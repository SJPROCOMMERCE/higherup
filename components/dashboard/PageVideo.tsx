'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── URL → embed converter ─────────────────────────────────────────────────

function toEmbedUrl(url: string): string | null {
  const s = url.trim()
  if (!s) return null

  if (s.includes('/embed/') || s.includes('player.vimeo.com')) return s

  const loom = s.match(/loom\.com\/share\/([a-zA-Z0-9]+)/)
  if (loom) return `https://www.loom.com/embed/${loom[1]}`

  const yt = s.match(/youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]+)/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`

  const ytShort = s.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
  if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}`

  const vimeo = s.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`

  return null
}

// ─── Component ────────────────────────────────────────────────────────────

interface PageVideoData {
  video_url: string
  is_active: boolean
  updated_at: string
}

export function PageVideo({ slug }: { slug: string }) {
  const [data,      setData]      = useState<PageVideoData | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [minimized, setMinimized] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(`video_minimized_${slug}`)
    if (stored === 'true') setMinimized(true)
  }, [slug])

  useEffect(() => {
    supabase
      .from('page_videos')
      .select('video_url, is_active, updated_at')
      .eq('page_slug', slug)
      .maybeSingle()
      .then(({ data: row }) => {
        if (row) setData(row as PageVideoData)
        setLoading(false)
      })
  }, [slug])

  function toggleMinimize() {
    const next = !minimized
    setMinimized(next)
    localStorage.setItem(`video_minimized_${slug}`, String(next))
  }

  // Loading skeleton
  if (loading) {
    return (
      <div style={{ maxWidth: 720, width: '100%', margin: '0 auto 48px' }}>
        <div style={{ height: 20, width: 200, margin: '0 auto 16px', background: '#F5F5F5', borderRadius: 4 }} />
        <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', borderRadius: 16, background: '#F5F5F5' }} />
        <div style={{ height: 12, width: 120, margin: '12px auto 0', background: '#F5F5F5', borderRadius: 4 }} />
      </div>
    )
  }

  // Minimized pill
  if (minimized) {
    return (
      <div style={{ maxWidth: 720, width: '100%', margin: '0 auto 24px', textAlign: 'center' }}>
        <button
          type="button"
          onClick={toggleMinimize}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 16px', borderRadius: 100,
            background: '#FAFAFA', border: 'none', cursor: 'pointer',
            transition: 'background 0.15s', fontFamily: 'inherit',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#F0F0F0')}
          onMouseLeave={e => (e.currentTarget.style.background = '#FAFAFA')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#CCCCCC">
            <polygon points="8,5 20,12 8,19" />
          </svg>
          <span style={{ fontSize: 12, color: '#999999' }}>Show tutorial video</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#CCCCCC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
    )
  }

  const hasVideo = data && data.is_active && data.video_url.trim()
  const embedUrl = hasVideo ? toEmbedUrl(data.video_url) : null

  // Title row with Hide button
  const titleRow = (
    <div style={{ maxWidth: 720, width: '100%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ width: 60 }} />
      <p style={{ fontSize: 15, fontWeight: 500, color: '#111111', margin: 0 }}>
        Before you start, check this video!
      </p>
      <button
        type="button"
        onClick={toggleMinimize}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '5px 10px', borderRadius: 100,
          background: 'none', border: 'none', cursor: 'pointer',
          transition: 'background 0.15s', fontFamily: 'inherit',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#F5F5F5')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#CCCCCC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
        <span style={{ fontSize: 11, color: '#CCCCCC' }}>Hide</span>
      </button>
    </div>
  )

  // Active video
  if (hasVideo && embedUrl) {
    const updatedDate = new Date(data.updated_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
    return (
      <div style={{ margin: '0 auto 48px' }}>
        {titleRow}
        <div style={{ maxWidth: 720, width: '100%', margin: '0 auto' }}>
          <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', borderRadius: 16, overflow: 'hidden' }}>
            <iframe
              src={embedUrl}
              frameBorder={0}
              allowFullScreen
              allow="autoplay; fullscreen; picture-in-picture"
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none', background: '#000000' }}
            />
          </div>
          <p style={{ marginTop: 10, fontSize: 12, color: '#CCCCCC', textAlign: 'center' }}>Last updated {updatedDate}</p>
        </div>
      </div>
    )
  }

  // Placeholder
  return (
    <div style={{ margin: '0 auto 48px' }}>
      {titleRow}
      <div style={{ maxWidth: 720, width: '100%', margin: '0 auto' }}>
        <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: '#FAFAFA',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#F0F0F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#CCCCCC">
                <polygon points="8,5 20,12 8,19" />
              </svg>
            </div>
            <p style={{ marginTop: 16, fontSize: 16, fontWeight: 500, color: '#CCCCCC', margin: '16px 0 0' }}>Coming Soon</p>
            <p style={{ marginTop: 4, fontSize: 12, color: '#DDDDDD', margin: '4px 0 0' }}>A tutorial video for this page is on its way.</p>
          </div>
        </div>
        <p style={{ marginTop: 10, fontSize: 12, color: '#DDDDDD', textAlign: 'center' }}>Last updated: —</p>
      </div>
    </div>
  )
}
