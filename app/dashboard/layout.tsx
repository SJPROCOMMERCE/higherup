'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useVA } from '@/context/va-context'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { NotificationBell } from '@/components/NotificationBell'
import { DarkModeProvider, useDarkMode } from '@/components/DarkModeProvider'
import { LanguageProvider, useLanguage } from '@/components/LanguageProvider'
import { DarkModeToggle } from '@/components/dashboard/DarkModeToggle'
import { LanguageToggle } from '@/components/dashboard/LanguageToggle'
import { QuickStats } from '@/components/dashboard/QuickStats'

const NAV_KEYS = [
  { key: 'overview',      href: '/dashboard',            exact: true  },
  { key: 'upload',        href: '/dashboard/upload',     exact: false },
  { key: 'clients',       href: '/dashboard/clients',    exact: false },
  { key: 'history',       href: '/dashboard/uploads',    exact: false },
  { key: 'messages',      href: '/dashboard/messages',   exact: false },
  { key: 'support',       href: '/dashboard/support',    exact: false },
  { key: 'billing',       href: '/dashboard/billing',    exact: false },
  { key: 'affiliates',    href: '/dashboard/affiliates', exact: false },
  { key: 'profit',        href: '/dashboard/profit',     exact: false },
  { key: 'successCenter', href: '/dashboard/success',    exact: false },
  { key: 'profile',       href: '/dashboard/profile',    exact: false },
] as const

function Inner({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const { currentVA, logout, refreshVA } = useVA()
  const { dark }  = useDarkMode()
  const { tr }    = useLanguage()
  const [hydrated,      setHydrated]      = useState(false)
  const [menuOpen,      setMenuOpen]      = useState(false)
  const [msgCount,      setMsgCount]      = useState(0)
  const [supportCount,  setSupportCount]  = useState(0)

  // Load unread message count for this VA
  useEffect(() => {
    if (!currentVA?.id) return
    supabase
      .from('uploads')
      .select('id', { count: 'exact', head: true })
      .eq('va_id', currentVA.id)
      .eq('awaiting_va_response', true)
      .then(({ count }) => setMsgCount(count ?? 0))

    // Load unread support chat count
    supabase
      .from('support_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('va_id', currentVA.id)
      .gt('unread_va', 0)
      .then(({ count }) => setSupportCount(count ?? 0))
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

  if (!hydrated || !currentVA) return <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }} />

  const isWaitlist  = pathname === '/dashboard/waitlist'
  const isBlocked   = pathname === '/dashboard/blocked'
  const navDisabled = isWaitlist || isBlocked

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>

      {/* ─── Top Nav ──────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30, height: 52,
        background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'stretch',
        paddingLeft: 64, paddingRight: 64,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <img src="/logo.png" alt="HigherUp" style={{ height: 26, width: 'auto', display: 'block' }} />
          </Link>
        </div>

        {/* Center nav — desktop only */}
        <nav className="nav-desktop" style={{ alignItems: 'stretch', gap: 32 }}>
          {NAV_KEYS.map((item) => {
            const active = isActive(item.href, item.exact)
            const label  = tr.nav[item.key as keyof typeof tr.nav] ?? item.key

            if (navDisabled) {
              return (
                <span
                  key={item.href}
                  style={{
                    display: 'flex', alignItems: 'center', height: '100%',
                    fontSize: 13, color: 'var(--text-muted)',
                    borderBottom: '1.5px solid transparent',
                  }}
                >
                  {label}
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
                  color: active ? 'var(--text-primary)' : 'var(--text-faded)',
                  textDecoration: 'none',
                  borderBottom: active ? '1.5px solid var(--text-primary)' : '1.5px solid transparent',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-faded)' }}
              >
                {label}
                {item.href === '/dashboard/messages' && msgCount > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', marginLeft: 4 }}>({msgCount})</span>
                )}
                {item.href === '/dashboard/support' && supportCount > 0 && (
                  <span style={{
                    background: '#EF4444', color: '#FFFFFF', fontSize: 10, fontWeight: 700,
                    borderRadius: '50%', width: 16, height: 16, marginLeft: 4,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {supportCount > 9 ? '9+' : supportCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Right */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
          {!navDisabled && <NotificationBell vaId={currentVA.id} />}
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{currentVA.name}</span>
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
            style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            {tr.nav.logOut}
          </button>

          <button
            className="hamburger-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            style={{ flexDirection: 'column', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            aria-label="Menu"
          >
            <span style={{ display: 'block', width: 16, height: 1, background: 'var(--text-primary)' }} />
            <span style={{ display: 'block', width: 16, height: 1, background: 'var(--text-primary)' }} />
            <span style={{ display: 'block', width: 16, height: 1, background: 'var(--text-primary)' }} />
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)', padding: '8px 24px 16px' }}>
          {NAV_KEYS.map((item) => {
            const active = isActive(item.href, item.exact)
            const label  = tr.nav[item.key as keyof typeof tr.nav] ?? item.key
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  display: 'block', padding: '10px 0',
                  fontSize: 14, fontWeight: active ? 500 : 400,
                  color: navDisabled ? 'var(--text-muted)' : active ? 'var(--text-primary)' : 'var(--text-faded)',
                  textDecoration: 'none',
                  borderBottom: '1px solid var(--border-color)',
                  pointerEvents: navDisabled ? 'none' : 'auto',
                }}
              >
                {label}
              </Link>
            )
          })}
        </div>
      )}

      <main>{children}</main>

      {/* Floating quick stats widget */}
      {!navDisabled && <QuickStats vaId={currentVA.id} />}
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { currentVA } = useVA()
  return (
    <DarkModeProvider>
      <LanguageProvider vaId={currentVA?.id}>
        <Inner>{children}</Inner>
      </LanguageProvider>
    </DarkModeProvider>
  )
}
