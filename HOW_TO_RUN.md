# How to Run This System on Other Devices

This project is made of a few services:

- Backend API: FastAPI
- Frontend: React + Vite
- Postgres database: with PostGIS
- MQTT broker: Mosquitto
- OSRM routing service

The fastest way to start the full system is:

1. Start the core infrastructure with Docker
2. Start the frontend locally on the host machine
3. Open the app from another device using your computer's local IP address

---

## 1. Prerequisites

Install these on the machine hosting the project:

- Git
- Docker Desktop or Docker Engine
- Docker Compose
- Node.js 18+
- npm
- osrm routing data

If you are running on Windows, make sure Docker Desktop is running before starting the containers.

---

## 2. Clone the project and download the routing data


```bash
git clone <your-repository-url>
cd ambulance-CAD
```

If you already have the project, go to the project folder:

```bash
cd ambulance-CAD
```

routing data: https://drive.google.com/drive/folders/1nDhTnrDztT7B1Ptozmd_O76lYNlU6ygx?usp=drive_link
download this folder and put it inside the infrastructure folder

---

## 3. Start the backend infrastructure with Docker

From the project root, run:

```bash
docker compose up --build
```

This starts the required services:

- Postgres database
- Mosquitto MQTT broker
- OSRM routing engine
- FastAPI backend

After startup, check the app is available:

- Backend: http://localhost:8000
- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

If you are opening from another device on the same network, replace `localhost` with the host machine's private IP address.

Example:

```text
http://192.168.1.50:8000
```

To find your local IP on Windows:

```powershell
ipconfig
```

Look for the IPv4 address under your active network adapter.

---

## 4. Start the frontend

Open a second terminal and run:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

This makes the Vite dev server available on your local network.

The frontend should be available at:

```text
http://localhost:5173
```

From another device on the same network:

```text
http://192.168.1.50:5173
```

> Replace `192.168.1.50` with the actual IP of the machine running the project.

---

## 5. Access the app from another device

On the other device, open the browser and visit:

```text
http://<HOST_MACHINE_IP>:5173
```

Example:

```text
http://192.168.1.50:5173
```

The backend API will be available at:

```text
http://<HOST_MACHINE_IP>:8000
```

Example:

```text
http://192.168.1.50:8000/docs
```

---

## 6. Optional: run backend without Docker

If you want to run only the FastAPI backend directly instead of using Docker:

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

This is useful for local development and debugging.

---

## 7. Optional: create the default admin user

When the database is empty, you can seed the default admin account:

```bash
docker compose exec backend python seed.py
```

Default credentials:

- Username: admin
- Password: admin123
- Email: admin@example.com

You can override these by setting environment variables before running the seed:

```bash
CAD_ADMIN_USERNAME=myuser
CAD_ADMIN_PASSWORD=mypassword
CAD_ADMIN_EMAIL=me@example.com
```

---

## 8. Common issues and fixes

### Frontend not visible on another device

Run the frontend with:

```bash
npm run dev -- --host 0.0.0.0
```

### Backend not reachable

Make sure Docker is running and the containers are started:

```bash
docker compose ps
```

If needed, restart services:

```bash
docker compose down
docker compose up --build
```

### Port blocked or not accessible on LAN

Check your firewall settings and make sure the following ports are open:

- 5173 for the frontend
- 8000 for the backend
- 5432 for Postgres
- 1883 for MQTT
- 5000 for OSRM

---

## 9. Recommended local workflow

For normal development, use this flow:

```bash
docker compose up --build
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

Then open the app in a browser using your host machine IP address.

---

## 10. Summary

The system is designed to run with:

- Docker for database, MQTT, OSRM, and backend services
- Local Node dev server for the frontend
- Access from other devices using your machine's LAN IP

Most important URL patterns:

- Frontend: http://<HOST_IP>:5173
- Backend: http://<HOST_IP>:8000
- API docs: http://<HOST_IP>:8000/docs

If you follow the steps above, this project can be run from a laptop or desktop and accessed by other devices on the same network.
