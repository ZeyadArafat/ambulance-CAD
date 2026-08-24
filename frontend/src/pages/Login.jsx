import { useState } from 'react'
import { Eye, EyeOff, ShieldAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCad } from '../context/CadContext'

const roles = [
  {
    value: 'call-taker',
    label: 'Call Taker',
    description: 'Receive and document emergency calls.',
  },
  {
    value: 'dispatcher',
    label: 'Dispatcher',
    description: 'Manage incidents and dispatch response units.',
  },
  {
    value: 'paramedic',
    label: 'Paramedic',
    description: 'Manage assigned emergency response and patient status.',
  },
  {
    value: 'hospital',
    label: 'Hospital',
    description: 'Manage incoming patients and hospital capacity.',
  },
  {
    value: 'operations',
    label: 'Operations Supervisor',
    description: 'Monitor operations and resource allocation.',
  },
  {
    value: 'fleet',
    label: 'Fleet / Maintenance',
    description: 'Monitor ambulance fleet and maintenance status.',
  },
  {
    value: 'admin',
    label: 'Administrator',
    description: 'Manage users, roles, configuration and audit records.',
  },
]

export default function Login() {
  const navigate = useNavigate()
  const { loginAs } = useCad()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('')

  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedRole = roles.find((item) => item.value === role)

  const handleSubmit = async (event) => {
    event.preventDefault()

    setError('')

    if (!username.trim()) {
      setError('USERNAME is required.')
      return
    }

    if (!password) {
      setError('PASSWORD is required.')
      return
    }

    if (!role) {
      setError('Please select your operational role.')
      return
    }

    setLoading(true)

    const result = await loginAs(role, username, password)

    if (!result?.success) {
      setLoading(false)
      setError(result?.message || 'Unable to sign in.')
      return
    }

    navigate(`/${result.user.roleKey}`, {
      replace: true,
    })
  }

  return (
    <div className="h-screen min-h-screen overflow-hidden bg-[#0B0F14] text-[#F5F7FA] flex flex-col">

      {/* HEADER */}
      <header className="h-[60px] shrink-0 bg-[#121620] border-b border-[#222B3A] px-6 flex items-center justify-between">

        <div>
          <div className="text-[15px] font-black tracking-[0.12em]">
            AMBULANCE CAD
          </div>

          <div className="text-[9px] uppercase tracking-[0.18em] text-[#7E8A9A] mt-0.5">
            Emergency Computer-Aided Dispatch
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider">
          <span className="w-2 h-2 rounded-full bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.7)]" />

          <span className="text-[#22C55E]">
            SYSTEM ONLINE
          </span>
        </div>

      </header>

      {/* MAIN */}
      <main className="flex-1 min-h-0 overflow-hidden flex items-center justify-center px-4 py-6">

        <div className="w-full max-w-[480px]">

          {/* BRAND / TITLE */}
          <div className="mb-5">

            <div className="flex items-center gap-3 mb-3">

              <div className="w-10 h-10 border border-[#EF4444]/40 bg-[#17151A] flex items-center justify-center">

                <ShieldAlert
                  size={21}
                  className="text-[#EF4444]"
                />

              </div>

              <div>

                <div className="text-[10px] font-bold tracking-[0.2em] text-[#EF4444]">
                  EMS OPERATIONS
                </div>

                <div className="text-[11px] text-[#7E8A9A] uppercase tracking-wider">
                  Secure operational access
                </div>

              </div>

            </div>

            <h1 className="text-2xl font-black tracking-tight">
              SIGN IN TO EMS CAD
            </h1>

            <p className="text-xs text-[#7E8A9A] mt-1">
              Authenticate to access your assigned operational workspace.
            </p>

          </div>

          {/* LOGIN CARD */}
          <div className="bg-[#151B24] border border-[#222B3A]">

            {/* CARD HEADER */}
            <div className="h-11 px-4 border-b border-[#222B3A] flex items-center justify-between">

              <span className="text-[10px] font-bold tracking-[0.16em]">
                OPERATIONAL SIGN-IN
              </span>

              <span className="text-[9px] text-[#7E8A9A]">
                SECURE SESSION
              </span>

            </div>

            {/* FORM */}
            <form
              onSubmit={handleSubmit}
              className="p-5 space-y-4"
            >

              {/* USERNAME */}
              <div>

                <label className="block text-[10px] font-bold tracking-[0.14em] text-[#AAB4C3] mb-2">
                  USERNAME
                </label>

                <input
                  type="text"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value)
                    setError('')
                  }}
                  placeholder="Enter username"
                  autoComplete="username"
                  className="w-full h-10 px-3 bg-[#0F141D] border border-[#222B3A] text-sm text-[#F5F7FA] placeholder:text-[#596474] outline-none focus:border-[#3B82F6] transition-colors"
                />

              </div>

              {/* PASSWORD */}
              <div>

                <label className="block text-[10px] font-bold tracking-[0.14em] text-[#AAB4C3] mb-2">
                  PASSWORD
                </label>

                <div className="relative">

                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setError('')
                    }}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    className="w-full h-10 px-3 pr-10 bg-[#0F141D] border border-[#222B3A] text-sm text-[#F5F7FA] placeholder:text-[#596474] outline-none focus:border-[#3B82F6] transition-colors"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-0 top-0 h-10 w-10 flex items-center justify-center text-[#7E8A9A] hover:text-[#F5F7FA]"
                    aria-label={
                      showPassword
                        ? 'Hide password'
                        : 'Show password'
                    }
                  >
                    {showPassword ? (
                      <EyeOff size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                  </button>

                </div>

              </div>

              {/* ROLE */}
              <div>

                <label className="block text-[10px] font-bold tracking-[0.14em] text-[#AAB4C3] mb-2">
                  SELECT ROLE
                </label>

                <select
                  value={role}
                  onChange={(event) => {
                    setRole(event.target.value)
                    setError('')
                  }}
                  className="w-full h-10 px-3 bg-[#0F141D] border border-[#222B3A] text-sm text-[#F5F7FA] outline-none focus:border-[#3B82F6] cursor-pointer"
                >

                  <option value="">
                    Select your operational role
                  </option>

                  {roles.map((item) => (
                    <option
                      key={item.value}
                      value={item.value}
                    >
                      {item.label}
                    </option>
                  ))}

                </select>

                {/* ROLE DESCRIPTION */}
                {selectedRole && (
                  <div className="mt-2 px-3 py-2 border border-[#222B3A] bg-[#0F141D]">

                    <div className="text-[10px] font-bold text-[#38BDF8]">
                      {selectedRole.label}
                    </div>

                    <div className="text-[10px] text-[#7E8A9A] mt-0.5">
                      {selectedRole.description}
                    </div>

                  </div>
                )}

              </div>

              {/* ERROR */}
              {error && (
                <div className="border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 flex items-center gap-2">

                  <span className="w-1.5 h-1.5 bg-[#EF4444] rounded-full shrink-0" />

                  <span className="text-[10px] font-bold text-[#F87171]">
                    {error}
                  </span>

                </div>
              )}

              {/* SIGN IN */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-60 disabled:cursor-not-allowed border border-[#60A5FA] text-white text-[11px] font-black tracking-[0.16em] transition-colors"
              >
                {loading ? 'AUTHENTICATING...' : 'SIGN IN'}
              </button>

              {/* FOOTER */}
              <div className="pt-2 border-t border-[#222B3A]">

                <div className="flex justify-between text-[9px] text-[#596474]">
                  <span>EMS CAD ENVIRONMENT</span>
                  <span>BACKEND AUTHENTICATION REQUIRED</span>
                </div>

              </div>

            </form>

          </div>

          {/* BOTTOM */}
          <div className="mt-4 flex items-center justify-between text-[9px] text-[#596474] uppercase tracking-wider">
            <span>EMS CAD OPERATIONS</span>
            <span>AUTHORIZED ACCESS ONLY</span>
          </div>

        </div>

      </main>

    </div>
  )
}