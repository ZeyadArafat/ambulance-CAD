import TopHeader from './TopHeader'
import Sidebar from './Sidebar'
import Toast from '../common/Toast'
import StatusBar from './StatusBar'
import { useCad } from '../../context/CadContext'

export default function AppShell({ children, fullWidth = false }) {
  const {
    notifications,
    dismissNotification,
  } = useCad()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0B0E14] text-[#F5F7FA]">

      {/* 60px HEADER */}
      <div className="h-[60px] shrink-0">
        <TopHeader />
      </div>

      {/* MAIN APPLICATION */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {!fullWidth && (
          <Sidebar />
        )}

        <main className="min-w-0 min-h-0 flex-1 overflow-hidden">
          {children}
        </main>

      </div>

      <Toast
        items={notifications}
        onDismiss={dismissNotification}
      />

    </div>
  )
}
