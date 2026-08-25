import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { hospitals } from '../data/mockHospitals'
import { users } from '../data/mockUsers'
import { maintenance } from '../data/mockMaintenance'
import {
  addIncidentNote,
  createIncident,
  createV1Call,
  createV1Dispatch,
  getDispatchBoard,
  getDispatchEta,
  getDispatchRecommendationV1,
  getIncidentById,
  getIncidentQueue,
  listIncidents,
  listUnits,
  patchDispatch,
  sendDispatchMessage,
  setIncidentPriority,
  submitIncident as submitIncidentApi,
  updateIncident,
  updateV1Dispatch,
} from '../api/emsApi'
import {
  getCurrentUser,
  login as loginApi,
  logout as logoutApi,
} from '../api/authApi'
import { clearAuthToken, setAuthToken } from '../api/apiClient'

const CadContext = createContext(null)

const toRouteRole = (role) => {
  const normalizedRole = String(role || '').trim().toLowerCase().replace(/[_\s]+/g, '-')
  const aliases = {
    'call-taker': 'call-taker',
    calltaker: 'call-taker',
    dispatcher: 'dispatcher',
    paramedic: 'paramedic',
    hospital: 'hospital',
    operations: 'operations',
    'operations-supervisor': 'operations',
    fleet: 'fleet',
    maintenance: 'fleet',
    'fleet-maintenance': 'fleet',
    admin: 'admin',
    administrator: 'admin',
  }

  return aliases[normalizedRole] || null
}

const normalizePriority = (value = 'medium') => {
  const normalized = String(value || 'medium').toUpperCase()

  if (['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO'].includes(normalized)) {
    return normalized
  }

  switch (normalized.toLowerCase()) {
    case 'low':
      return 'ALPHA'
    case 'medium':
      return 'CHARLIE'
    case 'high':
      return 'DELTA'
    case 'critical':
      return 'ECHO'
    default:
      return 'CHARLIE'
  }
}

const normalizeIncident = (incident = {}, fallbackId = 'CAD-0000') => {
  const rawId = incident.incident_id || incident.id || incident.incident_number || fallbackId
  const description = incident.incident_description || incident.description || incident.narrative || incident.chiefComplaint || 'No summary available.'
  const location = incident.location_description || incident.location || 'Unknown location'
  const timeValue = incident.incident_time || incident.time || new Date().toISOString()

  return {
    ...incident,
    id: String(rawId),
    incident_id: incident.incident_id || incident.id || null,
    incident_number: incident.incident_number || String(rawId),
    time: typeof timeValue === 'string' && timeValue.includes('T')
      ? new Date(timeValue).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : timeValue,
    priority: normalizePriority(incident.priority),
    description,
    location,
    status: incident.status || 'Pending',
    notes: Array.isArray(incident.notes) ? incident.notes : [],
    assignedUnit: incident.assignedUnit || incident.assigned_unit || null,
  }
}

const normalizeUnit = (unit = {}, fallbackId = 'AMB-00') => {
  const id = unit.id || unit.ambulance_code || unit.code || unit.ambulance_id || fallbackId

  return {
    ...unit,
    id: String(id),
    callSign: unit.callSign || unit.call_sign || unit.ambulance_code || String(id),
    status: String(unit.status || 'available').toUpperCase(),
    capability: unit.capability || unit.ambulance_type || 'UNKNOWN',
    crew_member_id: unit.crew_member_id || unit.crewMemberId || null,
    assignedIncident: unit.assignedIncident || unit.assigned_incident || null,
  }
}

const coerceArray = (payload) => {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  if (Array.isArray(payload.items)) return payload.items
  if (Array.isArray(payload.data)) return payload.data
  if (Array.isArray(payload.results)) return payload.results
  return []
}

const normalizeCoordinate = (value, axis) => {
  const num = Number(value)

  if (!Number.isFinite(num)) return null
  if (axis === 'lat' && (num < -90 || num > 90)) return null
  if (axis === 'lng' && (num < -180 || num > 180)) return null

  return num
}

const geocodeAddress = async (location) => {
  const text = String(location || '').trim()

  if (!text) return null

  try {
    const query = new URLSearchParams({
      q: text.includes('egypt') ? text : `${text}, Egypt`,
      format: 'jsonv2',
      limit: '1',
    })

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${query.toString()}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
      },
    })

    if (!response.ok) return null

    const result = await response.json()
    const match = result?.[0]

    if (!match) return null

    const lat = normalizeCoordinate(match.lat, 'lat')
    const lng = normalizeCoordinate(match.lon, 'lng')

    if (lat === null || lng === null) return null

    return { latitude: lat, longitude: lng }
  } catch (error) {
    return null
  }
}

const buildIncidentApiPayload = (payload) => {
  const incidentType = payload.incident_type || payload.chiefComplaint || payload.incidentType || 'Medical'
  const description = payload.description || payload.narrative || payload.chiefComplaint || ''

  return {
    incident_number: payload.incident_number || payload.id || `INC-${Date.now()}`,
    incident_type: incidentType,
    priority: normalizePriority(payload.priority),
    severity: payload.severity || 'moderate',
    incident_description: description,
    location_description: payload.location || '',
    latitude: normalizeCoordinate(payload.latitude, 'lat') ?? 30.0444,
    longitude: normalizeCoordinate(payload.longitude, 'lng') ?? 31.2357,
    incident_time: new Date().toISOString(),
    emergency_call_id: payload.emergency_call_id || null,
    patient_id: payload.patient_id || null,
  }
}

const attemptBackendSync = async () => {
  try {
    const [incidentResponse, unitResponse, queueResponse, dispatchResponse] = await Promise.all([
      listIncidents({}),
      listUnits(),
      getIncidentQueue(),
      getDispatchBoard(),
    ])

    const incidentList = coerceArray(incidentResponse)
    const unitList = coerceArray(unitResponse)
    const queueList = coerceArray(queueResponse)
    const dispatchList = coerceArray(dispatchResponse)
    const activeDispatches = dispatchList.filter((dispatch) => !['completed', 'cancelled'].includes(String(dispatch.dispatch_status).toLowerCase()))
    const dispatchByIncident = new Map(activeDispatches.map((dispatch) => [String(dispatch.incident_id), dispatch]))
    const dispatchByAmbulance = new Map(activeDispatches.flatMap((dispatch) => [
      [String(dispatch.ambulance_id), dispatch],
      [String(dispatch.ambulance_code), dispatch],
    ]))
    const sourceIncidents = incidentList.length ? incidentList : queueList

    return {
      success: true,
      incidents: sourceIncidents.map((item, index) => {
        const normalized = normalizeIncident(item, `CAD-${index + 1}`)
        const dispatch = dispatchByIncident.get(String(normalized.incident_id)) || activeDispatches.find(
          (candidate) => String(candidate.ambulance_code) === String(normalized.assignedUnit)
        )
        return dispatch
          ? normalizeIncident({ ...item, assignedUnit: dispatch.ambulance_code, dispatch_id: dispatch.dispatch_id, eta_minutes: dispatch.eta_minutes, status: dispatch.dispatch_status }, normalized.id)
          : normalized
      }),
      units: (() => {
        const normalizedUnits = unitList.map((item, index) => {
          const unit = normalizeUnit(item, `AMB-${String(index + 1).padStart(2, '0')}`)
          const dispatch = dispatchByAmbulance.get(String(unit.ambulance_id)) || dispatchByAmbulance.get(String(unit.ambulance_code))

          return dispatch
            ? { ...unit, status: String(dispatch.dispatch_status).toUpperCase(), assignedIncident: String(dispatch.incident_id), eta: dispatch.eta_minutes ?? unit.eta }
            : unit
        })
        const knownAmbulances = new Set(normalizedUnits.flatMap((unit) => [String(unit.ambulance_id), String(unit.ambulance_code)]))

        return [
          ...normalizedUnits,
          ...activeDispatches
            .filter((dispatch) => !knownAmbulances.has(String(dispatch.ambulance_id)) && !knownAmbulances.has(String(dispatch.ambulance_code)))
            .map((dispatch) => normalizeUnit({
              ambulance_id: dispatch.ambulance_id,
              ambulance_code: dispatch.ambulance_code,
              crew_member_id: dispatch.crew_member_id,
              status: dispatch.dispatch_status,
              assignedIncident: dispatch.incident_id,
              eta: dispatch.eta_minutes,
            }, `AMB-${dispatch.ambulance_id}`)),
        ]
      })(),
    }
  } catch (error) {
    return {
      success: false,
      reason: localStorage.getItem('access_token') ? (error.message || 'unavailable') : 'authentication-required',
      incidents: [],
      units: [],
    }
  }
}

export function CadProvider({ children }) {
  const [incidents, setIncidents] = useState([])
  const [units, setUnits] = useState([])
  const [messages, setMessages] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [backendAvailable, setBackendAvailable] = useState(false)
  const [backendAuthenticated, setBackendAuthenticated] = useState(Boolean(localStorage.getItem('access_token')))
  const [backendError, setBackendError] = useState('')

  useEffect(() => {
    let isMounted = true

    const hydrate = async () => {
      setLoading(true)

      const storedToken = localStorage.getItem('access_token')

      if (storedToken) {
        try {
          const profile = await getCurrentUser()
          const profileRole = (profile?.roles || []).map(toRouteRole).find(Boolean)
          const user = users.find((item) => item.roleKey === profileRole)

          if (!user) {
            throw new Error('Your account has no supported operational role.')
          }

          setCurrentUser({
            ...user,
            name: profile.username || user.name,
            backendProfile: profile,
          })
          setBackendAuthenticated(true)
        } catch (error) {
          clearAuthToken()
          setBackendAuthenticated(false)
          setCurrentUser(null)
          setBackendError(error.message || 'authentication-required')
          setLoading(false)
          return
        }
      } else {
        setLoading(false)
        return
      }

      const data = await attemptBackendSync()

      if (!isMounted) return

      if (data.success) {
        setIncidents(data.incidents)
        setUnits(data.units)
      }
      setBackendAvailable(data.success)
      setBackendError(data.success ? '' : data.reason)
      setLoading(false)
    }

    hydrate().catch(() => {
      if (!isMounted) return
      setBackendAvailable(false)
      setBackendError('unavailable')
      setLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const handleUnauthorized = () => {
      setBackendAuthenticated(false)
      setCurrentUser(null)
      localStorage.removeItem('cad_role')
      localStorage.removeItem('cad_username')
      setBackendError('Session expired or is no longer valid.')
    }

    window.addEventListener('auth:unauthorized', handleUnauthorized)

    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized)
  }, [])

  const [currentUser, setCurrentUser] = useState(() => {
    if (!localStorage.getItem('access_token')) {
      return null
    }

    const role = localStorage.getItem('cad_role')
    const username = localStorage.getItem('cad_username')

    if (!role) {
      return null
    }

    const user = users.find((u) => u.roleKey === role)

    if (!user) {
      return null
    }

    return {
      ...user,
      name: username || user.name,
    }
  })

  const loginAs = async (roleKey, username = 'Demo User', password = '') => {
    if (!password) {
      return { success: false, message: 'PASSWORD is required.' }
    }

    try {
      const tokenResponse = await loginApi(username.trim(), password)
      const accessToken = tokenResponse?.access_token

      if (!accessToken) {
        throw new Error('Login response did not include an access token.')
      }

      setAuthToken(accessToken)
      const profile = await getCurrentUser()
      const backendRoles = Array.isArray(profile?.roles) ? profile.roles : []
      const backendRoleKeys = backendRoles.map(toRouteRole).filter(Boolean)
      const resolvedRole = backendRoleKeys[0]
      const user = users.find((item) => item.roleKey === resolvedRole)

      if (!resolvedRole || !user) {
        throw new Error('Your account has no supported operational role.')
      }

      const loggedInUser = {
        ...user,
        name: profile.username || username.trim() || user.name,
        backendProfile: profile,
      }

      setBackendAuthenticated(true)
      setBackendError('')
      setCurrentUser(loggedInUser)
      localStorage.setItem('cad_role', loggedInUser.roleKey)
      localStorage.setItem('cad_username', loggedInUser.name)

      return { success: true, mode: 'backend', backendAuthenticated: true, user: loggedInUser }
    } catch (error) {
      clearAuthToken()
      setBackendAuthenticated(false)
      setBackendError(error.message || 'authentication-failed')
      return { success: false, message: error.message || 'Unable to authenticate with the EMS CAD backend.' }
    }
  }

  const logout = () => {
    try {
      logoutApi().catch((error) => {
        setBackendError(error.message || 'logout-request-failed')
      })
    } catch (error) {
      setBackendError(error.message || 'logout-request-failed')
    }

    clearAuthToken()
    setBackendAuthenticated(false)
    localStorage.removeItem('cad_role')
    localStorage.removeItem('cad_username')
    setCurrentUser(null)
  }

  const addIncident = async (payload) => {
    const geocodedLocation = await geocodeAddress(payload.location).catch(() => null)
    const resolvedLatitude = normalizeCoordinate(payload.latitude, 'lat') ?? geocodedLocation?.latitude ?? 30.0444
    const resolvedLongitude = normalizeCoordinate(payload.longitude, 'lng') ?? geocodedLocation?.longitude ?? 31.2357

    const localIncident = {
      ...payload,
      latitude: resolvedLatitude,
      longitude: resolvedLongitude,
      id: `CAD-${Date.now()}`,
      time: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      status: 'Pending',
      notes: [],
    }

    try {
      const callTakerId = currentUser?.backendProfile?.user_id
      if (!callTakerId) throw new Error('Authenticated call-taker profile is unavailable.')

      const emergencyCall = await createV1Call({
        caller_name: payload.caller,
        caller_phone: payload.callback,
        call_source: 'phone',
        narrative: payload.narrative,
        chief_complaint: payload.chiefComplaint,
        location_description: payload.location,
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
      })

      const backendPayload = buildIncidentApiPayload({
        ...payload,
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
      })
      const backendIncident = await createIncident({
        ...backendPayload,
        emergency_call_id: emergencyCall.emergency_call_id,
      })
      await submitIncidentApi(backendIncident.incident_id)
      const submittedIncident = await getIncidentById(backendIncident.incident_id)
      const createdIncident = normalizeIncident({
        ...submittedIncident,
        caller: payload.caller,
        callback: payload.callback,
        chiefComplaint: payload.chiefComplaint,
        narrative: payload.narrative,
        emergency_call_id: emergencyCall.emergency_call_id,
      }, localIncident.id)
      setBackendAvailable(true)
      setBackendError('')

      setIncidents((prev) => [createdIncident, ...prev.filter((incident) => incident.id !== createdIncident.id)])

      setNotifications((prev) =>
        [
          {
            id: Date.now(),
            type: 'success',
            message: `${createdIncident.id} submitted to dispatch queue.`,
          },
          ...prev,
        ].slice(0, 4)
      )

      return { ...createdIncident, backendPersisted: true, localFallback: false }
    } catch (error) {
      setBackendAvailable(false)
      setBackendError(error.message || 'incident-create-failed')
      setIncidents((prev) => [localIncident, ...prev])

      setNotifications((prev) =>
        [
          {
            id: Date.now(),
            type: 'warning',
            message: `${localIncident.id} saved locally; backend persistence failed.`,
          },
          ...prev,
        ].slice(0, 4)
      )

      return { ...localIncident, backendPersisted: false, localFallback: true }
    }
  }

  const appendNote = async (incidentId, note) => {
    if (!note.trim()) return

    const incident = incidents.find((item) => item.id === incidentId)

    if (incident?.incident_id) {
      try {
        await addIncidentNote(incident.incident_id, note.trim())
        const refreshedIncident = await getIncidentById(incident.incident_id)
        const normalizedIncident = normalizeIncident(refreshedIncident, incident.id)
        setBackendAvailable(true)
        setBackendError('')

        setIncidents((prev) => prev.map((item) => item.id === incidentId ? normalizedIncident : item))
        setNotifications((prev) => [{ id: Date.now(), type: 'success', message: `Note appended to ${incidentId}.` }, ...prev].slice(0, 4))
        return { ...normalizedIncident, backendPersisted: true, localFallback: false }
      } catch (error) {
        setBackendAvailable(false)
        setBackendError(error.message || 'incident-note-failed')
      }
    }

    setIncidents((prev) =>
      prev.map((incident) =>
        incident.id === incidentId
          ? {
              ...incident,
              notes: [
                ...(incident.notes || []),
                {
                  text: note,
                  at: new Date().toLocaleTimeString(),
                },
              ],
            }
          : incident
      )
    )

    setNotifications((prev) =>
      [
        {
          id: Date.now(),
          type: 'warning',
          message: `Note added locally to ${incidentId}; backend persistence failed.`,
        },
        ...prev,
      ].slice(0, 4)
    )

    return { success: false, backendPersisted: false, localFallback: true }
  }

  const updateIncidentStatus = async (incidentId, status) => {
    const incident = incidents.find((item) => item.id === incidentId)
    const normalizedStatus = String(status || '').toLowerCase()
    const dispatchStatuses = ['en_route', 'arrived_scene', 'transporting', 'arrived_hospital', 'completed', 'cancelled']

    if (incident?.dispatch_id && dispatchStatuses.includes(normalizedStatus)) {
      try {
        const dispatch = await patchDispatch(incident.dispatch_id, { status: normalizedStatus })
        const updatedIncident = { ...incident, status: dispatch?.dispatch_status || normalizedStatus, dispatch }
        setBackendAvailable(true)
        setBackendError('')
        setIncidents((prev) => prev.map((item) => item.id === incidentId ? updatedIncident : item))
        setNotifications((prev) => [{ id: Date.now(), type: 'success', message: `${incidentId} dispatch status updated.` }, ...prev].slice(0, 4))
        return updatedIncident
      } catch (error) {
        setBackendAvailable(false)
        setBackendError(error.message || 'dispatch-status-failed')
      }
    }

    if (incident?.incident_id) {
      try {
        const response = await updateIncident(incident.incident_id, { status: normalizedStatus })
        const updatedIncident = normalizeIncident(response, incident.id)
        setBackendAvailable(true)
        setBackendError('')
        setIncidents((prev) => prev.map((item) => item.id === incidentId ? updatedIncident : item))
        setNotifications((prev) => [{ id: Date.now(), type: 'success', message: `${incidentId} status updated to ${updatedIncident.status}.` }, ...prev].slice(0, 4))
        return updatedIncident
      } catch (error) {
        setBackendAvailable(false)
        setBackendError(error.message || 'incident-status-failed')
      }
    }

    setIncidents((prev) =>
      prev.map((incident) =>
        incident.id === incidentId ? { ...incident, status } : incident
      )
    )

    setNotifications((prev) =>
      [{ id: Date.now(), type: 'warning', message: `${incidentId} updated locally; backend persistence failed.` }, ...prev].slice(0, 4)
    )

    return { success: false, backendPersisted: false, localFallback: true, incident: incidents.find((item) => item.id === incidentId) }
  }

  const assignUnit = async (incidentId, unitId) => {
    const incident = incidents.find((item) => item.id === incidentId)
    const targetUnit = units.find((item) => item.id === unitId)
    const crewMemberId = targetUnit?.crew_member_id || targetUnit?.crewMemberId

    if (incident?.incident_id && targetUnit?.ambulance_id && crewMemberId) {
      try {
        const dispatch = await createV1Dispatch({
          incident_id: incident.incident_id,
          ambulance_id: targetUnit.ambulance_id,
          crew_member_id: crewMemberId,
        })

        setIncidents((prev) => prev.map((item) => item.id === incidentId ? { ...item, assignedUnit: unitId, status: dispatch?.dispatch_status || 'Dispatched', dispatch_id: dispatch?.dispatch_id, dispatch } : item))
        setUnits((prev) => prev.map((item) => item.id === unitId ? { ...item, status: 'EN ROUTE', assignedIncident: incidentId } : item))
        setNotifications((prev) => [{ id: Date.now(), type: 'success', message: `${unitId} dispatched to ${incidentId}.` }, ...prev].slice(0, 4))
        setBackendAvailable(true)
        setBackendError('')
        return { ...dispatch, backendPersisted: true, localFallback: false }
      } catch (error) {
        setBackendAvailable(false)
        setBackendError(error.message || 'dispatch-create-failed')
        setNotifications((prev) => [{ id: Date.now(), type: 'error', message: error.message || 'Dispatch failed.' }, ...prev].slice(0, 4))
        return { success: false, backendPersisted: false, error: error.message || 'Dispatch failed.' }
      }
    }

    const error = !incident?.incident_id
      ? 'Incident is not linked to a backend record.'
      : !targetUnit?.ambulance_id
        ? 'Ambulance is not linked to a backend record.'
        : !crewMemberId
          ? 'Ambulance has no active crew member.'
          : 'Dispatch could not be created.'
    setBackendError(error)
    setNotifications((prev) => [{ id: Date.now(), type: 'error', message: error }, ...prev].slice(0, 4))
    return { success: false, backendPersisted: false, error }
  }

  const reassignUnit = async (incidentId, unitId) => {
    const incident = incidents.find((item) => item.id === incidentId)
    const previousUnitId = incident?.assignedUnit
    const targetUnit = units.find((item) => item.id === unitId)

    if (incident?.dispatch_id && targetUnit?.ambulance_id) {
      try {
        const dispatch = await updateV1Dispatch(incident.dispatch_id, { ambulance_id: targetUnit.ambulance_id })
        setIncidents((prev) => prev.map((item) => item.id === incidentId ? { ...item, assignedUnit: unitId, dispatch_id: dispatch?.dispatch_id || item.dispatch_id, status: 'Dispatched' } : item))
        setUnits((prev) => prev.map((item) => {
          if (item.id === previousUnitId && item.id !== unitId) return { ...item, status: 'AVAILABLE', assignedIncident: null }
          if (item.id === unitId) return { ...item, status: 'EN ROUTE', assignedIncident: incidentId }
          return item
        }))
        setNotifications((prev) => [{ id: Date.now(), type: 'success', message: `${incidentId} reassigned to ${unitId}.` }, ...prev].slice(0, 4))
        setBackendAvailable(true)
        setBackendError('')
        return { ...dispatch, backendPersisted: true, localFallback: false }
      } catch (error) {
        setBackendAvailable(false)
        setBackendError(error.message || 'dispatch-reassignment-failed')
      }
    }

    setIncidents((prev) =>
      prev.map((item) =>
        item.id === incidentId
          ? { ...item, assignedUnit: unitId, status: 'Dispatched' }
          : item
      )
    )

    setUnits((prev) =>
      prev.map((item) => {
        if (item.id === previousUnitId && item.id !== unitId) {
          return { ...item, status: 'AVAILABLE', assignedIncident: null }
        }

        if (item.id === unitId) {
          return { ...item, status: 'EN ROUTE', assignedIncident: incidentId }
        }

        return item
      })
    )

    setNotifications((prev) =>
      [{ id: Date.now(), type: 'warning', message: `${incidentId} reassigned to ${unitId} using local fallback.` }, ...prev].slice(0, 4)
    )

    return null
  }

  const requestAdditionalUnit = async (incidentId) => {
    const incident = incidents.find((item) => item.id === incidentId)

    if (incident?.dispatch_id) {
      try {
        await updateV1Dispatch(incident.dispatch_id, { notes: 'Additional response unit requested by dispatcher.' })
        setBackendAvailable(true)
        setBackendError('')
      } catch (error) {
        setBackendAvailable(false)
        setBackendError(error.message || 'support-request-failed')
      }
    }

    setIncidents((prev) =>
      prev.map((item) =>
        item.id === incidentId ? { ...item, supportRequested: true } : item
      )
    )

    setNotifications((prev) =>
      [{ id: Date.now(), type: 'warning', message: `Additional unit requested for ${incidentId}.` }, ...prev].slice(0, 4)
    )
  }

  const upgradeIncidentPriority = async (incidentId) => {
    const priorityOrder = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO']
    const incident = incidents.find((item) => item.id === incidentId)
    const currentIndex = priorityOrder.indexOf(incident?.priority)
    const nextPriority = priorityOrder[Math.min(currentIndex + 1, priorityOrder.length - 1)]

    if (!incident || nextPriority === incident.priority) return

    if (incident?.incident_id) {
      try {
        const response = await setIncidentPriority(incident.incident_id, nextPriority)
        const updatedIncident = normalizeIncident(response, incident.id)
        setBackendAvailable(true)
        setBackendError('')
        setIncidents((prev) => prev.map((item) => item.id === incidentId ? updatedIncident : item))
        setNotifications((prev) => [{ id: Date.now(), type: 'success', message: `${incidentId} priority updated to ${updatedIncident.priority}.` }, ...prev].slice(0, 4))
        return { ...updatedIncident, backendPersisted: true, localFallback: false }
      } catch (error) {
        setBackendAvailable(false)
        setBackendError(error.message || 'incident-priority-failed')
      }
    }

    setIncidents((prev) =>
      prev.map((item) =>
        item.id === incidentId ? { ...item, priority: nextPriority } : item
      )
    )

    setNotifications((prev) =>
      [{ id: Date.now(), type: 'warning', message: `${incidentId} priority updated locally; backend persistence failed.` }, ...prev].slice(0, 4)
    )

    return { success: false, backendPersisted: false, localFallback: true }
  }

  const updateUnitStatus = (unitId, status) => {
    setUnits((prev) =>
      prev.map((unit) =>
        unit.id === unitId
          ? {
              ...unit,
              status,
            }
          : unit
      )
    )

    setNotifications((prev) =>
      [{ id: Date.now(), type: 'success', message: `${unitId} status updated to ${status}.` }, ...prev].slice(0, 4)
    )
  }

  const saveAssessment = (incidentId, assessment) => {
    setIncidents((prev) =>
      prev.map((incident) =>
        incident.id === incidentId ? { ...incident, assessment } : incident
      )
    )

    setNotifications((prev) =>
      [{ id: Date.now(), type: 'success', message: `Assessment saved for ${incidentId}.` }, ...prev].slice(0, 4)
    )
  }

  const completeIncident = (incidentId, unitId, summary) => {
    setIncidents((prev) =>
      prev.map((incident) =>
        incident.id === incidentId ? { ...incident, status: 'Completed', outcome: summary } : incident
      )
    )
    setUnits((prev) =>
      prev.map((unit) =>
        unit.id === unitId ? { ...unit, status: 'AVAILABLE', assignedIncident: null } : unit
      )
    )
    setNotifications((prev) =>
      [{ id: Date.now(), type: 'success', message: `${incidentId} closed; ${unitId} returned to available.` }, ...prev].slice(0, 4)
    )
  }

  const submitIncident = async (incidentId) => {
    const incident = incidents.find((item) => item.id === incidentId)

    if (!incident) return false

    try {
      if (incident.incident_id) {
        await submitIncidentApi(incident.incident_id)
        const refreshedIncident = await getIncidentById(incident.incident_id)
        const updatedIncident = normalizeIncident(refreshedIncident, incident.id)
        setIncidents((prev) => prev.map((item) => item.id === incidentId ? updatedIncident : item))
        setBackendAvailable(true)
        setBackendError('')
        return { ...updatedIncident, backendPersisted: true, localFallback: false }
      }
      updateIncidentStatus(incidentId, 'Submitted')
      return { success: false, backendPersisted: false, localFallback: true }
    } catch (error) {
      setBackendAvailable(false)
      setBackendError(error.message || 'incident-submit-failed')
      updateIncidentStatus(incidentId, 'Submitted')
      return { success: false, backendPersisted: false, localFallback: true }
    }
  }

  const fetchDispatchEta = async (dispatchId) => {
    try {
      const response = await getDispatchEta(dispatchId)
      setBackendAvailable(true)
      setBackendError('')
      return { ...response, backendPersisted: true, localFallback: false }
    } catch (error) {
      setBackendAvailable(false)
      setBackendError(error.message || 'dispatch-eta-failed')
      return null
    }
  }

  const fetchDispatchRecommendation = async (incidentId) => {
    try {
      const response = await getDispatchRecommendationV1(incidentId)
      setBackendAvailable(true)
      setBackendError('')
      return response?.recommendations || []
    } catch (error) {
      setBackendAvailable(false)
      setBackendError(error.message || 'dispatch-recommendation-failed')
      return []
    }
  }

  const refreshQueue = async () => {
    const next = await attemptBackendSync()
    if (next.success) {
      setIncidents(next.incidents)
      setUnits(next.units)
    }
    setBackendAvailable(next.success)
    setBackendError(next.success ? '' : next.reason)
    return next
  }

  const sendMessage = async (message, to = 'ALL') => {
    if (!message.trim()) return

    const targetIncident = incidents.find((incident) => incident.assignedUnit === to)

    if (targetIncident?.dispatch_id) {
      try {
        const response = await sendDispatchMessage(targetIncident.dispatch_id, { message: message.trim() })
        setBackendAvailable(true)
        setBackendError('')
        setMessages((prev) => [{ id: response?.message_id || Date.now(), from: currentUser?.name || 'CAD', to, text: response?.message || message.trim(), time: new Date().toLocaleTimeString() }, ...prev])
        return { ...response, backendPersisted: true, localFallback: false }
      } catch (error) {
        setBackendAvailable(false)
        setBackendError(error.message || 'message-send-failed')
      }
    }

    setMessages((prev) => [
      {
        id: Date.now(),
        from: currentUser?.name || 'CAD',
        to,
        text: message,
        time: new Date().toLocaleTimeString(),
      },
      ...prev,
    ])

    setNotifications((prev) => [{ id: Date.now(), type: 'warning', message: 'Message saved locally; backend dispatch message failed.' }, ...prev].slice(0, 4))

    return { success: false, backendPersisted: false, localFallback: true }
  }

  const dismissNotification = (id) => {
    setNotifications((prev) =>
      prev.filter((notification) => notification.id !== id)
    )
  }

  const value = useMemo(
    () => ({
      incidents,
      setIncidents,

      units,
      setUnits,

      hospitals,
      users,
      maintenance,

      messages,
      notifications,
      loading,
      backendAvailable,
      backendAuthenticated,
      backendError,

      currentUser,

      submitIncident,
      fetchDispatchEta,
      fetchDispatchRecommendation,
      refreshQueue,

      loginAs,
      logout,

      addIncident,
      appendNote,
      updateIncidentStatus,
      assignUnit,
      reassignUnit,
      requestAdditionalUnit,
      upgradeIncidentPriority,
      updateUnitStatus,
      saveAssessment,
      completeIncident,

      sendMessage,
      dismissNotification,
    }),
    [
      incidents,
      units,
      messages,
      notifications,
      loading,
      backendAvailable,
      backendAuthenticated,
      backendError,
      currentUser,
    ]
  )

  return (
    <CadContext.Provider value={value}>
      {children}
    </CadContext.Provider>
  )
}

export const useCad = () => useContext(CadContext)
