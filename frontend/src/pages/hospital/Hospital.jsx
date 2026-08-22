import { useMemo, useState } from 'react'
import { BedDouble, Check, Hospital as HospitalIcon, Power, RefreshCw, Siren } from 'lucide-react'
import ActionButton from '../../components/common/ActionButton'
import MetricCard from '../../components/common/MetricCard'
import Panel from '../../components/common/Panel'
import PriorityBadge from '../../components/common/PriorityBadge'
import StatusBadge from '../../components/common/StatusBadge'
import { useCad } from '../../context/CadContext'

export default function Hospital() {
  const { incidents, hospitals } = useCad()
  const [diversion, setDiversion] = useState(false)
  const [acknowledged, setAcknowledged] = useState([])
  const [selectedHospitalId, setSelectedHospitalId] = useState('H-01')
  const inbound = useMemo(() => incidents.filter((incident) => incident.assignedUnit && incident.status !== 'Completed').slice(0, 6), [incidents])
  const selectedHospital = hospitals.find((hospital) => hospital.id === selectedHospitalId) || hospitals[0]
  const emergencyBeds = selectedHospital?.beds ?? 0
  const icuBeds = Math.max(0, Math.floor(emergencyBeds / 3))
  const ambulanceSlots = Math.max(0, 4 - (selectedHospital?.inbound ?? 0))

  return <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_340px] grid-rows-[auto_minmax(0,1fr)] gap-3 p-4">
    <div className="col-span-2 grid grid-cols-4 gap-3"><MetricCard label="FACILITY LINK" value="ONLINE" sub="CAD inbound feed" icon={HospitalIcon} tone="success" /><MetricCard label="INBOUND AMBULANCES" value={inbound.length} sub="Pre-arrival queue" icon={Siren} tone="info" /><MetricCard label="ED BEDS OPEN" value={emergencyBeds} sub={`${icuBeds} ICU beds available`} icon={BedDouble} tone={emergencyBeds < 5 ? 'danger' : 'success'} /><MetricCard label="DIVERSION" value={diversion ? 'ON' : 'OFF'} sub={diversion ? 'Holding new transports' : 'Accepting inbound'} icon={Power} tone={diversion ? 'danger' : 'success'} /></div>
    <Panel title="INBOUND PATIENTS" subtitle="LIVE PRE-ARRIVAL NOTIFICATIONS" className="flex min-h-0 flex-col overflow-hidden"><div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">{inbound.map((incident) => { const isAcknowledged = acknowledged.includes(incident.id); return <div key={incident.id} className="flex items-center justify-between gap-3 border border-[#222B3A] bg-[#0F141D] p-3"><div className="min-w-0"><div className="flex items-center gap-2"><b className="text-xs">{incident.id}</b><PriorityBadge priority={incident.priority} /></div><p className="mt-2 truncate text-[11px] text-[#AAB4C3]">{incident.description}</p><p className="mt-1 text-[10px] text-[#7E8A9A]">{incident.assignedUnit} · ETA 6 MIN · {incident.location}</p></div><ActionButton icon={Check} variant={isAcknowledged ? 'ghost' : 'primary'} onClick={() => setAcknowledged((items) => items.includes(incident.id) ? items : [...items, incident.id])}>{isAcknowledged ? 'ACKED' : 'ACCEPT'}</ActionButton></div> })}</div></Panel>
    <div className="flex min-h-0 flex-col gap-3"><Panel title="FACILITY CAPACITY" subtitle="SELECT RECEIVING HOSPITAL" className="shrink-0"><div className="p-3"><select value={selectedHospitalId} onChange={(event) => setSelectedHospitalId(event.target.value)} className="cad-input h-9 py-1 text-[11px]">{hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.id} · {hospital.name}</option>)}</select><div className="mt-3 grid grid-cols-3 gap-2 text-center"><Capacity label="ED BEDS" value={emergencyBeds} /><Capacity label="ICU BEDS" value={icuBeds} /><Capacity label="AMB SLOTS" value={ambulanceSlots} /></div><div className="mt-3 flex items-center justify-between text-[10px]"><span className="text-[#7E8A9A]">{selectedHospital?.zone} · {selectedHospital?.occupied} currently occupied</span><StatusBadge status={selectedHospital?.capacity} /></div></div></Panel><Panel title="SYSTEM CAPACITY" className="min-h-0 flex-1 overflow-hidden"><div className="h-full overflow-y-auto p-3 space-y-2">{hospitals.map((hospital) => <div key={hospital.id} className="flex items-center justify-between border-b border-[#222B3A] pb-2"><div><b className="text-[11px]">{hospital.id} · {hospital.name}</b><p className="mt-1 text-[10px] text-[#7E8A9A]">ED {hospital.beds} · {hospital.inbound} inbound</p></div><StatusBadge status={hospital.capacity} /></div>)}</div></Panel></div>
    <div className="flex min-h-0 flex-col gap-3"><Panel title="DIVERSION CONTROL" subtitle="Mock facility receiving status" className="shrink-0"><div className="p-3"><p className="text-[11px] text-[#AAB4C3]">{diversion ? 'Facility is diverting new inbound transports.' : 'Facility is accepting new inbound transports.'}</p><ActionButton className="mt-3 h-11 w-full" variant={diversion ? 'danger' : 'primary'} icon={Power} onClick={() => setDiversion((value) => !value)}>{diversion ? 'DISABLE DIVERSION' : 'ENABLE DIVERSION'}</ActionButton><ActionButton className="mt-2 w-full" icon={RefreshCw} onClick={() => setAcknowledged([])}>REFRESH INBOUND QUEUE</ActionButton></div></Panel><Panel title="RECEIVING WORKFLOW" className="min-h-0 flex-1"><div className="p-3 text-[11px] text-[#AAB4C3]"><p>Accepted patients are marked in the inbound list for local handoff coordination.</p><p className="mt-3 text-[#7E8A9A]">Destination and inbound acknowledgement screens are prepared for the confirmed hospital-capacity and dispatch-destination API areas.</p></div></Panel></div>
  </div>
}

function Capacity({ label, value }) { return <div className="border border-[#222B3A] bg-[#0F141D] p-2"><span className="block text-[8px] tracking-wider text-[#7E8A9A]">{label}</span><b className="mt-1 block text-lg text-[#38BDF8]">{value}</b></div> }
