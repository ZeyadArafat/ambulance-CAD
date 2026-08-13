function AmbulancePanel({ ambulances }) {

    const getStatusClass = (status) => {

        switch (status) {

            case "available":
                return "available";

            case "dispatched":
                return "dispatched";

            case "en_route":
                return "en-route";

            case "busy":
                return "busy";

            default:
                return "offline";
        }
    };

    return (
        <aside className="ambulance-panel">

            <div className="panel-title">
                AMBULANCE FLEET
            </div>

            {ambulances.map((ambulance) => (

                <div
                    className="ambulance-card"
                    key={ambulance.id}
                >

                    <div className="ambulance-icon">
                        🚑
                    </div>

                    <div className="ambulance-info">

                        <strong>
                            {ambulance.code}
                        </strong>

                        <span>
                            {ambulance.ambulance_type}
                        </span>

                    </div>

                    <div
                        className={`ambulance-status ${getStatusClass(
                            ambulance.status
                        )}`}
                    >
                        {ambulance.status}
                    </div>

                </div>

            ))}

        </aside>
    );
}

export default AmbulancePanel;