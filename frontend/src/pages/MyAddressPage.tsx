import { AddressForm } from '@/components/address/AddressForm'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export function MyAddressPage() {
  useDocumentTitle('Meu endereço')

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-3xl">
        <AddressForm />
      </div>
    </ProtectedRoute>
  )
}
