'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useVA } from '@/context/va-context'
import { supabase } from '@/lib/supabase'

const T = {
  black: '#111111', ter: '#999999', ghost: '#CCCCCC', div: '#EEEEEE',
}

const PAYMENT_LABELS: Record<string, string> = {
  wise: 'Wise', paypal: 'PayPal', gcash: 'GCash', maya: 'Maya',
  upi: 'UPI', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa',
  bkash: 'bKash', bank_transfer: 'Bank Transfer',
}

const COUNTRY_NAMES: Record<string, string> = {
  PH:'Philippines', ID:'Indonesia', IN:'India', PK:'Pakistan', BD:'Bangladesh',
  US:'United States', GB:'United Kingdom', AU:'Australia', CA:'Canada',
  DE:'Germany', FR:'France', NL:'Netherlands', SG:'Singapore', MY:'Malaysia',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins < 2)    return 'just now'
  if (mins < 60)   return `${mins} minutes ago`
  if (hours < 24)  return `${hours} hour${hours > 1 ? 's' : ''} ago`
  return `${days} day${days > 1 ? 's' : ''} ago`
}

function paymentSummary(method: string | null, details: Record<string, string> | null): string {
  if (!method || !details) return '—'
  const label = PAYMENT_LABELS[method] ?? method
  const email = details.wise_email ?? details.paypal_email ?? ''
  const num   = details.gcash_number ?? details.bkash_number ?? details.maya_number ?? details.jazzcash_number ?? details.easypaisa_number ?? ''
  const extra = email || num
  return extra ? `${label} · ${extra}` : label
}

export default function WaitlistPage() {
  const router         = useRouter()
  const { currentVA, refreshVA } = useVA()
  const [copied,       setCopied]       = useState(false)
  const [submittedAt,  setSubmittedAt]  = useState<string | null>(null)

  // Load agreed_at for "Submitted" row
  useEffect(() => {
    if (!currentVA) return
    // agreed_at is when onboarding was submitted
    setSubmittedAt((currentVA as { agreed_at?: string | null }).agreed_at ?? null)
  }, [currentVA])

  // Auto-refresh: poll every 30s + Supabase Realtime
  const checkStatus = useCallback(async () => {
    if (!currentVA) return
    const { data, error } = await supabase
      .from('vas')
      .select('status')
      .eq('id', currentVA.id)
      .single()
    console.log('[waitlist] Polling VA status:', data?.status, error ?? '')
    if (data?.status === 'active') {
      console.log('[waitlist] Status = active — redirecting to /dashboard')
      await refreshVA()
      router.push('/dashboard')
    }
  }, [currentVA, refreshVA, router])

  useEffect(() => {
    // Only start polling if we're confirmed pending_approval
    // (layout already handles wrong-status redirects, but this is a safety guard)
    if (!currentVA || currentVA.status !== 'pending_approval') return

    // Polling every 30s
    const interval = setInterval(checkStatus, 30_000)

    // Realtime subscription
    const channel = supabase
      .channel(`va-status-${currentVA.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vas', filter: `id=eq.${currentVA.id}` },
        async (payload) => {
          console.log('[waitlist] Realtime event received:', payload.new)
          if ((payload.new as { status: string }).status === 'active') {
            console.log('[waitlist] Realtime: status = active — redirecting')
            await refreshVA()
            router.push('/dashboard')
          }
        },
      )
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [currentVA, checkStatus, refreshVA, router])

  const handleCopy = useCallback(() => {
    if (!currentVA) return
    const vaId = `VA-${currentVA.id.slice(0, 8)}`
    navigator.clipboard.writeText(vaId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [currentVA])

  if (!currentVA) return null

  const vaId      = `VA-${currentVA.id.slice(0, 8)}`
  const firstName = currentVA.name.split(' ')[0]
  const country   = currentVA.country ? (COUNTRY_NAMES[currentVA.country] ?? currentVA.country) : '—'

  return (
    <div style={{ paddingTop: 80, paddingBottom: 100, paddingInline: 24, textAlign: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>

        {/* Logo */}
        <div style={{ marginBottom: 40 }}>
          <img src="/logo.png" alt="HigherUp" style={{ height: 34, width: 'auto', display: 'block', margin: '0 auto' }} />
        </div>

        {/* Heading */}
        <div style={{ fontSize: 32, fontWeight: 300, color: T.black, marginBottom: 8 }}>
          You&apos;re almost ready to start earning, {firstName}.
        </div>
        <div style={{ fontSize: 14, color: T.ter, marginBottom: 48 }}>
          We&apos;re reviewing your profile. You&apos;ll get access as soon as possible.
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 64, flexWrap: 'wrap', marginBottom: 32 }}>
          {[
            { value: '31',    label: 'ACTIVE OPERATORS' },
            { value: '78',    label: 'CLIENTS SERVED'   },
            { value: '$4,280',label: 'EARNED THIS WEEK' },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 44, fontWeight: 600, color: T.black, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginTop: 8 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <div style={{ width: 40, height: 1, background: '#E8E8E8' }} />
        </div>

        {/* Status card */}
        <div style={{ maxWidth: 440, margin: '0 auto 32px', textAlign: 'left' }}>
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 16 }}>
            Your status
          </div>

          {[
            {
              label: 'VA ID',
              content: (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, color: T.black }}>{vaId}</span>
                  <button
                    onClick={handleCopy}
                    style={{ fontSize: 11, color: copied ? '#00A550' : T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', transition: 'color 0.15s' }}
                    onMouseEnter={e => { if (!copied) e.currentTarget.style.color = T.black }}
                    onMouseLeave={e => { if (!copied) e.currentTarget.style.color = T.ghost }}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              ),
            },
            { label: 'Name',           content: <span style={{ fontSize: 14, color: T.black }}>{currentVA.name}</span> },
            { label: 'Country',        content: <span style={{ fontSize: 14, color: T.black }}>{country}</span> },
            {
              label: 'Payment method',
              content: <span style={{ fontSize: 14, color: T.black }}>{paymentSummary(currentVA.payment_method, currentVA.payment_details)}</span>,
            },
            {
              label: 'Submitted',
              content: <span style={{ fontSize: 14, color: T.black }}>{submittedAt ? timeAgo(submittedAt) : '—'}</span>,
            },
            {
              label: 'Status',
              content: (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PulsingDot />
                  <span style={{ fontSize: 14, color: T.ghost, fontStyle: 'italic' }}>Pending review</span>
                </div>
              ),
            },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', paddingBlock: 13, borderBottom: `1px solid ${T.div}` }}>
              <div style={{ width: 140, flexShrink: 0, fontSize: 12, color: T.ghost }}>{row.label}</div>
              <div>{row.content}</div>
            </div>
          ))}
        </div>

        {/* Free entry message */}
        <div style={{ maxWidth: 440, margin: '0 auto 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: T.black, fontWeight: 400, marginBottom: 6 }}>
            No signup fees. No deposits. Start earning on day one.
          </div>
          <div style={{ fontSize: 13, color: T.ter }}>
            You only pay at the end of the month, after you&apos;ve already earned.
          </div>
        </div>

        {/* What to expect */}
        <div style={{ maxWidth: 440, margin: '0 auto 48px', textAlign: 'left' }}>
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 16 }}>
            What happens next
          </div>
          {[
            'We review your profile within 24 hours.',
            'Once approved, you\'ll get full access to upload and manage clients.',
            'You\'ll receive a notification when your account is activated.',
          ].map(line => (
            <div key={line} style={{ fontSize: 13, color: T.ter, marginBottom: 10, lineHeight: 1.6 }}>{line}</div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ fontSize: 12, color: T.ghost }}>
          Questions? Contact us at{' '}
          <a href="mailto:support@higherup.io" style={{ color: T.ghost, textDecoration: 'underline', textUnderlineOffset: 3 }}>
            support@higherup.io
          </a>
        </div>

      </div>
    </div>
  )
}

function PulsingDot() {
  return (
    <>
      <style>{`
        @keyframes hu-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
      <span style={{
        display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
        background: '#CCCCCC', animation: 'hu-pulse 2s ease-in-out infinite',
        flexShrink: 0,
      }} />
    </>
  )
}
