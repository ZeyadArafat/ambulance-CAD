import { CadProvider } from './context/CadContext'
import AppRoutes from './routes/AppRoutes'

export default function App() {
  return (
    <CadProvider>
      <AppRoutes />
    </CadProvider>
  )
}
