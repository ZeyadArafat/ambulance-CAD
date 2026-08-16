import { useState } from "react";

function DispatchPanel({
    incident,
    recommendations,
    onDispatch,
    routeInfo,
}) {

    const [dispatching, setDispatching] =useState(false);

    const dispatchAmbulance = async (
    incidentId,
    ambulanceId
) => {
    

    if (dispatching) {
        return;
    }

    setDispatching(true);

    try {

        const response = await fetch(
            "http://localhost:8000/api/dispatch/dispatch",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                },

                body: JSON.stringify({
                    incident_id: incidentId,
                    ambulance_id: ambulanceId,
                }),
            }
        );

        if (!response.ok) {

            const error =
                await response.json();

            throw new Error(
                error.detail ||
                "Dispatch failed"
            );
        }

        const data = await response.json();
        onDispatch(data);
        console.log("Dispatch successful:", data);


    } catch (error) {

        console.error(
            "Dispatch error:",
            error
        );

        alert(error.message);

    } finally {

        setDispatching(false);
    }
};

    if (!incident && !routeInfo) {

        return (
            <div className="dispatch-panel">

                <div className="panel-title">
                    DISPATCH
                </div>

                <div className="empty-state">
                    Select an incident or ambulance to view its route
                </div>

            </div>
        );
    }

    const best =
        recommendations.length > 0
            ? recommendations[0]
            : null;

    return (
        <div className="dispatch-panel">
            {!incident && !routeInfo && (
                <div className="empty-state">
                    Select an incident or ambulance to view its route
                </div>
            )}

            {routeInfo && (
                <div className="route-summary">
                    <div className="panel-title">
                        ROUTE STATUS
                    </div>

                    <div className="dispatch-info">
                        <div>
                            <strong>Ambulance</strong>
                            <span>{routeInfo.ambulance_code}</span>
                        </div>

                        <div>
                            <strong>Distance</strong>
                            <span>{routeInfo.distance_km} km</span>
                        </div>

                        <div>
                            <strong>ETA</strong>
                            <span>{routeInfo.eta_minutes} min</span>
                        </div>
                    </div>
                </div>
            )}

            {incident && (
                <>
                    <div className="panel-title">
                        DISPATCH
                    </div>

                    <div className="dispatch-info">
                        <div>
                            <strong>
                                Incident
                            </strong>

                            <span>
                                INC-{String(incident.id).padStart(3, "0")}
                            </span>
                        </div>

                        <div>
                            <strong>
                                Priority
                            </strong>

                            <span className={`priority ${incident.priority}`}>
                                {incident.priority.toUpperCase()}
                            </span>
                        </div>

                        <div>
                            <strong>
                                Type
                            </strong>

                            <span>
                                {incident.incident_type}
                            </span>
                        </div>
                    </div>

                    <div className="recommendation">
                        <h3>
                            Recommended Ambulance
                        </h3>

                        {!best && (
                            <p>
                                No available ambulances.
                            </p>
                        )}

                        {best && (
                            <>
                                <div className="recommended-ambulance">
                                    🚑

                                    <strong>
                                        {best.code}
                                    </strong>
                                </div>

                                <div className="route-info">
                                    <span>
                                        {best.distance_km} km
                                    </span>

                                    <span>
                                        {best.eta_minutes} min ETA
                                    </span>
                                </div>

                                <button
                                    disabled={dispatching}
                                    onClick={() =>
                                        dispatchAmbulance(
                                            incident.id,
                                            best.ambulance_id
                                        )
                                    }
                                >
                                    {dispatching
                                        ? "DISPATCHING..."
                                        : "DISPATCH"}
                                </button>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export default DispatchPanel;


