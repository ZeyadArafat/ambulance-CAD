import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Battery, Car, CalendarDays, Search, Thermometer, Wrench } from 'lucide-react'
import ActionButton from '../../components/common/ActionButton'
import DataTable from '../../components/common/DataTable'
import MetricCard from '../../components/common/MetricCard'
import Panel from '../../components/common/Panel'
import StatusBadge from '../../components/common/StatusBadge'
import {
  createMaintenanceRecord,
  getFleetDashboard,
  getMaintenanceRecords,
  getVehicleAlerts,
  getVehicleDiagnostics,
  getVehicles,
  setVehicleServiceStatus,
} from '../../api/emsApi'

const normalizeStatus = (status) => {
  const value = String(status || '').toLowerCase()
  if (value === 'available' || value === 'in_service' || value === 'dispatched' || value === 'en_route') return 'IN SERVICE'
  if (value === 'maintenance') return 'MAINTENANCE'
  if (value === 'out_of_service') return 'OUT OF SERVICE'
  return value.replace(/_/g, ' ').toUpperCase() || 'UNKNOWN'
}

const normalizeVehicle = (vehicle) => ({
  ...vehicle,
  id: vehicle.ambulance_code || vehicle.ambulance_id,
  vehicleId: vehicle.ambulance_id,
  callSign: vehicle.call_sign || vehicle.ambulance_code,
  status: normalizeStatus(vehicle.status),
  mileage: Number(vehicle.mileage || 0),
  faults: [],
  temperature: null,
  battery: null,
  maintenanceRecords: [],
})

const diagnosticValue = (diagnostics, names) => {
  const item = diagnostics.find((diagnostic) => names.includes(String(diagnostic.diagnostic_type || '').toLowerCase()))
  return item ? Number(item.value) || item.value : null
}

export default function FleetMaintenance() {
  const [records, setRecords] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [fleetDashboard, setFleetDashboard] = useState(null)

  useEffect(() => {
    Promise.all([getVehicles(), getFleetDashboard()])
      .then(([vehicleResponse, dashboardResponse]) => {
        const vehicles = (Array.isArray(vehicleResponse) ? vehicleResponse : []).map(normalizeVehicle)
        setRecords(vehicles)
        setSelectedId((current) => current || vehicles[0]?.id || '')
        setFleetDashboard(dashboardResponse)
      })
      .catch((loadError) => setError(loadError.message || 'Unable to load fleet data.'))
      .finally(() => setLoading(false))
  }, [])

  const selected = records.find((record) => record.id === selectedId) || records[0]

  useEffect(() => {
    if (!selected?.vehicleId) return undefined
    let active = true
    setDetailsLoading(true)
    Promise.allSettled([
      getVehicleDiagnostics(selected.vehicleId),
      getVehicleAlerts(selected.vehicleId),
      getMaintenanceRecords(selected.vehicleId),
    ]).then(([diagnosticsResult, alertsResult, maintenanceResult]) => {
      if (!active) return
      const diagnostics = diagnosticsResult.status === 'fulfilled' ? diagnosticsResult.value : []
      const alerts = alertsResult.status === 'fulfilled' ? alertsResult.value : []
      const maintenanceRecords = maintenanceResult.status === 'fulfilled' ? maintenanceResult.value : []
      const faults = [
        ...diagnostics.filter((item) => item.severity !== 'info').map((item) => item.diagnostic_type || item.value),
        ...alerts.map((item) => item.alert_type || item.message),
      ]
      setRecords((items) => items.map((record) => record.id === selected.id ? {
        ...record,
        temperature: diagnosticValue(diagnostics, ['engine_temperature', 'temperature', 'engine temp']),
        battery: diagnosticValue(diagnostics, ['battery', 'battery_voltage', 'battery_level']),
        faults,
        maintenanceRecords,
      } : record))
      setDetailsLoading(false)
    })
    return () => { active = false }
  }, [selected?.vehicleId, selected?.id])

  const filtered = useMemo(() => records.filter((record) => (filter === 'ALL' || record.status === filter) && `${record.id} ${record.callSign} ${record.faults.join(' ')}`.toLowerCase().includes(query.toLowerCase())), [records, filter, query])

  const updateStatus = async (status, label) => {
    if (!selected?.vehicleId) return
    try {
      await setVehicleServiceStatus(selected.vehicleId, { status })
      setRecords((items) => items.map((record) => record.id === selected.id ? { ...record, status: normalizeStatus(status) } : record))
      setFeedback(`${selected.id} marked ${label}.`)
    } catch (actionError) {
      setFeedback(actionError.message || 'Unable to update vehicle service status.')
    }
  }

  const scheduleMaintenance = async () => {
    if (!selected?.vehicleId) return
    try {
      await createMaintenanceRecord(selected.vehicleId, { maintenance_type: 'preventive_service', maintenance_date: new Date().toISOString(), description: 'Maintenance scheduled by fleet operations.', odometer: selected.mileage, status: 'scheduled' })
      await setVehicleServiceStatus(selected.vehicleId, { status: 'maintenance' })
      setRecords((items) => items.map((record) => record.id === selected.id ? { ...record, status: 'MAINTENANCE' } : record))
      setFeedback(`${selected.id} maintenance scheduled.`)
    } catch (actionError) {
      setFeedback(actionError.message || 'Unable to schedule maintenance.')
    }
  }

  const availability = fleetDashboard?.availability || {}
  const readyCount = availability.available ?? records.filter((record) => record.status === 'IN SERVICE').length

  return <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_350px] grid-rows-[auto_minmax(0,1fr)] gap-3 p-4">
    <div className="col-span-2 grid grid-cols-5 gap-3"><MetricCard label="FLEET READY" value={`${readyCount}/${records.length}`} icon={Car} tone="success" /><MetricCard label="ACTIVE FAULTS" value={records.filter((record) => record.faults.length).length} icon={AlertTriangle} tone="danger" /><MetricCard label="CRITICAL" value={records.filter((record) => record.vehicle_health_status === 'critical').length} icon={AlertTriangle} tone="danger" /><MetricCard label="SERVICE DUE" value={availability.maintenance ?? records.filter((record) => record.status === 'MAINTENANCE').length} icon={CalendarDays} /><MetricCard label="CAN BUS" value={loading ? '...' : 'ONLINE'} sub="Backend telemetry" icon={Battery} tone="success" /></div>
    <Panel title="VEHICLE STATUS" subtitle="LIVE VEHICLE DATA · BACKEND API" className="flex min-h-0 flex-col overflow-hidden"><div className="flex gap-2 border-b border-[#222B3A] p-3"><div className="relative flex-1"><Search size={14} className="absolute left-3 top-2.5 text-[#7E8A9A]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search unit or DTC" className="cad-input h-9 py-1 pl-9 text-[11px]" /></div><select value={filter} onChange={(event) => setFilter(event.target.value)} className="cad-input h-9 w-36 py-1 text-[11px]"><option>ALL</option><option>IN SERVICE</option><option>MAINTENANCE</option><option>OUT OF SERVICE</option></select></div>{error && <div className="border-b border-[#7F1D1D] bg-[#29151A] px-3 py-2 text-[11px] text-[#FCA5A5]">{error}</div>}<div className="min-h-0 flex-1 overflow-auto">{loading ? <div className="p-4 text-[11px] text-[#7E8A9A]">Loading fleet data...</div> : <DataTable rows={filtered} onRowClick={(record) => setSelectedId(record.id)} columns={[{ key: 'id', label: 'Unit' }, { key: 'mileage', label: 'Mileage' }, { key: 'temperature', label: 'Temp', render: (record) => record.temperature === null ? '—' : <span className={record.temperature > 100 ? 'text-[#EF4444]' : ''}>{record.temperature}°C</span> }, { key: 'battery', label: 'Battery', render: (record) => record.battery === null ? '—' : `${record.battery}%` }, { key: 'faults', label: 'DTC / Faults', render: (record) => record.faults.join(', ') || '—' }, { key: 'status', label: 'Status', render: (record) => <StatusBadge status={record.status} /> }]} />}</div></Panel>
    <aside className="flex min-h-0 flex-col gap-3"><Panel title={`VEHICLE HEALTH · ${selected?.id || '—'}`} className="shrink-0"><div className="p-3"><div className="grid grid-cols-2 gap-2"><Health icon={Thermometer} label="ENGINE TEMP" value={selected?.temperature === null ? '—' : `${selected?.temperature}°C`} danger={selected?.temperature > 100} /><Health icon={Battery} label="BATTERY" value={selected?.battery === null ? '—' : `${selected?.battery}%`} danger={selected?.battery < 70} /></div><p className="mt-3 text-[11px] text-[#AAB4C3]">Health: <b>{selected?.vehicle_health_status || 'unknown'}</b> · Mileage: <b>{selected?.mileage ?? '—'}</b></p><p className="mt-2 flex items-center gap-2 text-[10px] text-[#7E8A9A]"><CalendarDays size={13} />{detailsLoading ? 'Loading maintenance history...' : `${selected?.maintenanceRecords?.length || 0} maintenance records`}</p><div className="mt-3 grid grid-cols-2 gap-2"><ActionButton icon={Wrench} variant="danger" onClick={() => updateStatus('out_of_service', 'OUT OF SERVICE')}>OUT OF SERVICE</ActionButton><ActionButton icon={Car} onClick={() => updateStatus('available', 'IN SERVICE')}>RETURN TO SERVICE</ActionButton></div><ActionButton className="mt-2 w-full" variant="primary" onClick={scheduleMaintenance}>SCHEDULE MAINTENANCE</ActionButton>{feedback && <p className="mt-2 text-[10px] text-[#86EFAC]">{feedback}</p>}</div></Panel><Panel title="FAULT / DTC RECORD" className="min-h-0 flex-1 overflow-hidden"><div className="h-full overflow-y-auto p-3">{records.filter((record) => record.faults.length).map((record) => <button key={record.id} type="button" onClick={() => setSelectedId(record.id)} className="mb-2 w-full border border-[#222B3A] p-2 text-left hover:border-[#38BDF8]"><div className="flex justify-between text-[11px]"><b>{record.id}</b><StatusBadge status={record.status} /></div><p className="mt-1 text-[10px] text-[#AAB4C3]">{record.faults.join(' · ')}</p></button>)}{!records.some((record) => record.faults.length) && <div className="text-[10px] text-[#7E8A9A]">No active vehicle faults.</div>}</div></Panel></aside>
  </div>
}
function Health({ icon: Icon, label, value, danger }) { return <div className="border border-[#222B3A] bg-[#0F141D] p-2"><Icon size={14} className={danger ? 'text-[#EF4444]' : 'text-[#38BDF8]'} /><span className="mt-1 block text-[8px] tracking-wider text-[#7E8A9A]">{label}</span><b className={danger ? 'text-[#FCA5A5]' : ''}>{value}</b></div> }
