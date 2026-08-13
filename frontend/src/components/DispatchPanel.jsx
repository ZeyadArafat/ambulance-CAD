function DispatchPanel({
    incident,
    recommendations,
    onDispatch,
}) {

    if (!incident) {

        return (
            <div className="dispatch-panel">

                <div className="panel-title">
                    DISPATCH
                </div>

                <div className="empty-state">
                    Select an incident to begin dispatch
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
                            className="dispatch-button"
                            onClick={() =>
                                onDispatch(best.ambulance_id)
                            }
                        >
                            DISPATCH AMBULANCE
                        </button>
                    </>
                )}

            </div>

        </div>
    );
}

export default DispatchPanel;