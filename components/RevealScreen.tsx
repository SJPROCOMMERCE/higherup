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
            display: 'block', margin: '0 auto',
            width: '100%', maxWidth: 320, padding: '16px 32px',
            borderRadius: 9999, border: 'none',
            cursor:     loading ? 'not-allowed' : 'pointer',
            background: loading ? '#F0F0F0' : '#2DB87E',
            color:      loading ? '#CCCCCC'  : '#FFFFFF',
            fontSize: 15, fontWeight: 500,
            fontFamily: 'inherit', transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.9' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          {loading ? '···' : `${continueText} →`}
        </button>
      </div>
    </div>
  )
}
