function Header() {
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

        </header>
    );
}

export default Header;