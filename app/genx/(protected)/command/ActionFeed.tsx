'use client'
import { useState } from 'react'

type Action = {
  id: string
  type: string
  priority: string
  title: string
  body: string | null
  va_user_id: string | null
  metadata: Record<string, unknown> | null
}

export default function ActionFeed({ actions: initial }: { actions: Action[] }) {
  const [actions, setActions] = useState(initial)
  const [loading, setLoading] = useState<string | null>(null)

  async function dismiss(id: string) {
    setLoading(id)
    await fetch(`/api/genx/actions/${id}/dismiss`, { method: 'POST' })
    setActions(prev => prev.filter(a => a.id !== id))
    setLoading(null)
  }

  async function complete(id: string) {
    setLoading(id)
    await fetch(`/api/genx/actions/${id}/complete`, { method: 'POST' })
    setActions(prev => prev.filter(a => a.id !== id))
    setLoading(null)
  }

  if (actions.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {actions.map(action => (
        <div key={action.id} style={{
          background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 16,
          display: 'flex', gap: 12, opacity: loading === action.id ? 0.5 : 1,
        }}>
          <div style={{ paddingTop: 4, flexShrink: 0 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: action.priority === 'high' ? '#FFFFFF' : '#555555' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 500, marginBottom: 4, lineHeight: 1.4 }}>
              {action.title}
            </div>
            {action.body && (
              <div style={{ color: '#888888', fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
                {action.body}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => complete(action.id)} style={{
                background: '#1A1A1A', border: '1px solid #333', borderRadius: 4,
                padding: '6px 12px', fontSize: 12, color: '#FFFFFF', cursor: 'pointer',
              }}>
                Done
              </button>
              <button onClick={() => dismiss(action.id)} style={{
                background: 'none', border: 'none', fontSize: 11, color: '#555555',
                cursor: 'pointer', padding: '4px 0', letterSpacing: '0.04em',
              }}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
