import { useEffect, useState } from "react";

function Header() {

    const [simEnabled, setSimEnabled] = useState(false);

    useEffect(() => {
        // Load current simulation status from backend
        fetch("http://localhost:8000/api/simulation/")
            .then((r) => r.json())
            .then((data) => {
                setSimEnabled(!!data.enabled);
            })
            .catch(() => {});
    }, []);

    const toggleSimulation = async () => {
        try {
            const response = await fetch("http://localhost:8000/api/simulation/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: !simEnabled }),
            });

            if (response.ok) {
                const data = await response.json();
                setSimEnabled(!!data.enabled);
            }
        } catch (err) {
            console.error("Failed to toggle simulation", err);
        }
    };

    return (
        <header className="cad-header">

            <div className="cad-logo">
                🚑
                <span>AMBULANCE CAD</span>
            </div>

            <div className="system-status">
                <span className="status-dot"></span>
                SYSTEM ONLINE
            </div>

            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
                <label style={{ fontSize: 14 }}>
                    Simulation
                </label>
                <button onClick={toggleSimulation} style={{ padding: "6px 10px" }}>
                    {simEnabled ? "On" : "Off"}
                </button>
            </div>

        </header>
    );
}

export default Header;