'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useVA } from '@/context/va-context'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

const NAV = [
  { label: 'Overview',   href: '/dashboard',            exact: true  },
  { label: 'Upload',     href: '/dashboard/upload',     exact: false },
  { label: 'Clients',    href: '/dashboard/clients',    exact: false },
  { label: 'History',    href: '/dashboard/uploads',    exact: false },
  { label: 'Messages',   href: '/dashboard/messages',   exact: false },
  { label: 'Billing',    href: '/dashboard/billing',    exact: false },
  { label: 'Affiliates', href: '/dashboard/affiliates', exact: false },
  { label: 'Pricing',        href: '/dashboard/pricing',  exact: false },
  { label: 'Success Center', href: '/dashboard/success', exact: false },
  { label: 'Profile',   href: '/dashboard/profile',    exact: false },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const { currentVA, logout, refreshVA } = useVA()
  const [hydrated,  setHydrated]  = useState(false)
  const [menuOpen,  setMenuOpen]  = useState(false)
  const [msgCount,  setMsgCount]  = useState(0)

  // Load unread message count for this VA
  useEffect(() => {
    if (!currentVA?.id) return
    supabase
      .from('uploads')
      .select('id', { count: 'exact', head: true })
      .eq('va_id', currentVA.id)
      .eq('awaiting_va_response', true)
      .then(({ count }) => setMsgCount(count ?? 0))
  }, [currentVA?.id, pathname])

  useEffect(() => { setHydrated(true) }, [])

  // If localStorage has stale VA data (missing onboarding_complete field),
  // refresh from DB before routing decisions are made
  useEffect(() => {
    if (!hydrated || !currentVA) return
    if (currentVA.onboarding_complete === undefined) {
      console.log('[layout] stale localStorage — refreshing VA from DB')
      refreshVA()
    }
  }, [hydrated, currentVA]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hydrated) return
    if (!currentVA) { router.replace('/'); return }

    // If we're still waiting for fresh DB data, don't route yet
    if (currentVA.onboarding_complete === undefined) return

    const onboardingDone = currentVA.onboarding_complete === true
    const status         = currentVA.status
    const isWaitlist     = pathname === '/dashboard/waitlist'
    const isBlocked      = pathname === '/dashboard/blocked'

    console.log('[layout] VA status:', status)
    console.log('[layout] onboarding_complete:', onboardingDone)

    if (onboardingDone && status === 'pending_approval' && !isWaitlist) {
      console.log('[layout] Redirecting to: /dashboard/waitlist')
      router.replace('/dashboard/waitlist'); return
    }
    if ((status === 'blocked' || status === 'deleted') && !isBlocked) {
      console.log('[layout] Redirecting to: /dashboard/blocked')
      router.replace('/dashboard/blocked'); return
    }
    // Active VA somehow landed on waitlist → send to dashboard
    if (status === 'active' && isWaitlist) {
      console.log('[layout] Active VA on waitlist — redirecting to: /dashboard')
      router.replace('/dashboard'); return
    }
    // Safety net: paused VA on waitlist → send to dashboard (paused can still view)
    if (status === 'paused' && isWaitlist) {
      console.log('[layout] Paused VA on waitlist — redirecting to: /dashboard')
      router.replace('/dashboard'); return
    }
  }, [hydrated, currentVA, pathname, router])

  if (!hydrated || !currentVA) return <div style={{ minHeight: '100vh', background: '#fff' }} />

  const isWaitlist  = pathname === '/dashboard/waitlist'
  const isBlocked   = pathname === '/dashboard/blocked'
  const navDisabled = isWaitlist || isBlocked

  function isActive(item: typeof NAV[0]) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>

      {/* ─── Top Nav ──────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30, height: 52,
        background: '#FFFFFF', borderBottom: '1px solid #F0F0F0',
        display: 'flex', alignItems: 'stretch',
        paddingLeft: 64, paddingRight: 64,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', color: '#111111', fontFamily: "'Inter', system-ui, sans-serif" }}>
              HigherUp
            </span>
          </Link>
        </div>

        {/* Center nav — desktop only */}
        <nav className="nav-desktop" style={{ alignItems: 'stretch', gap: 32 }}>
          {NAV.map((item) => {
            const active   = isActive(item)
            const disabled = navDisabled

            if (navDisabled) {
              return (
                <span
                  key={item.href}
                  style={{
                    display: 'flex', alignItems: 'center', height: '100%',
                    fontSize: 13, color: '#DDDDDD',
                    borderBottom: '1.5px solid transparent',
                  }}
                >
                  {item.label}
                </span>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex', alignItems: 'center', height: '100%',
                  fontSize: 13, fontWeight: active ? 500 : 400,
                  color: active ? '#111111' : '#BBBBBB',
                  textDecoration: 'none',
                  borderBottom: active ? '1.5px solid #111111' : '1.5px solid transparent',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#111111' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#BBBBBB' }}
              >
                {item.label}
                {item.href === '/dashboard/messages' && msgCount > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#111111', marginLeft: 4 }}>({msgCount})</span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Right */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
          <span style={{ fontSize: 12, color: '#999999' }}>{currentVA.name}</span>
          <button
            onClick={() => {
              if (currentVA) {
                void logActivity({
                  action: 'va_logout',
                  va_id: currentVA.id,
                  source: 'va',
                  details: `${currentVA.name} logged out`,
                })
              }
              logout()
              router.push('/')
            }}
            style={{ fontSize: 11, color: '#CCCCCC', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#111111'}
            onMouseLeave={e => e.currentTarget.style.color = '#CCCCCC'}
          >
            Log out
          </button>

          <button
            className="hamburger-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            style={{ flexDirection: 'column', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            aria-label="Menu"
          >
            <span style={{ display: 'block', width: 16, height: 1, background: '#111111' }} />
            <span style={{ display: 'block', width: 16, height: 1, background: '#111111' }} />
            <span style={{ display: 'block', width: 16, height: 1, background: '#111111' }} />
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{ background: '#FFFFFF', borderBottom: '1px solid #F0F0F0', padding: '8px 24px 16px' }}>
          {NAV.map((item) => {
            const active = isActive(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  display: 'block', padding: '10px 0',
                  fontSize: 14, fontWeight: active ? 500 : 400,
                  color: navDisabled ? '#DDDDDD' : active ? '#111111' : '#BBBBBB',
                  textDecoration: 'none',
                  borderBottom: '1px solid #F5F5F5',
                  pointerEvents: navDisabled ? 'none' : 'auto',
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      )}

      <main>{children}</main>
    </div>
  )
}
