import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FilePlus2, MapPinned, Phone, RotateCcw, Send, User } from 'lucide-react'
import ActionButton from '../../components/common/ActionButton'
import IncidentCard from '../../components/incidents/IncidentCard'
import IncidentDetails from '../../components/incidents/IncidentDetails'
import MapPanel from '../../components/map/MapPanel'
import PriorityBadge from '../../components/common/PriorityBadge'
import { useCad } from '../../context/CadContext'

const priorities = [
  { id: 'ECHO', label: 'Cardiac / Respiratory', tone: 'border-[#991B1B] bg-[#2A1114]' },
  { id: 'DELTA', label: 'Life Threatening', tone: 'border-[#C2410C] bg-[#2A1710]' },
  { id: 'CHARLIE', label: 'Serious / Urgent', tone: 'border-[#D97706] bg-[#2A1F0D]' },
  { id: 'BRAVO', label: 'Non-Life Threat', tone: 'border-[#22C55E] bg-[#10251B]' },
  { id: 'ALPHA', label: 'Minor / Basic', tone: 'border-[#2563EB] bg-[#101C35]' },
]

const emptyForm = { caller: '', phone: '', location: '', chiefComplaint: '', narrative: '', priority: '' }

const geocodeAddress = async (address) => {
  const query = String(address || '').trim()

  if (!query) return null

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query + ', Egypt')}&limit=1`, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
      },
    })

    if (!response.ok) return null

    const results = await response.json()
    const match = Array.isArray(results) ? results[0] : null

    if (!match) return null

    return {
      latitude: Number(match.lat),
      longitude: Number(match.lon),
      label: match.display_name || query,
    }
  } catch {
    return null
  }
}

const reverseGeocode = async (latitude, longitude) => {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
      },
    })

    if (!response.ok) return null

    const result = await response.json()
    return result?.display_name || null
  } catch {
    return null
  }
}

function isSimilarLocation(first, second) {
  const tokens = (value) => value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !['sector', 'street', 'road', 'avenue'].includes(word))
  const firstTokens = tokens(first)
  const secondTokens = tokens(second)
  const normalizedFirst = firstTokens.join(' ')
  const normalizedSecond = secondTokens.join(' ')
  if (!normalizedFirst || !normalizedSecond) return false
  if (normalizedFirst.includes(normalizedSecond) || normalizedSecond.includes(normalizedFirst)) return true
  const shared = firstTokens.filter((token) => secondTokens.includes(token)).length
  return shared >= 2 && shared / Math.min(firstTokens.length, secondTokens.length) >= 0.6
}

export default function CallTaker() {
  const { incidents, addIncident, appendNote } = useCad()
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [createdIncident, setCreatedIncident] = useState(null)
  const [selectedId, setSelectedId] = useState(incidents[0]?.id || '')
  const [noteIncident, setNoteIncident] = useState(incidents[0]?.id || '')
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState('')
  const [noteSuccess, setNoteSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pinMode, setPinMode] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState(null)

  useEffect(() => {
    const query = form.location.trim()

    if (!query) {
      setSelectedLocation(null)
      return undefined
    }

    let cancelled = false

    geocodeAddress(query).then((location) => {
      if (!cancelled && location) {
        setSelectedLocation(location)
      }
    })

    return () => {
      cancelled = true
    }
  }, [form.location])

  const active = useMemo(() => incidents.filter((incident) => incident.status !== 'Completed').slice(0, 8), [incidents])
  const selectedIncident = incidents.find((incident) => incident.id === selectedId) || active[0]
  const duplicate = useMemo(() => form.location.trim() ? incidents.find((incident) => incident.status !== 'Completed' && isSimilarLocation(form.location, incident.location)) : null, [form.location, incidents])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setCreatedIncident(null)
  }

  const submitIncident = async (event) => {
    event.preventDefault()
    const nextErrors = {}
    if (!form.caller.trim()) nextErrors.caller = 'Caller name is required.'
    if (!form.phone.trim()) nextErrors.phone = 'Callback number is required.'
    if (!form.location.trim()) nextErrors.location = 'Incident location is required.'
    if (!form.chiefComplaint.trim()) nextErrors.chiefComplaint = 'Chief complaint is required.'
    if (!form.narrative.trim()) nextErrors.narrative = 'Narrative details are required.'
    if (!form.priority) nextErrors.priority = 'Select a triage priority.'
    if (Object.keys(nextErrors).length) return setErrors(nextErrors)

    setSubmitting(true)
    const incident = await addIncident({ caller: form.caller.trim(), callback: form.phone.trim(), location: form.location.trim(), chiefComplaint: form.chiefComplaint.trim(), description: form.chiefComplaint.trim(), narrative: form.narrative.trim(), priority: form.priority })
    setCreatedIncident(incident)
    setSelectedId(incident.id)
    setNoteIncident(incident.id)
    setErrors({})
    setForm(emptyForm)
    setSubmitting(false)
  }

  const clearForm = () => {
    setForm(emptyForm)
    setErrors({})
    setCreatedIncident(null)
    setSelectedLocation(null)
    setPinMode(false)
  }

  const handleMapPin = async ({ latitude, longitude }) => {
    setPinMode(false)
    const gatheredAddress = await reverseGeocode(latitude, longitude)
    const nextLocation = gatheredAddress || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`

    setSelectedLocation({
      latitude,
      longitude,
      label: nextLocation,
    })

    setForm((current) => ({
      ...current,
      location: nextLocation,
    }))

    setErrors((current) => ({
      ...current,
      location: undefined,
    }))
  }

  const addSupplementaryNote = async () => {
    if (!noteIncident) return setNoteError('Select an active incident before adding a note.')
    if (!note.trim()) return setNoteError('Enter a note before appending it to the incident log.')
    const result = await appendNote(noteIncident, note.trim())
    if (result?.backendPersisted === false) return setNoteError(`Note saved locally; backend persistence failed for ${noteIncident}.`)
    setNote(''); setNoteError(''); setNoteSuccess(`Note added to ${noteIncident}.`)
  }

  return <div className="h-full w-full overflow-y-auto bg-[#0B0F14] p-4">
    <div className="grid min-h-full grid-cols-[minmax(0,3fr)_minmax(370px,2fr)] gap-4">
      <form onSubmit={submitIncident} className="flex min-h-0 flex-col border border-[#222B3A] bg-[#121620]">
        <header className="flex min-h-14 shrink-0 items-center justify-between border-b border-[#222B3A] px-4"><div><h1 className="text-sm font-bold tracking-[0.1em] text-[#F5F7FA]">NEW INCIDENT INTAKE</h1><p className="mt-1 text-[10px] text-[#7E8A9A]">Create a CAD incident and place it in the active dispatch queue.</p></div><span className="border border-[#222B3A] bg-[#0E131B] px-2 py-1 font-mono text-[9px] font-bold text-[#7E8A9A]">NEW</span></header>
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="grid grid-cols-2 gap-3"><Field label="CALLER NAME" icon={User} value={form.caller} error={errors.caller} onChange={(value) => updateField('caller', value)} /><Field label="CALLBACK NUMBER" icon={Phone} value={form.phone} error={errors.phone} onChange={(value) => updateField('phone', value)} /></div>
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="cad-label mb-0">INCIDENT LOCATION</span>
              <button
                type="button"
                onClick={() => setPinMode((value) => !value)}
                className={`text-[9px] font-bold uppercase tracking-[0.12em] ${pinMode ? 'text-[#FCD34D]' : 'text-[#38BDF8]'}`}
              >
                {pinMode ? 'CANCEL PIN' : 'DROP PIN'}
              </button>
            </div>
            <Field label="" icon={MapPinned} value={form.location} error={errors.location} onChange={(value) => updateField('location', value)} />
          </div>
          <div className="mt-3"><div className="mb-1 flex items-center justify-between"><span className="cad-label mb-0">INCIDENT SITE VISUALIZER</span><span className="text-[9px] font-semibold tracking-wider text-[#7E8A9A]">LOCATION PREVIEW</span></div><MapPanel showControls={false} className="h-56 w-full" title="INCIDENT SITE" incidents={duplicate ? [duplicate] : selectedIncident ? [selectedIncident] : []} selectedLocation={selectedLocation} mapPinMode={pinMode} onMapClick={handleMapPin} focusPoints={selectedLocation ? [[selectedLocation.latitude, selectedLocation.longitude]] : []} /></div>
          <div className="mt-3 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3"><Field label="CHIEF COMPLAINT" value={form.chiefComplaint} error={errors.chiefComplaint} onChange={(value) => updateField('chiefComplaint', value)} /><label className="block"><span className="cad-label">NARRATIVE / DETAILS</span><textarea value={form.narrative} onChange={(event) => updateField('narrative', event.target.value)} className={`h-16 w-full resize-none border bg-[#0E131B] px-3 py-2 text-[11px] leading-relaxed text-[#F5F7FA] outline-none focus:border-[#38BDF8] ${errors.narrative ? 'border-[#EF4444]' : 'border-[#222B3A]'}`} aria-invalid={Boolean(errors.narrative)} />{errors.narrative && <p className="mt-1 text-[10px] text-[#FCA5A5]">{errors.narrative}</p>}</label></div>
          <div className="mt-3"><div className="mb-1 flex items-center justify-between"><span className="cad-label mb-0">TRIAGE PRIORITY</span>{form.priority && <span className="text-[10px] font-bold text-[#38BDF8]">{form.priority} SELECTED</span>}</div><div className="grid grid-cols-5 gap-2">{priorities.map((item) => { const isSelected = form.priority === item.id; return <button key={item.id} type="button" aria-pressed={isSelected} onClick={() => updateField('priority', item.id)} className={`h-16 border px-2 text-left transition ${isSelected ? `${item.tone} ring-1 ring-[#F5F7FA]/20` : 'border-[#222B3A] bg-[#0E131B] hover:border-[#3A4759]'}`}><PriorityBadge priority={item.id} /><span className="mt-2 block text-[8px] leading-tight text-[#AAB4C3]">{item.label}</span></button> })}</div>{errors.priority && <p className="mt-1 text-[10px] text-[#FCA5A5]">{errors.priority}</p>}</div>
          <div className="mt-4 flex min-h-12 items-center gap-3 border-t border-[#222B3A] pt-3"><div className="mr-auto min-w-0 text-[10px]" aria-live="polite">{createdIncident ? <span className={`inline-flex items-center gap-1.5 ${createdIncident.backendPersisted ? 'text-[#86EFAC]' : 'text-[#FCD34D]'}`}><CheckCircle2 size={14} />{createdIncident.id} {createdIncident.backendPersisted ? 'submitted to dispatch' : 'saved locally; backend submission failed'} as {createdIncident.priority}.</span> : <span className="text-[#7E8A9A]">Required fields show inline feedback when missing.</span>}</div><ActionButton type="button" icon={RotateCcw} onClick={clearForm}>CLEAR FORM</ActionButton><ActionButton type="submit" icon={Send} variant="primary" className="min-w-[210px]" disabled={submitting}>{submitting ? 'SUBMITTING...' : 'SUBMIT TO DISPATCH'}</ActionButton></div>
        </div>
      </form>
      <aside className="flex min-h-0 flex-col gap-3">
        <section className={`shrink-0 border ${duplicate ? 'border-[#7F1D1D] bg-[#28151A]' : 'border-[#1F6B43] bg-[#10251B]'}`}><div className="flex items-start gap-3 px-4 py-3"><AlertTriangle size={16} className={duplicate ? 'mt-0.5 shrink-0 text-[#EF4444]' : 'mt-0.5 shrink-0 text-[#22C55E]'} /><div><h2 className={`text-[10px] font-extrabold tracking-[0.12em] ${duplicate ? 'text-[#FCA5A5]' : 'text-[#86EFAC]'}`}>POTENTIAL DUPLICATE</h2><p className="mt-1 text-[10px] leading-relaxed text-[#AAB4C3]">{duplicate ? `${duplicate.id} is active at ${duplicate.location}. Confirm this is a separate patient before submitting.` : 'No similar active incident location was found.'}</p></div></div></section>
        <section className="flex min-h-[220px] flex-1 flex-col overflow-hidden border border-[#222B3A] bg-[#121620]"><header className="flex h-14 shrink-0 items-center justify-between border-b border-[#222B3A] px-4"><div><h2 className="text-xs font-bold tracking-[0.1em]">ACTIVE INCIDENTS ({active.length})</h2><p className="mt-1 text-[9px] font-semibold tracking-wider text-[#22C55E]">● LIVE QUEUE</p></div><span className="border border-[#1F6B43] bg-[#10251B] px-2 py-1 text-[8px] font-bold text-[#22C55E]">LIVE</span></header><div className="min-h-0 flex-1 overflow-y-auto">{active.length ? active.map((incident) => <IncidentCard key={incident.id} incident={incident} compact selected={incident.id === selectedIncident?.id} onClick={() => { setSelectedId(incident.id); setNoteIncident(incident.id); setNoteSuccess('') }} />) : <div className="flex h-full items-center justify-center p-6 text-center text-[11px] text-[#7E8A9A]">No active incidents are currently available from the CAD backend.</div>}</div></section>
        <section className="shrink-0 border border-[#222B3A] bg-[#121620]"><header className="border-b border-[#222B3A] px-4 py-2"><h2 className="text-[10px] font-bold tracking-[0.1em]">SELECTED INCIDENT</h2></header><IncidentDetails incident={selectedIncident} /></section>
        <section className="shrink-0 border border-[#222B3A] bg-[#121620]"><header className="flex items-center justify-between border-b border-[#222B3A] px-4 py-2"><h2 className="text-[10px] font-bold tracking-[0.1em]">ADD SUPPLEMENTARY NOTE</h2><FilePlus2 size={14} className="text-[#7E8A9A]" /></header><div className="space-y-2 p-3"><select value={noteIncident} onChange={(event) => { setNoteIncident(event.target.value); setNoteError(''); setNoteSuccess('') }} className="cad-input h-8 py-1 text-[11px]" aria-label="Incident for supplementary note">{active.map((incident) => <option key={incident.id} value={incident.id}>{incident.id} · {incident.status}</option>)}</select><textarea value={note} onChange={(event) => { setNote(event.target.value); setNoteError(''); setNoteSuccess('') }} placeholder="Append access details, hazards, or patient updates" className={`h-14 w-full resize-none border bg-[#0E131B] px-3 py-2 text-[10px] text-[#F5F7FA] outline-none placeholder:text-[#586578] focus:border-[#38BDF8] ${noteError ? 'border-[#EF4444]' : 'border-[#222B3A]'}`} /><div aria-live="polite">{noteError && <p className="text-[10px] text-[#FCA5A5]">{noteError}</p>}{noteSuccess && <p className="text-[10px] text-[#86EFAC]">{noteSuccess}</p>}</div><ActionButton type="button" icon={FilePlus2} onClick={addSupplementaryNote} className="w-full">APPEND TO ACTIVE LOG</ActionButton></div></section>
      </aside>
    </div>
  </div>
}

function Field({ label, icon: Icon, value, onChange, error }) {
  return <label className="block"><span className="cad-label">{label}</span><div className="relative">{Icon && <Icon size={14} className="absolute left-3 top-3 text-[#7E8A9A]" />}<input value={value} onChange={(event) => onChange(event.target.value)} className={`cad-input h-10 text-[11px] ${Icon ? 'pl-9' : ''} ${error ? 'border-[#EF4444]' : ''}`} aria-invalid={Boolean(error)} /></div>{error && <p className="mt-1 text-[10px] text-[#FCA5A5]">{error}</p>}</label>
}
