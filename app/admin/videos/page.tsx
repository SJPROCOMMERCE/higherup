'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const T = {
  black: '#111111', sec: '#555555', ter: '#999999', ghost: '#CCCCCC',
  div: '#EEEEEE', row: '#FAFAFA', bg: '#FFFFFF',
}

const PAGE_LABELS: Record<string, string> = {
  dashboard:  'Dashboard (Home)',
  clients:    'My Clients',
  upload:     'Upload',
  uploads:    'Upload History',
  billing:    'Billing',
  pricing:    'Pricing / Earnings',
  affiliates: 'Affiliates',
  profile:    'Profile',
  success:    'Success Center',
  messages:   'Messages',
  waitlist:   'Waitlist',
}

const ALL_SLUGS = Object.keys(PAGE_LABELS)

interface VideoRow {
  page_slug:  string
  video_url:  string
  is_active:  boolean
  updated_at: string
}

export default function AdminVideosPage() {
  const [rows,    setRows]    = useState<VideoRow[]>([])
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('page_videos')
      .select('page_slug, video_url, is_active, updated_at')
      .order('page_slug')

    // Merge DB rows with all expected slugs
    const map = new Map((data ?? []).map((r: VideoRow) => [r.page_slug, r]))
    const merged: VideoRow[] = ALL_SLUGS.map(slug => map.get(slug) ?? {
      page_slug:  slug,
      video_url:  '',
      is_active:  false,
      updated_at: new Date().toISOString(),
    })
    setRows(merged)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function setUrl(slug: string, url: string) {
    setRows(prev => prev.map(r =>
      r.page_slug === slug
        ? { ...r, video_url: url, is_active: url.trim() ? r.is_active : false }
        : r
    ))
  }

  function setActive(slug: string, active: boolean) {
    setRows(prev => prev.map(r =>
      r.page_slug === slug ? { ...r, is_active: active } : r
    ))
  }

  async function save() {
    setSaving(true)
    const now = new Date().toISOString()
    for (const r of rows) {
      await supabase.from('page_videos').upsert({
        page_slug:  r.page_slug,
        video_url:  r.video_url,
        is_active:  r.is_active && r.video_url.trim().length > 0,
        updated_at: now,
      }, { onConflict: 'page_slug' })
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    void load()
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: T.black, margin: 0 }}>Page Videos</h1>
        <p style={{ fontSize: 14, color: T.ter, marginTop: 6 }}>
          Embed a Loom, YouTube, or Vimeo video on any VA dashboard page.
        </p>
      </div>

      {loading ? (
        <p style={{ fontSize: 14, color: T.ghost }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {rows.map((r, i) => (
            <div key={r.page_slug} style={{
              display: 'grid',
              gridTemplateColumns: '160px 1fr 80px',
              alignItems: 'center',
              gap: 16,
              padding: '16px 0',
              borderTop: i === 0 ? `1px solid ${T.div}` : 'none',
              borderBottom: `1px solid ${T.div}`,
            }}>
              {/* Page name */}
              <span style={{ fontSize: 14, color: T.black, fontWeight: 500 }}>
                {PAGE_LABELS[r.page_slug] ?? r.page_slug}
              </span>

              {/* URL input */}
              <input
                type="text"
                value={r.video_url}
                placeholder="Paste Loom, YouTube, or Vimeo URL"
                onChange={e => setUrl(r.page_slug, e.target.value)}
                style={{
                  width: '100%',
                  fontSize: 13,
                  color: T.black,
                  background: 'none',
                  border: 'none',
                  borderBottom: `1.5px solid ${T.div}`,
                  outline: 'none',
                  padding: '6px 0',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.currentTarget.style.borderBottomColor = T.black)}
                onBlur={e => (e.currentTarget.style.borderBottomColor = T.div)}
              />

              {/* Active toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                <span style={{ fontSize: 11, color: r.is_active && r.video_url.trim() ? T.black : T.ghost }}>
                  {r.is_active && r.video_url.trim() ? 'Active' : 'Off'}
                </span>
                <button
                  type="button"
                  disabled={!r.video_url.trim()}
                  onClick={() => setActive(r.page_slug, !r.is_active)}
                  style={{
                    width: 40, height: 22, borderRadius: 11,
                    background: r.is_active && r.video_url.trim() ? '#111111' : '#DDDDDD',
                    border: 'none', cursor: r.video_url.trim() ? 'pointer' : 'default',
                    position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: 'absolute',
                    top: 3,
                    left: r.is_active && r.video_url.trim() ? 21 : 3,
                    width: 16, height: 16,
                    borderRadius: '50%',
                    background: '#FFFFFF',
                    transition: 'left 0.2s',
                  }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save button */}
      <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          style={{
            fontSize: 14, fontWeight: 500,
            background: T.black, color: '#FFFFFF',
            border: 'none', borderRadius: 100,
            padding: '11px 28px', cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.6 : 1, fontFamily: 'inherit',
          }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {saved && <span style={{ fontSize: 13, color: '#10B981' }}>Saved ✓</span>}
      </div>
    </div>
  )
}
