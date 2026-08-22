import { NavLink, useNavigate } from 'react-router-dom'
import {
  Radio,
  MapPinned,
  Ambulance,
  Hospital as HospitalIcon,
  Shield,
  Settings,
  Truck,
  LogOut,
} from 'lucide-react'
import { useCad } from '../../context/CadContext'

const links = [
  ['call-taker', 'Call Taker', Radio],
  ['dispatcher', 'Dispatcher', MapPinned],
  ['paramedic', 'Paramedic', Ambulance],
  ['hospital', 'Hospital', HospitalIcon],
  ['operations', 'Operations', Shield],
  ['fleet', 'Fleet / Maintenance', Truck],
  ['admin', 'Admin', Settings],
]

export default function Sidebar() {
  const { currentUser, logout } = useCad()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="w-[220px] shrink-0 border-r border-[#222B3A] bg-[#0E131B] flex flex-col overflow-hidden">

      {/* WORKSPACES */}

      <div className="px-4 pt-4 pb-2">
        <div className="text-[9px] uppercase tracking-[0.15em] text-[#586578]">
          Workspaces
        </div>
      </div>


      {/* NAVIGATION */}

      <nav className="px-2 space-y-1">

        {links.map(([to, label, Icon]) => (
          <NavLink
            key={to}
            to={`/${to}`}
            className={({ isActive }) =>
              [
                'group flex w-full items-center gap-3 rounded-md px-3 py-2.5',
                'text-[11px] font-semibold transition-all duration-150',
                'border-l-2',
                isActive
                  ? 'border-[#38BDF8] bg-[#1A2A3A] text-[#F5F7FA]'
                  : 'border-transparent text-[#7E8A9A] hover:bg-[#151D28] hover:text-[#F5F7FA]',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={15}
                  strokeWidth={isActive ? 2.3 : 1.8}
                  className={
                    isActive
                      ? 'text-[#38BDF8]'
                      : 'text-[#66758A] group-hover:text-[#CBD5E1]'
                  }
                />

                <span className="truncate">
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}

      </nav>


      {/* BOTTOM */}

      <div className="mt-auto border-t border-[#222B3A] p-3">

        <div className="mb-3 px-1">

          <div className="text-[9px] uppercase tracking-[0.15em] text-[#586578]">
            Operator
          </div>

          <div className="mt-1 truncate text-[11px] font-semibold text-[#F5F7FA]">
            {currentUser?.name || 'Demo User'}
          </div>

          <div className="mt-0.5 text-[9px] uppercase text-[#586578]">
            {currentUser?.roleKey || 'Operator'}
          </div>

        </div>


        {/* LOGOUT */}

        <button
          type="button"
          onClick={handleLogout}
          className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-[11px] font-semibold text-[#7E8A9A] transition hover:bg-[#24171A] hover:text-[#F87171]"
        >
          <LogOut
            size={15}
            strokeWidth={1.8}
            className="text-[#66758A] transition group-hover:text-[#F87171]"
          />

          <span>
            Logout
          </span>
        </button>

      </div>

    </aside>
  )
}