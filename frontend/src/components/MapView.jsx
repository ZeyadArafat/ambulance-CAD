import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Polyline,
} from "react-leaflet";

import { divIcon } from "leaflet";
import { useRef, useEffect } from "react";



// ===============================
// Ambulance Marker
// ===============================

const ambulanceIcon = divIcon({
    className: "",
    html: `
        <div class="ambulance-marker">
            🚑
        </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
});


// ===============================
// Incident Marker
// ===============================

const incidentIcon = divIcon({
    className: "",
    html: `
        <div class="incident-marker">
            !
        </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
});


function MovingMarker({ position, icon, children, markerKey }) {
    const markerRef = useRef(null);

    useEffect(() => {
        if (markerRef.current && position && position[0] !== undefined && position[1] !== undefined) {
            try {
                markerRef.current.setLatLng(position);
            } catch (e) {
                // ignore
                console.error('setLatLng error', e);
            }
        }
    }, [position]);

    return (
        <Marker
            key={markerKey}
            ref={markerRef}
            position={position}
            icon={icon}
        >
            {children}
        </Marker>
    );
}

function MapView({
    ambulances,
    incidents,
    onSelectIncident,
    routeCoordinates = [],
}) {

    console.log('MapView ambulances prop:', ambulances);

    const cairo = [30.0444, 31.2357];
    const mappedRouteCoordinates = routeCoordinates.map(([lng, lat]) => [lat, lng]);

    if (ambulances && ambulances.length) {
        ambulances.forEach((a) => {
            console.log(`MapView marker for id=${a.id} -> [${a.latitude}, ${a.longitude}]`);
        });
    }

    return (
        <MapContainer
            center={cairo}
            zoom={12}
            style={{
                height: "100%",
                width: "100%",
            }}
        >

            <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />


            {/* ========================= */}
            {/* AMBULANCES */}
            {/* ========================= */}

            {ambulances.map((ambulance) => (

                <MovingMarker
                    key={`ambulance-${ambulance.id}`}
                    markerKey={`ambulance-${ambulance.id}`}
                    position={[
                        Number(ambulance.latitude),
                        Number(ambulance.longitude),
                    ]}
                    icon={ambulanceIcon}
                >

                    <Popup>

                        <strong>
                            🚑 {ambulance.code}
                        </strong>

                        <br />

                        Status:
                        {" "}
                        {ambulance.status}

                        <br />

                        Type:
                        {" "}
                        {ambulance.ambulance_type}

                    </Popup>

                </MovingMarker>

            ))}


            {mappedRouteCoordinates.length > 0 && (
                <Polyline
                    positions={mappedRouteCoordinates}
                    pathOptions={{
                        color: "#f59e0b",
                        weight: 5,
                        opacity: 0.9,
                    }}
                />
            )}

            {/* ========================= */}
            {/* INCIDENTS */}
            {/* ========================= */}

            {incidents.map((incident) => (

                <Marker
                    key={`incident-${incident.id}`}
                    position={[
                        Number(incident.latitude),
                        Number(incident.longitude),
                    ]}
                    icon={incidentIcon}
                    eventHandlers={{
                        click: () =>
                            onSelectIncident(incident),
                    }}
                >

                    <Popup>

                        <strong>
                            🚨 Incident #{incident.id}
                        </strong>

                        <br />

                        Priority:
                        {" "}
                        {incident.priority}

                        <br />

                        Type:
                        {" "}
                        {incident.incident_type}

                        <br />

                        {incident.description}

                    </Popup>

                </Marker>

            ))}

        </MapContainer>
    );
}


export default MapView;