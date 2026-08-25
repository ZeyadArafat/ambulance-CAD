import { useEffect, useMemo, useState } from 'react'
import { Download, FileText, MapPinned, Plus, ShieldCheck, SlidersHorizontal, Truck, Users } from 'lucide-react'
import ActionButton from '../../components/common/ActionButton'
import DataTable from '../../components/common/DataTable'
import Modal from '../../components/common/Modal'
import Panel from '../../components/common/Panel'
import SearchInput from '../../components/common/SearchInput'
import {
  createUser as createUserApi,
  createStaff,
  createStation,
  createVehicle,
  createZone,
  downloadOperationalReport,
  exportOperationalReports,
  getAuditLog,
  getDispatchRecommendationProtocol,
  getRoles,
  getStaff,
  getStations,
  getUsers,
  getVehicles,
  getZones,
  getTriageProtocols,
  patchDispatchRecommendationProtocol,
  patchTriageProtocols,
  updateUser,
} from '../../api/emsApi'

const emptyDraft = { username: '', email: '', password: '', roleId: '' }
const emptyStaffDraft = { username: '', email: '', password: '', roleId: '', employee_number: '', first_name: '', last_name: '', middle_name: '', phone: '', hire_date: '' }
const emptyMasterDraft = { kind: 'station', station_code: '', station_name: '', address: '', latitude: '', longitude: '', zone_code: '', zone_name: '', ambulance_code: '', call_sign: '', registration_number: '', ambulance_type: 'basic_life_support', station_id: '', zone_id: '' }

function normalizeUser(user, roles) {
  const userRoles = (user.role_ids || [])
    .map((roleId) => roles.find((role) => role.role_id === roleId)?.role_name)
    .filter(Boolean)
  return {
    ...user,
    id: user.user_id,
    name: user.username,
    role: userRoles.join(', ') || 'Unassigned',
    status: user.is_active ? 'ACTIVE' : 'SUSPENDED',
  }
}

export default function AdminDashboard() {
  const [records, setRecords] = useState([])
  const [availableRoles, setAvailableRoles] = useState([])
  const [audit, setAudit] = useState([])
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('ALL')
  const [modalOpen, setModalOpenState] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [staffDraft, setStaffDraft] = useState(emptyStaffDraft)
  const [staffModalOpen, setStaffModalOpen] = useState(false)
  const [staffRecords, setStaffRecords] = useState([])
  const setModalOpen = (open) => {
    if (open) {
      setStaffDraft(emptyStaffDraft)
      setStaffModalOpen(true)
      return
    }

    setModalOpenState(false)
  }
  const [feedback, setFeedback] = useState('')
  const [auditQuery, setAuditQuery] = useState('')
  const [masterData, setMasterData] = useState({ stations: [], zones: [], vehicles: [] })
  const [triage, setTriage] = useState(null)
  const [recommendation, setRecommendation] = useState(null)
  const [masterModalOpen, setMasterModalOpen] = useState(false)
  const [masterDraft, setMasterDraft] = useState(emptyMasterDraft)
  const [loading, setLoading] = useState(true)
  const roles = availableRoles.map((item) => item.role_name)
  const visible = useMemo(() => records.filter((user) => (role === 'ALL' || user.role.split(', ').includes(role)) && `${user.name} ${user.role}`.toLowerCase().includes(query.toLowerCase())), [records, query, role])

  useEffect(() => {
    setLoading(true)
    Promise.all([getUsers(), getRoles(), getStaff(), getAuditLog(), getStations(), getZones(), getVehicles(), getTriageProtocols(), getDispatchRecommendationProtocol()])
      .then(([userResponse, roleResponse, staffResponse, auditResponse, stationResponse, zoneResponse, vehicleResponse, triageResponse, recommendationResponse]) => {
        const roleList = Array.isArray(roleResponse) ? roleResponse : []
        setAvailableRoles(roleList)
        setRecords((Array.isArray(userResponse) ? userResponse : []).map((user) => normalizeUser(user, roleList)))
        setStaffRecords(Array.isArray(staffResponse) ? staffResponse : [])
        setAudit(Array.isArray(auditResponse) ? auditResponse : [])
        setMasterData({
          stations: Array.isArray(stationResponse) ? stationResponse : [],
          zones: Array.isArray(zoneResponse) ? zoneResponse : [],
          vehicles: Array.isArray(vehicleResponse) ? vehicleResponse : [],
        })
        setTriage(triageResponse)
        setRecommendation(recommendationResponse)
      })
      .catch((error) => setFeedback(error.message || 'Unable to load administration data.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    getAuditLog(auditQuery ? { query: auditQuery } : {})
      .then((response) => setAudit(Array.isArray(response) ? response : []))
      .catch((error) => setFeedback(error.message || 'Unable to load audit log.'))
  }, [auditQuery])

  const refreshUsers = async () => {
    const response = await getUsers()
    setRecords((Array.isArray(response) ? response : []).map((user) => normalizeUser(user, availableRoles)))
  }

  const refreshStaff = async () => {
    const response = await getStaff()
    setStaffRecords(Array.isArray(response) ? response : [])
  }

  const toggleStatus = async (user) => {
    try {
      await updateUser(user.id, { is_active: user.status !== 'ACTIVE' })
      await refreshUsers()
      setFeedback(`${user.name} is now ${user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'}.`)
    } catch (error) {
      setFeedback(error.message || 'Unable to update account status.')
    }
  }

  const changeRole = async (user, roleId) => {
    try {
      await updateUser(user.id, { role_ids: [roleId] })
      await refreshUsers()
      setFeedback(`${user.name}'s role was updated.`)
    } catch (error) {
      setFeedback(error.message || 'Unable to update account role.')
    }
  }

  const createUser = async () => {
    if (!draft.username.trim() || !draft.email.trim() || !draft.password || !draft.roleId) {
      setFeedback('Username, email, password, and role are required.')
      return
    }

    try {
      await createUserApi({ username: draft.username.trim(), email: draft.email.trim(), password: draft.password, role_ids: [draft.roleId] })
      await refreshUsers()
      setModalOpen(false)
      setFeedback(`Created account for ${draft.username.trim()}.`)
      setDraft(emptyDraft)
    } catch (error) {
      setFeedback(error.message || 'Unable to create user account.')
    }
  }

  const createStaffMember = async () => {
    const required = ['username', 'email', 'password', 'roleId', 'employee_number', 'first_name', 'last_name']
    if (required.some((field) => !String(staffDraft[field] || '').trim())) {
      setFeedback('Account, employee number, first name, and last name are required.')
      return
    }

    try {
      const user = await createUserApi({
        username: staffDraft.username.trim(),
        email: staffDraft.email.trim(),
        password: staffDraft.password,
        role_ids: [staffDraft.roleId],
      })
      await createStaff({
        user_id: user.user_id,
        employee_number: staffDraft.employee_number.trim(),
        first_name: staffDraft.first_name.trim(),
        last_name: staffDraft.last_name.trim(),
        middle_name: staffDraft.middle_name.trim() || null,
        phone: staffDraft.phone.trim() || null,
        email: staffDraft.email.trim(),
        hire_date: staffDraft.hire_date || null,
        employment_status: 'active',
      })
      await Promise.all([refreshUsers(), refreshStaff()])
      setStaffModalOpen(false)
      setStaffDraft(emptyStaffDraft)
      setFeedback(`Created staff member ${staffDraft.first_name.trim()} ${staffDraft.last_name.trim()}.`)
    } catch (error) {
      setFeedback(error.message || 'Unable to create staff member.')
    }
  }

  const exportReport = async (format) => {
    try {
      if (format === 'json') {
        await exportOperationalReports(format)
      } else {
        const blob = await downloadOperationalReport(format)
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `cad-operational-report.${format}`
        link.click()
        URL.revokeObjectURL(link.href)
      }
      setFeedback(`${format.toUpperCase()} operational report prepared.`)
    } catch (error) {
      setFeedback(error.message || 'Unable to export report.')
    }
  }

  const createMasterRecord = async () => {
    try {
      if (masterDraft.kind === 'station') {
        await createStation({ station_code: masterDraft.station_code.trim(), station_name: masterDraft.station_name.trim(), address: masterDraft.address.trim() || null, latitude: Number(masterDraft.latitude), longitude: Number(masterDraft.longitude) })
      } else if (masterDraft.kind === 'zone') {
        await createZone({ zone_code: masterDraft.zone_code.trim(), zone_name: masterDraft.zone_name.trim(), coverage_area: masterDraft.address.trim() || null })
      } else {
        await createVehicle({ station_id: masterDraft.station_id, zone_id: masterDraft.zone_id, ambulance_code: masterDraft.ambulance_code.trim(), call_sign: masterDraft.call_sign.trim(), registration_number: masterDraft.registration_number.trim(), ambulance_type: masterDraft.ambulance_type, current_latitude: 0, current_longitude: 0 })
      }
      const [stations, zones, vehicles] = await Promise.all([getStations(), getZones(), getVehicles()])
      setMasterData({ stations, zones, vehicles })
      setMasterModalOpen(false)
      setMasterDraft(emptyMasterDraft)
      setFeedback(`${masterDraft.kind.toUpperCase()} master record created.`)
    } catch (error) {
      setFeedback(error.message || 'Unable to create master record.')
    }
  }

  const saveProtocols = async () => {
    try {
      await Promise.all([patchTriageProtocols(triage), patchDispatchRecommendationProtocol(recommendation)])
      setFeedback('Dispatch and triage protocols saved.')
    } catch (error) {
      setFeedback(error.message || 'Unable to save protocols.')
    }
  }
  return <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_360px] grid-rows-[auto_minmax(0,1fr)] gap-3 p-4">
    <div className="col-span-2 grid grid-cols-6 gap-3"><Info icon={Users} label="USER ACCOUNTS" value={records.length} /><Info icon={ShieldCheck} label="ACTIVE ACCOUNTS" value={records.filter((user) => user.status === 'ACTIVE').length} /><Info icon={FileText} label="ROLES CONFIGURED" value={roles.length} /><Info icon={MapPinned} label="STATIONS" value={masterData.stations.length} /><Info icon={SlidersHorizontal} label="ZONES" value={masterData.zones.length} /><Info icon={Truck} label="VEHICLES" value={masterData.vehicles.length} /><Info icon={Users} label="STAFF" value={staffRecords.length} /></div>
    <Panel title="USER MANAGEMENT" subtitle="Accounts and access roles" actions={<ActionButton icon={Plus} variant="primary" onClick={() => setModalOpen(true)}>CREATE USER</ActionButton>} className="flex min-h-0 flex-col overflow-hidden"><div className="flex gap-2 border-b border-[#222B3A] p-3"><div className="max-w-sm flex-1"><SearchInput value={query} onChange={setQuery} placeholder="Search username or role" /></div><select value={role} onChange={(event) => setRole(event.target.value)} className="cad-input w-44 text-[11px]"><option>ALL</option>{roles.map((item) => <option key={item}>{item}</option>)}</select></div><div className="min-h-0 flex-1 overflow-auto">{loading ? <div className="p-6 text-center text-[11px] text-[#7E8A9A]">Loading live administration data...</div> : visible.length === 0 ? <div className="p-6 text-center text-[11px] text-[#7E8A9A]">No backend user accounts match the current filter.</div> : <DataTable rows={visible} columns={[{ key: 'id', label: 'ID' }, { key: 'name', label: 'Username' }, { key: 'role', label: 'Role', render: (user) => <select value={user.role_ids?.[0] || ''} onChange={(event) => changeRole(user, event.target.value)} className="cad-input h-7 min-w-32 py-0 text-[10px]"><option value="">Unassigned</option>{availableRoles.map((item) => <option key={item.role_id} value={item.role_id}>{item.role_name}</option>)}</select> }, { key: 'status', label: 'Status', render: (user) => <span className={user.status === 'ACTIVE' ? 'text-[#86EFAC]' : 'text-[#FCA5A5]'}>{user.status}</span> }, { key: 'action', label: 'Action', render: (user) => <button type="button" onClick={(event) => { event.stopPropagation(); toggleStatus(user) }} className="text-[10px] font-bold text-[#38BDF8]">{user.status === 'ACTIVE' ? 'SUSPEND' : 'ACTIVATE'}</button> }]} />}</div>{feedback && <div className="border-t border-[#222B3A] px-3 py-2 text-[10px] text-[#86EFAC]">{feedback}</div>}</Panel>
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto"><Panel title="MASTER DATA" subtitle="Stations, zones, and vehicles"><div className="grid grid-cols-3 gap-2 p-3"><ActionButton icon={MapPinned} onClick={() => { setMasterDraft({ ...emptyMasterDraft, kind: 'station' }); setMasterModalOpen(true) }}>STATION</ActionButton><ActionButton icon={SlidersHorizontal} onClick={() => { setMasterDraft({ ...emptyMasterDraft, kind: 'zone' }); setMasterModalOpen(true) }}>ZONE</ActionButton><ActionButton icon={Truck} onClick={() => { setMasterDraft({ ...emptyMasterDraft, kind: 'vehicle' }); setMasterModalOpen(true) }}>VEHICLE</ActionButton></div><div className="grid grid-cols-3 gap-2 px-3 pb-3 text-[10px] text-[#AAB4C3]"><span>{masterData.stations.length} stations</span><span>{masterData.zones.length} zones</span><span>{masterData.vehicles.length} vehicles</span></div></Panel><Panel title="PROTOCOL CONFIGURATION" subtitle="Triage and dispatch recommendation parameters"><div className="space-y-3 p-3 text-[10px]">{triage && <label className="block"><span className="cad-label">PRIORITY ORDER</span><input value={triage.priorities.join(', ')} onChange={(event) => setTriage({ ...triage, priorities: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} className="cad-input h-8 text-[10px]" /></label>}{recommendation && <label className="block"><span className="cad-label">ETA WEIGHT</span><input type="number" step="0.1" value={recommendation.eta_weight} onChange={(event) => setRecommendation({ ...recommendation, eta_weight: Number(event.target.value) })} className="cad-input h-8 text-[10px]" /></label>}<ActionButton icon={SlidersHorizontal} variant="primary" className="w-full" disabled={!triage || !recommendation} onClick={saveProtocols}>SAVE PROTOCOLS</ActionButton></div></Panel><Panel title="AUDIT LOG" subtitle="Recent administrative activity" className="min-h-[220px] flex flex-col overflow-hidden"><div className="p-3"><SearchInput value={auditQuery} onChange={setAuditQuery} placeholder="Search audit log" /></div><div className="min-h-0 flex-1 overflow-auto"><DataTable rows={audit} columns={[{ key: 'created_at', label: 'Time' }, { key: 'user_id', label: 'Actor' }, { key: 'action', label: 'Action' }, { key: 'resource', label: 'Resource' }]} /></div></Panel><Panel title="OPERATIONAL REPORTS" className="shrink-0"><div className="flex flex-wrap gap-2 p-3"><ActionButton icon={Download} onClick={() => exportReport('csv')}>CSV</ActionButton><ActionButton icon={Download} onClick={() => exportReport('pdf')}>PDF</ActionButton><ActionButton icon={Download} onClick={() => exportReport('json')}>JSON</ActionButton></div></Panel></aside>
    <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="CREATE USER ACCOUNT"><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); createUser() }}><label><span className="cad-label">USERNAME</span><input required value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} className="cad-input" autoComplete="username" /></label><label><span className="cad-label">EMAIL</span><input required type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className="cad-input" autoComplete="email" /></label><label><span className="cad-label">PASSWORD</span><input required type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} className="cad-input" autoComplete="new-password" /></label><label><span className="cad-label">ROLE</span><select required value={draft.roleId} onChange={(event) => setDraft({ ...draft, roleId: event.target.value })} className="cad-input"><option value="">Select a role</option>{availableRoles.map((item) => <option key={item.role_id} value={item.role_id}>{item.role_name}</option>)}</select></label><ActionButton type="submit" variant="primary" className="w-full">CREATE ACCOUNT</ActionButton></form><ActionButton icon={Users} className="mt-3 w-full" onClick={() => { setModalOpen(false); setStaffDraft(emptyStaffDraft); setStaffModalOpen(true) }}>CREATE STAFF MEMBER</ActionButton></Modal>
    <Modal open={staffModalOpen} onClose={() => setStaffModalOpen(false)} title="CREATE STAFF MEMBER"><form className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto" onSubmit={(event) => { event.preventDefault(); createStaffMember() }}><Input label="USERNAME" value={staffDraft.username} onChange={(value) => setStaffDraft({ ...staffDraft, username: value })} /><Input label="EMAIL" value={staffDraft.email} onChange={(value) => setStaffDraft({ ...staffDraft, email: value })} /><Input label="PASSWORD" value={staffDraft.password} onChange={(value) => setStaffDraft({ ...staffDraft, password: value })} /><label className="block"><span className="cad-label">ROLE</span><select required value={staffDraft.roleId} onChange={(event) => setStaffDraft({ ...staffDraft, roleId: event.target.value })} className="cad-input"><option value="">Select a role</option>{availableRoles.map((item) => <option key={item.role_id} value={item.role_id}>{item.role_name}</option>)}</select></label><Input label="EMPLOYEE NUMBER" value={staffDraft.employee_number} onChange={(value) => setStaffDraft({ ...staffDraft, employee_number: value })} /><Input label="FIRST NAME" value={staffDraft.first_name} onChange={(value) => setStaffDraft({ ...staffDraft, first_name: value })} /><Input label="MIDDLE NAME" value={staffDraft.middle_name} onChange={(value) => setStaffDraft({ ...staffDraft, middle_name: value })} /><Input label="LAST NAME" value={staffDraft.last_name} onChange={(value) => setStaffDraft({ ...staffDraft, last_name: value })} /><Input label="PHONE" value={staffDraft.phone} onChange={(value) => setStaffDraft({ ...staffDraft, phone: value })} /><Input label="HIRE DATE" value={staffDraft.hire_date} onChange={(value) => setStaffDraft({ ...staffDraft, hire_date: value })} type="date" /><ActionButton type="submit" variant="primary" className="col-span-2">CREATE STAFF MEMBER</ActionButton></form></Modal>
    <Modal open={masterModalOpen} onClose={() => setMasterModalOpen(false)} title={`CREATE ${masterDraft.kind.toUpperCase()}`}><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); createMasterRecord() }}>{masterDraft.kind === 'station' && <><Input label="CODE" value={masterDraft.station_code} onChange={(value) => setMasterDraft({ ...masterDraft, station_code: value })} /><Input label="NAME" value={masterDraft.station_name} onChange={(value) => setMasterDraft({ ...masterDraft, station_name: value })} /><Input label="ADDRESS" value={masterDraft.address} onChange={(value) => setMasterDraft({ ...masterDraft, address: value })} /><div className="grid grid-cols-2 gap-2"><Input label="LATITUDE" value={masterDraft.latitude} onChange={(value) => setMasterDraft({ ...masterDraft, latitude: value })} /><Input label="LONGITUDE" value={masterDraft.longitude} onChange={(value) => setMasterDraft({ ...masterDraft, longitude: value })} /></div></>}{masterDraft.kind === 'zone' && <><Input label="CODE" value={masterDraft.zone_code} onChange={(value) => setMasterDraft({ ...masterDraft, zone_code: value })} /><Input label="NAME" value={masterDraft.zone_name} onChange={(value) => setMasterDraft({ ...masterDraft, zone_name: value })} /></>}{masterDraft.kind === 'vehicle' && <><Input label="AMBULANCE CODE" value={masterDraft.ambulance_code} onChange={(value) => setMasterDraft({ ...masterDraft, ambulance_code: value })} /><Input label="CALL SIGN" value={masterDraft.call_sign} onChange={(value) => setMasterDraft({ ...masterDraft, call_sign: value })} /><Input label="REGISTRATION" value={masterDraft.registration_number} onChange={(value) => setMasterDraft({ ...masterDraft, registration_number: value })} /><label className="block"><span className="cad-label">AMBULANCE TYPE</span><select required value={masterDraft.ambulance_type} onChange={(event) => setMasterDraft({ ...masterDraft, ambulance_type: event.target.value })} className="cad-input"><option value="basic_life_support">Basic Life Support</option><option value="advanced_life_support">Advanced Life Support</option><option value="patient_transport">Patient Transport</option></select></label><select required value={masterDraft.station_id} onChange={(event) => setMasterDraft({ ...masterDraft, station_id: event.target.value })} className="cad-input"><option value="">Select station</option>{masterData.stations.map((item) => <option key={item.station_id} value={item.station_id}>{item.station_code}</option>)}</select><select required value={masterDraft.zone_id} onChange={(event) => setMasterDraft({ ...masterDraft, zone_id: event.target.value })} className="cad-input"><option value="">Select zone</option>{masterData.zones.map((item) => <option key={item.zone_id} value={item.zone_id}>{item.zone_code}</option>)}</select></>}<ActionButton type="submit" variant="primary" className="w-full">CREATE RECORD</ActionButton></form></Modal>
  </div>
}
function Info({ icon: Icon, label, value }) { return <div className="cad-panel flex items-center justify-between p-3"><div><p className="text-[10px] tracking-wider text-[#7E8A9A]">{label}</p><b className="mt-1 block text-2xl">{value}</b></div><Icon className="text-[#38BDF8]" size={18} /></div> }
function Input({ label, value, onChange, type = 'text' }) { return <label className="block"><span className="cad-label">{label}</span><input required type={type} value={value} onChange={(event) => onChange(event.target.value)} className="cad-input" /></label> }
