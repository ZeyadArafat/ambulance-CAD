import { useEffect, useState } from 'react'
import { checkBackendHealth } from './apiClient'

export default function BackendTest() {
  const [status, setStatus] = useState('Checking backend...')
  const [error, setError] = useState('')

  useEffect(() => {
    checkBackendHealth()
      .then((data) => {
        console.log('BACKEND RESPONSE:', data)
        setStatus('BACKEND CONNECTED ✅')
      })
      .catch((err) => {
        console.error('BACKEND ERROR:', err)
        setStatus('BACKEND CONNECTION FAILED ❌')
        setError(err.message)
      })
  }, [])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0B0F14',
        color: '#F5F7FA',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '10px',
        fontFamily: 'Arial',
      }}
    >
      <h1>{status}</h1>

      {error && (
        <p style={{ color: '#EF4444' }}>
          {error}
        </p>
      )}
    </div>
  )
}