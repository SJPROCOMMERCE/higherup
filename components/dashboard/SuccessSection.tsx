'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useVA } from '@/context/va-context'
import { supabase } from '@/lib/supabase'

interface SuccessSectionProps {
  slug:     string
  title:    string
  subtitle: string
  children: React.ReactNode
}

export function SuccessSection({ slug, title, subtitle, children }: SuccessSectionProps) {
  const { currentVA } = useVA()

  useEffect(() => {
    if (!currentVA?.id) return
    supabase.from('success_progress').upsert({
      va_id:           currentVA.id,
      section_slug:    slug,
      completed:       true,
      last_visited_at: new Date().toISOString(),
    }, { onConflict: 'va_id,section_slug' })
  }, [slug, currentVA?.id])

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px 100px', fontFamily: "'Inter', system-ui, sans-serif" }}>

      <Link
        href="/dashboard/success"
        style={{ fontSize: 13, color: '#CCCCCC', textDecoration: 'none', transition: 'color 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#111111')}
        onMouseLeave={e => (e.currentTarget.style.color = '#CCCCCC')}
      >
        ← Success Center
      </Link>

      <h1 style={{ marginTop: 32, fontSize: 28, fontWeight: 300, color: '#111111', margin: '32px 0 0' }}>
        {title}
      </h1>
      <p style={{ marginTop: 8, fontSize: 14, color: '#999999' }}>{subtitle}</p>

      <div style={{ marginTop: 48 }}>
        {children}
      </div>

    </div>
  )
}
