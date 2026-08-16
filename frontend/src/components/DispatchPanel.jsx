import { useEffect, useState } from "react";

function DispatchPanel({
    incident,
    recommendations,
    onDispatch,
    routeInfo,
    ambulances = [],
}) {

    const [dispatching, setDispatching] = useState(false);
    const [manualAmbulanceId, setManualAmbulanceId] = useState("");

    useEffect(() => {
        if (!incident) {
            setManualAmbulanceId("");
            return;
        }

        const preferred = ambulances.find(
            (ambulance) => ambulance.status === "available"
        ) || ambulances[0];

        if (preferred) {
            setManualAmbulanceId(String(preferred.id));
        } else {
            setManualAmbulanceId("");
        }
    }, [incident, ambulances]);

    const dispatchAmbulance = async (ambulanceId, isManual = false) => {
        if (dispatching || !incident) {
            return;
        }

        setDispatching(true);

        try {
            await onDispatch(ambulanceId, isManual);
        } catch (error) {
            console.error("Dispatch error:", error);
            alert(error.message || "Dispatch failed");
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
                                No route-based recommendation available right now.
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
                                            best.ambulance_id,
                                            false
                                        )
                                    }
                                >
                                    {dispatching
                                        ? "DISPATCHING..."
                                        : "DISPATCH RECOMMENDATION"}
                                </button>
                            </>
                        )}
                    </div>

                    <div className="manual-dispatch">
                        <h3>
                            Manual Dispatch
                        </h3>

                        <select
                            value={manualAmbulanceId}
                            onChange={(event) =>
                                setManualAmbulanceId(event.target.value)
                            }
                            disabled={dispatching}
                        >
                            <option value="">
                                Select ambulance
                            </option>
                            {ambulances
                                .filter(
                                    (ambulance) =>
                                        ambulance.status === "available"
                                )
                                .map((ambulance) => (
                                    <option
                                        key={ambulance.id}
                                        value={ambulance.id}
                                    >
                                        {ambulance.code} - {ambulance.status}
                                    </option>
                                ))}
                        </select>

                        <button
                            disabled={
                                dispatching || !manualAmbulanceId
                            }
                            onClick={() =>
                                dispatchAmbulance(
                                    Number(manualAmbulanceId),
                                    true
                                )
                            }
                        >
                            {dispatching
                                ? "DISPATCHING..."
                                : "DISPATCH SELECTED AMBULANCE"}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

export default DispatchPanel;


