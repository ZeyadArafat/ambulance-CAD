import { Routes, Route, Navigate } from 'react-router-dom'
import { useCad } from '../context/CadContext'

import AppShell from '../components/layout/AppShell'

import Login from '../pages/Login'
import CallTaker from '../pages/call-taker/CallTaker'
import Dispatcher from '../pages/dispatcher/Dispatcher'
import Paramedic from '../pages/paramedic/Paramedic'
import Hospital from '../pages/hospital/Hospital'
import OperationsSupervisor from '../pages/operations/OperationsSupervisor'
import FleetMaintenance from '../pages/fleet/FleetMaintenance'
import AdminDashboard from '../pages/admin/AdminDashboard'

const pages = {
  'call-taker': CallTaker,
  dispatcher: Dispatcher,
  paramedic: Paramedic,
  hospital: Hospital,
  operations: OperationsSupervisor,
  fleet: FleetMaintenance,
  admin: AdminDashboard,
}

function Guard({ role, children }) {
  const { currentUser } = useCad()

  // Not logged in
  if (!currentUser) {
    return <Navigate to="/login" replace />
  }

  // User tries to open another role
  if (currentUser.roleKey !== role) {
    return (
      <Navigate
        to={`/${currentUser.roleKey}`}
        replace
      />
    )
  }

  return children
}

export default function AppRoutes() {
  return (
    <Routes>

      {/* =========================
          LOGIN
      ========================= */}
      <Route
        path="/login"
        element={<Login />}
      />

      {/* =========================
          ROLE DASHBOARDS
      ========================= */}
      {Object.entries(pages).map(([role, Page]) => (
        <Route
          key={role}
          path={`/${role}`}
          element={
            <Guard role={role}>
              <AppShell>
                <Page />
              </AppShell>
            </Guard>
          }
        />
      ))}

      {/* =========================
          ROOT
      ========================= */}
      <Route
        path="/"
        element={<Navigate to="/login" replace />}
      />

      {/* =========================
          UNKNOWN ROUTE
      ========================= */}
      <Route
        path="*"
        element={<Navigate to="/login" replace />}
      />

    </Routes>
  )
}