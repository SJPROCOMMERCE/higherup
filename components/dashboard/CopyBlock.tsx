'use client'

import { useState } from 'react'

interface CopyBlockProps {
  title:   string
  content: string
}

export function CopyBlock({ title, content }: CopyBlockProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ marginTop: 24, background: '#FAFAFA', borderRadius: 16, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
          {title}
        </p>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            fontSize: 12, color: copied ? '#10B981' : '#CCCCCC',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', transition: 'color 0.15s', padding: 0,
          }}
          onMouseEnter={e => { if (!copied) e.currentTarget.style.color = '#111111' }}
          onMouseLeave={e => { if (!copied) e.currentTarget.style.color = '#CCCCCC' }}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <p style={{ fontSize: 14, color: '#111111', whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0 }}>
        {content}
      </p>
    </div>
  )
}
