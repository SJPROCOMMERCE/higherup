'use client'

import { useState, useRef, useEffect } from 'react'
import { useLanguage } from '@/components/LanguageProvider'
import { LOCALES, type Locale } from '@/lib/translations'

export function LanguageToggle() {
  const { locale, setLocale } = useLanguage()
  const [open, setOpen]       = useState(false)
  const ref                   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const current = LOCALES.find(l => l.code === locale) ?? LOCALES[0]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display:    'flex',
          alignItems: 'center',
          gap:        4,
          background: 'none',
          border:     '1px solid var(--border-light)',
          borderRadius: 6,
          cursor:     'pointer',
          padding:    '3px 8px',
          fontSize:   11,
          fontWeight: 500,
          color:      'var(--text-tertiary)',
          transition: 'color 0.15s, border-color 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = 'var(--text-primary)'
          e.currentTarget.style.borderColor = 'var(--text-muted)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = 'var(--text-tertiary)'
          e.currentTarget.style.borderColor = 'var(--border-light)'
        }}
      >
        <span style={{ fontSize: 13 }}>{current.flag}</span>
        <span>{current.label}</span>
      </button>

      {open && (
        <div style={{
          position:   'absolute',
          top:        'calc(100% + 6px)',
          right:      0,
          background: 'var(--bg-primary)',
          border:     '1px solid var(--border-light)',
          borderRadius: 8,
          boxShadow:  '0 4px 20px rgba(0,0,0,0.10)',
          zIndex:     9999,
          minWidth:   110,
          overflow:   'hidden',
        }}>
          {LOCALES.map(loc => (
            <button
              key={loc.code}
              onClick={() => { setLocale(loc.code as Locale); setOpen(false) }}
              style={{
                display:    'flex',
                alignItems: 'center',
                gap:        8,
                width:      '100%',
                padding:    '8px 12px',
                background: loc.code === locale ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                border:     'none',
                cursor:     'pointer',
                fontSize:   12,
                fontWeight: loc.code === locale ? 600 : 400,
                color:      'var(--text-primary)',
                textAlign:  'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => {
                if (loc.code !== locale) e.currentTarget.style.background = 'var(--bg-secondary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = loc.code === locale ? 'var(--bg-tertiary)' : 'var(--bg-primary)'
              }}
            >
              <span style={{ fontSize: 15 }}>{loc.flag}</span>
              <span>{loc.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
