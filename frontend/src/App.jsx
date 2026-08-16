import { useEffect, useState } from "react";

import Header from "./components/Header";
import MapView from "./components/MapView";
import IncidentPanel from "./components/IncidentPanel";
import AmbulancePanel from "./components/AmbulancePanel";
import DispatchPanel from "./components/DispatchPanel";

import "./index.css";


const API_URL = "http://localhost:8000";


function App() {

    const [ambulances, setAmbulances] = useState([]);
    const [incidents, setIncidents] = useState([]);

    const [selectedIncident, setSelectedIncident] =
        useState(null);

    const [recommendations, setRecommendations] =
        useState([]);


    /*
     * Load initial data
     */

    useEffect(() => {

        fetch(`${API_URL}/api/ambulances/`)
            .then((response) => response.json())
            .then((data) => {
                setAmbulances(data);
            });

        fetch(`${API_URL}/api/incidents/`)
            .then((response) => response.json())
            .then((data) => {
                setIncidents(data);
            });

    }, []);


    /*
     * WebSocket
     */

    useEffect(() => {

        const ws = new WebSocket(
            "ws://localhost:8000/ws"
        );

        ws.onopen = () => {
            console.log(
                "Connected to CAD WebSocket"
            );
        };

        ws.onmessage = (event) => {

            const data = JSON.parse(
                event.data
            );

            if (
                data.type ===
                "ambulance_update"
            ) {

                const ambulance =
                    data.ambulance;

                setAmbulances((current) => {

                    const exists =
                        current.some(
                            (item) =>
                                item.id ===
                                ambulance.id
                        );

                    if (!exists) {
                        return [
                            ...current,
                            ambulance,
                        ];
                    }

                    return current.map(
                        (item) =>
                            item.id ===
                            ambulance.id
                                ? ambulance
                                : item
                    );

                });

            }

        };

        return () => {
            ws.close();
        };

    }, []);


    /*
     * Select incident
     */
const selectIncident = async (incident) => {

    console.log("SELECTED INCIDENT:", incident);

    setSelectedIncident(incident);

    try {

        const url =
            `${API_URL}/api/dispatch/recommend/${incident.id}`;

        console.log("REQUESTING:", url);

        const response = await fetch(url);

        console.log(
            "RESPONSE STATUS:",
            response.status
        );

        console.log(
            "RESPONSE OK:",
            response.ok
        );

        if (!response.ok) {
            const errorText = await response.text();

            console.error(
                "API ERROR:",
                errorText
            );

            throw new Error(
                `Recommendation API returned ${response.status}`
            );
        }

        const data =
            await response.json();

        console.log(
            "RECOMMENDATION DATA:",
            data
        );

        setRecommendations(
            data.recommendations || []
        );

    } catch (error) {

        console.error(
            "FAILED TO GET RECOMMENDATIONS:",
            error
        );

        setRecommendations([]);
    }
};


    /*
     * Dispatch ambulance
     */

    const dispatchAmbulance = async (
        ambulanceId
    ) => {

        if (!selectedIncident) {
            return;
        }

        try {

            const response = await fetch(
                `${API_URL}/api/dispatch/dispatch`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body: JSON.stringify({
                        incident_id:
                            selectedIncident.id,

                        ambulance_id:
                            ambulanceId,
                    }),
                }
            );

            const data =
                await response.json();

            console.log(
                "Dispatch result:",
                data
            );

            /*
             * Reload incidents
             */

            const incidentsResponse =
                await fetch(
                    `${API_URL}/api/incidents/`
                );

            const updatedIncidents =
                await incidentsResponse.json();

            setIncidents(
                updatedIncidents
            );

            /*
             * Reload ambulances
             */

            const ambulancesResponse =
                await fetch(
                    `${API_URL}/api/ambulances/`
                );

            const updatedAmbulances =
                await ambulancesResponse.json();

            setAmbulances(
                updatedAmbulances
            );

            setSelectedIncident(null);
            setRecommendations([]);

        } catch (error) {

            console.error(
                "Dispatch failed:",
                error
            );

        }
    };


    return (

        <div className="cad-app">

            <Header />

            <main className="cad-layout">

                <IncidentPanel
                    incidents={incidents}
                    selectedIncident={
                        selectedIncident
                    }
                    onSelectIncident={
                        selectIncident
                    }
                />

                <section className="map-container">

                    <MapView
                        ambulances={
                            ambulances
                        }
                        incidents={
                            incidents
                        }
                        selectedIncident={
                            selectedIncident
                        }
                        onSelectIncident={
                            selectIncident
                        }
                    />

                </section>

                <AmbulancePanel
                    ambulances={
                        ambulances
                    }
                />

            </main>

            <DispatchPanel
                incident={
                    selectedIncident
                }
                recommendations={
                    recommendations
                }
                onDispatch={
                    dispatchAmbulance
                }
            />

        </div>
    );
}

export default App;