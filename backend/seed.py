import os
from datetime import date

from app.auth import ensure_default_roles, hash_password
from app.database import Base, SessionLocal, engine
from app.models import Ambulance, Role, Staff, Station, User, UserRole, Zone


DEFAULT_USERS = (
    ("margaret.reynolds", "call-taker", "call-taker@example.com"),
    ("daniel.brooks", "dispatcher", "dispatcher@example.com"),
    ("nadia.hassan", "admin", "admin@example.com"),
    ("alex.carter", "paramedic", "paramedic@example.com"),
    ("jordan.lee", "operations-supervisor", "operations@example.com"),
    ("sarah.patel", "hospital", "hospital@example.com"),
    ("mike.torres", "fleet-maintenance", "fleet@example.com"),
)

DEFAULT_STAFF = {
    "call-taker": ("EMP-001", "Margaret", "Reynolds", "call-taker@example.com", "call taker"),
    "dispatcher": ("EMP-002", "Daniel", "Brooks", "dispatcher@example.com", "dispatcher"),
    "admin": ("EMP-003", "Nadia", "Hassan", "admin@example.com", "administrator"),
    "paramedic": ("EMP-004", "Alex", "Carter", "paramedic@example.com", "paramedic"),
    "operations-supervisor": ("EMP-005", "Jordan", "Lee", "operations@example.com", "operations supervisor"),
    "hospital": ("EMP-006", "Sarah", "Patel", "hospital@example.com", "hospital liaison"),
    "fleet-maintenance": ("EMP-007", "Mike", "Torres", "fleet@example.com", "fleet maintenance"),
}

DEFAULT_ZONE = {
    "zone_code": "CAI-01",
    "zone_name": "Cairo Central",
    "coverage_area": "Cairo Governorate",
    "priority_level": "high",
    "status": "active",
}

DEFAULT_STATIONS = (
    ("CAI-ST-01", "Downtown Cairo Station", "Talaat Harb Square, Cairo", 30.0444, 31.2357),
    ("CAI-ST-02", "Nasr City Station", "Nasr City, Cairo", 30.0626, 31.3384),
    ("CAI-ST-03", "Maadi Station", "Maadi, Cairo", 29.9602, 31.2569),
)

DEFAULT_AMBULANCES = (
    ("CAI-AMB-01", "Cairo Unit 01", "CAI-REG-001", "advanced_life_support", "CAI-ST-01", 30.0448, 31.2361),
    ("CAI-AMB-02", "Cairo Unit 02", "CAI-REG-002", "basic_life_support", "CAI-ST-01", 30.0439, 31.2349),
    ("CAI-AMB-03", "Cairo Unit 03", "CAI-REG-003", "advanced_life_support", "CAI-ST-02", 30.0630, 31.3389),
    ("CAI-AMB-04", "Cairo Unit 04", "CAI-REG-004", "basic_life_support", "CAI-ST-02", 30.0619, 31.3378),
    ("CAI-AMB-05", "Cairo Unit 05", "CAI-REG-005", "advanced_life_support", "CAI-ST-03", 29.9606, 31.2573),
    ("CAI-AMB-06", "Cairo Unit 06", "CAI-REG-006", "basic_life_support", "CAI-ST-03", 29.9598, 31.2564),
)


def seed_users() -> int:
    Base.metadata.create_all(bind=engine)

    default_password = os.getenv("CAD_DEFAULT_PASSWORD", "cad12345")

    with SessionLocal.begin() as db:
        ensure_default_roles(db)
        db.flush()
        created_count = 0
        created_accounts = []
        created_staff = []
        created_locations = []
        created_ambulances = []

        zone = db.query(Zone).filter(Zone.zone_code == DEFAULT_ZONE["zone_code"]).first()
        if zone is None:
            zone = Zone(**DEFAULT_ZONE)
            db.add(zone)
            db.flush()
            created_locations.append(f"zone '{zone.zone_code}'")

        station_records = {}
        for station_code, station_name, address, latitude, longitude in DEFAULT_STATIONS:
            station = db.query(Station).filter(Station.station_code == station_code).first()
            if station is None:
                station = Station(
                    station_code=station_code,
                    station_name=station_name,
                    address=address,
                    latitude=latitude,
                    longitude=longitude,
                    status="active",
                )
                db.add(station)
                db.flush()
                created_locations.append(f"station '{station_code}'")
            station_records[station_code] = station

        for code, call_sign, registration, ambulance_type, station_code, latitude, longitude in DEFAULT_AMBULANCES:
            ambulance = db.query(Ambulance).filter(Ambulance.ambulance_code == code).first()
            if ambulance is None:
                db.add(Ambulance(
                    station_id=station_records[station_code].station_id,
                    zone_id=zone.zone_id,
                    ambulance_code=code,
                    call_sign=call_sign,
                    ambulance_type=ambulance_type,
                    registration_number=registration,
                    current_latitude=latitude,
                    current_longitude=longitude,
                    status="available",
                    vehicle_health_status="operational",
                    mileage=0,
                ))
                created_ambulances.append(code)

        for username, role_name, email in DEFAULT_USERS:
            if role_name == "admin":
                username = os.getenv("CAD_ADMIN_USERNAME", username)
                email = os.getenv("CAD_ADMIN_EMAIL", email)
                password = os.getenv("CAD_ADMIN_PASSWORD", "admin123")
            else:
                password_env_name = f"CAD_{role_name.upper().replace('-', '_')}_PASSWORD"
                password = os.getenv(password_env_name, default_password)
            user = db.query(User).filter(
                (User.username == username) | (User.email == email)
            ).first()

            if user is None:
                user = User(
                    username=username,
                    password_hash=hash_password(password),
                    email=email,
                )
                db.add(user)
                db.flush()
                created_count += 1
                created_accounts.append((username, role_name))

            role = db.query(Role).filter(Role.role_name == role_name).one()
            assignment = db.query(UserRole).filter(
                UserRole.user_id == user.user_id,
                UserRole.role_id == role.role_id,
            ).first()
            if assignment is None:
                db.add(UserRole(user_id=user.user_id, role_id=role.role_id))

            employee_number, first_name, last_name, staff_email, _ = DEFAULT_STAFF[role_name]
            staff_email = email
            staff = db.query(Staff).filter(Staff.user_id == user.user_id).first()
            if staff is None:
                existing_employee = db.query(Staff).filter(
                    Staff.employee_number == employee_number
                ).first()
                if existing_employee is None:
                    db.add(Staff(
                        user_id=user.user_id,
                        employee_number=employee_number,
                        first_name=first_name,
                        last_name=last_name,
                        email=staff_email,
                        hire_date=date.today(),
                        employment_status="active",
                    ))
                    created_staff.append((username, role_name, employee_number))

    for username, role_name in created_accounts:
        print(f"Created account '{username}' successfully with role '{role_name}'.")
    for username, role_name, employee_number in created_staff:
        print(f"Created staff record '{employee_number}' for '{username}' with role '{role_name}'.")
    for location in created_locations:
        print(f"Created {location} successfully in Cairo.")
    for code in created_ambulances:
        print(f"Created ambulance '{code}' successfully in Cairo.")

    return created_count


def seed_admin() -> bool:
    return seed_users() > 0


if __name__ == "__main__":
    created_count = seed_users()
    if created_count:
        print(f"Created {created_count} default user account(s).")
    else:
        print("Default user accounts already exist.")