'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Notification } from '@/lib/supabase'

// ─── Route per notification type ─────────────────────────────────────────────

const TYPE_ROUTE: Record<string, string> = {
  upload_done:          '/dashboard/uploads',
  upload_failed:        '/dashboard/uploads',
  upload_clarification: '/dashboard/messages',
  va_response:          '/dashboard/messages',
  invoice_generated:    '/dashboard/billing',
  invoice_overdue:      '/dashboard/billing',
  output_locked:        '/dashboard/billing',
  payment_received:     '/dashboard/billing',
  account_paused:       '/dashboard/billing',
  account_blocked:      '/dashboard/billing',
  client_approved:      '/dashboard/clients',
  client_rejected:      '/dashboard/clients',
  request_approved:     '/dashboard/clients',
  request_rejected:     '/dashboard/clients',
  streak_lost:          '/dashboard/affiliates',
  streak_extended:      '/dashboard/affiliates',
  streak_reminder:      '/dashboard/affiliates',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m    = Math.floor(diff / 60000)
  if (m < 60)  return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h`
  return `${Math.floor(h / 24)}d`
}

// ─── Bell SVG ────────────────────────────────────────────────────────────────

function BellIcon({ size = 18, color = '#999999' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationBell({ vaId }: { vaId: string }) {
  const router      = useRouter()
  const dropRef     = useRef<HTMLDivElement>(null)
  const [open,      setOpen]      = useState(false)
  const [notes,     setNotes]     = useState<Notification[]>([])
  const [bellColor, setBellColor] = useState('#999999')

  // ── Fetch unread ────────────────────────────────────────────────────────────
  const fetchNotes = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('va_id', vaId)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(20)
    setNotes((data ?? []) as Notification[])
  }, [vaId])

  useEffect(() => { void fetchNotes() }, [fetchNotes])

  // ── Realtime: new inserts ───────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`notif-bell-${vaId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `va_id=eq.${vaId}` },
        (payload) => { setNotes(prev => [payload.new as Notification, ...prev]) },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [vaId])

  // ── Click outside ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function dismiss(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  async function clearAll() {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('va_id', vaId)
      .eq('is_read', false)
    setNotes([])
    setOpen(false)
  }

  async function handleClick(n: Notification) {
    await dismiss(n.id)
    const route = TYPE_ROUTE[n.type] ?? '/dashboard'
    router.push(route)
    setOpen(false)
  }

  const unread = notes.length

  return (
    <div ref={dropRef} style={{ position: 'relative' }}>

      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 8,
          background: 'none', border: 'none', cursor: 'pointer',
          transition: 'background 0.15s',
        }}
        onMouseEnter={() => setBellColor('#111111')}
        onMouseLeave={() => setBellColor('#999999')}
        aria-label="Notifications"
      >
        <BellIcon size={18} color={open ? '#111111' : bellColor} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 5, right: 5,
            width: 7, height: 7, borderRadius: '50%',
            background: '#2DB87E',
            border: '1.5px solid #FFFFFF',
          }} />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 360, maxHeight: 400, overflowY: 'auto',
          background: '#FFFFFF',
          border: '1px solid #EEEEEE',
          borderRadius: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          zIndex: 100,
        }}>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #F5F5F5',
          }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#111111' }}>Notifications</span>
            {unread > 0 && (
              <button
                onClick={clearAll}
                style={{
                  fontSize: 12, color: '#CCCCCC', background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', padding: 0, transition: 'color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#111111'}
                onMouseLeave={e => e.currentTarget.style.color = '#CCCCCC'}
              >
                Clear all
              </button>
            )}
          </div>

          {/* Empty state */}
          {unread === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#CCCCCC', margin: 0 }}>No new notifications</p>
            </div>
          )}

          {/* Notification rows */}
          {notes.map(n => (
            <div
              key={n.id}
              onClick={() => void handleClick(n)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '14px 20px',
                borderBottom: '1px solid #F5F5F5',
                cursor: 'pointer',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFA')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Unread dot */}
              <span style={{
                marginTop: 5, flexShrink: 0,
                width: 6, height: 6, borderRadius: '50%',
                background: '#2DB87E', display: 'block',
              }} />

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: 0, fontSize: 13, fontWeight: 500, color: '#111111',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {n.title}
                </p>
                {n.message && (
                  <p style={{
                    margin: '2px 0 0', fontSize: 12, color: '#999999',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {n.message}
                  </p>
                )}
              </div>

              {/* Time */}
              <span style={{ fontSize: 11, color: '#CCCCCC', flexShrink: 0, marginLeft: 8, marginTop: 1 }}>
                {relativeTime(n.created_at)}
              </span>
            </div>
          ))}

        </div>
      )}
    </div>
  )
}
