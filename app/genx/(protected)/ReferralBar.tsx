'use client'
import { useState } from 'react'

export default function ReferralBar({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      background: '#141414',
      borderBottom: '1px solid #1F1F1F',
      padding: '8px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
          Your link
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          color: '#FFFFFF',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {link}
        </span>
      </div>
      <button
        onClick={copy}
        style={{
          background: copied ? '#22C55E' : '#1F1F1F',
          color: copied ? '#0A0A0A' : '#888888',
          border: 'none',
          borderRadius: 4,
          padding: '4px 12px',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'background 0.15s',
          letterSpacing: '0.04em',
        }}
      >
        {copied ? 'COPIED' : 'COPY'}
      </button>

      <style>{`
        @media (max-width: 480px) {
          .genx-refbar-link { display: none; }
        }
      `}</style>
    </div>
  )
}
