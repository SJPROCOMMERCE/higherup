'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── URL → embed converter ─────────────────────────────────────────────────

function toEmbedUrl(url: string): string | null {
  const s = url.trim()
  if (!s) return null

  // Already an embed URL — use as-is
  if (s.includes('/embed/') || s.includes('player.vimeo.com')) return s

  // Loom: loom.com/share/ID → loom.com/embed/ID
  const loom = s.match(/loom\.com\/share\/([a-zA-Z0-9]+)/)
  if (loom) return `https://www.loom.com/embed/${loom[1]}`

  // YouTube: youtube.com/watch?v=ID
  const yt = s.match(/youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]+)/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`

  // YouTube short: youtu.be/ID
  const ytShort = s.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
  if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}`

  // Vimeo: vimeo.com/ID
  const vimeo = s.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`

  return null
}

// ─── Shared wrapper ────────────────────────────────────────────────────────

function VideoWrapper({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 720, width: '100%', margin: '0 auto 48px', textAlign: 'center' }}>
      <p style={{ fontSize: 15, fontWeight: 500, color: '#111111', marginBottom: 16 }}>
        Before you start, check this video!
      </p>
      <div style={{
        position: 'relative',
        width: '100%',
        paddingBottom: '56.25%',
        borderRadius: 16,
        overflow: 'hidden',
      }}>
        {children}
      </div>
      {footer}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────

interface PageVideoData {
  video_url: string
  is_active: boolean
  updated_at: string
}

export function PageVideo({ slug }: { slug: string }) {
  const [data,    setData]    = useState<PageVideoData | null>(null)
  const [loading, setLoading] = useState(true)

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

  // Loading skeleton
  if (loading) {
    return (
      <div style={{ maxWidth: 720, width: '100%', margin: '0 auto 48px', textAlign: 'center' }}>
        <div style={{ height: 20, width: 200, margin: '0 auto 16px', background: '#F5F5F5', borderRadius: 4 }} />
        <div style={{
          position: 'relative', width: '100%', paddingBottom: '56.25%',
          borderRadius: 16, overflow: 'hidden', background: '#F5F5F5',
        }} />
        <div style={{ height: 12, width: 120, margin: '12px auto 0', background: '#F5F5F5', borderRadius: 4 }} />
      </div>
    )
  }

  const hasVideo = data && data.is_active && data.video_url.trim()
  const embedUrl = hasVideo ? toEmbedUrl(data.video_url) : null

  // Active video
  if (hasVideo && embedUrl) {
    const updatedDate = new Date(data.updated_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
    return (
      <VideoWrapper footer={
        <p style={{ marginTop: 10, fontSize: 12, color: '#CCCCCC' }}>Last updated {updatedDate}</p>
      }>
        <iframe
          src={embedUrl}
          frameBorder={0}
          allowFullScreen
          allow="autoplay; fullscreen; picture-in-picture"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none', background: '#000000' }}
        />
      </VideoWrapper>
    )
  }

  // Placeholder
  return (
    <VideoWrapper footer={
      <p style={{ marginTop: 10, fontSize: 12, color: '#DDDDDD' }}>Last updated: —</p>
    }>
      <div style={{
        position: 'absolute', inset: 0,
        background: '#FAFAFA',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: '#F0F0F0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#CCCCCC">
            <polygon points="8,5 20,12 8,19" />
          </svg>
        </div>
        <p style={{ marginTop: 16, fontSize: 16, fontWeight: 500, color: '#CCCCCC' }}>Coming Soon</p>
        <p style={{ marginTop: 4, fontSize: 12, color: '#DDDDDD' }}>A tutorial video for this page is on its way.</p>
      </div>
    </VideoWrapper>
  )
}
