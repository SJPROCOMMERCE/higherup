'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase }       from '@/lib/supabase'
import { RevealText }     from '@/components/onboarding/RevealText'
import { CountUp }        from '@/components/onboarding/CountUp'
import { ProgressLine }   from '@/components/onboarding/ProgressLine'
import { getCountryData, getPaymentMethods, COUNTRIES } from '@/lib/country-data'

// ─── Step map ─────────────────────────────────────────────────────────────────
// 1  = HOOK: What if…
// 2  = FORM: Name
// 3  = REVEAL: Their day (pain)
// 4  = REVEAL: One number (2 min)
// 5  = FORM: Country
// 6  = REVEAL: Their reality
// 7  = REVEAL: Comparison
// 8  = FORM: Payout
// 9  = REVEAL: One upload = $130
// 10 = REVEAL: Slider (interactive)
// 11 = REVEAL: Compound effect
// 12 = FORM: Referral code → Complete setup
// 13 = REVEAL: Identity shift (submit runs async here)
// 14 = CONFIRM: Login code

const TOTAL_STEPS = 14
type StepNum = 1|2|3|4|5|6|7|8|9|10|11|12|13|14

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  firstName:      string
  lastName:       string
  country:        string
  phone:          string
  paymentMethod:  string
  paymentDetails: Record<string, string>
  referralCode:   string
}

type RefState = 'idle' | 'checking' | 'valid' | 'invalid'

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  black:  '#111111',
  gray:   '#999999',
  ghost:  '#CCCCCC',
  light:  '#DDDDDD',
  border: '#EEEEEE',
  white:  '#FFFFFF',
  green:  '#2DB87E',
  row:    '#FAFAFA',
}

const label10: React.CSSProperties = {
  fontSize: 10, fontWeight: 500, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: C.ghost, marginBottom: 8,
}

const inputBase: React.CSSProperties = {
  width: '100%', background: 'none', border: 'none',
  borderBottom: `1.5px solid ${C.border}`, outline: 'none',
  fontSize: 16, color: C.black, paddingBottom: 12, paddingTop: 6,
  fontFamily: 'inherit', boxSizing: 'border-box',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 600)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return mobile
}

function useDelayedShow(ms: number) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), ms)
    return () => clearTimeout(t)
  }, [ms])
  return show
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, autoFocus, type = 'text', optional }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; autoFocus?: boolean; type?: string; optional?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 120) }, [autoFocus])
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={label10}>{label}</div>
        {optional && <span style={{ fontSize: 11, color: C.light }}>Optional</span>}
      </div>
      <input
        ref={ref} type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder} style={inputBase}
        onFocus={e => { e.currentTarget.style.borderBottomColor = C.black }}
        onBlur={e  => { e.currentTarget.style.borderBottomColor = C.border }}
      />
    </div>
  )
}

function PrimaryBtn({ label = 'Continue →', disabled, onClick, loading }: {
  label?: string; disabled?: boolean; onClick?: () => void; loading?: boolean
}) {
  const on = !disabled && !loading
  return (
    <button
      disabled={!on} onClick={onClick}
      style={{
        width: '100%', padding: '15px 0', borderRadius: 10,
        fontSize: 14, fontWeight: 500, border: 'none',
        cursor:     on ? 'pointer' : 'not-allowed',
        background: on ? C.black : '#F5F5F5',
        color:      on ? C.white : C.ghost,
        fontFamily: 'inherit', transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => { if (on) e.currentTarget.style.opacity = '0.85' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
    >
      {loading ? '···' : label}
    </button>
  )
}

function GhostBtn({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        background: 'none', border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 13, color: disabled ? C.light : C.ghost,
        fontFamily: 'inherit', padding: '10px 0', transition: 'color 0.15s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = C.black }}
      onMouseLeave={e => { e.currentTarget.style.color = disabled ? C.light : C.ghost }}
    >
      {label} →
    </button>
  )
}

function RevealScreen({
  children, onContinue, continueDelay = 3500, continueText = 'Continue', disabled = false,
}: {
  children: React.ReactNode; onContinue: () => void
  continueDelay?: number; continueText?: string; disabled?: boolean
}) {
  const showBtn = useDelayedShow(continueDelay)
  return (
    <div style={{ textAlign: 'center', padding: '0 4px' }}>
      {children}
      <div style={{
        marginTop: 72,
        opacity:   showBtn ? 1 : 0,
        transform: showBtn ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.7s ease-out, transform 0.7s ease-out',
        pointerEvents: showBtn ? 'auto' : 'none',
      }}>
        <GhostBtn label={continueText} onClick={onContinue} disabled={disabled} />
      </div>
    </div>
  )
}

// ─── Steps with their own hooks (defined outside OnboardingForm) ──────────────

function StepHook({ onContinue, bigN }: { onContinue: () => void; bigN: (n: number) => number }) {
  const showBtn = useDelayedShow(2200)
  return (
    <div style={{ textAlign: 'center' }}>
      <RevealText delay={0} style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.ghost, marginBottom: 28 }}>
        You were invited
      </RevealText>
      <RevealText delay={400} style={{ fontSize: bigN(36), fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em', color: C.black, marginBottom: 20 }}>
        What if you could earn $800/month from your laptop?
      </RevealText>
      <RevealText delay={1200} style={{ fontSize: 15, color: C.gray, lineHeight: 1.65 }}>
        No degree. No experience.<br />Just 2 minutes per task.
      </RevealText>
      <div style={{
        marginTop: 64,
        opacity:   showBtn ? 1 : 0,
        transform: showBtn ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.7s ease-out, transform 0.7s ease-out',
        pointerEvents: showBtn ? 'auto' : 'none',
      }}>
        <GhostBtn label="Show me how" onClick={onContinue} />
      </div>
    </div>
  )
}

function StepSlider({
  sliderGoal, setSliderGoal, onContinue, bigN,
}: {
  sliderGoal: number; setSliderGoal: (n: number) => void
  onContinue: () => void; bigN: (n: number) => number
}) {
  const showSlider = useDelayedShow(600)
  const m = sliderGoal * 130
  const y = m * 12
  return (
    <div style={{ textAlign: 'center' }}>
      <RevealText delay={0} style={{ fontSize: 22, fontWeight: 300, color: C.black, lineHeight: 1.4, marginBottom: 40 }}>
        How many clients do you want?
      </RevealText>

      <div style={{
        fontSize: bigN(72), fontWeight: 700, color: C.black,
        lineHeight: 1, letterSpacing: '-0.03em', marginBottom: 4,
        opacity: showSlider ? 1 : 0, transition: 'opacity 0.5s ease',
      }}>
        {sliderGoal}
      </div>
      <div style={{
        fontSize: 14, color: C.ghost, marginBottom: 40,
        opacity: showSlider ? 1 : 0, transition: 'opacity 0.5s ease 0.1s',
      }}>
        {sliderGoal === 1 ? 'client' : 'clients'}
      </div>

      <div style={{ opacity: showSlider ? 1 : 0, transition: 'opacity 0.6s ease 0.2s' }}>
        <input
          type="range" min={1} max={20} value={sliderGoal}
          onChange={e => setSliderGoal(Number(e.target.value))}
          style={{ width: '100%', accentColor: C.black, cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 11, color: C.ghost }}>1 client</span>
          <span style={{ fontSize: 11, color: C.ghost }}>20 clients</span>
        </div>
      </div>

      <div style={{
        marginTop: 48, padding: '24px 0', borderTop: `1px solid ${C.border}`,
        opacity: showSlider ? 1 : 0, transition: 'opacity 0.6s ease 0.3s',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.ghost, marginBottom: 8 }}>Per month</div>
            <div style={{ fontSize: bigN(32), fontWeight: 700, color: C.black, letterSpacing: '-0.02em' }}>
              ${m.toLocaleString()}
            </div>
          </div>
          <div style={{ width: 1, background: C.border }} />
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.ghost, marginBottom: 8 }}>Per year</div>
            <div style={{ fontSize: bigN(32), fontWeight: 700, color: C.green, letterSpacing: '-0.02em' }}>
              ${y.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 48 }}>
        <GhostBtn label={`Lock in ${sliderGoal} ${sliderGoal === 1 ? 'client' : 'clients'}`} onClick={onContinue} />
      </div>
    </div>
  )
}

function StepIdentityShift({
  firstName, loginCode, onContinue, bigN,
}: {
  firstName: string; loginCode: string | null
  onContinue: () => void; bigN: (n: number) => number
}) {
  const showBtn = useDelayedShow(8000)
  const ready   = !!loginCode

  return (
    <div style={{ textAlign: 'center' }}>
      <RevealText delay={0} style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.ghost, marginBottom: 48 }}>
        Welcome to HigherUp
      </RevealText>
      <RevealText delay={600} style={{ fontSize: bigN(28), fontWeight: 600, color: C.black, lineHeight: 1.3, letterSpacing: '-0.02em', marginBottom: 24 }}>
        This isn&apos;t a side hustle.
      </RevealText>
      <RevealText delay={2000} style={{ fontSize: bigN(28), fontWeight: 600, color: C.black, lineHeight: 1.3, letterSpacing: '-0.02em', marginBottom: 24 }}>
        This is your new income.
      </RevealText>
      <RevealText delay={3600} style={{ fontSize: bigN(24), fontWeight: 300, color: C.gray, lineHeight: 1.3, letterSpacing: '-0.01em', marginBottom: 24 }}>
        You&apos;re not just a VA.
      </RevealText>
      <RevealText delay={5000} style={{ fontSize: bigN(28), fontWeight: 600, color: C.black, lineHeight: 1.3, letterSpacing: '-0.02em', marginBottom: 48 }}>
        You&apos;re a business.
      </RevealText>
      <RevealText delay={6500} style={{ fontSize: 18, fontWeight: 400, color: C.black }}>
        Ready, <span style={{ fontWeight: 600 }}>{firstName}</span>?
      </RevealText>

      <div style={{
        marginTop: 64,
        opacity:   showBtn ? 1 : 0,
        transform: showBtn ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.7s ease-out, transform 0.7s ease-out',
        pointerEvents: showBtn ? 'auto' : 'none',
      }}>
        <GhostBtn
          label={ready ? 'Get my login code' : '···'}
          onClick={() => { if (ready) onContinue() }}
          disabled={!ready}
        />
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OnboardingForm({ token: _token, inviteId }: { token: string; inviteId: string }) {
  const mobile = useMobile()

  const [step,          setStep]          = useState<StepNum>(1)
  const [transitioning, setTransitioning] = useState(false)

  const [form, setForm] = useState<FormData>({
    firstName: '', lastName: '', country: '', phone: '',
    paymentMethod: '', paymentDetails: {}, referralCode: '',
  })

  const [sliderGoal, setSliderGoal] = useState(5)

  // Country dropdown
  const [cOpen,  setCOpen]  = useState(false)
  const [cQuery, setCQuery] = useState('')
  const cRef = useRef<HTMLDivElement>(null)

  // Referral
  const [refState, setRefState] = useState<RefState>('idle')
  const [refVaId,  setRefVaId]  = useState<string | null>(null)

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [loginCode,  setLoginCode]  = useState<string | null>(null)
  const [copied,     setCopied]     = useState(false)

  // ── Outside-click for country dropdown ───────────────────────────────────

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (cRef.current && !cRef.current.contains(e.target as Node)) setCOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Referral code validation (debounced 500ms) ────────────────────────────

  useEffect(() => {
    const v = form.referralCode.trim().toUpperCase()
    if (!v) { setRefState('idle'); setRefVaId(null); return }
    setRefState('checking')
    const t = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/affiliates/validate-code?code=${encodeURIComponent(v)}`)
        const data = await res.json() as { valid: boolean; referrer_va_id?: string }
        if (data.valid) { setRefState('valid'); setRefVaId(data.referrer_va_id ?? null) }
        else            { setRefState('invalid'); setRefVaId(null) }
      } catch { setRefState('invalid') }
    }, 500)
    return () => clearTimeout(t)
  }, [form.referralCode])

  // ── Transitions ───────────────────────────────────────────────────────────

  function goTo(next: StepNum) {
    setTransitioning(true)
    setTimeout(() => { setStep(next); setTransitioning(false) }, 260)
  }

  function goForward() {
    const next = (step + 1) as StepNum
    if (next <= 14) goTo(next)
  }

  // ── Payment helpers ───────────────────────────────────────────────────────

  function pd(key: string) { return form.paymentDetails[key] ?? '' }
  function setPd(key: string, val: string) {
    setForm(f => ({ ...f, paymentDetails: { ...f.paymentDetails, [key]: val } }))
  }

  function renderPaymentDetails() {
    const m = form.paymentMethod
    if (!m) return null
    const emailF = (key: string, lbl: string) => (
      <Field key={key} label={lbl} value={pd(key)} onChange={v => setPd(key, v)} placeholder="your@email.com" />
    )
    const textF = (key: string, lbl: string, ph: string) => (
      <Field key={key} label={lbl} value={pd(key)} onChange={v => setPd(key, v)} placeholder={ph} />
    )
    if (m === 'Wise')   return emailF('wise_email', 'Wise email')
    if (m === 'PayPal') return emailF('paypal_email', 'PayPal email')
    if (['GCash', 'Maya', 'bKash', 'JazzCash', 'EasyPaisa', 'UPI'].includes(m)) return <>
      {textF('account_number', 'Account number', m === 'UPI' ? 'yourname@upi' : '+XX XXX XXX XXXX')}
      {textF('holder_name', 'Account holder name', 'Your full name')}
    </>
    if (m === 'Bank Transfer') return <>
      {textF('bank_name', 'Bank name', 'e.g. BDO, BCA, SBI')}
      {textF('holder_name', 'Account holder name', 'Full legal name on account')}
      {textF('account_number', 'Account number', 'Your bank account number')}
      {textF('swift', 'SWIFT / BIC code', 'e.g. BPABORPH (optional)')}
    </>
    return null
  }

  function isPaymentReady() {
    const m = form.paymentMethod; const d = form.paymentDetails
    if (!m) return false
    if (m === 'Wise')   return !!d.wise_email?.trim()
    if (m === 'PayPal') return !!d.paypal_email?.trim()
    if (['GCash', 'Maya', 'bKash', 'JazzCash', 'EasyPaisa', 'UPI'].includes(m))
      return !!d.account_number?.trim() && !!d.holder_name?.trim()
    if (m === 'Bank Transfer')
      return !!d.bank_name?.trim() && !!d.holder_name?.trim() && !!d.account_number?.trim()
    return false
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    try {
      const codeRes  = await fetch('/api/auth/generate-login-code', { method: 'POST' })
      const codeData = await codeRes.json() as { code?: string }
      const code     = codeData.code

      const { data: newVa, error: vaErr } = await supabase.from('vas').insert({
        name:                `${form.firstName.trim()} ${form.lastName.trim()}`,
        country:             form.country || null,
        phone_number:        form.phone.trim() || null,
        payment_method:      form.paymentMethod,
        payment_details:     form.paymentDetails,
        status:              'pending_approval',
        login_code:          code ?? null,
        onboarding_complete: true,
        agreed_to_terms:     true,
        agreed_at:           new Date().toISOString(),
      }).select().single()

      if (vaErr || !newVa) throw new Error(vaErr?.message ?? 'Failed to create account')

      // Generate referral code for new VA
      await fetch('/api/affiliates/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ va_id: newVa.id }),
      })

      // Register affiliate relation
      if (refState === 'valid' && refVaId && form.referralCode.trim()) {
        const refCode = form.referralCode.trim().toUpperCase()
        const regRes  = await fetch('/api/affiliates/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referred_va_id: newVa.id, referral_code: refCode }),
        })
        const regData = await regRes.json() as { ok?: boolean }
        if (!regData.ok) {
          const { data: rcRow } = await supabase
            .from('referral_codes').select('va_id, code')
            .eq('code', refCode).maybeSingle()
          if (rcRow?.va_id && rcRow.va_id !== newVa.id) {
            await supabase.from('affiliates').insert({
              referrer_va_id: rcRow.va_id, referred_va_id: newVa.id, is_active: true,
            })
          }
        }
      }

      // Mark invite used
      await supabase.from('invites').update({ used: true }).eq('id', inviteId)

      setLoginCode(code ?? null)
      setSubmitting(false)
    } catch (err) {
      console.error('[onboarding] submit error:', err)
      setSubmitting(false)
    }
  }, [form, refState, refVaId, inviteId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Step 12: go to identity shift immediately, submit in background
  function handleCompleteSetup() {
    goTo(13)
    handleSubmit()
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const firstName = form.firstName.trim() || 'you'
  const cd        = getCountryData(form.country)
  const avgSalary = cd.avgSalary
  const bigN      = (n: number) => mobile ? Math.min(n, 52) : n
  const payMethods = getPaymentMethods(form.country)

  const filteredCountries = cQuery
    ? COUNTRIES.filter(c => c.toLowerCase().includes(cQuery.toLowerCase()))
    : COUNTRIES

  function copyCode() {
    if (!loginCode) return
    navigator.clipboard.writeText(loginCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh', background: C.white,
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Logo bar */}
      <div style={{
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, borderBottom: `1px solid ${C.border}`,
      }}>
        <img src="/logo.png" alt="HigherUp" style={{ height: 28, width: 'auto', display: 'block' }} />
      </div>

      {/* Content — key={step} forces full remount on every step change */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px 80px',
      }}>
        <div
          key={step}
          style={{
            width: '100%', maxWidth: 420,
            opacity:    transitioning ? 0 : 1,
            transform:  transitioning ? 'translateY(6px)' : 'translateY(0)',
            transition: `opacity ${transitioning ? '0.16s' : '0.3s'} ease, transform ${transitioning ? '0.16s' : '0.3s'} ease`,
          }}
        >

          {/* ── Step 1: Hook ──────────────────────────────────────────── */}
          {step === 1 && (
            <StepHook onContinue={goForward} bigN={bigN} />
          )}

          {/* ── Step 2: Name form ─────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <RevealText delay={0} style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.ghost, marginBottom: 18 }}>
                  Let&apos;s start
                </RevealText>
                <RevealText delay={200} style={{ fontSize: 22, fontWeight: 300, color: C.black, lineHeight: 1.4 }}>
                  {form.firstName.trim().length >= 1
                    ? <>Hi, <span style={{ fontWeight: 500 }}>{form.firstName.trim()}</span>. Great to meet you.</>
                    : "What's your name?"
                  }
                </RevealText>
              </div>
              <Field label="First name" value={form.firstName}
                onChange={v => setForm(f => ({ ...f, firstName: v }))}
                placeholder="First name" autoFocus />
              <Field label="Last name"  value={form.lastName}
                onChange={v => setForm(f => ({ ...f, lastName:  v }))}
                placeholder="Last name" />
              <div style={{ marginTop: 32 }}>
                <PrimaryBtn
                  disabled={form.firstName.trim().length < 2 || form.lastName.trim().length < 2}
                  onClick={goForward}
                />
              </div>
            </div>
          )}

          {/* ── Step 3: Their day ─────────────────────────────────────── */}
          {step === 3 && (
            <RevealScreen onContinue={goForward} continueDelay={5800}>
              <div style={{ textAlign: 'left', maxWidth: 300, margin: '0 auto' }}>
                <RevealText delay={0} style={{ fontSize: 11, color: C.ghost, marginBottom: 32, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                  Most VAs&apos; day looks like this
                </RevealText>
                {[
                  { t: 300,  text: 'Wake up.' },
                  { t: 900,  text: 'Commute.' },
                  { t: 1500, text: 'Sit at a desk.' },
                  { t: 2100, text: 'Work all day.' },
                  { t: 2700, text: 'Get paid almost nothing.' },
                  { t: 3300, text: 'Go home exhausted.' },
                  { t: 3900, text: 'Sleep.' },
                ].map(({ t, text }) => (
                  <RevealText key={text} delay={t}
                    style={{ fontSize: 18, color: C.gray, marginBottom: 12, fontWeight: 300 }}>
                    {text}
                  </RevealText>
                ))}
                <RevealText delay={4800}
                  style={{ fontSize: bigN(40), fontWeight: 700, color: C.black, marginTop: 28, letterSpacing: '-0.02em' }}>
                  Repeat.
                </RevealText>
              </div>
            </RevealScreen>
          )}

          {/* ── Step 4: One number ────────────────────────────────────── */}
          {step === 4 && (
            <RevealScreen onContinue={goForward} continueDelay={5000}>
              <RevealText delay={0} style={{ fontSize: 14, color: C.ghost, marginBottom: 20, letterSpacing: '0.04em' }}>
                It only takes
              </RevealText>
              <div style={{ fontSize: bigN(88), fontWeight: 700, color: C.black, lineHeight: 1, letterSpacing: '-0.04em', marginBottom: 4 }}>
                <CountUp end={2} delay={200} duration={800} />
              </div>
              <RevealText delay={1000} style={{ fontSize: bigN(32), fontWeight: 300, color: C.black, marginBottom: 32, letterSpacing: '-0.01em' }}>
                minutes.
              </RevealText>
              <RevealText delay={2000} style={{ fontSize: 15, color: C.gray, lineHeight: 1.65 }}>
                To upload one product listing<br />on HigherUp.
              </RevealText>
              <RevealText delay={3200} style={{ fontSize: 15, fontWeight: 500, color: C.black, marginTop: 20 }}>
                One listing. One step closer to $800.
              </RevealText>
            </RevealScreen>
          )}

          {/* ── Step 5: Country form ──────────────────────────────────── */}
          {step === 5 && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <RevealText delay={0} style={{ fontSize: 22, fontWeight: 300, color: C.black, lineHeight: 1.4 }}>
                  Where are you based,{' '}
                  <span style={{ fontWeight: 500 }}>{form.firstName}</span>?
                </RevealText>
                <RevealText delay={300} style={{ fontSize: 14, color: C.ghost, marginTop: 10 }}>
                  We&apos;ll show you your earning potential.
                </RevealText>
              </div>

              {/* Country dropdown */}
              <div style={{ marginBottom: 24 }}>
                <div style={label10}>Country</div>
                <div ref={cRef} style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={form.country ? form.country : cQuery}
                    onChange={e => { setCQuery(e.target.value); setForm(f => ({ ...f, country: '' })); setCOpen(true) }}
                    onFocus={() => { if (!form.country) setCOpen(true) }}
                    placeholder="Search your country…"
                    style={inputBase}
                    onBlur={e  => { e.currentTarget.style.borderBottomColor = C.border }}
                    autoFocus
                  />
                  {cOpen && filteredCountries.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      background: C.white, border: `1px solid ${C.border}`,
                      borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.07)',
                      maxHeight: 220, overflowY: 'auto', zIndex: 50,
                    }}>
                      {filteredCountries.map(c => (
                        <button key={c}
                          onClick={() => { setForm(f => ({ ...f, country: c })); setCOpen(false); setCQuery('') }}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '11px 16px', fontSize: 14, color: C.black,
                            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = C.row }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Phone (optional) */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={label10}>Phone number</div>
                  <span style={{ fontSize: 11, color: C.light }}>Optional</span>
                </div>
                <input
                  type="text" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+63 900 000 0000" style={inputBase}
                  onFocus={e => { e.currentTarget.style.borderBottomColor = C.black }}
                  onBlur={e  => { e.currentTarget.style.borderBottomColor = C.border }}
                />
              </div>

              <div style={{ marginTop: 32 }}>
                <PrimaryBtn disabled={!form.country} onClick={goForward} />
              </div>
            </div>
          )}

          {/* ── Step 6: Their reality ──────────────────────────────────── */}
          {step === 6 && (
            <RevealScreen onContinue={goForward} continueDelay={5500}>
              <RevealText delay={0} style={{ fontSize: 14, color: C.ghost, marginBottom: 14, letterSpacing: '0.04em' }}>
                The average {form.country || 'VA'} earns
              </RevealText>
              <div style={{ fontSize: bigN(72), fontWeight: 700, color: C.ghost, lineHeight: 1, letterSpacing: '-0.03em', marginBottom: 6 }}>
                <CountUp end={avgSalary} prefix="$" delay={300} duration={1400} />
              </div>
              <RevealText delay={800} style={{ fontSize: 14, color: C.ghost, marginBottom: 52 }}>
                per month. 160+ hours.
              </RevealText>
              <RevealText delay={2200} style={{ fontSize: 14, color: C.gray, marginBottom: 14, letterSpacing: '0.04em' }}>
                HigherUp operators earn
              </RevealText>
              <div style={{ fontSize: bigN(72), fontWeight: 700, color: C.black, lineHeight: 1, letterSpacing: '-0.03em', marginBottom: 6 }}>
                <CountUp end={800} prefix="$" suffix="+" delay={2600} duration={1400} />
              </div>
              <RevealText delay={3400} style={{ fontSize: 15, color: C.gray }}>
                Working 3 hours a day. From home.
              </RevealText>
            </RevealScreen>
          )}

          {/* ── Step 7: Comparison ─────────────────────────────────────── */}
          {step === 7 && (
            <RevealScreen onContinue={goForward} continueDelay={5000}>
              <div style={{
                display: 'flex', gap: mobile ? 0 : 32,
                flexDirection: mobile ? 'column' : 'row',
                textAlign: 'left',
              }}>
                {/* NOW */}
                <div style={{ flex: 1, marginBottom: mobile ? 36 : 0 }}>
                  <RevealText delay={0} style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.ghost, marginBottom: 20 }}>
                    Now
                  </RevealText>
                  {[
                    { t: 200,  text: '9-to-5 schedule'        },
                    { t: 500,  text: `$${avgSalary}/month`     },
                    { t: 800,  text: 'Commute every day'       },
                    { t: 1100, text: '1 income source'         },
                    { t: 1400, text: 'No financial freedom'    },
                  ].map(({ t, text }) => (
                    <RevealText key={text} delay={t}
                      style={{ fontSize: 15, color: C.ghost, marginBottom: 12 }}>
                      {text}
                    </RevealText>
                  ))}
                </div>

                {/* WITH HIGHERUP */}
                <div style={{ flex: 1 }}>
                  <RevealText delay={600} style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.black, marginBottom: 20 }}>
                    With HigherUp
                  </RevealText>
                  {[
                    { t: 800,  text: 'Work your own hours', g: false },
                    { t: 1100, text: '$800+/month',          g: true  },
                    { t: 1400, text: 'Work from anywhere',   g: false },
                    { t: 1700, text: 'Referral income too',  g: false },
                    { t: 2000, text: 'Full freedom',         g: false },
                  ].map(({ t, text, g }) => (
                    <RevealText key={text} delay={t}
                      style={{ fontSize: 15, color: g ? C.green : C.black, fontWeight: g ? 600 : 400, marginBottom: 12 }}>
                      {text}
                    </RevealText>
                  ))}
                </div>
              </div>
            </RevealScreen>
          )}

          {/* ── Step 8: Payout form ───────────────────────────────────── */}
          {step === 8 && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <RevealText delay={0} style={{ fontSize: 22, fontWeight: 300, color: C.black, lineHeight: 1.4 }}>
                  How do you want to get paid,{' '}
                  <span style={{ fontWeight: 500 }}>{form.firstName}</span>?
                </RevealText>
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={label10}>Payment method</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {payMethods.map(m => {
                    const active = form.paymentMethod === m
                    return (
                      <button key={m}
                        onClick={() => setForm(f => ({ ...f, paymentMethod: m, paymentDetails: {} }))}
                        style={{
                          padding: '8px 16px', borderRadius: 20, fontSize: 13, fontFamily: 'inherit',
                          cursor: 'pointer', transition: 'all 0.15s',
                          border: `1.5px solid ${active ? C.black : C.border}`,
                          background: active ? C.black : C.white,
                          color: active ? C.white : C.black,
                          fontWeight: active ? 500 : 400,
                        }}>
                        {m}
                      </button>
                    )
                  })}
                </div>
              </div>

              {form.paymentMethod && (
                <div style={{ marginTop: 24 }}>
                  {renderPaymentDetails()}
                </div>
              )}

              <div style={{ marginTop: 32 }}>
                <PrimaryBtn disabled={!isPaymentReady()} onClick={goForward} />
              </div>
            </div>
          )}

          {/* ── Step 9: One upload = $130 ─────────────────────────────── */}
          {step === 9 && (
            <RevealScreen onContinue={goForward} continueDelay={5000}>
              <RevealText delay={0} style={{ fontSize: 14, color: C.ghost, marginBottom: 20, letterSpacing: '0.04em' }}>
                Let&apos;s talk money.
              </RevealText>
              <div style={{ fontSize: bigN(80), fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em', color: C.green, marginBottom: 4 }}>
                <CountUp end={130} prefix="$" delay={400} duration={1200} />
              </div>
              <RevealText delay={1400} style={{ fontSize: 16, color: C.black, marginBottom: 32 }}>
                per client, per month.
              </RevealText>
              <RevealText delay={2600} style={{ fontSize: 15, color: C.gray, lineHeight: 1.65 }}>
                You upload their products.<br />
                Takes about 2 minutes per listing.<br />
                They pay every month, like clockwork.
              </RevealText>
              <RevealText delay={3800} style={{ fontSize: 15, fontWeight: 500, color: C.black, marginTop: 20 }}>
                One client. $130. Every single month.
              </RevealText>
            </RevealScreen>
          )}

          {/* ── Step 10: Slider ───────────────────────────────────────── */}
          {step === 10 && (
            <StepSlider
              sliderGoal={sliderGoal}
              setSliderGoal={setSliderGoal}
              onContinue={goForward}
              bigN={bigN}
            />
          )}

          {/* ── Step 11: Compound effect ──────────────────────────────── */}
          {step === 11 && (
            <RevealScreen onContinue={goForward} continueDelay={5500}>
              <RevealText delay={0} style={{ fontSize: 22, fontWeight: 300, color: C.black, lineHeight: 1.4, marginBottom: 48 }}>
                Here&apos;s what {sliderGoal} {sliderGoal === 1 ? 'client' : 'clients'} looks like over time.
              </RevealText>
              {([
                { t: 400,  label: 'Month 1',  value: Math.round(sliderGoal * 0.4) * 130, note: 'Getting started'    },
                { t: 1100, label: 'Month 3',  value: Math.round(sliderGoal * 0.7) * 130, note: 'Building momentum'  },
                { t: 1800, label: 'Month 6',  value: sliderGoal * 130,                    note: 'Full capacity'      },
                { t: 2500, label: 'Month 12', value: Math.round(sliderGoal * 1.3) * 130, note: '+ referral bonuses' },
              ] as Array<{ t: number; label: string; value: number; note: string }>).map(({ t, label, value, note }, i) => (
                <RevealText key={label} delay={t} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 0', borderBottom: `1px solid ${C.border}`, textAlign: 'left',
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.black }}>{label}</div>
                    <div style={{ fontSize: 12, color: C.ghost, marginTop: 2 }}>{note}</div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: i === 3 ? C.green : C.black, letterSpacing: '-0.01em' }}>
                    ${value.toLocaleString()}
                  </div>
                </RevealText>
              ))}
              <RevealText delay={3500} style={{ fontSize: 13, color: C.gray, marginTop: 24, lineHeight: 1.65 }}>
                Referrals kick in as you invite other operators. Your income grows while you sleep.
              </RevealText>
            </RevealScreen>
          )}

          {/* ── Step 12: Referral code + Complete setup ───────────────── */}
          {step === 12 && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <RevealText delay={0} style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.ghost, marginBottom: 18 }}>
                  Last step
                </RevealText>
                <RevealText delay={200} style={{ fontSize: 22, fontWeight: 300, color: C.black, lineHeight: 1.4 }}>
                  One more thing,{' '}
                  <span style={{ fontWeight: 500 }}>{firstName}</span>.
                </RevealText>
              </div>

              {/* Referral code */}
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={label10}>Referral code</div>
                  <span style={{ fontSize: 11, color: C.light }}>Optional</span>
                </div>
                <input
                  type="text"
                  value={form.referralCode}
                  onChange={e => setForm(f => ({ ...f, referralCode: e.target.value.toUpperCase() }))}
                  placeholder="e.g. MARIA2026"
                  style={{
                    ...inputBase,
                    borderBottomColor:
                      refState === 'valid'   ? C.green :
                      refState === 'invalid' ? '#EF4444' : C.border,
                    letterSpacing: '0.05em',
                  }}
                  onFocus={e => { if (refState === 'idle') e.currentTarget.style.borderBottomColor = C.black }}
                  onBlur={e  => {
                    if (refState === 'idle' || refState === 'checking')
                      e.currentTarget.style.borderBottomColor = C.border
                  }}
                />
                <div style={{
                  fontSize: 12, marginTop: 8, height: 16,
                  color: refState === 'valid' ? C.green : refState === 'invalid' ? '#EF4444' : C.ghost,
                }}>
                  {refState === 'checking' && '···'}
                  {refState === 'valid'    && '✓ Referral code applied'}
                  {refState === 'invalid'  && 'Code not found'}
                </div>
              </div>

              <div style={{ marginTop: 48 }}>
                <PrimaryBtn
                  label="Complete setup"
                  disabled={submitting || refState === 'checking'}
                  loading={submitting}
                  onClick={handleCompleteSetup}
                />
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <span style={{ fontSize: 11, color: C.ghost }}>
                    By continuing you agree to our terms of service
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 13: Identity shift ───────────────────────────────── */}
          {step === 13 && (
            <StepIdentityShift
              firstName={firstName}
              loginCode={loginCode}
              onContinue={() => goTo(14)}
              bigN={bigN}
            />
          )}

          {/* ── Step 14: Confirmation ─────────────────────────────────── */}
          {step === 14 && (
            <div style={{ textAlign: 'center' }}>
              <RevealText delay={0} style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.ghost, marginBottom: 32 }}>
                You&apos;re in
              </RevealText>
              <RevealText delay={300} style={{ fontSize: 24, fontWeight: 300, color: C.black, lineHeight: 1.4, marginBottom: 48 }}>
                Welcome, <span style={{ fontWeight: 600 }}>{form.firstName} {form.lastName}</span>.
              </RevealText>

              <RevealText delay={900}>
                <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ghost, marginBottom: 16 }}>
                  Your login code
                </div>
                <div
                  onClick={copyCode}
                  style={{
                    fontSize: 32, fontWeight: 700, letterSpacing: '0.2em',
                    color: C.black, cursor: 'pointer', padding: '20px 24px',
                    background: C.row, borderRadius: 12, border: `1px solid ${C.border}`,
                    userSelect: 'all', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F0F0F0' }}
                  onMouseLeave={e => { e.currentTarget.style.background = C.row }}
                >
                  {loginCode ?? '···'}
                </div>
                <div style={{ fontSize: 12, color: copied ? C.green : C.ghost, marginTop: 12, transition: 'color 0.2s' }}>
                  {copied ? '✓ Copied!' : 'Tap to copy'}
                </div>
              </RevealText>

              <RevealText delay={1500} style={{ marginTop: 40, paddingTop: 32, borderTop: `1px solid ${C.border}` }}>
                <p style={{ fontSize: 14, color: C.gray, lineHeight: 1.7, margin: 0 }}>
                  Save this code — you&apos;ll use it every time you log in.<br />
                  Your account is being reviewed. We&apos;ll reach out soon.
                </p>
              </RevealText>

              <RevealText delay={2200} style={{ marginTop: 32 }}>
                <a href="/"
                  style={{ fontSize: 13, color: C.ghost, textDecoration: 'none', transition: 'color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = C.black }}
                  onMouseLeave={e => { e.currentTarget.style.color = C.ghost }}
                >
                  Go to login →
                </a>
              </RevealText>
            </div>
          )}

        </div>
      </div>

      {/* Progress bar */}
      <ProgressLine step={step} total={TOTAL_STEPS} />
    </div>
  )
}
