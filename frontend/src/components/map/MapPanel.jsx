import { Map, Navigation, LocateFixed } from 'lucide-react'

import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const CITY_CENTER = [30.0444, 31.2357]
const FALLBACK_INCIDENTS = [
  [30.0472, 31.2385],
  [30.0338, 31.2215],
  [30.0507, 31.2512],
  [30.0411, 31.2679],
  [30.0585, 31.2484],
  [30.0378, 31.2137],
]
const FALLBACK_UNITS = [
  [30.0418, 31.2327],
  [30.0524, 31.2381],
  [30.0359, 31.2492],
  [30.0456, 31.2648],
  [30.0598, 31.2283],
]
const FALLBACK_HOSPITALS = [
  [30.056, 31.225],
  [30.071, 31.29],
  [29.982, 31.27],
]

const normalizeCoordinate = (value, axis) => {
  const num = Number(value)

  if (!Number.isFinite(num)) return null
  if (axis === 'lat' && (num < -90 || num > 90)) return null
  if (axis === 'lng' && (num < -180 || num > 180)) return null

  return num
}

const getMarkerPosition = (item, index, fallback) => {
  const lat = normalizeCoordinate(item?.latitude ?? item?.lat, 'lat')
  const lng = normalizeCoordinate(item?.longitude ?? item?.lng ?? item?.lon, 'lng')

  if (lat !== null && lng !== null) {
    return [lat, lng]
  }

  return fallback[index % fallback.length]
}

export default function MapPanel({ units = [], incidents = [], hospitals = [], route = null, focusPoints = null, className = '', title = 'LIVE CAD MAP', showControls = true }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const layerGroupRef = useRef(null)

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: true,
    }).setView(CITY_CENTER, 12)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)

    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    const layerGroup = L.layerGroup().addTo(map)
    mapInstanceRef.current = map
    layerGroupRef.current = layerGroup

    return () => {
      layerGroup.clearLayers()
      map.remove()
      mapInstanceRef.current = null
      layerGroupRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    const layerGroup = layerGroupRef.current

    if (!map || !layerGroup) return

    layerGroup.clearLayers()
    console.log('MapPanel rendering with:', { route, unitsCount: units.length, incidentsCount: incidents.length, hospitalsCount: hospitals.length })

    // Draw route if provided
    if (route && Array.isArray(route.coordinates) && route.coordinates.length > 0) {
      console.log('Drawing route with', route.coordinates.length, 'points')
      const routeCoordinates = route.coordinates.map((coord) => {
        console.log('Route coord raw:', coord, '-> converted to:', [coord[1], coord[0]])
        return [coord[1], coord[0]]
      })
      console.log('Final route coordinates:', routeCoordinates)
      const polyline = L.polyline(routeCoordinates, {
        color: '#38BDF8',
        weight: 3,
        opacity: 0.8,
        dashArray: '5, 5',
        lineCap: 'round',
        lineJoin: 'round',
      })
      polyline.addTo(layerGroup)
      console.log('✓ Route polyline added to map')
    } else {
      console.log('No route to display:', { 
        routeExists: !!route,
        hasCoordinates: !!route?.coordinates,
        coordinateCount: route?.coordinates?.length || 0,
        isArray: Array.isArray(route?.coordinates)
      })
    }

    incidents.slice(0, 12).forEach((incident, index) => {
      const position = getMarkerPosition(incident, index, FALLBACK_INCIDENTS)
      const priorityColor = incident.priority === 'ECHO' ? '#EF4444' : incident.priority === 'DELTA' ? '#F97316' : '#F59E0B'

      const circle = L.circleMarker(position, {
        radius: 8,
        color: '#0B0F14',
        weight: 2,
        fillColor: priorityColor,
        fillOpacity: 0.95,
      })

      circle.bindTooltip(incident.id || `Incident ${index + 1}`)
      circle.addTo(layerGroup)
    })

    units.slice(0, 20).forEach((unit, index) => {
      const position = getMarkerPosition(unit, index, FALLBACK_UNITS)
      const statusColor = unit.status === 'AVAILABLE' ? '#22C55E' : unit.status === 'OUT OF SERVICE' ? '#EF4444' : '#38BDF8'

      const marker = L.circleMarker(position, {
        radius: 6,
        color: '#0B0F14',
        weight: 2,
        fillColor: statusColor,
        fillOpacity: 0.9,
      })

      marker.bindTooltip(unit.id || `Unit ${index + 1}`)
      marker.addTo(layerGroup)
    })

    hospitals.slice(0, 20).forEach((hospital, index) => {
      const position = getMarkerPosition(hospital, index, FALLBACK_HOSPITALS)
      const marker = L.circleMarker(position, {
        radius: 7,
        color: '#0B0F14',
        weight: 2,
        fillColor: '#A78BFA',
        fillOpacity: 0.95,
      })

      marker.bindTooltip(hospital.name || hospital.hospital_name || hospital.hospital_code || `Hospital ${index + 1}`)
      marker.addTo(layerGroup)
    })

    // Focus on provided points or all points
    const pointsToFocus = focusPoints || [
      ...incidents.slice(0, 12).map((incident, index) => getMarkerPosition(incident, index, FALLBACK_INCIDENTS)),
      ...units.slice(0, 20).map((unit, index) => getMarkerPosition(unit, index, FALLBACK_UNITS)),
      ...hospitals.slice(0, 20).map((hospital, index) => getMarkerPosition(hospital, index, FALLBACK_HOSPITALS)),
    ]

    const validPoints = pointsToFocus.filter(Boolean)

    if (validPoints.length) {
      const bounds = L.latLngBounds(validPoints)
      map.fitBounds(bounds.pad(0.35), { animate: false, maxZoom: 13 })
    }
  }, [incidents, units, hospitals, route, focusPoints])

  const panelLabel = useMemo(() => showControls ? 'LIVE LOCATION VIEW' : 'LOCATION VIEW', [showControls])

  return <div className={`relative overflow-hidden border border-[#222B3A] bg-[#0C141D] ${className}`}>
    <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between border-b border-[#222B3A] bg-[#121620]/90 px-3 py-2"><span className="flex items-center gap-2 text-[10px] font-bold tracking-[.12em]"><Map size={13} className="text-[#38BDF8]" />{title}</span><span className="text-[10px] text-[#7E8A9A]">{panelLabel}</span></div>
    <div ref={mapRef} className="h-full w-full" />
    <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-[500] flex items-end justify-between"><div className="cad-panel pointer-events-auto px-3 py-2 text-[9px] text-[#7E8A9A]"><div className="flex gap-3"><span>• INCIDENT</span><span>◆ UNIT</span><span>▲ HOSPITAL</span><span>OSM</span></div></div>{showControls && <div className="pointer-events-auto flex gap-2" aria-label="Map status indicators"><span className="cad-panel p-2 text-[#7E8A9A]"><LocateFixed size={14} /></span><span className="cad-panel p-2 text-[#7E8A9A]"><Navigation size={14} /></span></div>}</div>
  </div>
}
