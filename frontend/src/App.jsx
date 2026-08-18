import { useEffect, useState, useRef } from "react";

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

    const [selectedAmbulance, setSelectedAmbulance] =
        useState(null);

    const [routeInfo, setRouteInfo] = useState(null);

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

    const wsRef = useRef(null);

    useEffect(() => {

        // Avoid creating multiple sockets if StrictMode causes double mount
        if (wsRef.current) return;

        const ws = new WebSocket("ws://localhost:8000/ws");
        wsRef.current = ws;

        ws.onopen = (ev) => {
            console.log("Connected to CAD WebSocket", ev);
            // Expose the WebSocket for interactive debugging in the browser console
            try {
                window.__CAD_WS = ws;
            } catch (e) {
                /* ignore in non-browser envs */
            }
        };

        ws.onmessage = (event) => {
            console.log("CAD WS raw:", event.data);

            let data;
            try {
                data = JSON.parse(event.data);
            } catch (err) {
                console.error("Failed to parse WS message:", err, event.data);
                return;
            }

            if (data.type === "ambulance_update") {
                const ambulance = data.ambulance;
                console.log(`Received ambulance_update for id=${ambulance.id}`, ambulance);

                setAmbulances((current) => {
                    const exists = current.some((item) => item.id === ambulance.id);

                    if (!exists) {
                        console.log(`Adding ambulance id=${ambulance.id}`);
                        return [...current, ambulance];
                    }

                    console.log(`Updating ambulance id=${ambulance.id}`);
                    return current.map((item) => (item.id === ambulance.id ? ambulance : item));
                });
            }
        };

        ws.onclose = (ev) => {
            console.warn("CAD WebSocket closed:", ev);
            wsRef.current = null;
        };

        ws.onerror = (ev) => {
            console.error("CAD WebSocket error:", ev);
        };

        return () => {
            try {
                ws.close();
            } catch (e) {
                /* ignore */
            }
            wsRef.current = null;
        };

    }, []);

    useEffect(() => {
        console.log("Ambulances state changed:", ambulances);
    }, [ambulances]);

    useEffect(() => {
        const loadRoute = async () => {
            try {
                if (selectedIncident?.assigned_ambulance_id) {
                    const response = await fetch(
                        `${API_URL}/api/dispatch/route/incident/${selectedIncident.id}`
                    );

                    if (response.ok) {
                        const data = await response.json();
                        setRouteInfo(data);
                        return;
                    }
                }

                if (selectedAmbulance) {
                    const response = await fetch(
                        `${API_URL}/api/dispatch/route/ambulance/${selectedAmbulance.id}`
                    );

                    if (response.ok) {
                        const data = await response.json();
                        setRouteInfo(data);
                        return;
                    }
                }
            } catch (error) {
                console.error("Failed to fetch route info:", error);
            }

            setRouteInfo(null);
        };

        loadRoute();
    }, [ambulances, incidents, selectedAmbulance, selectedIncident]);

    const handleSelectAmbulance = (ambulance) => {
        setSelectedAmbulance(ambulance);

        const assignedIncident = incidents.find(
            (incident) => incident.assigned_ambulance_id === ambulance.id
        );

        if (assignedIncident) {
            setSelectedIncident(assignedIncident);
        } else {
            setSelectedIncident(null);
        }
    };

    /*
     * Select incident
     */
const selectIncident = async (incident) => {

    console.log("SELECTED INCIDENT:", incident);

    setSelectedIncident(incident);

    if (incident?.assigned_ambulance_id) {
        const assignedAmbulance = ambulances.find(
            (ambulance) => ambulance.id === incident.assigned_ambulance_id
        );
        setSelectedAmbulance(assignedAmbulance || null);
    } else {
        setSelectedAmbulance(null);
    }

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
        ambulanceId,
        manual = false
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
                        manual,
                    }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    errorData.detail || "Dispatch failed"
                );
            }

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
            setSelectedAmbulance(null);
            setRouteInfo(null);
            setRecommendations([]);

            return data;

        } catch (error) {

            console.error(
                "Dispatch failed:",
                error
            );
            throw error;

        }
    };


    const routeCoordinates = routeInfo?.coordinates || [];

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
                        routeCoordinates={routeCoordinates}
                    />

                </section>

                <AmbulancePanel
                    ambulances={ambulances}
                    selectedAmbulance={selectedAmbulance}
                    onSelectAmbulance={handleSelectAmbulance}
                />

            </main>

            <DispatchPanel
                incident={selectedIncident}
                recommendations={recommendations}
                onDispatch={dispatchAmbulance}
                routeInfo={routeInfo}
                ambulances={ambulances}
            />

        </div>
    );
}

export default App;