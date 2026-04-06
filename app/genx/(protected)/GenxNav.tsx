'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'

const ITEMS = [
  { href: '/genx/command', label: 'COMMAND', short: 'CMD' },
  { href: '/genx/network', label: 'NETWORK', short: 'NET' },
  { href: '/genx/toolkit', label: 'TOOLKIT', short: 'TK'  },
  { href: '/genx/payouts', label: 'PAYOUTS', short: 'PAY' },
]

export default function GenxNav({ displayName, lgId }: { displayName: string; lgId: string }) {
  const pathname = usePathname()
  const router   = useRouter()
  void lgId

  async function handleLogout() {
    await fetch('/api/genx/logout', { method: 'POST' })
    router.replace('/genx/login')
  }

  return (
    <>
      {/* Desktop */}
      <nav style={{
        borderBottom: '1px solid #1F1F1F',
        background: '#0A0A0A',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', padding: '0 24px',
          height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Image src="/genxlogo.png" alt="GENX" height={28} width={80} style={{ objectFit: 'contain' }} priority />

          <div style={{ display: 'flex', gap: 32 }} className="genx-desktop-nav">
            {ITEMS.map(item => {
              const active = pathname.startsWith(item.href)
              return (
                <Link key={item.href} href={item.href} style={{
                  fontSize: 12, fontWeight: 500, letterSpacing: '0.08em',
                  color: active ? '#FFFFFF' : '#888888',
                  textDecoration: 'none', transition: 'color 0.15s',
                }}>
                  {item.label}
                </Link>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 12, color: '#555555' }}>{displayName}</span>
            <button onClick={handleLogout} style={{
              fontSize: 11, color: '#555555', background: 'none', border: 'none',
              cursor: 'pointer', letterSpacing: '0.05em', textTransform: 'uppercase',
              padding: 0,
            }}>
              Exit
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <div style={{
        display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#0A0A0A', borderTop: '1px solid #1F1F1F', zIndex: 50,
        justifyContent: 'space-around', padding: '10px 0',
      }} className="genx-mobile-nav">
        {ITEMS.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} style={{
              fontSize: 10, fontWeight: 500, letterSpacing: '0.06em',
              color: active ? '#FFFFFF' : '#888888',
              textDecoration: 'none', textAlign: 'center', padding: '4px 8px',
            }}>
              {item.short}
            </Link>
          )
        })}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .genx-desktop-nav { display: none !important; }
          .genx-mobile-nav  { display: flex !important; }
        }
      `}</style>
    </>
  )
}
