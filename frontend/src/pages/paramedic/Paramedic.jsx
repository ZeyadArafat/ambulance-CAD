import { useState } from 'react'
import { CheckCircle2, Clipboard, MapPinned, Navigation, Save, Wifi, WifiOff } from 'lucide-react'
import ActionButton from '../../components/common/ActionButton'
import Panel from '../../components/common/Panel'
import PriorityBadge from '../../components/common/PriorityBadge'
import MapPanel from '../../components/map/MapPanel'
import { useCad } from '../../context/CadContext'

const lifecycle = [
  ['EN ROUTE', 'EN ROUTE'], ['ARRIVED SCENE', 'ON SCENE'], ['TRANSPORTING', 'TRANSPORTING'], ['ARRIVED HOSPITAL', 'AT HOSPITAL'],
]

export default function Paramedic() {
  const { incidents, units, hospitals, updateUnitStatus, saveAssessment, completeIncident } = useCad()
  const unit = units.find((item) => item.id === 'AMB-07') || units[0]
  const incident = incidents.find((item) => item.assignedUnit === unit?.id) || incidents.find((item) => item.id === 'CAD-2984') || incidents[0]
  const [state, setState] = useState(unit?.status === 'AVAILABLE' ? 'EN ROUTE' : unit?.status)
  const [offline, setOffline] = useState(false)
  const [hospitalId, setHospitalId] = useState('H-01')
  const [saved, setSaved] = useState(false)
  const [assessment, setAssessment] = useState(() => incident?.assessment || { patient: 'Unknown adult', age: '', pulse: '', bp: '', spo2: '', gcs: '15', notes: '' })
  const hospital = hospitals.find((item) => item.id === hospitalId)

  const setLifecycle = (label, unitStatus) => {
    setState(unitStatus)
    updateUnitStatus(unit.id, unitStatus)
    setSaved(false)
  }

  const updateAssessment = (field, value) => {
    setAssessment((current) => ({ ...current, [field]: value }))
    setSaved(false)
  }

  const persistAssessment = () => {
    if (!incident) return
    saveAssessment(incident.id, { ...assessment, destinationHospital: hospitalId, status: state })
    setSaved(true)
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(260px,1fr)_minmax(0,1.5fr)_minmax(300px,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-3 p-4">
      <header className="col-span-3 flex items-center justify-between border-b border-[#222B3A] pb-3">
        <div><p className="text-[10px] font-bold tracking-[0.14em] text-[#7E8A9A]">MOBILE CLINICAL WORKSPACE · {unit?.id}</p><h1 className="mt-1 text-lg font-bold">{incident?.id || 'NO ASSIGNMENT'}</h1></div>
        <button type="button" onClick={() => setOffline((value) => !value)} className={`flex items-center gap-2 border px-3 py-2 text-[10px] font-bold ${offline ? 'border-[#F59E0B]/50 text-[#FCD34D]' : 'border-[#22C55E]/50 text-[#86EFAC]'}`}>{offline ? <WifiOff size={14} /> : <Wifi size={14} />}{offline ? 'OFFLINE DOCUMENTATION' : 'CAD CONNECTED'}</button>
      </header>

      <div className="flex min-h-0 flex-col gap-3">
        <Panel title="ASSIGNED INCIDENT" subtitle={incident?.location} className="shrink-0"><div className="p-3"><div className="flex items-center justify-between"><PriorityBadge priority={incident?.priority} /><span className="text-xs font-bold text-[#38BDF8]">{unit?.eta ?? '—'} MIN ETA</span></div><p className="mt-3 text-xs font-semibold text-[#F5F7FA]">{incident?.description}</p><p className="mt-2 flex items-center gap-2 text-[11px] text-[#AAB4C3]"><MapPinned size={14} className="text-[#38BDF8]" />{incident?.location}</p><p className="mt-2 text-[10px] text-[#7E8A9A]">UNIT: {unit?.callSign} · {unit?.capability} · {unit?.homeZone}</p></div></Panel>
        <Panel title="DISPATCH LIFECYCLE" className="min-h-0 flex-1 overflow-hidden"><div className="grid h-full grid-rows-4 gap-2 p-3">{lifecycle.map(([label, unitStatus]) => <button key={label} type="button" onClick={() => setLifecycle(label, unitStatus)} className={`border px-3 text-left text-[11px] font-extrabold tracking-wide ${state === unitStatus ? 'border-[#38BDF8] bg-[#1B2A3A] text-[#F5F7FA]' : 'border-[#222B3A] bg-[#0F141D] text-[#7E8A9A]'}`}><span className="mr-2 text-[#38BDF8]">{state === unitStatus ? '●' : '○'}</span>{label}</button>)}</div></Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-3"><MapPanel className="h-[38%] min-h-[210px]" title="NAVIGATION · MOCK ROUTE" incidents={incident ? [incident] : []} units={unit ? [unit] : []} /><Panel title="PATIENT / PREHOSPITAL ASSESSMENT" subtitle="Mock record ready for assessment API" className="flex min-h-0 flex-1 flex-col overflow-hidden"><div className="min-h-0 flex-1 overflow-y-auto p-3"><div className="grid grid-cols-2 gap-2"><Input label="PATIENT" value={assessment.patient} onChange={(value) => updateAssessment('patient', value)} /><Input label="AGE" value={assessment.age} onChange={(value) => updateAssessment('age', value)} /><Input label="PULSE" value={assessment.pulse} onChange={(value) => updateAssessment('pulse', value)} /><Input label="BP" value={assessment.bp} onChange={(value) => updateAssessment('bp', value)} /><Input label="SPO₂" value={assessment.spo2} onChange={(value) => updateAssessment('spo2', value)} /><Input label="GCS" value={assessment.gcs} onChange={(value) => updateAssessment('gcs', value)} /></div><label className="mt-3 block"><span className="cad-label">CLINICAL NOTES</span><textarea value={assessment.notes} onChange={(event) => updateAssessment('notes', event.target.value)} className="h-24 w-full resize-none border border-[#222B3A] bg-[#0F141D] px-3 py-2 text-[11px] outline-none focus:border-[#38BDF8]" placeholder="Assessment findings, interventions, and handoff notes" /></label></div><div className="border-t border-[#222B3A] p-3"><ActionButton icon={Save} variant="primary" className="w-full" onClick={persistAssessment}>{saved ? 'ASSESSMENT SAVED' : 'SAVE ASSESSMENT'}</ActionButton></div></Panel></div>

      <div className="flex min-h-0 flex-col gap-3"><Panel title="DESTINATION HOSPITAL" subtitle="Receiving facility workflow" className="shrink-0"><div className="p-3"><select value={hospitalId} onChange={(event) => { setHospitalId(event.target.value); setSaved(false) }} className="cad-input h-9 py-1 text-[11px]">{hospitals.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.name}</option>)}</select><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div className="border border-[#222B3A] bg-[#0F141D] p-2"><span className="text-[#7E8A9A]">CAPACITY</span><b className="mt-1 block">{hospital?.capacity}</b></div><div className="border border-[#222B3A] bg-[#0F141D] p-2"><span className="text-[#7E8A9A]">AMB SLOTS</span><b className="mt-1 block">{hospital?.inbound ?? 0} inbound</b></div></div></div></Panel>
        <Panel title="CURRENT STATUS" className="shrink-0"><div className="p-3"><div className="flex items-center gap-2 text-xs"><Clipboard size={16} className="text-[#38BDF8]" /><b>{state || 'ASSIGNED'}</b></div><p className="mt-2 text-[10px] text-[#AAB4C3]">Destination: {hospital?.name || 'Not selected'}</p><p className="mt-1 text-[10px] text-[#7E8A9A]">Document before closing this assignment.</p></div></Panel>
        <Panel title="INCIDENT CLOSEOUT" className="min-h-0 flex-1"><div className="flex h-full flex-col p-3"><p className="text-[11px] text-[#AAB4C3]">Returns the unit to available and marks the incident completed in mock CAD state.</p><ActionButton icon={Navigation} className="mt-3" onClick={() => setLifecycle('ARRIVED HOSPITAL', 'AT HOSPITAL')}>MARK ARRIVED HOSPITAL</ActionButton><ActionButton variant="primary" icon={CheckCircle2} className="mt-auto h-12 w-full" disabled={!incident} onClick={() => completeIncident(incident.id, unit.id, assessment.notes)}>COMPLETE / AVAILABLE</ActionButton></div></Panel>
      </div>
    </div>
  )
}

function Input({ label, value, onChange }) {
  return <label><span className="cad-label">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="cad-input h-8 py-1 text-[11px]" /></label>
}
