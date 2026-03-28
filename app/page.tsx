'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type VA } from '@/lib/supabase'
import { useVA } from '@/context/va-context'
import { logActivity } from '@/lib/activity-log'

// ─── Blocked screen ───────────────────────────────────────────────────────────

function BlockedScreen() {
  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#FFFFFF', fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: 48 }}>
          <img src="/logo.png" alt="HigherUp" style={{ height: 36, width: 'auto', display: 'block', margin: '0 auto' }} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 300, color: '#111111', marginBottom: 10 }}>
          Your account is no longer active.
        </div>
        <div style={{ fontSize: 13, color: '#CCCCCC' }}>
          Contact your manager for support.
        </div>
      </div>
    </main>
  )
}

// ─── Login page ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router           = useRouter()
  const { setCurrentVA } = useVA()

  const [digits,  setDigits]  = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(false)
  const [shaking, setShaking] = useState(false)
  const [blocked, setBlocked] = useState(false)

  const refs = useRef<(HTMLInputElement | null)[]>([])

  const code   = digits.join('')
  const isFull = code.length === 6

  // Auto-focus first box on mount
  useEffect(() => { refs.current[0]?.focus() }, [])

  // ── Digit input ─────────────────────────────────────────────────────────────
  function handleChange(i: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1)
    if (!digit) return
    const next = [...digits]
    next[i] = digit
    setDigits(next)
    if (error) setError(false)
    if (i < 5) refs.current[i + 1]?.focus()
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (digits[i]) {
        const next = [...digits]; next[i] = ''; setDigits(next)
      } else if (i > 0) {
        const next = [...digits]; next[i - 1] = ''; setDigits(next)
        refs.current[i - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft'  && i > 0) { refs.current[i - 1]?.focus() }
    else if   (e.key === 'ArrowRight' && i < 5) { refs.current[i + 1]?.focus() }
    else if   (e.key === 'Enter' && isFull)     { void handleSubmit() }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = ['', '', '', '', '', '']
    for (let j = 0; j < pasted.length; j++) next[j] = pasted[j]
    setDigits(next)
    setError(false)
    refs.current[Math.min(pasted.length, 5)]?.focus()
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!isFull || loading) return
    setLoading(true)
    setError(false)

    const { data, error: dbErr } = await supabase
      .from('vas')
      .select('*')
      .eq('login_code', code)
      .limit(1)
      .maybeSingle()

    if (dbErr || !data) {
      triggerError()
      return
    }

    const va = data as VA

    if (va.status === 'blocked' || va.status === 'deleted') {
      setLoading(false)
      setBlocked(true)
      return
    }

    setCurrentVA(va)
    void logActivity({ action: 'va_login', va_id: va.id, source: 'va', details: `${va.name} logged in` })
    router.push('/dashboard')
  }

  function triggerError() {
    setLoading(false)
    setError(true)
    setShaking(true)
    setTimeout(() => setShaking(false), 300)
    // Auto-reset after 2s
    setTimeout(() => {
      setDigits(['', '', '', '', '', ''])
      setError(false)
      refs.current[0]?.focus()
    }, 2000)
  }

  // ── Blocked screen ───────────────────────────────────────────────────────────
  if (blocked) return <BlockedScreen />

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#FFFFFF', fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    }}>
      <style>{`
        @keyframes hu-shake {
          0%, 100% { transform: translateX(0);   }
          20%       { transform: translateX(-4px); }
          40%       { transform: translateX(4px);  }
          60%       { transform: translateX(-2px); }
          80%       { transform: translateX(2px);  }
        }
        .hu-shake { animation: hu-shake 0.3s ease-in-out; }
        @keyframes hu-dot-pulse {
          0%, 80%, 100% { opacity: 0.2; }
          40%           { opacity: 1;   }
        }
        .hu-dot { display: inline-block; animation: hu-dot-pulse 1.2s ease-in-out infinite; }
        .hu-dot:nth-child(2) { animation-delay: 0.2s; }
        .hu-dot:nth-child(3) { animation-delay: 0.4s; }
      `}</style>

      <div style={{ width: 320, textAlign: 'center' }}>

        {/* ── Logo ── */}
        <div style={{ marginBottom: 64 }}>
          <img src="/logo.png" alt="HigherUp" style={{ height: 36, width: 'auto', display: 'block', margin: '0 auto' }} />
        </div>

        {/* ── Six digit boxes ── */}
        <div
          className={shaking ? 'hu-shake' : ''}
          style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 32 }}
        >
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { refs.current[i] = el }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              value={d}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              onPaste={handlePaste}
              autoComplete="off"
              disabled={loading}
              style={{
                width: 44, height: 52,
                border: `1.5px solid ${error ? '#F87171' : '#E0E0E0'}`,
                borderRadius: 10,
                background: '#FFFFFF',
                fontSize: 22, fontWeight: 600,
                textAlign: 'center',
                color: error ? '#EF4444' : '#111111',
                fontFamily: "'Inter', system-ui, sans-serif",
                outline: 'none',
                transition: 'border-color 0.15s ease',
                caretColor: 'transparent',
                boxSizing: 'border-box',
                flexShrink: 0,
              }}
              onFocus={e => { if (!error) e.target.style.borderColor = '#111111' }}
              onBlur={e => { if (!error) e.target.style.borderColor = '#E0E0E0' }}
            />
          ))}
        </div>

        {/* ── Sign in button ── */}
        <button
          onClick={() => void handleSubmit()}
          disabled={!isFull || loading}
          style={{
            width: '100%', padding: '14px 0',
            fontSize: 14, fontWeight: 500,
            color: isFull && !loading ? '#FFFFFF' : '#CCCCCC',
            background: isFull && !loading ? '#111111' : '#F5F5F5',
            border: 'none', borderRadius: 10,
            cursor: isFull && !loading ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            transition: 'background 0.15s, opacity 0.15s',
          }}
          onMouseEnter={e => { if (isFull && !loading) e.currentTarget.style.opacity = '0.9' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          {loading ? (
            <span>
              <span className="hu-dot">·</span>
              <span className="hu-dot">·</span>
              <span className="hu-dot">·</span>
            </span>
          ) : 'Sign in'}
        </button>

        {/* ── Error / spacing ── */}
        <div style={{ height: 16 }} />
        {error && (
          <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 4 }}>
            Invalid code
          </div>
        )}

        {/* ── Hint ── */}
        <div style={{ fontSize: 12, color: '#CCCCCC' }}>
          Your 6-digit code was sent by your manager.
        </div>

      </div>
    </main>
  )
}
