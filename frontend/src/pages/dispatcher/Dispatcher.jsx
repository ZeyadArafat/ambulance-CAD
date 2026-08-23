import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowUp,
  CheckCircle2,
  Clock3,
  MapPinned,
  MessageSquareText,
  Radio,
  Send,
  ShieldAlert,
  UserPlus,
} from 'lucide-react'
import ActionButton from '../../components/common/ActionButton'
import Panel from '../../components/common/Panel'
import PriorityBadge from '../../components/common/PriorityBadge'
import StatusBadge from '../../components/common/StatusBadge'
import MapPanel from '../../components/map/MapPanel'
import { useCad } from '../../context/CadContext'

const priorityOrder = { ECHO: 0, DELTA: 1, CHARLIE: 2, BRAVO: 3, ALPHA: 4 }

function isSimilarLocation(first, second) {
  const tokens = (value) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !['sector', 'street', 'road', 'avenue', 'blvd', 'drive', 'lane'].includes(word))

  const firstTokens = tokens(first)
  const secondTokens = tokens(second)
  const normalizedFirst = firstTokens.join(' ')
  const normalizedSecond = secondTokens.join(' ')

  if (!normalizedFirst || !normalizedSecond) return false
  if (normalizedFirst.includes(normalizedSecond) || normalizedSecond.includes(normalizedFirst)) return true

  const shared = firstTokens.filter((token) => secondTokens.includes(token)).length
  return shared >= 2 && shared / Math.min(firstTokens.length, secondTokens.length) >= 0.6
}

export default function Dispatcher() {
  const {
    incidents,
    units,
    messages,
    assignUnit,
    reassignUnit,
    requestAdditionalUnit,
    upgradeIncidentPriority,
    sendMessage,
    appendNote,
    updateIncidentStatus,
    requestDispatchRecommendation,
    fetchDispatchRoute,
    dispatchRecommendations,
    dispatchRoutes,
  } = useCad()

  const [selectedId, setSelectedId] = useState(incidents[0]?.id || '')
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [messageText, setMessageText] = useState('')
  const [noteText, setNoteText] = useState('')
  const [feedback, setFeedback] = useState('Operations ready')

  const sortedIncidents = useMemo(
    () =>
      [...incidents]
        .filter((incident) => incident.status !== 'Completed')
        .sort(
          (a, b) =>
            priorityOrder[a.priority] - priorityOrder[b.priority] ||
            a.time.localeCompare(b.time)
        ),
    [incidents]
  )

  const selected = incidents.find((incident) => incident.id === selectedId) || sortedIncidents[0] || null
  const availableUnits = units.filter((unit) => unit.status === 'AVAILABLE')
  const assignedUnit = units.find((unit) => unit.id === selected?.assignedUnit)
  const backendRecommendations = selected?.incident_id ? dispatchRecommendations[selected.incident_id] || [] : []
  const backendRoute = selected?.incident_id ? dispatchRoutes[selected.incident_id] : null
  const recommendedUnit = availableUnits.find((unit) => unit.ambulance_id === backendRecommendations[0]?.ambulance_id) || availableUnits[0] || assignedUnit || null
  const chosenUnit = units.find((unit) => unit.id === selectedUnitId) || assignedUnit || recommendedUnit

  useEffect(() => {
    if (!selected?.incident_id) return
    requestDispatchRecommendation(selected.incident_id)
    if (selected.assignedUnit) fetchDispatchRoute(selected.incident_id)
  }, [selected?.incident_id, selected?.assignedUnit])

  const duplicateIncident = useMemo(() => {
    if (!selected || !selected.location) return null

    return incidents.find(
      (incident) =>
        incident.id !== selected.id &&
        incident.status !== 'Completed' &&
        isSimilarLocation(selected.location, incident.location)
    )
  }, [incidents, selected])

  const activeMessages = useMemo(
    () => messages.filter((message) => message.to === 'ALL' || message.to === chosenUnit?.id).slice(0, 5),
    [messages, chosenUnit]
  )

  const selectedNoteCount = selected?.notes?.length || 0

  const applyUnitDispatch = () => {
    if (!selected || !chosenUnit) {
      setFeedback('No eligible unit selected for dispatch.')
      return
    }

    if (selected.assignedUnit && selected.assignedUnit !== chosenUnit.id) {
      reassignUnit(selected.id, chosenUnit.id)
      setFeedback(`${selected.id} reassigned to ${chosenUnit.id}.`)
      return
    }

    if (!selected.assignedUnit) {
      assignUnit(selected.id, chosenUnit.id)
      setFeedback(`${selected.id} assigned to ${chosenUnit.id}.`)
      return
    }

    setFeedback(`${selected.id} already assigned to ${selected.assignedUnit}.`)
  }

  const sendCrewMessage = () => {
    if (!messageText.trim()) {
      setFeedback('Enter a message before sending to the crew.')
      return
    }

    sendMessage(messageText.trim(), chosenUnit?.id || selected?.assignedUnit || 'ALL')
    setMessageText('')
    setFeedback(`Message sent to ${chosenUnit?.id || selected?.assignedUnit || 'ALL'}.`)
  }

  const addSelectedNote = () => {
    if (!selected) {
      setFeedback('Select an active incident first.')
      return
    }

    if (!noteText.trim()) {
      setFeedback('Enter note text before appending it to the log.')
      return
    }

    appendNote(selected.id, noteText.trim())
    setNoteText('')
    setFeedback(`Note added to ${selected.id}.`)
  }

  const handleStatusUpdate = (status) => {
    if (!selected) return
    updateIncidentStatus(selected.id, status)
    setFeedback(`${selected.id} status updated to ${status}.`)
  }

  const handleDuplicateAction = (action) => {
    if (!selected || !duplicateIncident) return

    if (action === 'view') {
      setSelectedId(duplicateIncident.id)
      setSelectedUnitId('')
      setFeedback(`Reviewing ${duplicateIncident.id} for duplicate response.`)
      return
    }

    if (action === 'note') {
      appendNote(
        selected.id,
        `Possible duplicate with ${duplicateIncident.id} at ${duplicateIncident.location}; active incident reviewed.`
      )
      setFeedback(`Duplicate note linked to ${selected.id}.`)
      return
    }

    appendNote(
      selected.id,
      `Submitted to dispatch review: matching location with ${duplicateIncident.id} at ${duplicateIncident.location}.`
    )
    updateIncidentStatus(selected.id, 'Pending')
    setFeedback(`${selected.id} submitted to dispatch review.`)
  }

  const handleSelectIncident = (incident) => {
    setSelectedId(incident.id)
    setSelectedUnitId('')
    setFeedback(`${incident.id} selected for review.`)
  }

  return (
    <div className="h-full min-h-0 overflow-hidden p-2">
      <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1.5fr)_340px] grid-rows-[minmax(0,1fr)_175px] gap-2">
        <Panel
          title="ACTIVE INCIDENTS"
          subtitle={`${sortedIncidents.length} ACTIVE · PRIORITY ORDER`}
          className="flex min-h-0 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            {sortedIncidents.map((incident) => (
              <button
                key={incident.id}
                type="button"
                onClick={() => handleSelectIncident(incident)}
                className={`w-full border-b border-[#222B3A] px-3 py-2 text-left transition ${
                  selected?.id === incident.id
                    ? 'bg-[#1B2A3B] ring-1 ring-inset ring-[#38BDF8]/60'
                    : 'bg-[#101820] hover:bg-[#171F2B]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[10px] text-[#AAB4C3]">
                    <span className="font-bold text-[#F5F7FA]">{incident.id}</span>
                    <span>{incident.time}</span>
                  </div>
                  <PriorityBadge priority={incident.priority} />
                </div>

                <p className="mt-2 line-clamp-2 text-[11px] text-[#D8E0EA]">{incident.description}</p>
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[#7E8A9A]">
                  <span className="truncate max-w-[180px]">{incident.location}</span>
                  <span>{incident.assignedUnit || 'UNASSIGNED'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <StatusBadge status={incident.status} />
                  {incident.assignedUnit ? (
                    <span className="text-[10px] text-[#38BDF8]">RTS</span>
                  ) : (
                    <span className="text-[10px] text-[#F59E0B]">WAITING</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel
          title="SELECTED INCIDENT"
          subtitle={selected ? `${selected.id} · ${selected.location}` : 'Select an incident'}
          className="flex min-h-0 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {duplicateIncident && (
              <div className="mb-3 border border-[#7F1D1D] bg-[#29151A] p-3">
                <div className="flex items-start gap-2">
                  <ShieldAlert size={16} className="mt-0.5 text-[#FCA5A5]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold tracking-[0.12em] text-[#FCA5A5]">POSSIBLE DUPLICATE INCIDENT</div>
                    <p className="mt-2 text-[11px] text-[#FDE7E7]">
                      Another active incident exists at a matching location: {duplicateIncident.id} · {duplicateIncident.location}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionButton type="button" variant="secondary" onClick={() => handleDuplicateAction('view')}>
                        VIEW EXISTING INCIDENT
                      </ActionButton>
                      <ActionButton type="button" variant="secondary" onClick={() => handleDuplicateAction('note')}>
                        APPEND TO ACTIVE LOG
                      </ActionButton>
                      <ActionButton type="button" variant="primary" onClick={() => handleDuplicateAction('submit')}>
                        SUBMIT TO DISPATCH
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selected ? (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-[#222B3A] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-[#F5F7FA]">{selected.id}</span>
                      <PriorityBadge priority={selected.priority} />
                    </div>
                    <div className="mt-1 text-[11px] text-[#7E8A9A]">{selected.time} · {selected.status}</div>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                <div className="mt-3 space-y-3 text-[11px] text-[#AAB4C3]">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="cad-label mb-1">SEVERITY</div>
                      <div className="text-sm font-semibold text-[#F5F7FA]">{selected.priority}</div>
                    </div>
                    <div>
                      <div className="cad-label mb-1">ETA</div>
                      <div className="text-sm font-semibold text-[#38BDF8]">{backendRoute?.eta_minutes ?? backendRecommendations[0]?.eta_minutes ?? chosenUnit?.eta ?? '—'} min</div>
                    </div>
                  </div>

                  <div>
                    <div className="cad-label mb-1">TYPE</div>
                    <div className="text-sm text-[#F5F7FA]">{selected.description}</div>
                  </div>

                  <div>
                    <div className="cad-label mb-1">LOCATION</div>
                    <div className="flex items-center gap-2 text-sm text-[#F5F7FA]">
                      <MapPinned size={14} className="text-[#38BDF8]" />
                      {selected.location}
                    </div>
                  </div>

                  {selected.caller && (
                    <div>
                      <div className="cad-label mb-1">CALLER</div>
                      <div className="text-sm text-[#F5F7FA]">{selected.caller}{selected.callback ? ` · ${selected.callback}` : ''}</div>
                    </div>
                  )}

                  {selected.narrative && (
                    <div>
                      <div className="cad-label mb-1">NARRATIVE</div>
                      <p className="text-[11px] leading-relaxed text-[#AAB4C3]">{selected.narrative}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 border-t border-[#222B3A] pt-3">
                    <div>
                      <div className="cad-label mb-1">ASSIGNED UNIT</div>
                      <div className="text-sm font-semibold text-[#38BDF8]">{selected.assignedUnit || 'UNASSIGNED'}</div>
                    </div>
                    <div>
                      <div className="cad-label mb-1">DISPATCH TIER</div>
                      <div className="text-sm font-semibold text-[#F5F7FA]">{selected.status}</div>
                    </div>
                  </div>

                  <div className="rounded border border-[#222B3A] bg-[#0E141B] p-3">
                    <div className="flex items-center justify-between">
                      <span className="cad-label mb-0">RECOMMENDED RESPONSE</span>
                      <span className="text-[10px] font-bold text-[#38BDF8]">{backendRoute?.eta_minutes ?? backendRecommendations[0]?.eta_minutes ?? chosenUnit?.eta ?? '—'} min</span>
                    </div>
                    {chosenUnit ? (
                      <>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-[#F5F7FA]">
                          <span>{chosenUnit.id} · {chosenUnit.callSign}</span>
                          <span>{chosenUnit.capability}</span>
                        </div>
                        <div className="mt-1 text-[10px] text-[#7E8A9A]">{backendRoute?.distance_km ?? backendRecommendations[0]?.distance_km ?? chosenUnit.distance} km · {chosenUnit.status} · {chosenUnit.homeZone}</div>
                      </>
                    ) : (
                      <p className="mt-2 text-[11px] text-[#FCA5A5]">No available unit can be recommended.</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton variant="primary" icon={UserPlus} disabled={!selected || !chosenUnit} onClick={applyUnitDispatch}>
                      {selected.assignedUnit ? 'REASSIGN UNIT' : 'ASSIGN UNIT'}
                    </ActionButton>
                    <ActionButton icon={Radio} disabled={!selected} onClick={() => requestAdditionalUnit(selected.id)}>
                      REQUEST SUPPORT
                    </ActionButton>
                    <ActionButton variant="warning" icon={ArrowUp} disabled={!selected || selected.priority === 'ECHO'} onClick={() => upgradeIncidentPriority(selected.id)}>
                      UPGRADE PRIORITY
                    </ActionButton>
                    <ActionButton icon={CheckCircle2} onClick={() => handleStatusUpdate('Pending')}>
                      SET PENDING
                    </ActionButton>
                  </div>

                  {selected.supportRequested && (
                    <p className="border-l-2 border-[#F59E0B] bg-[#251B0D] px-2 py-1 text-[10px] text-[#FCD34D]">
                      SUPPORT UNIT REQUESTED · awaiting allocation
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[#7E8A9A]">No active incident selected.</div>
            )}
          </div>
        </Panel>

        <Panel
          title="DISPATCH MAP"
          subtitle={selected ? `${selected.location}` : 'Location overview'}
          className="flex min-h-0 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-hidden">
            <MapPanel
              className="h-full w-full"
              title="LIVE DISPATCH MAP"
              incidents={incidents.filter((incident) => incident.status !== 'Completed')}
              units={units}
              showControls
            />
          </div>
          <div className="border-t border-[#222B3A] p-2">
            <div className="flex items-center justify-between text-[10px] text-[#7E8A9A]">
              <span>AVAILABLE {availableUnits.length}</span>
              <span>{selected?.assignedUnit || 'UNASSIGNED'}</span>
            </div>
          </div>
        </Panel>

        <Panel
          title="UNIT ASSIGNMENT"
          subtitle={`${availableUnits.length} READY FOR ALLOCATION`}
          className="flex min-h-0 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {availableUnits.length ? (
              availableUnits.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => {
                    setSelectedUnitId(unit.id)
                    setFeedback(`${unit.id} selected for ${selected?.id || 'incident'} response.`)
                  }}
                  className={`mb-2 flex w-full items-center justify-between rounded border px-3 py-2 text-left ${
                    chosenUnit?.id === unit.id
                      ? 'border-[#38BDF8] bg-[#112334]'
                      : 'border-[#222B3A] bg-[#101820] hover:bg-[#171F2B]'
                  }`}
                >
                  <div>
                    <div className="text-[11px] font-bold text-[#F5F7FA]">{unit.id}</div>
                    <div className="text-[10px] text-[#7E8A9A]">{unit.callSign} · {unit.capability}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold text-[#38BDF8]">{unit.eta} min</div>
                    <div className="text-[10px] text-[#AAB4C3]">{unit.homeZone}</div>
                  </div>
                </button>
              ))
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] text-[#7E8A9A]">
                No units available for dispatch.
              </div>
            )}
          </div>
        </Panel>

        <Panel title="DISPATCH OPERATIONS" subtitle="ETA / NOTES / COMMUNICATIONS" className="col-span-3 flex min-h-0 flex-col overflow-hidden">
          <div className="grid h-full min-h-0 grid-cols-[220px_minmax(0,1.1fr)_minmax(0,1fr)] gap-3 p-3">
            <div className="rounded border border-[#222B3A] bg-[#0E141B] p-3">
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.12em] text-[#7E8A9A]">
                <Clock3 size={14} className="text-[#38BDF8]" /> ETA / STATUS
              </div>
              <div className="mt-3 text-3xl font-bold text-[#38BDF8]">{backendRoute?.eta_minutes ?? backendRecommendations[0]?.eta_minutes ?? chosenUnit?.eta ?? '—'} <span className="text-xs font-normal text-[#7E8A9A]">MIN</span></div>
              <div className="mt-3 space-y-2 text-[11px] text-[#AAB4C3]">
                <div className="flex items-center justify-between">
                  <span>Selected unit</span>
                  <span className="text-[#F5F7FA]">{chosenUnit?.id || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Assigned</span>
                  <span className="text-[#F5F7FA]">{selected?.assignedUnit || 'UNASSIGNED'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Dispatch</span>
                  <span className="text-[#F5F7FA]">{selected?.status || '—'}</span>
                </div>
              </div>
            </div>

            <div className="rounded border border-[#222B3A] bg-[#0E141B] p-3">
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.12em] text-[#7E8A9A]">
                <MessageSquareText size={14} className="text-[#38BDF8]" /> NOTES / ACTIVITY
              </div>

              <div className="mt-3 h-[92px] overflow-y-auto rounded border border-[#222B3A] bg-[#101820] p-2">
                {(selected?.notes?.length ? selected.notes : [{ at: 'N/A', text: 'No supplemental notes logged for this incident.' }]).map((entry, index) => (
                  <div key={`${entry.at}-${index}`} className="mb-2 border-l border-[#38BDF8]/40 pl-2 text-[10px] text-[#AAB4C3]">
                    <span className="text-[#7E8A9A]">{entry.at}</span> · {entry.text}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && addSelectedNote()}
                  placeholder="Add supplemental note"
                  className="cad-input h-9 py-1 text-[11px]"
                />
                <ActionButton icon={Send} onClick={addSelectedNote}>ADD NOTE</ActionButton>
              </div>
            </div>

            <div className="rounded border border-[#222B3A] bg-[#0E141B] p-3">
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.12em] text-[#7E8A9A]">
                <Radio size={14} className="text-[#38BDF8]" /> COMMAND / FEEDBACK
              </div>
              <div className="mt-3 h-[92px] overflow-y-auto rounded border border-[#222B3A] bg-[#101820] p-2">
                {activeMessages.length ? (
                  activeMessages.map((message) => (
                    <div key={message.id} className="mb-2 border-l border-[#38BDF8]/40 pl-2 text-[10px] text-[#AAB4C3]">
                      <span className="text-[#7E8A9A]">{message.time}</span> · <strong>{message.from}</strong> · {message.text}
                    </div>
                  ))
                ) : (
                  <div className="text-[10px] text-[#7E8A9A]">No active communications for this assignment.</div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && sendCrewMessage()}
                  placeholder={`Message ${chosenUnit?.id || 'all units'}`}
                  className="cad-input h-9 py-1 text-[11px]"
                />
                <ActionButton icon={Send} onClick={sendCrewMessage}>SEND</ActionButton>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[#222B3A] bg-[#0F141D] px-3 py-2 text-[10px] text-[#AAB4C3]">
            <span className="inline-flex items-center gap-2"><AlertTriangle size={12} className="text-[#F59E0B]" />{feedback}</span>
            <span>{selected ? `${selected.id} · ${selected.status}` : 'QUEUE STANDBY'}</span>
          </div>
        </Panel>
      </div>
    </div>
  )
}
