import { AppRouter } from '@/app/AppRouter'
import { AuthProvider } from '@/auth/AuthProvider'

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}
