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

// ─── Component ────────────────────────────────────────────────────────────

interface PageVideoData {
  video_url: string
  is_active: boolean
  updated_at: string
}

export function PageVideo({ slug }: { slug: string }) {
  const [data, setData] = useState<PageVideoData | null>(null)

  useEffect(() => {
    supabase
      .from('page_videos')
      .select('video_url, is_active, updated_at')
      .eq('page_slug', slug)
      .maybeSingle()
      .then(({ data: row }) => {
        if (row) setData(row as PageVideoData)
      })
  }, [slug])

  if (!data || !data.is_active || !data.video_url.trim()) return null

  const embedUrl = toEmbedUrl(data.video_url)
  if (!embedUrl) return null

  const updatedDate = new Date(data.updated_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div style={{ maxWidth: 720, width: '100%', margin: '0 auto 48px', textAlign: 'center' }}>
      {/* 16:9 iframe container */}
      <div style={{
        position: 'relative',
        width: '100%',
        paddingBottom: '56.25%',
        borderRadius: 16,
        overflow: 'hidden',
        background: '#000000',
      }}>
        <iframe
          src={embedUrl}
          frameBorder={0}
          allowFullScreen
          allow="autoplay; fullscreen; picture-in-picture"
          style={{
            position: 'absolute',
            top: 0, left: 0,
            width: '100%', height: '100%',
            border: 'none',
          }}
        />
      </div>
      <p style={{ marginTop: 10, fontSize: 12, color: '#CCCCCC' }}>
        Last updated {updatedDate}
      </p>
    </div>
  )
}
