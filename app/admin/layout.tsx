'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const NAV = [
  { label: 'Dashboard',  href: '/admin/dashboard' },
  { label: 'Analytics',  href: '/admin/analytics' },
  { label: 'Approvals',  href: '/admin/approvals' },
  { label: 'Flagged',    href: '/admin/flagged' },
  { label: 'Messages',   href: '/admin/messages' },
  { label: 'Requests',   href: '/admin/requests' },
  { label: "VA's",       href: '/admin/vas' },
  { label: 'Clients',    href: '/admin/clients' },
  { label: 'Prompts',    href: '/admin/prompts' },
  { label: 'Pricing',    href: '/admin/pricing' },
  { label: 'Billing',    href: '/admin/billing' },
  { label: 'Finance',    href: '/admin/finance' },
  { label: 'Affiliates', href: '/admin/affiliates' },
  { label: 'Videos',     href: '/admin/videos' },
  { label: 'Logs',       href: '/admin/logs' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const [pendingRequests, setPendingRequests] = useState(0)
  const [pendingVAs,      setPendingVAs]      = useState(0)
  const [flaggedCount,    setFlaggedCount]    = useState(0)
  const [msgCount,        setMsgCount]        = useState(0)

  useEffect(() => {
    supabase
      .from('profile_change_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setPendingRequests(count ?? 0))

    supabase
      .from('vas')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_approval')
      .then(({ count }) => setPendingVAs(count ?? 0))

    // Flagged counter: sum of unresolved items needing attention
    const now = new Date()
    const in12h = new Date(now.getTime() + 12 * 3600_000).toISOString()
    Promise.all([
      supabase.from('uploads').select('id', { count: 'exact', head: true }).eq('status', 'on_hold').eq('flag_resolved', false),
      supabase.from('uploads').select('id', { count: 'exact', head: true }).eq('status', 'failed').eq('flag_resolved', false),
      supabase.from('clients').select('id', { count: 'exact', head: true }).lte('deadline_48h', in12h).eq('deadline_expired', false).eq('is_active', true),
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('deadline_expired', true).eq('is_active', false),
      supabase.from('billing').select('id', { count: 'exact', head: true }).eq('status', 'overdue'),
      supabase.from('activity_log').select('id', { count: 'exact', head: true }).eq('action', 'store_mismatch'),
    ]).then(results => {
      const total = results.reduce((s, r) => s + (r.count ?? 0), 0)
      setFlaggedCount(total)
    })

    // Admin unread messages: VA responses not yet read
    supabase
      .from('uploads')
      .select('id', { count: 'exact', head: true })
      .eq('awaiting_admin_response', true)
      .then(({ count }) => setMsgCount(count ?? 0))
  }, [pathname])

  // Login + entry page — no nav
  if (pathname === '/admin' || pathname === '/admin/login') {
    return (
      <div style={{ minHeight: '100vh', background: '#FFFFFF', fontFamily: "'Inter', system-ui, sans-serif" }}>
        {children}
      </div>
    )
  }

  function isActive(href: string) {
    if (href === '/admin/dashboard') return pathname === '/admin/dashboard'
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ─── Black top nav ─────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30, height: 52,
        background: '#111111',
        display: 'flex', alignItems: 'stretch',
        paddingLeft: 48, paddingRight: 48,
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: 10 }}>
          <Link href="/admin/dashboard" style={{ textDecoration: 'none' }}>
            <img src="/logo.png" alt="HigherUp" style={{ height: 26, width: 'auto', display: 'block', filter: 'brightness(0) invert(1)' }} />
          </Link>
          <span style={{ fontSize: 11, color: '#555555', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Admin</span>
        </div>

        {/* Center nav */}
        <nav style={{ display: 'flex', alignItems: 'stretch', gap: 28 }}>
          {NAV.map(item => {
            const active = isActive(item.href)
            const isRequests = item.href === '/admin/requests'
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex', alignItems: 'center', height: '100%', gap: 5,
                  fontSize: 13, fontWeight: active ? 500 : 400,
                  color: active ? '#FFFFFF' : '#999999',
                  textDecoration: 'none',
                  borderBottom: active ? '1.5px solid #FFFFFF' : '1.5px solid transparent',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#FFFFFF' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#999999' }}
              >
                {item.label}
                {isRequests && pendingRequests > 0 && (
                  <span style={{ fontSize: 11, color: '#999999', fontWeight: 400 }}>({pendingRequests})</span>
                )}
                {item.href === '/admin/vas' && pendingVAs > 0 && (
                  <span style={{ fontSize: 11, color: '#FF6600', fontWeight: 500 }}>({pendingVAs})</span>
                )}
                {item.href === '/admin/flagged' && flaggedCount > 0 && (
                  <span style={{ fontSize: 11, color: '#999999', fontWeight: 400 }}>({flaggedCount})</span>
                )}
                {item.href === '/admin/messages' && msgCount > 0 && (
                  <span style={{ fontSize: 11, color: '#999999', fontWeight: 500 }}>({msgCount})</span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Right */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
          <button
            onClick={async () => {
              await fetch('/api/admin/logout', { method: 'POST' })
              router.push('/admin/login')
            }}
            style={{
              fontSize: 13, color: '#999999', background: 'none', border: 'none',
              cursor: 'pointer', padding: 0, transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#FFFFFF'}
            onMouseLeave={e => e.currentTarget.style.color = '#999999'}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Content */}
      <main>{children}</main>
    </div>
  )
}
