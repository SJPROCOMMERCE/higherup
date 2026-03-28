'use client'

import { useState, useEffect } from 'react'

interface RevealScreenProps {
  children: React.ReactNode
  onContinue: () => void
  continueDelay?: number
  continueText?: string
  loading?: boolean
}

export function RevealScreen({
  children,
  onContinue,
  continueDelay = 3000,
  continueText  = 'Continue',
  loading       = false,
}: RevealScreenProps) {
  const [showBtn, setShowBtn] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShowBtn(true), continueDelay)
    return () => clearTimeout(t)
  }, [continueDelay])

  return (
    <div style={{
      minHeight: '65vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      textAlign: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {children}
      </div>

      {/* Delayed continue button */}
      <div style={{
        marginTop: 64,
        opacity:   showBtn ? 1 : 0,
        transform: showBtn ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.7s ease-out, transform 0.7s ease-out',
        pointerEvents: showBtn ? 'auto' : 'none',
      }}>
        <button
          onClick={onContinue}
          disabled={loading}
          style={{
            background: 'none', border: 'none',
            cursor: loading ? 'default' : 'pointer',
            fontSize: 13,
            color: '#CCCCCC',
            fontFamily: 'inherit', padding: '12px 0', minHeight: 44,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.color = '#111111' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#CCCCCC' }}
        >
          {loading ? '···' : `${continueText} →`}
        </button>
      </div>
    </div>
  )
}
