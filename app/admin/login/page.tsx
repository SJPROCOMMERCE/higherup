'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const router   = useRouter()
  const pwRef    = useRef<HTMLInputElement>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const canSubmit = username.trim() && password && !loading

  async function handleSubmit() {
    if (!canSubmit) return
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/admin/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: username.trim(), password }),
      })

      if (res.ok) {
        router.push('/admin/dashboard')
        router.refresh()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Invalid credentials')
        setPassword('')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#FFFFFF', fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ width: 320 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <img src="/logo.png" alt="HigherUp" style={{ height: 36, width: 'auto', display: 'block', margin: '0 auto' }} />
          <div style={{ fontSize: 14, color: '#CCCCCC', marginTop: 10 }}>Admin</div>
        </div>

        {/* Username */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: '#CCCCCC', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
            Username
          </div>
          <input
            type="text"
            value={username}
            onChange={e => { setUsername(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && pwRef.current?.focus()}
            placeholder="Username"
            autoFocus
            autoComplete="username"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'transparent', border: 'none',
              borderBottom: '1.5px solid #EEEEEE',
              fontSize: 15, color: '#111111',
              padding: '6px 0', outline: 'none',
              fontFamily: 'inherit', transition: 'border-color 0.15s',
            }}
            onFocus={e  => { e.target.style.borderBottomColor = '#111111' }}
            onBlur={e   => { e.target.style.borderBottomColor = '#EEEEEE' }}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 10, color: '#CCCCCC', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
            Password
          </div>
          <input
            ref={pwRef}
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Password"
            autoComplete="current-password"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'transparent', border: 'none',
              borderBottom: '1.5px solid #EEEEEE',
              fontSize: 15, color: '#111111',
              padding: '6px 0', outline: 'none',
              fontFamily: 'inherit', transition: 'border-color 0.15s',
            }}
            onFocus={e => { e.target.style.borderBottomColor = '#111111' }}
            onBlur={e  => { e.target.style.borderBottomColor = '#EEEEEE' }}
          />
        </div>

        {/* Button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            width: '100%', padding: '14px 0',
            background: canSubmit ? '#111111' : '#F5F5F5',
            color:      canSubmit ? '#FFFFFF'  : '#CCCCCC',
            border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 500,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => { if (canSubmit) e.currentTarget.style.opacity = '0.88' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          {loading ? '···' : 'Sign in'}
        </button>

        {/* Error */}
        {error && (
          <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: '#EF4444' }}>
            {error}
          </div>
        )}
      </div>
    </main>
  )
}
