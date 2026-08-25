import { useEffect, useState } from 'react'
import { CheckCircle2, Clipboard, MapPinned, Navigation, Save, Wifi, WifiOff } from 'lucide-react'
import ActionButton from '../../components/common/ActionButton'
import Panel from '../../components/common/Panel'
import PriorityBadge from '../../components/common/PriorityBadge'
import MapPanel from '../../components/map/MapPanel'
import { useCad } from '../../context/CadContext'
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
  ['EN ROUTE', 'en_route'], ['ARRIVED SCENE', 'arrived_scene'], ['TRANSPORTING', 'transporting'], ['ARRIVED HOSPITAL', 'arrived_hospital'],
]

const numberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export default function Paramedic() {
  const { currentUser } = useCad()
  const [dispatch, setDispatch] = useState(null)
  const [unit, setUnit] = useState(null)
  const [incident, setIncident] = useState(null)
  const [hospitals, setHospitals] = useState([])
  const [state, setState] = useState('EN ROUTE')
  const [offline, setOffline] = useState(false)
  const [hospitalId, setHospitalId] = useState('')
  const [saved, setSaved] = useState(false)
  const [assessment, setAssessment] = useState({ patient: 'Unknown adult', age: '', pulse: '', bp: '', spo2: '', gcs: '15', notes: '' })
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')
  const [hospitalAcknowledgedAt, setHospitalAcknowledgedAt] = useState(null)
  const hospital = hospitals.find((item) => item.id === hospitalId)

  useEffect(() => {
    Promise.allSettled([getCurrentParamedicDispatch(), getHospitalCapacityBoard()]).then(async ([dispatchResult, hospitalsResult]) => {
      if (dispatchResult.status === 'fulfilled') {
        const nextDispatch = dispatchResult.value
        setDispatch(nextDispatch)
        setUnit({ id: nextDispatch.ambulance_code, ambulance_id: nextDispatch.ambulance_id, callSign: nextDispatch.ambulance_code })
        setIncident({ ...nextDispatch.incident, id: nextDispatch.incident_id, incident_id: nextDispatch.incident_id })
        setHospitalId(nextDispatch.hospital_id || '')
        setHospitalAcknowledgedAt(nextDispatch.hospital_acknowledged_at || null)
        setState(String(nextDispatch.dispatch_status || 'en_route'))
        if (nextDispatch.assignment_id) {
          const result = await getAssessments(nextDispatch.assignment_id)
          const latest = Array.isArray(result) ? result[0] : null
          if (latest) setAssessment((current) => ({ ...current, pulse: latest.heart_rate || '', bp: latest.systolic_bp ? `${latest.systolic_bp}/${latest.diastolic_bp || ''}` : '', spo2: latest.spo2 || '', notes: latest.clinical_notes || '' }))
        }
      } else setFeedback('No active dispatch is assigned to this paramedic account.')
      if (hospitalsResult.status === 'fulfilled') {
        const nextHospitals = (Array.isArray(hospitalsResult.value) ? hospitalsResult.value : []).map((item) => ({ ...item, id: item.hospital_id || item.id, name: item.hospital_name || item.name || item.hospital_code, latitude: item.latitude, longitude: item.longitude, capacity: String(item.capacity_status || '').toUpperCase() }))
        setHospitals(nextHospitals)
        if (dispatchResult.status !== 'fulfilled' || !dispatchResult.value.hospital_id) setHospitalId(nextHospitals[0]?.id || '')
      }
      setLoading(false)
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

  const setLifecycle = async (label, dispatchStatus) => {
    if (!dispatch?.dispatch_id) return
    try {
      await patchDispatch(dispatch.dispatch_id, { status: dispatchStatus })
      setDispatch((current) => ({ ...current, dispatch_status: dispatchStatus }))
      setState(dispatchStatus)
      setSaved(false)
      setFeedback(`Dispatch status updated to ${label}.`)
    } catch (error) { setFeedback(error.message || 'Unable to update dispatch status.') }
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
      let patientId = incident.patient_id
      if (!patientId) {
        const patient = await createPatient({ medical_record_no: `CAD-${Date.now()}`, first_name: assessment.patient || 'Unknown', last_name: 'Patient', status: 'active' })
        patientId = patient.patient_id
      }
      const [systolic, diastolic] = String(assessment.bp || '').split('/')
      await createAssessment(dispatch.assignment_id, { patient_id: patientId, assessed_by: currentUser.backendProfile.user_id, consciousness_level: assessment.gcs || '15', airway_status: 'patent', breathing_status: 'adequate', circulation_status: 'stable', heart_rate: numberOrNull(assessment.pulse), systolic_bp: numberOrNull(systolic), diastolic_bp: numberOrNull(diastolic), spo2: numberOrNull(assessment.spo2), clinical_notes: assessment.notes || null, severity: 'moderate' })
      setSaved(true)
      setFeedback(`Assessment sent to ${hospital?.name || 'the destination hospital'}.`)
    } catch (error) { setFeedback(error.message || 'Unable to save assessment.') }
  }

  const selectDestination = async (value) => {
    setHospitalId(value)
    setHospitalAcknowledgedAt(null)
    setSaved(false)
    if (!dispatch?.dispatch_id) return
    try { await assignDestinationHospital(dispatch.dispatch_id, { hospital_id: value }); setFeedback('Destination hospital saved.') } catch (error) { setFeedback(error.message || 'Unable to save destination hospital.') }
  }

  const completeAssignment = async () => {
    if (!incident?.incident_id || !dispatch?.dispatch_id) return
    try {
      await closeIncident(incident.incident_id, { outcome_summary: assessment.notes || 'Patient handoff completed.', patient_handoff_confirmed: true })
      await patchDispatch(dispatch.dispatch_id, { status: 'completed' })
      setIncident(null)
      setDispatch(null)
      setFeedback('Incident closed and ambulance returned to available.')
    } catch (error) { setFeedback(error.message || 'Unable to complete assignment.') }
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(260px,1fr)_minmax(0,1.5fr)_minmax(300px,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-3 p-4">
      <header className="col-span-3 flex items-center justify-between border-b border-[#222B3A] pb-3">
        <div><p className="text-[10px] font-bold tracking-[0.14em] text-[#7E8A9A]">MOBILE CLINICAL WORKSPACE · {unit?.id}</p><h1 className="mt-1 text-lg font-bold">{incident?.id || 'NO ASSIGNMENT'}</h1></div>
        <button type="button" onClick={() => setOffline((value) => !value)} className={`flex items-center gap-2 border px-3 py-2 text-[10px] font-bold ${offline ? 'border-[#F59E0B]/50 text-[#FCD34D]' : 'border-[#22C55E]/50 text-[#86EFAC]'}`}>{offline ? <WifiOff size={14} /> : <Wifi size={14} />}{offline ? 'OFFLINE DOCUMENTATION' : 'CAD CONNECTED'}</button>
      </header>

      <div className="flex min-h-0 flex-col gap-3">
        <Panel title="ASSIGNED INCIDENT" subtitle={incident?.location} className="shrink-0"><div className="p-3"><div className="flex items-center justify-between"><PriorityBadge priority={incident?.priority} /><span className="text-xs font-bold text-[#38BDF8]">{unit?.eta ?? '—'} MIN ETA</span></div><p className="mt-3 text-xs font-semibold text-[#F5F7FA]">{incident?.description}</p><p className="mt-2 flex items-center gap-2 text-[11px] text-[#AAB4C3]"><MapPinned size={14} className="text-[#38BDF8]" />{incident?.location}</p><p className="mt-2 text-[10px] text-[#7E8A9A]">UNIT: {unit?.callSign} · {unit?.capability} · {unit?.homeZone}</p></div></Panel>
        <Panel title="DISPATCH LIFECYCLE" className="min-h-0 flex-1 overflow-hidden"><div className="grid h-full grid-rows-4 gap-2 p-3">{lifecycle.map(([label, dispatchStatus]) => <button key={label} type="button" onClick={() => setLifecycle(label, dispatchStatus)} className={`border px-3 text-left text-[11px] font-extrabold tracking-wide ${state === dispatchStatus ? 'border-[#38BDF8] bg-[#1B2A3A] text-[#F5F7FA]' : 'border-[#222B3A] bg-[#0F141D] text-[#7E8A9A]'}`}><span className="mr-2 text-[#38BDF8]">{state === dispatchStatus ? '●' : '○'}</span>{label}</button>)}</div></Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-3"><MapPanel className="h-[38%] min-h-[210px]" title="NAVIGATION · LIVE ROUTE" incidents={incident ? [incident] : []} units={unit ? [unit] : []} hospitals={hospitals} /><Panel title="PATIENT / PREHOSPITAL ASSESSMENT" subtitle={hospital ? `Send handoff to ${hospital.name}` : 'Select a destination hospital first'} className="flex min-h-0 flex-1 flex-col overflow-hidden"><div className="min-h-0 flex-1 overflow-y-auto p-3"><div className="grid grid-cols-2 gap-2"><Input label="PATIENT" value={assessment.patient} onChange={(value) => updateAssessment('patient', value)} /><Input label="AGE" value={assessment.age} onChange={(value) => updateAssessment('age', value)} /><Input label="PULSE" value={assessment.pulse} onChange={(value) => updateAssessment('pulse', value)} /><Input label="BP" value={assessment.bp} onChange={(value) => updateAssessment('bp', value)} /><Input label="SPO₂" value={assessment.spo2} onChange={(value) => updateAssessment('spo2', value)} /><Input label="GCS" value={assessment.gcs} onChange={(value) => updateAssessment('gcs', value)} /></div><label className="mt-3 block"><span className="cad-label">CLINICAL NOTES</span><textarea value={assessment.notes} onChange={(event) => setAssessment((current) => ({ ...current, notes: event.target.value }))} className="h-24 w-full resize-none border border-[#222B3A] bg-[#0F141D] px-3 py-2 text-[11px] outline-none focus:border-[#38BDF8]" placeholder="Assessment findings, interventions, and handoff notes" /></label></div><div className="border-t border-[#222B3A] p-3"><ActionButton icon={Save} variant="primary" className="w-full" disabled={!hospitalId} onClick={persistAssessment}>{saved ? 'ASSESSMENT SENT' : 'SEND ASSESSMENT'}</ActionButton></div></Panel></div>

      <div className="flex min-h-0 flex-col gap-3"><Panel title="DESTINATION HOSPITAL" subtitle="Receiving facility workflow" className="shrink-0"><div className="p-3"><select value={hospitalId} onChange={(event) => selectDestination(event.target.value)} className="cad-input h-9 py-1 text-[11px]"><option value="">Select destination</option>{hospitals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div className="border border-[#222B3A] bg-[#0F141D] p-2"><span className="text-[#7E8A9A]">CAPACITY</span><b className="mt-1 block">{hospital?.capacity || '—'}</b></div><div className="border border-[#222B3A] bg-[#0F141D] p-2"><span className="text-[#7E8A9A]">AMB SLOTS</span><b className="mt-1 block">{hospital?.available_ambulance_slots ?? '—'}</b></div></div><div className={`mt-3 border px-2 py-2 text-[10px] font-bold ${hospitalAcknowledgedAt ? 'border-[#22C55E]/50 bg-[#10251A] text-[#86EFAC]' : 'border-[#F59E0B]/50 bg-[#251B0D] text-[#FCD34D]'}`}>{hospitalAcknowledgedAt ? `HOSPITAL ACKNOWLEDGED · ${new Date(hospitalAcknowledgedAt).toLocaleTimeString()}` : 'AWAITING HOSPITAL ACKNOWLEDGMENT'}</div></div></Panel>
        <Panel title="CURRENT STATUS" className="shrink-0"><div className="p-3"><div className="flex items-center gap-2 text-xs"><Clipboard size={16} className="text-[#38BDF8]" /><b>{state || 'ASSIGNED'}</b></div><p className="mt-2 text-[10px] text-[#AAB4C3]">Destination: {hospital?.name || 'Not selected'}</p><p className="mt-1 text-[10px] text-[#7E8A9A]">Document before closing this assignment.</p></div></Panel>
        <Panel title="INCIDENT CLOSEOUT" className="min-h-0 flex-1"><div className="flex h-full flex-col p-3"><p className="text-[11px] text-[#AAB4C3]">Complete the backend patient handoff before returning the ambulance to available.</p><ActionButton icon={Navigation} className="mt-3" onClick={() => setLifecycle('ARRIVED HOSPITAL', 'arrived_hospital')}>MARK ARRIVED HOSPITAL</ActionButton><ActionButton variant="primary" icon={CheckCircle2} className="mt-auto h-12 w-full" disabled={!incident || !dispatch} onClick={completeAssignment}>COMPLETE / AVAILABLE</ActionButton>{feedback && <p className="mt-2 text-[10px] text-[#86EFAC]">{feedback}</p>}</div></Panel>
      </div>
    </div>
  )
}

function Input({ label, value, onChange }) {
  return <label><span className="cad-label">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="cad-input h-8 py-1 text-[11px]" /></label>
}
