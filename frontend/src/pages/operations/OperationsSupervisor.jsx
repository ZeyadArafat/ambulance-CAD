import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, Ambulance, Clock, Shuffle, Users } from 'lucide-react'
import ActionButton from '../../components/common/ActionButton'
import MetricCard from '../../components/common/MetricCard'
import Panel from '../../components/common/Panel'
import MapPanel from '../../components/map/MapPanel'
import UnitList from '../../components/units/UnitList'
import { useCad } from '../../context/CadContext'
import {
  getFleetDashboard,
  getOperationalReports,
  getParamedicStaff,
  getStaffingCurrent,
  getStations,
  getZones,
  getZoneCoverageAlerts,
  listHospitals,
  createCrewMember,
  reallocateUnit,
} from '../../api/emsApi'

export default function OperationsSupervisor() {
  const { units, incidents, hospitals: contextHospitals, setUnits } = useCad()
  const [unitId, setUnitId] = useState(units[0]?.id)
  const [zoneId, setZoneId] = useState('')
  const [stationId, setStationId] = useState('')
  const [notice, setNotice] = useState('')
  const [paramedics, setParamedics] = useState([])
  const [crewStaffId, setCrewStaffId] = useState('')
  const [crewAmbulanceId, setCrewAmbulanceId] = useState('')
  const [crewRole, setCrewRole] = useState('paramedic')
  const [shiftStart, setShiftStart] = useState('')
  const [shiftEnd, setShiftEnd] = useState('')
  const [fleetDashboard, setFleetDashboard] = useState(null)
  const [staffing, setStaffing] = useState([])
  const [coverageAlerts, setCoverageAlerts] = useState([])
  const [zones, setZones] = useState([])
  const [stations, setStations] = useState([])
  const [hospitals, setHospitals] = useState(contextHospitals)
  const [operationalReport, setOperationalReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const available = units.filter((unit) => unit.status === 'AVAILABLE')
  const activeIncidents = incidents.filter((incident) => incident.status !== 'Completed')
  const coverage = useMemo(() => coverageAlerts.length ? coverageAlerts : zones.map((zone) => ({ zone_code: zone.zone_code, active_unit_count: available.filter((unit) => unit.zone_id === zone.zone_id).length })), [available, coverageAlerts, zones])
  const availability = fleetDashboard?.availability || {}
  const countStatus = (status) => availability[status] ?? units.filter((unit) => unit.status === status.toUpperCase()).length

  useEffect(() => {
    let active = true
    Promise.allSettled([getFleetDashboard(), getStaffingCurrent(), getZoneCoverageAlerts(), getZones(), getStations(), listHospitals(), getOperationalReports(), getParamedicStaff()])
      .then(([dashboard, currentStaffing, alerts, zoneList, stationList, hospitalList, report, paramedicList]) => {
        if (!active) return
        if (dashboard.status === 'fulfilled') setFleetDashboard(dashboard.value)
        if (currentStaffing.status === 'fulfilled') setStaffing(Array.isArray(currentStaffing.value) ? currentStaffing.value : [])
        if (alerts.status === 'fulfilled') setCoverageAlerts(Array.isArray(alerts.value) ? alerts.value : [])
        if (zoneList.status === 'fulfilled') setZones(Array.isArray(zoneList.value) ? zoneList.value : [])
        if (stationList.status === 'fulfilled') setStations(Array.isArray(stationList.value) ? stationList.value : [])
        if (hospitalList.status === 'fulfilled') setHospitals(Array.isArray(hospitalList.value) ? hospitalList.value : contextHospitals)
        if (report.status === 'fulfilled') setOperationalReport(report.value)
        if (paramedicList.status === 'fulfilled') setParamedics(Array.isArray(paramedicList.value) ? paramedicList.value : [])
      })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [contextHospitals])

  useEffect(() => {
    const selected = units.find((unit) => unit.id === unitId)
    if (selected) {
      setZoneId(selected.zone_id || '')
      setStationId(selected.station_id || '')
    }
  }, [unitId, units])

  const reassign = async () => {
    const selected = units.find((unit) => unit.id === unitId)
    if (!selected || !zoneId || !stationId) return
    try {
      const updated = await reallocateUnit(selected.ambulance_id, { station_id: stationId, zone_id: zoneId })
      setUnits((items) => items.map((unit) => unit.id === unitId ? { ...unit, ...updated, zone_id: zoneId, station_id: stationId } : unit))
      setNotice(`${unitId} reallocated successfully.`)
    } catch (error) {
      setNotice(error.message || 'Unit reallocation failed.')
    }
  }

  const assignParamedicCrew = async () => {
    if (!crewStaffId || !crewAmbulanceId || !shiftStart) {
      setNotice('Select a paramedic, ambulance, and shift start.')
      return
    }
    try {
      await createCrewMember({
        staff_id: crewStaffId,
        ambulance_id: crewAmbulanceId,
        crew_role: crewRole,
        shift_start: new Date(shiftStart).toISOString(),
        shift_end: shiftEnd ? new Date(shiftEnd).toISOString() : null,
        status: 'active',
      })
      setNotice('Paramedic assigned to ambulance crew successfully.')
      setParamedics((items) => items.filter((item) => item.staff_id !== crewStaffId))
      setCrewStaffId('')
    } catch (error) {
      setNotice(error.message || 'Unable to assign paramedic to ambulance crew.')
    }
  }

  if (loading) return <div className="flex h-full items-center justify-center text-sm text-[#7E8A9A]">Loading operations dashboard...</div>

  return <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_330px] grid-rows-[68px_minmax(0,1fr)] gap-2 p-3">
    <div className="col-span-2 grid grid-cols-6 gap-3"><MetricCard label="OPEN INCIDENTS" value={fleetDashboard?.open_incidents ?? activeIncidents.length} icon={Activity} tone="danger" /><MetricCard label="AVAILABLE" value={countStatus('available')} icon={Ambulance} tone="success" /><MetricCard label="DISPATCHED" value={countStatus('dispatched')} icon={Clock} tone="info" /><MetricCard label="EN ROUTE" value={countStatus('en_route')} icon={Activity} tone="info" /><MetricCard label="HOSPITAL FULL" value={hospitals.filter((hospital) => String(hospital.capacity_status || hospital.capacity).toUpperCase() === 'FULL').length} icon={AlertTriangle} tone="danger" /><MetricCard label="TOTAL DISPATCHES" value={operationalReport?.dispatch_count ?? '—'} sub="operational report" icon={Clock} tone="info" /></div>
    <div className="flex min-h-0 flex-col gap-3"><MapPanel className="min-h-0 h-[56%]" title="FLEET / INCIDENT LIVE MAP" incidents={activeIncidents} units={units} /><div className="grid min-h-0 flex-1 grid-cols-3 gap-3"><Panel title="ZONE COVERAGE" className="min-h-0 overflow-hidden"><div className="grid h-full grid-cols-2 gap-x-3 overflow-y-auto p-3">{coverage.map((item) => <div key={item.zone_id || item.zone_code} className="flex justify-between border-b border-[#222B3A] py-1 text-[10px]"><span>{item.zone_code}</span><b className={item.active_unit_count ? 'text-[#22C55E]' : 'text-[#EF4444]'}>{item.active_unit_count} active</b></div>)}</div></Panel><Panel title="SHIFT / CREW" className="min-h-0"><div className="p-4"><Users className="text-[#38BDF8]" size={18} /><b className="mt-2 block text-xl">{staffing.length} on duty</b><p className="text-[10px] text-[#7E8A9A]">Current crew roster</p><p className="mt-3 text-[10px] text-[#AAB4C3]">{units.filter((unit) => unit.status !== 'AVAILABLE').length} units committed to incidents.</p></div></Panel><Panel title="OPERATIONAL ALERTS" className="min-h-0 overflow-hidden"><div className="h-full overflow-y-auto p-3">{coverage.filter((item) => !item.active_unit_count).map((item) => <div key={item.zone_id || item.zone_code} className="mb-2 border-l-2 border-[#EF4444] bg-[#28151A] p-2 text-[10px]"><b>{item.zone_code} COVERAGE LOW</b><p className="mt-1 text-[#AAB4C3]">No active ambulance assigned.</p></div>)}{!coverage.some((item) => !item.active_unit_count) && <div className="text-[10px] text-[#86EFAC]">No coverage alerts reported.</div>}</div></Panel></div></div>
    <aside className="flex min-h-0 flex-col gap-3"><Panel title="CREW ASSIGNMENT" subtitle="Assign active paramedics to ambulances"><div className="space-y-2 p-3"><select value={crewStaffId} onChange={(event) => setCrewStaffId(event.target.value)} className="cad-input h-9 py-1 text-[11px]"><option value="">Select paramedic</option>{paramedics.map((staff) => <option key={staff.staff_id} value={staff.staff_id}>{staff.first_name} {staff.last_name} · {staff.employee_number}</option>)}</select><select value={crewAmbulanceId} onChange={(event) => setCrewAmbulanceId(event.target.value)} className="cad-input h-9 py-1 text-[11px]"><option value="">Select ambulance</option>{units.map((unit) => <option key={unit.ambulance_id} value={unit.ambulance_id}>{unit.id} · {unit.status}</option>)}</select><select value={crewRole} onChange={(event) => setCrewRole(event.target.value)} className="cad-input h-9 py-1 text-[11px]"><option value="paramedic">Paramedic</option><option value="team_lead">Team lead</option></select><label className="block"><span className="cad-label">SHIFT START</span><input required type="datetime-local" value={shiftStart} onChange={(event) => setShiftStart(event.target.value)} className="cad-input" /></label><label className="block"><span className="cad-label">SHIFT END</span><input type="datetime-local" value={shiftEnd} onChange={(event) => setShiftEnd(event.target.value)} className="cad-input" /></label><ActionButton variant="primary" icon={Users} className="w-full" onClick={assignParamedicCrew} disabled={!crewStaffId || !crewAmbulanceId || !shiftStart}>ASSIGN CREW</ActionButton></div></Panel><Panel title="UNIT ALLOCATION" subtitle="Reassign across stations and zones" className="shrink-0"><div className="space-y-3 p-3"><select value={unitId || ''} onChange={(event) => setUnitId(event.target.value)} className="cad-input h-9 py-1 text-[11px]">{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.id} · {unit.status}</option>)}</select><select value={stationId} onChange={(event) => setStationId(event.target.value)} className="cad-input h-9 py-1 text-[11px]"><option value="">Select station</option>{stations.map((station) => <option key={station.station_id} value={station.station_id}>{station.station_code} · {station.station_name}</option>)}</select><select value={zoneId} onChange={(event) => setZoneId(event.target.value)} className="cad-input h-9 py-1 text-[11px]"><option value="">Select zone</option>{zones.map((zone) => <option key={zone.zone_id} value={zone.zone_id}>{zone.zone_code} · {zone.zone_name}</option>)}</select><ActionButton variant="primary" icon={Shuffle} className="w-full" onClick={reassign} disabled={!unitId || !stationId || !zoneId}>REASSIGN UNIT</ActionButton>{notice && <p className="text-[10px] text-[#86EFAC]">{notice}</p>}</div></Panel><Panel title="UNIT ROSTER" subtitle={`${available.length} available`} className="flex min-h-0 flex-1 flex-col overflow-hidden"><div className="min-h-0 flex-1 overflow-y-auto"><UnitList units={units} selectedId={unitId} onSelect={(unit) => setUnitId(unit.id)} /></div></Panel></aside>
  </div>
}
