import { useEffect, useState } from "react";

import MapView from "./components/MapView";


function App() {

    const [ambulances, setAmbulances] = useState([]);

    useEffect(() => {

        const ws = new WebSocket(
            "ws://localhost:8000/ws"
        );

        ws.onopen = () => {
            console.log("Connected to CAD WebSocket");
        };

        ws.onmessage = (event) => {

            const data = JSON.parse(event.data);

            if (data.type !== "ambulance_update") {
                return;
            }

            const ambulance = data.ambulance;

            setAmbulances((current) => {

                const exists = current.some(
                    (item) =>
                        item.id === ambulance.id
                );

                if (!exists) {
                    return [...current, ambulance];
                }

                return current.map((item) =>
                    item.id === ambulance.id
                        ? ambulance
                        : item
                );
            });
        };

        ws.onclose = () => {
            console.log(
                "CAD WebSocket disconnected"
            );
        };

        return () => {
            ws.close();
        };

    }, []);

    return (
        <div
            style={{
                width: "100vw",
                height: "100vh",
            }}
        >
            <MapView
                ambulances={ambulances}
            />
        </div>
    );
}

export default App;