import { useMemo, useState } from 'react'
import { Activity, AlertTriangle, Ambulance, Clock, Shuffle, Users } from 'lucide-react'
import ActionButton from '../../components/common/ActionButton'
import MetricCard from '../../components/common/MetricCard'
import Panel from '../../components/common/Panel'
import MapPanel from '../../components/map/MapPanel'
import UnitList from '../../components/units/UnitList'
import { useCad } from '../../context/CadContext'

export default function OperationsSupervisor() {
  const { units, incidents, hospitals, setUnits } = useCad()
  const [unitId, setUnitId] = useState(units[0]?.id)
  const [zone, setZone] = useState('Z-04')
  const [notice, setNotice] = useState('')
  const available = units.filter((unit) => unit.status === 'AVAILABLE')
  const activeIncidents = incidents.filter((incident) => incident.status !== 'Completed')
  const coverage = useMemo(() => Array.from({ length: 10 }, (_, index) => { const id = `Z-${String(index).padStart(2, '0')}`; return { id, count: available.filter((unit) => unit.homeZone === id).length } }), [available])
  const reassign = () => { if (!unitId) return; setUnits((items) => items.map((unit) => unit.id === unitId ? { ...unit, homeZone: zone } : unit)); setNotice(`${unitId} reassigned to ${zone}.`) }
  return <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_330px] grid-rows-[auto_minmax(0,1fr)] gap-3 p-4">
    <div className="col-span-2 grid grid-cols-6 gap-3"><MetricCard label="ACTIVE INCIDENTS" value={activeIncidents.length} icon={Activity} tone="danger" /><MetricCard label="AVAILABLE" value={available.length} icon={Ambulance} tone="success" /><MetricCard label="EN ROUTE" value={units.filter((unit) => unit.status === 'EN ROUTE').length} icon={Clock} tone="info" /><MetricCard label="ON SCENE" value={units.filter((unit) => unit.status === 'ON SCENE').length} icon={Activity} /><MetricCard label="HOSPITAL FULL" value={hospitals.filter((hospital) => hospital.capacity === 'FULL').length} icon={AlertTriangle} tone="danger" /><MetricCard label="AVG RESPONSE" value="7.4m" sub="last 24 hours" icon={Clock} tone="info" /></div>
    <div className="flex min-h-0 flex-col gap-3"><MapPanel className="min-h-0 h-[56%]" title="FLEET / INCIDENT LIVE MAP" incidents={activeIncidents} units={units} /><div className="grid min-h-0 flex-1 grid-cols-3 gap-3"><Panel title="ZONE COVERAGE" className="min-h-0 overflow-hidden"><div className="grid h-full grid-cols-2 gap-x-3 overflow-y-auto p-3">{coverage.map((item) => <div key={item.id} className="flex justify-between border-b border-[#222B3A] py-1 text-[10px]"><span>{item.id}</span><b className={item.count ? 'text-[#22C55E]' : 'text-[#EF4444]'}>{item.count} ready</b></div>)}</div></Panel><Panel title="SHIFT / CREW" className="min-h-0"><div className="p-4"><Users className="text-[#38BDF8]" size={18} /><b className="mt-2 block text-xl">36 / 40</b><p className="text-[10px] text-[#7E8A9A]">Crew rostered for this shift</p><p className="mt-3 text-[10px] text-[#AAB4C3]">{units.filter((unit) => unit.status !== 'AVAILABLE').length} units committed to incidents.</p></div></Panel><Panel title="OPERATIONAL ALERTS" className="min-h-0 overflow-hidden"><div className="h-full overflow-y-auto p-3"><div className="border-l-2 border-[#EF4444] bg-[#28151A] p-2 text-[10px]"><b>Z-07 COVERAGE LOW</b><p className="mt-1 text-[#AAB4C3]">No available ambulance assigned.</p></div><div className="mt-2 border-l-2 border-[#F59E0B] bg-[#251B0D] p-2 text-[10px]">{hospitals.find((hospital) => hospital.capacity === 'FULL')?.id || 'H-04'} reporting full capacity.</div></div></Panel></div></div>
    <aside className="flex min-h-0 flex-col gap-3"><Panel title="UNIT ALLOCATION" subtitle="Reassign home-zone coverage" className="shrink-0"><div className="space-y-3 p-3"><select value={unitId} onChange={(event) => setUnitId(event.target.value)} className="cad-input h-9 py-1 text-[11px]">{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.id} · {unit.status}</option>)}</select><select value={zone} onChange={(event) => setZone(event.target.value)} className="cad-input h-9 py-1 text-[11px]">{coverage.map((item) => <option key={item.id}>{item.id}</option>)}</select><ActionButton variant="primary" icon={Shuffle} className="w-full" onClick={reassign}>REASSIGN UNIT</ActionButton>{notice && <p className="text-[10px] text-[#86EFAC]">{notice}</p>}</div></Panel><Panel title="UNIT ROSTER" subtitle={`${available.length} available`} className="flex min-h-0 flex-1 flex-col overflow-hidden"><div className="min-h-0 flex-1 overflow-y-auto"><UnitList units={units} selectedId={unitId} onSelect={(unit) => setUnitId(unit.id)} /></div></Panel></aside>
  </div>
}
