import { useEffect, useMemo, useState } from 'react'
import { BedDouble, Check, Hospital as HospitalIcon, Power, RefreshCw, Save, Siren } from 'lucide-react'
import ActionButton from '../../components/common/ActionButton'
import MetricCard from '../../components/common/MetricCard'
import Panel from '../../components/common/Panel'
import PriorityBadge from '../../components/common/PriorityBadge'
import StatusBadge from '../../components/common/StatusBadge'
import { useCad } from '../../context/CadContext'
import {
  acknowledgeInbound,
  getDispatchBoard,
  getHospitalCapacity,
  getHospitalCapacityBoard,
  getHospitalInbound,
  setHospitalCapacity,
} from '../../api/emsApi'

const activeStatuses = new Set(['dispatched', 'en_route', 'arrived_scene', 'transporting', 'arrived_hospital'])

const normalizeHospital = (hospital) => ({
  ...hospital,
  id: hospital.hospital_id,
  name: hospital.hospital_name,
  capacity: String(hospital.capacity_status || 'unknown').toUpperCase(),
})

const normalizeCapacity = (capacity, hospital) => ({
  availableBeds: capacity?.available_beds ?? 0,
  emergencyBeds: capacity?.emergency_beds ?? 0,
  icuBeds: capacity?.icu_beds ?? 0,
  ambulanceSlots: capacity?.available_ambulance_slots ?? 0,
  capacity: String(capacity?.capacity_status || hospital?.capacity_status || 'unknown').toUpperCase(),
  diversion: capacity?.diversion_flag ?? hospital?.diversion_flag ?? false,
})

export default function Hospital() {
  const { currentUser } = useCad()
  const [hospitals, setHospitals] = useState([])
  const [capacities, setCapacities] = useState({})
  const [inbound, setInbound] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [acknowledged, setAcknowledged] = useState([])
  const [selectedHospitalId, setSelectedHospitalId] = useState('')
  const [capacityDraft, setCapacityDraft] = useState(null)

  const loadHospitalData = async () => {
    setLoading(true)
    setError('')
    try {
      const [hospitalResponse, dispatchResponse] = await Promise.all([getHospitalCapacityBoard(), getDispatchBoard()])
      const facilityList = (Array.isArray(hospitalResponse) ? hospitalResponse : []).map(normalizeHospital)
      const dispatches = Array.isArray(dispatchResponse) ? dispatchResponse : []
      const capacityResults = await Promise.allSettled(facilityList.map((hospital) => getHospitalCapacity(hospital.id)))
      const nextCapacities = {}
      capacityResults.forEach((result, index) => {
        if (result.status === 'fulfilled') nextCapacities[facilityList[index].id] = normalizeCapacity(result.value, facilityList[index])
      })
      const inboundResults = await Promise.allSettled(facilityList.map((hospital) => getHospitalInbound(hospital.id)))
      const nextInbound = inboundResults.flatMap((result, index) => {
        if (result.status !== 'fulfilled' || !Array.isArray(result.value)) return []
        return result.value.flatMap((destination) => {
          const dispatch = dispatches.find((item) => String(item.dispatch_id) === String(destination.dispatch_id))
          if (!dispatch || !activeStatuses.has(String(dispatch.dispatch_status).toLowerCase())) return []
          return [{ ...dispatch, destination, hospitalId: facilityList[index].id, hospitalName: facilityList[index].name }]
        })
      })
      setHospitals(facilityList)
      setCapacities(nextCapacities)
      setInbound(nextInbound)
      setSelectedHospitalId(facilityList[0]?.id || '')
    } catch (loadError) {
      setError(loadError.message || 'Unable to load hospital data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHospitalData()
    const intervalId = window.setInterval(loadHospitalData, 10000)
    return () => window.clearInterval(intervalId)
  }, [])

  const selectedHospital = hospitals.find((hospital) => hospital.id === selectedHospitalId) || hospitals[0]
  const selectedCapacity = capacities[selectedHospital?.id] || normalizeCapacity(null, selectedHospital)
  const selectedInbound = useMemo(() => inbound.filter((item) => item.hospitalId === selectedHospital?.id), [inbound, selectedHospital?.id])

  useEffect(() => {
    if (selectedHospital) setCapacityDraft({ ...selectedCapacity })
  }, [selectedHospital?.id, selectedCapacity.availableBeds, selectedCapacity.emergencyBeds, selectedCapacity.icuBeds, selectedCapacity.ambulanceSlots, selectedCapacity.capacity, selectedCapacity.diversion])

  const updateCapacityDraft = (field, value) => setCapacityDraft((current) => ({ ...current, [field]: field === 'capacity' ? value : Number(value) }))

  const saveCapacity = async () => {
    if (!selectedHospital || !capacityDraft) return
    try {
      await setHospitalCapacity(selectedHospital.id, {
        available_beds: capacityDraft.availableBeds,
        emergency_beds: capacityDraft.emergencyBeds,
        icu_beds: capacityDraft.icuBeds,
        available_ambulance_slots: capacityDraft.ambulanceSlots,
        capacity_status: capacityDraft.capacity.toLowerCase(),
        diversion_flag: capacityDraft.diversion,
      })
      setCapacities((items) => ({ ...items, [selectedHospital.id]: capacityDraft }))
      setFeedback(`${selectedHospital.name} capacity record updated.`)
    } catch (actionError) { setFeedback(actionError.message || 'Unable to update capacity record.') }
  }

  const toggleDiversion = async () => {
    if (!selectedHospital) return
    const diversion = !selectedCapacity.diversion
    try {
      await setHospitalCapacity(selectedHospital.id, { available_beds: selectedCapacity.availableBeds, emergency_beds: selectedCapacity.emergencyBeds, icu_beds: selectedCapacity.icuBeds, available_ambulance_slots: selectedCapacity.ambulanceSlots, capacity_status: selectedCapacity.capacity, diversion_flag: diversion })
      setCapacities((items) => ({ ...items, [selectedHospital.id]: { ...selectedCapacity, diversion } }))
      setFeedback(`${selectedHospital.name} diversion ${diversion ? 'enabled' : 'disabled'}.`)
    } catch (actionError) { setFeedback(actionError.message || 'Unable to update diversion status.') }
  }

  const acknowledge = async (item) => {
    try {
      await acknowledgeInbound(item.hospitalId, item.dispatch_id)
      setAcknowledged((items) => items.includes(item.dispatch_id) ? items : [...items, item.dispatch_id])
      setFeedback(`Inbound dispatch ${item.dispatch_id} acknowledged.`)
    } catch (actionError) { setFeedback(actionError.message || 'Unable to acknowledge inbound dispatch.') }
  }

  const emergencyBeds = selectedCapacity.emergencyBeds
  const icuBeds = selectedCapacity.icuBeds
  const ambulanceSlots = selectedCapacity.ambulanceSlots

  return <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_340px] grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-auto p-4">
    <div className="col-span-2 grid grid-cols-4 gap-3"><MetricCard label="FACILITY LINK" value={loading ? '...' : 'ONLINE'} sub="Backend hospital feed" icon={HospitalIcon} tone="success" /><MetricCard label="INBOUND AMBULANCES" value={selectedInbound.length} sub="Pre-arrival queue" icon={Siren} tone="info" /><MetricCard label="ED BEDS OPEN" value={emergencyBeds} sub={`${icuBeds} ICU beds available`} icon={BedDouble} tone={emergencyBeds < 5 ? 'danger' : 'success'} /><MetricCard label="DIVERSION" value={selectedCapacity.diversion ? 'ON' : 'OFF'} sub={selectedCapacity.diversion ? 'Holding new transports' : 'Accepting inbound'} icon={Power} tone={selectedCapacity.diversion ? 'danger' : 'success'} /></div>
    <Panel title="INBOUND PATIENTS" subtitle="LIVE PRE-ARRIVAL NOTIFICATIONS · AUTO REFRESH 10S" className="flex min-h-0 flex-col overflow-hidden"><div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{error && <div className="border border-[#7F1D1D] bg-[#29151A] p-2 text-[11px] text-[#FCA5A5]">{error}</div>}{!loading && !selectedInbound.length && <div className="p-3 text-[11px] text-[#7E8A9A]">No active inbound dispatches for this facility.</div>}{selectedInbound.map((item) => { const record = item.destination || item; const isAcknowledged = acknowledged.includes(item.dispatch_id) || Boolean(record.acknowledged_at); return <div key={item.dispatch_id} className="flex items-center justify-between gap-3 border border-[#222B3A] bg-[#0F141D] p-3"><div className="min-w-0"><div className="flex items-center gap-2"><b className="text-xs">{item.incident_id}</b><PriorityBadge priority={item.priority} /></div><p className="mt-2 truncate text-[11px] text-[#AAB4C3]">{item.ambulance_code || 'Assigned ambulance'} · {item.dispatch_status}</p><p className="mt-1 text-[10px] text-[#7E8A9A]">ETA {item.eta_minutes ?? '—'} MIN · {item.hospitalName}</p>{record.patient && <p className="mt-2 text-[10px] text-[#D8E0EA]">Patient: {record.patient.name} · MRN {record.patient.medical_record_no}</p>}{record.assessment && <p className="mt-1 text-[10px] text-[#AAB4C3]">Assessment: HR {record.assessment.heart_rate ?? '—'} · BP {record.assessment.systolic_bp ?? '—'}/{record.assessment.diastolic_bp ?? '—'} · SpO₂ {record.assessment.spo2 ?? '—'} · {record.assessment.clinical_notes || 'No notes'}</p>}</div><ActionButton icon={Check} variant={isAcknowledged ? 'ghost' : 'primary'} onClick={() => acknowledge(item)}>{isAcknowledged ? 'ACKED' : 'ACCEPT'}</ActionButton></div> })}</div></Panel>
    <div className="flex min-h-0 flex-col gap-3"><Panel title="FACILITY CAPACITY" subtitle="ASSIGNED RECEIVING HOSPITAL" className="shrink-0"><div className="p-3"><div className="border border-[#222B3A] bg-[#0F141D] px-3 py-2 text-[11px] font-bold text-[#F5F7FA]">{selectedHospital ? `${selectedHospital.id} · ${selectedHospital.name}` : currentUser?.backendProfile?.hospital_id ? 'Loading assigned facility...' : 'No hospital assigned'}</div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><CapacityInput label="AVAILABLE" value={capacityDraft?.availableBeds ?? emergencyBeds} onChange={(value) => updateCapacityDraft('availableBeds', value)} /><CapacityInput label="ED BEDS" value={capacityDraft?.emergencyBeds ?? emergencyBeds} onChange={(value) => updateCapacityDraft('emergencyBeds', value)} /><CapacityInput label="ICU BEDS" value={capacityDraft?.icuBeds ?? icuBeds} onChange={(value) => updateCapacityDraft('icuBeds', value)} /><CapacityInput label="AMB SLOTS" value={capacityDraft?.ambulanceSlots ?? ambulanceSlots} onChange={(value) => updateCapacityDraft('ambulanceSlots', value)} /></div><div className="mt-3 flex items-center gap-2"><select value={capacityDraft?.capacity || selectedCapacity.capacity} onChange={(event) => updateCapacityDraft('capacity', event.target.value)} className="cad-input h-9 flex-1 py-1 text-[11px]"><option value="AVAILABLE">AVAILABLE</option><option value="LIMITED">LIMITED</option><option value="FULL">FULL</option></select><ActionButton icon={Save} variant="primary" onClick={saveCapacity}>SAVE CAPACITY</ActionButton></div><div className="mt-3 flex items-center justify-between text-[10px]"><span className="text-[#7E8A9A]">{selectedInbound.length} inbound dispatches</span><StatusBadge status={capacityDraft?.capacity || selectedCapacity.capacity} /></div></div></Panel><Panel title="SYSTEM CAPACITY" className="min-h-0 flex-1 overflow-hidden"><div className="h-full space-y-2 overflow-y-auto p-3">{hospitals.map((hospital) => { const capacity = capacities[hospital.id] || normalizeCapacity(null, hospital); return <div key={hospital.id} className="flex items-center justify-between border-b border-[#222B3A] pb-2"><div><b className="text-[11px]">{hospital.id} · {hospital.name}</b><p className="mt-1 text-[10px] text-[#7E8A9A]">ED {capacity.emergencyBeds} · {inbound.filter((item) => item.hospitalId === hospital.id).length} inbound</p></div><StatusBadge status={capacity.capacity} /></div> })}</div></Panel></div>
    <div className="flex min-h-0 flex-col gap-3"><Panel title="DIVERSION CONTROL" subtitle="Receiving status" className="shrink-0"><div className="p-3"><p className="text-[11px] text-[#AAB4C3]">{selectedCapacity.diversion ? 'Facility is diverting new inbound transports.' : 'Facility is accepting new inbound transports.'}</p><ActionButton className="mt-3 h-11 w-full" variant={selectedCapacity.diversion ? 'danger' : 'primary'} icon={Power} onClick={toggleDiversion}>{selectedCapacity.diversion ? 'DISABLE DIVERSION' : 'ENABLE DIVERSION'}</ActionButton><ActionButton className="mt-2 w-full" icon={RefreshCw} onClick={loadHospitalData}>REFRESH INBOUND QUEUE</ActionButton>{feedback && <p className="mt-2 text-[10px] text-[#86EFAC]">{feedback}</p>}</div></Panel><Panel title="RECEIVING WORKFLOW" className="min-h-0 flex-1"><div className="p-3 text-[11px] text-[#AAB4C3]"><p>Inbound dispatches are loaded from confirmed hospital destinations.</p><p className="mt-3 text-[#7E8A9A]">Accepting a notification acknowledges the destination record in the backend.</p></div></Panel></div>
  </div>
}

function Capacity({ label, value }) { return <div className="border border-[#222B3A] bg-[#0F141D] p-2"><span className="block text-[8px] tracking-wider text-[#7E8A9A]">{label}</span><b className="mt-1 block text-lg text-[#38BDF8]">{value}</b></div> }
function CapacityInput({ label, value, onChange }) { return <label className="border border-[#222B3A] bg-[#0F141D] p-2"><span className="block text-[8px] tracking-wider text-[#7E8A9A]">{label}</span><input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full bg-transparent text-lg text-[#38BDF8] outline-none" /></label> }
