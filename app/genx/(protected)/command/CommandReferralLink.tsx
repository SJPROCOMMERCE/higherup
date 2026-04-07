'use client'
import { useState } from 'react'

export default function CommandReferralLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          color: '#888888',
        }}>
          {link}
        </span>
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
            transition: 'background 0.15s',
            letterSpacing: '0.04em',
          }}
        >
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>
      <div style={{ fontSize: 12, color: '#555555' }}>
        Share this link. Every VA who signs up earns you $0.05 per product. Forever.
      </div>
    </div>
  )
}
