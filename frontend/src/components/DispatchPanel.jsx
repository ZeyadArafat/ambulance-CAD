import { useEffect, useState } from "react";

function DispatchPanel({
    incident,
    recommendations,
    onDispatch,
    onAddAmbulance,
    onDeleteAmbulance,
    routeInfo,
    ambulances = [],
}) {

    const [dispatching, setDispatching] = useState(false);
    const [manualAmbulanceId, setManualAmbulanceId] = useState("");
    const [isAddAmbulanceOpen, setIsAddAmbulanceOpen] = useState(false);
    const [isDeleteAmbulanceOpen, setIsDeleteAmbulanceOpen] = useState(false);
    const [newAmbulance, setNewAmbulance] = useState({
        code: "",
        status: "available",
        ambulance_type: "basic_life_support",
        latitude: "",
        longitude: "",
    });
    const [ambulanceCodeToDelete, setAmbulanceCodeToDelete] = useState("");
    const [isSubmittingAmbulance, setIsSubmittingAmbulance] = useState(false);
    const [isDeletingAmbulance, setIsDeletingAmbulance] = useState(false);

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

    const handleNewAmbulanceChange = (event) => {
        const { name, value } = event.target;

        setNewAmbulance((current) => ({
            ...current,
            [name]: value,
        }));
    };

    const handleAddAmbulance = async (event) => {
        event.preventDefault();

        if (!newAmbulance.code.trim()) {
            alert("Ambulance code is required");
            return;
        }

        setIsSubmittingAmbulance(true);

        try {
            const payload = {
                code: newAmbulance.code.trim(),
                status: newAmbulance.status,
                ambulance_type: newAmbulance.ambulance_type,
                latitude: newAmbulance.latitude === "" ? null : Number(newAmbulance.latitude),
                longitude: newAmbulance.longitude === "" ? null : Number(newAmbulance.longitude),
            };

            await onAddAmbulance(payload);
            setNewAmbulance({
                code: "",
                status: "available",
                ambulance_type: "basic_life_support",
                latitude: "",
                longitude: "",
            });
            setIsAddAmbulanceOpen(false);
        } catch (error) {
            console.error("Add ambulance failed:", error);
            alert(error.message || "Unable to add ambulance");
        } finally {
            setIsSubmittingAmbulance(false);
        }
    };

    const handleDeleteAmbulance = async (event) => {
        event.preventDefault();

        if (!ambulanceCodeToDelete.trim()) {
            alert("Ambulance code is required");
            return;
        }

        setIsDeletingAmbulance(true);

        try {
            await onDeleteAmbulance(ambulanceCodeToDelete.trim());
            setAmbulanceCodeToDelete("");
            setIsDeleteAmbulanceOpen(false);
        } catch (error) {
            console.error("Delete ambulance failed:", error);
            alert(error.message || "Unable to delete ambulance");
        } finally {
            setIsDeletingAmbulance(false);
        }
    };

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

            <div className="dispatcher-actions">
                <div className="dispatcher-action-row">
                    <button
                        type="button"
                        className="add-ambulance-button"
                        onClick={() => {
                            setIsDeleteAmbulanceOpen(false);
                            setIsAddAmbulanceOpen((current) => !current);
                        }}
                    >
                        {isAddAmbulanceOpen ? "CLOSE ADD FORM" : "ADD NEW AMBULANCE"}
                    </button>

                    <button
                        type="button"
                        className="delete-ambulance-button"
                        onClick={() => {
                            setIsAddAmbulanceOpen(false);
                            setIsDeleteAmbulanceOpen((current) => !current);
                        }}
                    >
                        {isDeleteAmbulanceOpen ? "CLOSE DELETE FORM" : "DELETE AMBULANCE"}
                    </button>
                </div>
            </div>

            {isAddAmbulanceOpen && (
                <form className="add-ambulance-form" onSubmit={handleAddAmbulance}>
                    <div className="form-grid">
                        <label>
                            <span>Code</span>
                            <input
                                type="text"
                                name="code"
                                value={newAmbulance.code}
                                onChange={handleNewAmbulanceChange}
                                placeholder="AMB-XXX"
                            />
                        </label>

                        <label>
                            <span>Status</span>
                            <select
                                name="status"
                                value={newAmbulance.status}
                                onChange={handleNewAmbulanceChange}
                            >
                                <option value="available">Available</option>
                                <option value="busy">Busy</option>
                                <option value="en_route">En Route</option>
                                <option value="dispatched">Dispatched</option>
                                <option value="offline">Offline</option>
                            </select>
                        </label>

                        <label>
                            <span>Type</span>
                            <select
                                name="ambulance_type"
                                value={newAmbulance.ambulance_type}
                                onChange={handleNewAmbulanceChange}
                            >
                                <option value="basic_life_support">Basic Life Support</option>
                                <option value="advanced_life_support">Advanced Life Support</option>
                                <option value="mobile_icu">Mobile ICU</option>
                            </select>
                        </label>

                        <label>
                            <span>Latitude</span>
                            <input
                                type="number"
                                step="0.000001"
                                name="latitude"
                                value={newAmbulance.latitude}
                                onChange={handleNewAmbulanceChange}
                                placeholder="30.0444"
                            />
                        </label>

                        <label>
                            <span>Longitude</span>
                            <input
                                type="number"
                                step="0.000001"
                                name="longitude"
                                value={newAmbulance.longitude}
                                onChange={handleNewAmbulanceChange}
                                placeholder="31.2357"
                            />
                        </label>
                    </div>

                    <div className="form-actions">
                        <button type="submit" disabled={isSubmittingAmbulance}>
                            {isSubmittingAmbulance ? "ADDING..." : "SAVE AMBULANCE"}
                        </button>
                    </div>
                </form>
            )}

            {isDeleteAmbulanceOpen && (
                <form className="delete-ambulance-form" onSubmit={handleDeleteAmbulance}>
                    <div className="form-grid single-field">
                        <label>
                            <span>Ambulance code</span>
                            <input
                                type="text"
                                value={ambulanceCodeToDelete}
                                onChange={(event) => setAmbulanceCodeToDelete(event.target.value)}
                                placeholder="AMB-XXX"
                            />
                        </label>
                    </div>

                    <div className="form-actions">
                        <button type="submit" className="danger-button" disabled={isDeletingAmbulance}>
                            {isDeletingAmbulance ? "DELETING..." : "CONFIRM DELETE"}
                        </button>
                    </div>
                </form>
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


