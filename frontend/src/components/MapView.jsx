import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";


function MapView({ ambulances }) {

    const cairo = [30.0444, 31.2357];

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
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {ambulances.map((ambulance) => (

                <Marker
                    key={ambulance.id}
                    position={[
                        ambulance.latitude,
                        ambulance.longitude,
                    ]}
                >

                    <Popup>
                        <strong>
                            {ambulance.code}
                        </strong>

                        <br />

                        Status:
                        {" "}
                        {ambulance.status}

                    </Popup>

                </Marker>

            ))}

        </MapContainer>
    );
}

export default MapView;