'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function GenxLoginPage() {
  const [code, setCode]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const router                = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/genx/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_code: code.trim().toUpperCase() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Invalid code'); return }
      router.replace('/genx/command')
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0A0A0A', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ width: 320 }}>
        <div style={{ marginBottom: 48 }}>
          <Image src="/genxlogo.png" alt="GENX" height={32} width={100} style={{ objectFit: 'contain' }} priority />
          <div style={{ fontSize: 12, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 8 }}>
            Lead Generator Portal
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 500, color: '#555555',
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
            }}>
              Access Code
            </label>
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Enter your code"
              autoFocus
              style={{
                width: '100%', background: '#141414', border: '1px solid #1F1F1F',
                borderRadius: 6, padding: '12px 14px', color: '#FFFFFF',
                fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: '#EF4444', marginBottom: 16 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !code.trim()}
            style={{
              width: '100%', background: '#FFFFFF', color: '#0A0A0A',
              border: 'none', borderRadius: 6, padding: '12px',
              fontSize: 13, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
              opacity: !code.trim() ? 0.4 : 1,
            }}
          >
            {loading ? 'Verifying…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
