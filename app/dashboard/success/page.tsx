'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useVA } from '@/context/va-context'
import { supabase } from '@/lib/supabase'
import { PageVideo } from '@/components/dashboard/PageVideo'

// ─── Sections ─────────────────────────────────────────────────────────────────

interface SectionDef {
  number:     string
  slug:       string
  title:      string
  subtitle:   string
  forClients: number[] | 'all'
}

const SECTIONS: SectionDef[] = [
  {
    number: '01', slug: 'first-client',
    title: 'Get Your First Client',
    subtitle: 'No clients yet? Start here. Step by step.',
    forClients: [0],
  },
  {
    number: '02', slug: 'upwork',
    title: 'Win on Upwork',
    subtitle: 'The 5 rules that get you hired.',
    forClients: [0, 1, 2, 3],
  },
  {
    number: '03', slug: 'earn-more',
    title: 'Earn More Per Client',
    subtitle: 'More money. Same amount of work.',
    forClients: [1, 2, 3, 4, 5],
  },
  {
    number: '04', slug: 'scale',
    title: 'Scale to 10+ Clients',
    subtitle: 'The system to go from 3 to 10.',
    forClients: [3, 4, 5, 6, 7, 8, 9, 10],
  },
  {
    number: '05', slug: 'scripts',
    title: 'Scripts & Templates',
    subtitle: 'Copy, paste, send. Ready to use.',
    forClients: 'all',
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuccessCenter() {
  const { currentVA } = useVA()
  const [clientCount, setClientCount] = useState(0)
  const [progress,    setProgress]    = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!currentVA?.id) return

    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('va_id', currentVA.id)
      .eq('is_active', true)
      .then(({ count }) => setClientCount(count ?? 0))

    supabase
      .from('success_progress')
      .select('section_slug, completed')
      .eq('va_id', currentVA.id)
      .then(({ data }) => {
        const map: Record<string, boolean> = {}
        ;(data ?? []).forEach(p => { map[p.section_slug] = p.completed })
        setProgress(map)
      })
  }, [currentVA?.id])

  function isRecommended(section: SectionDef): boolean {
    if (section.forClients === 'all') return false
    return (section.forClients as number[]).includes(clientCount)
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '48px 24px 100px', fontFamily: "'Inter', system-ui, sans-serif" }}>

      <PageVideo slug="success" />

      <h1 style={{ fontSize: 28, fontWeight: 300, color: '#111111', margin: 0 }}>Success Center</h1>
      <p style={{ marginTop: 8, fontSize: 14, color: '#CCCCCC' }}>
        Everything you need to find clients and grow your income.
      </p>

      <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {SECTIONS.map(section => {
          const recommended = isRecommended(section)
          const completed   = progress[section.slug]

          return (
            <SectionCard
              key={section.slug}
              section={section}
              recommended={recommended}
              completed={completed}
            />
          )
        })}
      </div>

    </div>
  )
}

function SectionCard({
  section, recommended, completed,
}: {
  section:     SectionDef
  recommended: boolean
  completed:   boolean
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <Link
      href={`/dashboard/success/${section.slug}`}
      style={{
        display: 'block',
        padding: 24,
        borderRadius: 16,
        border: recommended
          ? '1px solid #111111'
          : hovered
          ? '1px solid #CCCCCC'
          : '1px solid #F0F0F0',
        background: recommended ? '#FAFAFA' : '#FFFFFF',
        textDecoration: 'none',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>

        {/* Left: number + text */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
          <span style={{ fontSize: 32, fontWeight: 600, lineHeight: 1, color: recommended ? '#111111' : '#E0E0E0' }}>
            {section.number}
          </span>
          <div>
            <p style={{ fontSize: 16, fontWeight: 500, color: '#111111', margin: 0 }}>
              {section.title}
            </p>
            <p style={{ marginTop: 4, fontSize: 13, color: '#999999', margin: '4px 0 0' }}>
              {section.subtitle}
            </p>
          </div>
        </div>

        {/* Right: badges + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 16 }}>
          {recommended && (
            <span style={{
              fontSize: 11, fontWeight: 500, color: '#059669',
              background: '#D1FAE5', padding: '4px 12px', borderRadius: 100,
            }}>
              For you
            </span>
          )}
          {completed && (
            <span style={{ fontSize: 14, color: '#10B981' }}>✓</span>
          )}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CCCCCC" strokeWidth="2" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>

      </div>
    </Link>
  )
}
