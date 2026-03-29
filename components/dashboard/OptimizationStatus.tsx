'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { timeAgo } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateInfo {
  name: string
  niche: string | null
  language: string | null
  updated_at: string
}

interface LatestRequest {
  status: 'submitted' | 'reviewed' | 'applied' | 'rejected'
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  clientId: string
  vaId: string
  onSwitchToRequests?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OptimizationStatus({ clientId, vaId, onSwitchToRequests }: Props) {
  const [loading, setLoading]               = useState(true)
  const [hasTemplate, setHasTemplate]       = useState(false)
  const [templateInfo, setTemplateInfo]     = useState<TemplateInfo | null>(null)
  const [latestRequest, setLatestRequest]   = useState<LatestRequest | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      setLoading(true)

      // Fetch client_profile to see if a prompt_id is set
      const { data: profileData } = await supabase
        .from('client_profiles')
        .select('prompt_id, prompts(name, niche, language, updated_at)')
        .eq('client_id', clientId)
        .maybeSingle()

      if (cancelled) return

      const promptId = profileData?.prompt_id as string | null | undefined

      if (!promptId) {
        setHasTemplate(false)
        setTemplateInfo(null)
        setLatestRequest(null)
        setLoading(false)
        return
      }

      // The joined prompt data (Supabase may return array or object depending on relation type)
      type RawPrompt = { name: string; niche: string | null; language: string | null; updated_at: string }
      const rawPrompt = profileData?.prompts as RawPrompt | RawPrompt[] | null | undefined
      const promptRow: RawPrompt | null = Array.isArray(rawPrompt)
        ? (rawPrompt[0] ?? null)
        : (rawPrompt ?? null)

      setHasTemplate(true)
      if (promptRow) {
        setTemplateInfo({
          name: promptRow.name,
          niche: promptRow.niche,
          language: promptRow.language,
          updated_at: promptRow.updated_at,
        })
      }

      // Fetch latest prompt_request for this client
      const { data: reqData } = await supabase
        .from('prompt_requests')
        .select('status')
        .eq('client_id', clientId)
        .eq('va_id', vaId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return

      if (reqData) {
        setLatestRequest({ status: reqData.status as LatestRequest['status'] })
      } else {
        setLatestRequest(null)
      }

      setLoading(false)
    }

    void fetchData()
    return () => { cancelled = true }
  }, [clientId, vaId])

  // ── Loading skeleton ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ border: '1px solid #F0F0F0', borderRadius: 12, padding: 24 }}>
        <div style={{ width: 140, height: 12, borderRadius: 6, background: '#F0F0F0', marginBottom: 12 }} />
        <div style={{ width: 200, height: 10, borderRadius: 6, background: '#F5F5F5' }} />
      </div>
    )
  }

  // ── No template state ───────────────────────────────────────────────────────

  if (!hasTemplate) {
    return (
      <div style={{ border: '1px solid #F0F0F0', borderRadius: 12, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{
            display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
            background: '#DDDDDD', flexShrink: 0,
          }} />
          <span style={{ fontSize: 13, color: '#CCCCCC', fontWeight: 500 }}>Pending setup</span>
        </div>
        <p style={{ fontSize: 13, color: '#AAAAAA', marginBottom: 4 }}>
          Your client&apos;s optimization template is being set up.
        </p>
        <p style={{ fontSize: 13, color: '#CCCCCC' }}>
          You can start uploading once it&apos;s ready.
        </p>
      </div>
    )
  }

  // ── Preferences cell content ────────────────────────────────────────────────

  function PreferencesCell() {
    if (!latestRequest) {
      return (
        <div>
          <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', color: '#CCCCCC', textTransform: 'uppercase' as const, marginBottom: 2 }}>Preferences</p>
          <p style={{ fontSize: 14, color: '#CCCCCC', marginBottom: 2 }}>None submitted</p>
          {onSwitchToRequests && (
            <button
              type="button"
              onClick={onSwitchToRequests}
              style={{
                fontSize: 12, color: '#999999', background: 'none', border: 'none',
                cursor: 'pointer', padding: 0, fontFamily: 'inherit',
                textDecoration: 'underline', textUnderlineOffset: 3,
              }}
            >
              Add preferences →
            </button>
          )}
        </div>
      )
    }

    const statusMap: Record<string, { color: string; label: string }> = {
      submitted: { color: '#F59E0B', label: 'Submitted — pending review' },
      reviewed:  { color: '#3B82F6', label: 'Under review' },
      applied:   { color: '#2DB87E', label: 'Applied ✓' },
      rejected:  { color: '#999999', label: 'Not applicable' },
    }
    const st = statusMap[latestRequest.status] ?? statusMap.submitted

    return (
      <div>
        <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', color: '#CCCCCC', textTransform: 'uppercase' as const, marginBottom: 2 }}>Preferences</p>
        <p style={{ fontSize: 14, color: st.color, marginBottom: 2 }}>{st.label}</p>
        {latestRequest.status === 'rejected' && onSwitchToRequests && (
          <button
            type="button"
            onClick={onSwitchToRequests}
            style={{
              fontSize: 12, color: '#999999', background: 'none', border: 'none',
              cursor: 'pointer', padding: 0, fontFamily: 'inherit',
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >
            Submit new →
          </button>
        )}
      </div>
    )
  }

  // ── Has template state ──────────────────────────────────────────────────────

  const nicheLang = [templateInfo?.niche, templateInfo?.language].filter(Boolean).join(' · ')

  return (
    <div style={{ border: '1px solid #F0F0F0', borderRadius: 12, padding: 24 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
          background: '#2DB87E', flexShrink: 0,
        }} />
        <span style={{ fontSize: 13, color: '#2DB87E', fontWeight: 500 }}>Active</span>
      </div>

      {/* 2-column grid */}
      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px 32px' }}>
        {/* Template name */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', color: '#CCCCCC', textTransform: 'uppercase' as const, marginBottom: 2 }}>Template</p>
          <p style={{ fontSize: 14, color: '#111111' }}>{templateInfo?.name ?? '—'}</p>
        </div>

        {/* Focus: niche · language */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', color: '#CCCCCC', textTransform: 'uppercase' as const, marginBottom: 2 }}>Focus</p>
          <p style={{ fontSize: 14, color: '#111111' }}>{nicheLang || '—'}</p>
        </div>

        {/* Updated */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', color: '#CCCCCC', textTransform: 'uppercase' as const, marginBottom: 2 }}>Updated</p>
          <p style={{ fontSize: 14, color: '#111111' }}>
            {templateInfo?.updated_at ? timeAgo(templateInfo.updated_at) : '—'}
          </p>
        </div>

        {/* Preferences */}
        <PreferencesCell />
      </div>
    </div>
  )
}
