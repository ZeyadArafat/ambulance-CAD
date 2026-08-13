function IncidentPanel({
    incidents,
    selectedIncident,
    onSelectIncident,
}) {
    return (
        <aside className="incident-panel">

            <div className="panel-title">
                ACTIVE INCIDENTS
            </div>

            {incidents.length === 0 && (
                <div className="empty-state">
                    No active incidents
                </div>
            )}

            {incidents.map((incident) => (

                <div
                    key={incident.id}
                    className={`incident-card ${
                        selectedIncident?.id === incident.id
                            ? "selected"
                            : ""
                    }`}
                    onClick={() =>
                        onSelectIncident(incident)
                    }
                >

                    <div className="incident-header">

                        <strong>
                            INC-{String(incident.id).padStart(3, "0")}
                        </strong>

                        <span
                            className={`priority ${incident.priority}`}
                        >
                            {incident.priority.toUpperCase()}
                        </span>

                    </div>

                    <div className="incident-type">
                        {incident.incident_type}
                    </div>

                    <div className="incident-description">
                        {incident.description}
                    </div>

                </div>

            ))}

        </aside>
    );
}

export default IncidentPanel;