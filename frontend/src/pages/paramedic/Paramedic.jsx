import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clipboard,
  Crosshair,
  HeartPulse,
  Home,
  Map,
  MapPinned,
  Navigation,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useCad } from '../../context/CadContext'
import MapPanel from '../../components/map/MapPanel'
import {
  assignDestinationHospital,
  closeIncident,
  createAssessment,
  createPatient,
  getAssessments,
  getCurrentParamedicDispatch,
  getHospitalCapacityBoard,
  patchDispatch,
} from '../../api/emsApi'

const lifecycle = [
  ['EN ROUTE', 'en_route'],
  ['ARRIVED SCENE', 'arrived_scene'],
  ['TRANSPORTING', 'transporting'],
  ['ARRIVED HOSPITAL', 'arrived_hospital'],
]

const numberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const navItems = [
  { id: 'home', label: 'HOME', icon: Home },
  { id: 'patient', label: 'PATIENT', icon: UserRound },
  { id: 'mission', label: 'MISSION', icon: Map },
  { id: 'more', label: 'MORE', icon: Clipboard },
]

const patientTabs = ['Overview']

export default function Paramedic() {
  const { currentUser } = useCad()
  const [dispatch, setDispatch] = useState(null)
  const [unit, setUnit] = useState(null)
  const [incident, setIncident] = useState(null)
  const [hospitals, setHospitals] = useState([])
  const [state, setState] = useState('en_route')
  const [activeTab, setActiveTab] = useState('home')
  const [patientTab, setPatientTab] = useState('Overview')
  const [offline, setOffline] = useState(false)
  const [hospitalId, setHospitalId] = useState('')
  const [saved, setSaved] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [hospitalAcknowledgedAt, setHospitalAcknowledgedAt] = useState(null)
  const [handoffSummary, setHandoffSummary] = useState('')
  const [handoffConfirmed, setHandoffConfirmed] = useState(false)
  const [assessment, setAssessment] = useState({
    patient: '',
    age: '',
    pulse: '',
    bp: '',
    spo2: '',
    gcs: '',
    notes: '',
  })
  const [route, setRoute] = useState(null)
  const hospital = hospitals.find((item) => item.id === hospitalId)

  const currentStatusLabel = useMemo(
    () => lifecycle.find(([, value]) => value === state)?.[0] || 'EN ROUTE',
    [state],
  )

  const patientName = assessment.patient || 'Unknown patient'
  const unitLabel = unit?.callSign || 'No unit assigned'
  const incidentIdLabel = incident?.id || 'No active incident'
  const incidentPriorityLabel = incident?.priority || '—'
  const hospitalName = hospital?.name || 'No destination selected'
  const crewStatus = dispatch?.crew_member_id ? 'Crew assigned' : 'Awaiting crew'
  const currentTimeText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const hospitalAcknowledgementStatus = hospitalAcknowledgedAt ? 'Accepted by hospital' : 'Awaiting hospital acknowledgment'

  useEffect(() => {
    Promise.allSettled([getCurrentParamedicDispatch(), getHospitalCapacityBoard()]).then(async ([dispatchResult, hospitalsResult]) => {
      if (dispatchResult.status === 'fulfilled') {
        const nextDispatch = dispatchResult.value
        setDispatch(nextDispatch)
        setUnit({
          id: nextDispatch.ambulance_code,
          ambulance_id: nextDispatch.ambulance_id,
          callSign: nextDispatch.ambulance_code,
          capability: nextDispatch.ambulance_type || 'ALS',
          eta: nextDispatch.eta_minutes || 4,
          latitude: nextDispatch.ambulance_latitude,
          longitude: nextDispatch.ambulance_longitude,
        })
        setIncident({
          ...nextDispatch.incident,
          id: nextDispatch.incident_id,
          incident_id: nextDispatch.incident_id,
          priority: nextDispatch.priority || '—',
          description: nextDispatch.incident?.description || nextDispatch.incident?.incident_description || 'No incident description available',
          location: nextDispatch.incident?.location || nextDispatch.incident?.location_description || 'Location pending',
        })
        setHospitalId(nextDispatch.hospital_id || '')
        setHospitalAcknowledgedAt(nextDispatch.hospital_acknowledged_at || null)
        setState(String(nextDispatch.dispatch_status || 'en_route'))

        if (nextDispatch.assignment_id) {
          const result = await getAssessments(nextDispatch.assignment_id)
          const latest = Array.isArray(result) ? result[0] : null
          if (latest) {
            setAssessment((current) => ({
              ...current,
              pulse: latest.heart_rate || '',
              bp: latest.systolic_bp ? `${latest.systolic_bp}/${latest.diastolic_bp || ''}` : '',
              spo2: latest.spo2 || '',
              notes: latest.clinical_notes || '',
            }))
          }
        }
      } else {
        setFeedback('No active dispatch is assigned to this paramedic account.')
      }

      if (hospitalsResult.status === 'fulfilled') {
        const nextHospitals = (Array.isArray(hospitalsResult.value) ? hospitalsResult.value : []).map((item) => ({
          ...item,
          id: item.hospital_id || item.id,
          name: item.hospital_name || item.name || item.hospital_code,
          latitude: item.latitude,
          longitude: item.longitude,
          capacity: String(item.capacity_status || '').toUpperCase(),
          available_ambulance_slots: item.available_ambulance_slots ?? item.available_slots ?? 2,
        }))
        setHospitals(nextHospitals)
        if (dispatchResult.status !== 'fulfilled' || !dispatchResult.value.hospital_id) {
          setHospitalId(nextHospitals[0]?.id || '')
        }
      }
    })
  }, [])

  useEffect(() => {
    if (!dispatch?.dispatch_id) return undefined

    const refreshAcknowledgment = () => getCurrentParamedicDispatch()
      .then((current) => {
        setHospitalId(current.hospital_id || '')
        setHospitalAcknowledgedAt(current.hospital_acknowledged_at || null)
      })
      .catch(() => {})

    const intervalId = window.setInterval(refreshAcknowledgment, 10000)
    return () => window.clearInterval(intervalId)
  }, [dispatch?.dispatch_id])

  // Calculate route based on dispatch state
  useEffect(() => {
    const calculateRoute = async () => {
      let startLat, startLon, endLat, endLon

      console.log('Route calculation triggered', { state, unit, incident, hospital })

      // Determine start and end coordinates based on state
      if (state === 'en_route') {
        // Route from ambulance to incident
        startLat = unit?.latitude || 30.0418
        startLon = unit?.longitude || 31.2327
        endLat = incident?.latitude || 30.0472
        endLon = incident?.longitude || 31.2385
        console.log('EN ROUTE: Route from unit to incident', { startLat, startLon, endLat, endLon })
      } else if (['arrived_scene', 'transporting'].includes(state)) {
        // Route from ambulance to hospital
        startLat = unit?.latitude || 30.0418
        startLon = unit?.longitude || 31.2327
        endLat = hospital?.latitude || 30.056
        endLon = hospital?.longitude || 31.225
        console.log('TRANSPORTING: Route from unit to hospital', { startLat, startLon, endLat, endLon })
      } else {
        // arrived_hospital or other states - no need for route
        console.log('State does not require route:', state)
        setRoute(null)
        return
      }

      try {
        console.log('Fetching route from backend...')
        const routeData = await emsApi.getRoute({
          start_lat: startLat,
          start_lon: startLon,
          end_lat: endLat,
          end_lon: endLon,
        })
        console.log('Route data received:', routeData)
        console.log('  - Coordinates count:', routeData.coordinates?.length)
        setRoute(routeData)
      } catch (error) {
        console.error('Error calculating route:', error)
        setRoute(null)
      }
    }

    calculateRoute()
  }, [state, unit, incident, hospital])

  // Log route state changes
  useEffect(() => {
    console.log('Route state changed:', route)
  }, [route])

  const setLifecycle = async (label, dispatchStatus) => {
    if (!dispatch?.dispatch_id) return
    try {
      await patchDispatch(dispatch.dispatch_id, { status: dispatchStatus })
      setDispatch((current) => ({ ...current, dispatch_status: dispatchStatus }))
      setState(dispatchStatus)
      setSaved(false)
      setFeedback(`Dispatch status updated to ${label}.`)
    } catch (error) {
      setFeedback(error.message || 'Unable to update dispatch status.')
    }
  }

  const handleOfflineToggle = () => {
    const nextOfflineState = !offline
    setOffline(nextOfflineState)
    setFeedback(
      nextOfflineState
        ? 'Connectivity interrupted. Updates are queued locally and will sync when reconnected.'
        : 'Connectivity restored. Local updates have been synced to the CAD system.',
    )
  }

  const updateAssessment = (field, value) => {
    setAssessment((current) => ({ ...current, [field]: value }))
    setSaved(false)
  }

  const persistAssessment = async () => {
    if (!dispatch?.assignment_id || !currentUser?.backendProfile?.user_id || !hospitalId) {
      setFeedback('Select a destination hospital before sending the assessment.')
      return
    }

    try {
      let patientId = incident?.patient_id
      if (!patientId) {
        const patient = await createPatient({
          medical_record_no: `CAD-${Date.now()}`,
          first_name: assessment.patient || 'Unknown',
          last_name: 'Patient',
          status: 'active',
        })
        patientId = patient.patient_id
      }

      const [systolic, diastolic] = String(assessment.bp || '').split('/')
      await createAssessment(dispatch.assignment_id, {
        patient_id: patientId,
        assessed_by: currentUser.backendProfile.user_id,
        consciousness_level: assessment.gcs || '15',
        airway_status: 'patent',
        breathing_status: 'adequate',
        circulation_status: 'stable',
        heart_rate: numberOrNull(assessment.pulse),
        systolic_bp: numberOrNull(systolic),
        diastolic_bp: numberOrNull(diastolic),
        spo2: numberOrNull(assessment.spo2),
        clinical_notes: assessment.notes || null,
        severity: 'moderate',
      })

      setSaved(true)
      setFeedback(`Assessment sent to ${hospital?.name || 'the destination hospital'}.`)
    } catch (error) {
      setFeedback(error.message || 'Unable to save assessment.')
    }
  }

  const selectDestination = async (value) => {
    setHospitalId(value)
    setHospitalAcknowledgedAt(null)
    setSaved(false)

    if (!dispatch?.dispatch_id) return

    try {
      await assignDestinationHospital(dispatch.dispatch_id, { hospital_id: value })
      setFeedback('Destination hospital saved.')
    } catch (error) {
      setFeedback(error.message || 'Unable to save destination hospital.')
    }
  }

  const completeAssignment = async () => {
    if (!incident?.incident_id || !dispatch?.dispatch_id) return

    if (!handoffConfirmed) {
      setFeedback('Confirm patient handoff before completing the incident.')
      return
    }

    try {
      await closeIncident(incident.incident_id, {
        outcome_summary: handoffSummary || assessment.notes || 'Patient handoff completed.',
        patient_handoff_confirmed: true,
      })
      await patchDispatch(dispatch.dispatch_id, { status: 'completed' })
      setIncident(null)
      setDispatch(null)
      setFeedback('Incident closed and ambulance returned to available.')
    } catch (error) {
      setFeedback(error.message || 'Unable to complete assignment.')
    }
  }

  const nextMissionAction = lifecycle[lifecycle.findIndex(([, item]) => item === state) + 1]

  return (
    <div className="h-full overflow-auto bg-[#091018] p-3 md:p-5">
      {activeTab === 'home' && (
        <div className="mx-auto max-w-[430px] overflow-hidden rounded-[32px] border border-[#1C2A39] bg-[#121b27] shadow-[0_25px_80px_rgba(5,10,18,0.7)]">
          <header className="bg-[#0F1721] px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#162539] text-[#7DD3FC]">
                <Crosshair size={14} />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7E8A9A]">{unitLabel}</div>
                <div className="text-[11px] font-semibold text-[#E5F0FF]">{currentUser?.name ? `${currentUser.name.toUpperCase()} · PARAMEDIC` : 'PARAMEDIC'}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOfflineToggle}
              className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] ${
                offline ? 'border-[#F59E0B]/50 bg-[#2B210D] text-[#FCD34D]' : 'border-[#22C55E]/50 bg-[#10281D] text-[#86EFAC]'
              }`}
            >
              {offline ? <WifiOff size={12} /> : <Wifi size={12} />}
              {offline ? 'OFFLINE' : 'ONLINE'}
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7E8A9A]">{incidentIdLabel}</div>
              <div className="mt-1 text-[28px] font-black leading-none text-white">{currentStatusLabel}</div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[#1E2A38] bg-[#0B111A] px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#5EEAD4]">
              <span className="h-2 w-2 rounded-full bg-[#34D399] shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
              ACTIVE
            </div>
          </div>
        </header>

        <div className="bg-[#101a26] px-3 pb-4 pt-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {lifecycle.map(([label, dispatchStatus]) => (
              <button
                key={label}
                type="button"
                onClick={() => setLifecycle(label, dispatchStatus)}
                className={`whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] ${
                  state === dispatchStatus
                    ? 'border-[#38BDF8] bg-[#13243A] text-[#E0F2FE]'
                    : 'border-[#1E2A38] bg-[#0B131C] text-[#7E8A9A]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-[24px] border border-[#1E2A38] bg-[#0D1420] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7E8A9A]">ACTIVE INCIDENT</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#FBBF24]">
                  {incident?.priority || 'HIGH'} PRIORITY
                </div>
              </div>
              <div className="rounded-full border border-[#FCA5A5]/20 bg-[#2B1114] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#FCA5A5]">
                {incident?.priority || 'HIGH'}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[18px] font-black text-white">{incidentIdLabel}</div>
                <div className="mt-1 text-[13px] font-semibold text-[#E2E8F0]">{incident?.description || 'No incident description available'}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#A8B6C8]">
                  <MapPinned size={12} className="text-[#38BDF8]" />
                  {incident?.location || 'Location pending'}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[26px] font-black text-[#7DD3FC]">{unit?.eta ?? '—'}</div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#7E8A9A]">MIN ETA</div>
                <div className="mt-1 text-[10px] font-semibold text-[#9FB3C4]">{dispatch ? 'Live route' : 'Awaiting dispatch'}</div>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#203A52] bg-[#101D2E] px-2 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#DDEEFF]"
              >
                <Navigation size={14} className="text-[#7DD3FC]" />
                NAVIGATE
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('patient')}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#203A52] bg-[#101D2E] px-2 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#DDEEFF]"
              >
                <HeartPulse size={14} className="text-[#7DD3FC]" />
                PATIENT
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('mission')}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#203A52] bg-[#101D2E] px-2 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#DDEEFF]"
              >
                <Map size={14} className="text-[#7DD3FC]" />
                MISSION
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            <StatusMetric label="UNIT" value={unitLabel} tone="blue" />
            <StatusMetric label="CREW" value={crewStatus} tone="cyan" />
            <StatusMetric label="FUEL" value={dispatch ? 'LIVE' : '—'} tone="green" />
            <StatusMetric label="SHIFT" value={currentTimeText} tone="purple" />
          </div>

          <div className="mt-4 rounded-[22px] border border-[#1E2A38] bg-[#0B131D] p-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7E8A9A]">DISPATCH FEED</div>
              <div className="rounded-full border border-[#2A3C52] bg-[#10212E] px-1.5 py-0.5 text-[9px] font-bold text-[#7DD3FC]">{dispatch ? '1' : '0'}</div>
            </div>

            <div className="mt-3 space-y-3 text-[11px] text-[#DDE6F2]">
              {dispatch ? (
                <div className="flex gap-2">
                  <span className="mt-0.5 text-[9px] text-[#7E8A9A]">{currentTimeText}</span>
                  <p>{incidentIdLabel} is currently in {currentStatusLabel.toLowerCase()} status.</p>
                </div>
              ) : (
                <p className="text-[#7E8A9A]">No dispatch activity available for this paramedic account.</p>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-[22px] border border-[#1E2A38] bg-[#0A1118] p-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7E8A9A]">LAST VITALS</div>
              <button type="button" className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7DD3FC]">VIEW ALL →</button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <VitalCard label="HR" value={assessment.pulse || '—'} unit="bpm" />
              <VitalCard label="BP" value={assessment.bp || '—'} unit="mmHg" />
              <VitalCard label="SpO2" value={assessment.spo2 || '—'} unit="%" />
              <VitalCard label="GCS" value={assessment.gcs || '—'} unit="/15" />
            </div>
          </div>
        </div>

        </div>
      )}

      {activeTab === 'patient' && (
        <div className="mx-auto mt-4 max-w-[430px] rounded-[30px] border border-[#1C2A39] bg-[#101922] p-4 shadow-[0_18px_46px_rgba(0,0,0,0.4)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7E8A9A]">PATIENT</div>
              <div className="mt-1 text-[24px] font-black text-white">{patientName}</div>
            </div>
            <div className="rounded-full border border-[#1E2A38] bg-[#0B131D] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7E8A9A]">
              {assessment.age ? `${assessment.age} yrs` : 'Age not recorded'}
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {patientTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setPatientTab(tab)}
                className={`whitespace-nowrap rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] ${
                  patientTab === tab ? 'border-[#38BDF8] bg-[#13243A] text-[#EAF7FF]' : 'border-[#1E2A38] bg-[#0B131D] text-[#7E8A9A]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {patientTab === 'Overview' && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <InputField label="Patient" value={assessment.patient} onChange={(value) => updateAssessment('patient', value)} />
                <InputField label="Age" value={assessment.age} onChange={(value) => updateAssessment('age', value)} />
                <InputField label="GCS" value={assessment.gcs} onChange={(value) => updateAssessment('gcs', value)} />
                <InputField label="HR" value={assessment.pulse} onChange={(value) => updateAssessment('pulse', value)} />
                <InputField label="BP" value={assessment.bp} onChange={(value) => updateAssessment('bp', value)} />
                <InputField label="SpO₂" value={assessment.spo2} onChange={(value) => updateAssessment('spo2', value)} />
              </div>
              <div className="rounded-[22px] border border-[#1E2A38] bg-[#0B131D] p-3">
                <div className="flex items-center gap-2 text-[#7DD3FC]">
                  <Stethoscope size={16} />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">Patient report</span>
                </div>
                <textarea
                  value={assessment.notes}
                  onChange={(event) => updateAssessment('notes', event.target.value)}
                  className="mt-3 h-32 w-full resize-none rounded-[18px] border border-[#1E2A38] bg-[#0B131D] px-3 py-3 text-sm text-[#E2E8F0] outline-none focus:border-[#38BDF8]"
                  placeholder="Enter patient assessment report for the receiving hospital..."
                />
              </div>
            </div>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={persistAssessment}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2563EB] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white"
            >
              <SaveIcon />
              {saved ? 'ASSESSMENT SENT' : 'SEND ASSESSMENT'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'mission' && (
        <div className="mx-auto mt-4 max-w-[430px] rounded-[30px] border border-[#1C2A39] bg-[#101922] p-4 shadow-[0_18px_46px_rgba(0,0,0,0.4)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7E8A9A]">MISSION</div>
              <div className="mt-1 text-[24px] font-black text-white">Dispatch flow</div>
            </div>
            <button type="button" className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7DD3FC]">EXPAND</button>
          </div>

          <div className="mt-4 rounded-[24px] border border-[#1E2A38] bg-[#0D1420] overflow-hidden">
            <MapPanel
              units={unit ? [unit] : []}
              incidents={state === 'en_route' && incident ? [incident] : []}
              hospitals={(['arrived_scene', 'transporting'].includes(state) && hospital) ? [hospital] : []}
              route={route}
              focusPoints={[
                ...(unit && unit.latitude && unit.longitude ? [[unit.latitude, unit.longitude]] : []),
                ...(state === 'en_route' && incident && incident.latitude && incident.longitude ? [[incident.latitude, incident.longitude]] : []),
                ...(['arrived_scene', 'transporting'].includes(state) && hospital && hospital.latitude && hospital.longitude ? [[hospital.latitude, hospital.longitude]] : []),
              ].filter((p) => p && p.length === 2)}
              className="h-64 w-full"
              title="ACTIVE DISPATCH"
              showControls={false}
            />
          </div>

          <div className="mt-4 space-y-3">
            {lifecycle.map(([label, dispatchStatus], index) => (
              <div key={dispatchStatus} className="flex items-center gap-3">
                <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-black ${
                  index <= lifecycle.findIndex(([, item]) => item === state) ? 'bg-[#38BDF8] text-[#07151a]' : 'bg-[#1E2A38] text-[#7E8A9A]'
                }`}>
                  {index <= lifecycle.findIndex(([, item]) => item === state) ? <Check size={10} /> : index + 1}
                </div>
                <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#DDE6F2]">{label}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-[22px] border border-[#1E2A38] bg-[#0B131D] p-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7E8A9A]">NAVIGATION</div>
              <div className="rounded-full bg-[#10281D] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#86EFAC]">{offline ? 'OFFLINE' : 'LIVE'}</div>
            </div>
            <div className="mt-2 space-y-2 text-[11px] text-[#DDE6F2]">
              <div className="flex items-center justify-between">
                <span className="text-[#7E8A9A]">Scene route</span>
                <span className="font-semibold">{unit?.eta ?? '—'} min</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#7E8A9A]">Destination</span>
                <span className="font-semibold">{hospitalName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#7E8A9A]">Status</span>
                <span className="font-semibold text-[#7DD3FC]">{hospitalAcknowledgementStatus}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[22px] border border-[#1E2A38] bg-[#0B131D] p-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7E8A9A]">HOSPITAL</div>
              <div className="rounded-full bg-[#10281D] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#86EFAC]">{hospital?.capacity || '—'}</div>
            </div>
            <div className="mt-2 text-[16px] font-bold text-white">{hospitalName}</div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-[#DDE6F2]">
              <span>Amb slots</span>
              <span className="font-bold">{hospital?.available_ambulance_slots ?? '—'}</span>
            </div>
            <div className="mt-3 space-y-2">
              {hospitals.length > 0 ? hospitals.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectDestination(item.id)}
                  className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] ${
                    hospitalId === item.id ? 'border-[#38BDF8] bg-[#13243A] text-[#EAF7FF]' : 'border-[#1E2A38] bg-[#101A24] text-[#DDE6F2]'
                  }`}
                >
                  <span>{item.name}</span>
                  <span>{item.capacity || '—'}</span>
                </button>
              )) : (
                <p className="text-[11px] text-[#7E8A9A]">No hospitals available for selection.</p>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-2 text-[11px]">
            <div className="flex items-center justify-between rounded-2xl border border-[#1E2A38] bg-[#101A24] px-3 py-2 font-bold uppercase tracking-[0.12em] text-[#EAF7FF]">
              <span>Route Status</span>
              <span className="text-[#7DD3FC]">{dispatch ? 'ACTIVE' : 'PENDING'}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-[#1E2A38] bg-[#101A24] px-3 py-2 font-bold uppercase tracking-[0.12em] text-[#EAF7FF]">
              <span>Scene ETA</span>
              <span className="text-[#7DD3FC]">{unit?.eta ?? '—'} min</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-[#1E2A38] bg-[#101A24] px-3 py-2 font-bold uppercase tracking-[0.12em] text-[#EAF7FF]">
              <span>Destination</span>
              <span className="text-[#7DD3FC]">{hospitalName}</span>
            </div>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                const nextChoice = nextMissionAction ? nextMissionAction[1] : 'arrived_hospital'
                setLifecycle(nextMissionAction ? nextMissionAction[0] : 'ARRIVED HOSPITAL', nextChoice)
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2563EB] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white"
            >
              {nextMissionAction ? `NEXT: ${nextMissionAction[0]}` : 'NEXT: ARRIVED HOSPITAL'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'more' && (
        <div className="mx-auto mt-4 max-w-[430px] rounded-[30px] border border-[#1C2A39] bg-[#101922] p-4 shadow-[0_18px_46px_rgba(0,0,0,0.4)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7E8A9A]">HANDOFF</div>
              <div className="mt-1 text-[24px] font-black text-white">Patient transfer</div>
            </div>
            <div className="rounded-full border border-[#22C55E]/30 bg-[#10281D] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#86EFAC]">READY</div>
          </div>

          <div className="mt-4 rounded-[22px] border border-[#1E2A38] bg-[#0B131D] p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7E8A9A]">PATIENT</div>
                <div className="mt-1 text-[18px] font-black text-white">{patientName}</div>
              </div>
              <div className="text-right text-[10px] font-semibold text-[#7E8A9A]">
                <div>GCS {assessment.gcs || '—'}</div>
                <div>HR {assessment.pulse || '—'}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[#DDE6F2]">
              <MiniPanel title="SBP" value={assessment.bp ? assessment.bp.split('/')[0] || '—' : '—'} />
              <MiniPanel title="DBP" value={assessment.bp ? assessment.bp.split('/')[1] || '—' : '—'} />
              <MiniPanel title="SpO₂" value={assessment.spo2 ? `${assessment.spo2}%` : '—'} />
              <MiniPanel title="Arrival" value={currentTimeText} />
            </div>
          </div>

          <div className="mt-4 rounded-[22px] border border-[#1E2A38] bg-[#0B131D] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7E8A9A]">HANDOFF FORM</div>
            <div className="mt-3 space-y-2 text-sm text-[#DDE6F2]">
              <p className="flex items-center justify-between"><span className="text-[#7E8A9A]">Report</span><span className="font-semibold">{incident?.description || 'No report recorded'}</span></p>
              <p className="flex items-center justify-between"><span className="text-[#7E8A9A]">Transport</span><span className="font-semibold">{unit?.eta ? `${unit.eta} min` : 'Awaiting ETA'}</span></p>
              <p className="flex items-center justify-between"><span className="text-[#7E8A9A]">Destination</span><span className="font-semibold">{hospitalName}</span></p>
            </div>
            <textarea
              value={handoffSummary}
              onChange={(event) => setHandoffSummary(event.target.value)}
              className="mt-3 h-24 w-full resize-none rounded-[18px] border border-[#1E2A38] bg-[#0B131D] px-3 py-3 text-sm text-[#E2E8F0] outline-none focus:border-[#38BDF8]"
              placeholder="Enter patient handoff outcome summary..."
            />
          </div>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => {
                setHandoffConfirmed((value) => !value)
                setFeedback(handoffConfirmed ? 'Handoff confirmation cleared.' : 'Patient handoff manually confirmed.')
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#1E2A38] bg-[#101A24] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#EAF7FF]"
            >
              <ShieldCheck size={16} className="text-[#7DD3FC]" />
              {handoffConfirmed ? 'HANDOFF CONFIRMED' : 'CONFIRM HANDOFF'}
            </button>
            <button
              type="button"
              onClick={completeAssignment}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2563EB] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white"
            >
              <Check size={16} />
              COMPLETE INCIDENT
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto mt-4 max-w-[430px] rounded-2xl border border-[#1C2A39] bg-[#0B121A] px-2 pb-2 pt-2">
        <nav className="grid grid-cols-4 gap-2">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] ${
                activeTab === id ? 'bg-[#13243A] text-[#E2F4FF]' : 'text-[#7E8A9A]'
              }`}
            >
              <Icon size={18} className={activeTab === id ? 'text-[#7DD3FC]' : 'text-[#6B7D93]'} />
              <span className="mt-1">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {feedback && (
        <div className="mx-auto mt-4 max-w-[430px] rounded-2xl border border-[#1C2A39] bg-[#0B111A] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A7F3D0]">
          {feedback}
        </div>
      )}
    </div>
  )
}

function StatusMetric({ label, value, tone }) {
  const colors = {
    blue: 'bg-[#121D32] text-[#8ED1FF]',
    cyan: 'bg-[#102A2B] text-[#9AE6B4]',
    green: 'bg-[#10281D] text-[#A7F3D0]',
    purple: 'bg-[#1C1A31] text-[#C4B5FD]',
  }

  return (
    <div className={`rounded-2xl border border-[#1E2A38] px-2 py-2 ${colors[tone] || colors.blue}`}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] opacity-80">{label}</div>
      <div className="mt-1 text-[12px] font-bold">{value}</div>
    </div>
  )
}

function VitalCard({ label, value, unit }) {
  return (
    <div className="rounded-2xl border border-[#1E2A38] bg-[#101A24] p-2.5 text-[#E5F0FF]">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#7E8A9A]">{label}</div>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-[20px] font-black text-white">{value}</span>
        <span className="pb-1 text-[9px] uppercase tracking-[0.12em] text-[#7E8A9A]">{unit}</span>
      </div>
    </div>
  )
}

function MiniPanel({ title, value }) {
  return (
    <div className="rounded-2xl border border-[#1E2A38] bg-[#0B131D] p-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#7E8A9A]">{title}</div>
      <div className="mt-1 text-[17px] font-black text-white">{value}</div>
    </div>
  )
}

function InputField({ label, value, onChange }) {
  return (
    <label className="rounded-2xl border border-[#1E2A38] bg-[#0B131D] p-3 text-left text-[9px] font-semibold uppercase tracking-[0.14em] text-[#7E8A9A]">
      <span>{label}</span>
      <input
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-[#1E2A38] bg-[#101A24] px-2 py-2 text-[13px] font-bold uppercase tracking-[0.08em] text-[#EAF7FF] outline-none placeholder:text-[#6B7D93] focus:border-[#38BDF8]"
        placeholder={label}
      />
    </label>
  )
}

function SaveIcon() {
  return <Clipboard size={14} />
}
