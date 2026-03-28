'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5

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

// ─── Countries ────────────────────────────────────────────────────────────────

const COUNTRIES = [
  'Philippines', 'Indonesia', 'India', 'Pakistan', 'Bangladesh',
  'Sri Lanka', 'Nepal', 'Vietnam', 'Malaysia', 'Thailand',
  'Myanmar', 'Cambodia', 'Nigeria', 'Kenya', 'South Africa',
  'Ghana', 'Egypt', 'Mexico', 'Colombia', 'Brazil',
  'Argentina', 'Peru', 'Romania', 'Ukraine', 'Poland',
  'Turkey', 'Other',
]

// ─── Payment methods by country ───────────────────────────────────────────────

function getPaymentMethods(country: string): string[] {
  switch (country) {
    case 'Philippines': return ['Wise', 'PayPal', 'GCash', 'Maya']
    case 'Indonesia':   return ['Wise', 'PayPal', 'Bank Transfer']
    case 'India':       return ['Wise', 'PayPal', 'UPI', 'Bank Transfer']
    case 'Pakistan':    return ['Wise', 'JazzCash', 'EasyPaisa', 'Bank Transfer']
    case 'Bangladesh':  return ['Wise', 'PayPal', 'bKash', 'Bank Transfer']
    default:            return ['Wise', 'PayPal', 'Bank Transfer']
  }
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  black: '#111111', gray: '#999999', ghost: '#CCCCCC',
  light: '#DDDDDD', border: '#EEEEEE', bg: '#FFFFFF',
  green: '#10B981', red: '#EF4444', row: '#FAFAFA',
}

const label10 = {
  fontSize: 10, fontWeight: 500, textTransform: 'uppercase' as const,
  letterSpacing: '0.1em', color: T.ghost, marginBottom: 8,
}

const inputBase: React.CSSProperties = {
  width: '100%', background: 'none', border: 'none',
  borderBottom: `1.5px solid ${T.border}`, outline: 'none',
  fontSize: 15, color: T.black, paddingBottom: 10, paddingTop: 4,
  fontFamily: 'inherit', boxSizing: 'border-box' as const,
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, autoFocus, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; autoFocus?: boolean; type?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={label10}>{label}</div>
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputBase}
        onFocus={e => { e.target.style.borderBottomColor = T.black }}
        onBlur={e => { e.target.style.borderBottomColor = T.border }}
      />
    </div>
  )
}

// ─── Continue button ──────────────────────────────────────────────────────────

function ContinueBtn({
  label = 'Continue', disabled, onClick, loading,
}: {
  label?: string; disabled?: boolean; onClick?: () => void; loading?: boolean
}) {
  return (
    <button
      disabled={disabled || loading}
      onClick={onClick}
      style={{
        width: '100%', padding: '14px 0', borderRadius: 10,
        fontSize: 14, fontWeight: 500, border: 'none', cursor: disabled || loading ? 'not-allowed' : 'pointer',
        background: disabled || loading ? '#F5F5F5' : T.black,
        color:      disabled || loading ? T.ghost : T.bg,
        fontFamily: 'inherit', transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => { if (!disabled && !loading) e.currentTarget.style.opacity = '0.88' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
    >
      {loading ? '...' : label}
    </button>
  )
}

// ─── Welcome text ─────────────────────────────────────────────────────────────

function WelcomeText({ step, firstName, lastName }: { step: Step; firstName: string; lastName: string }) {
  const bothFilled = firstName.trim().length >= 1 && lastName.trim().length >= 1
  const fullName   = [firstName, lastName].filter(Boolean).join(' ')

  let text: React.ReactNode
  const nameStyle: React.CSSProperties = { fontWeight: 400, transition: 'all 0.2s ease' }

  if (step === 1) {
    const display = firstName || '...'
    const trailing = bothFilled ? '.' : lastName ? `…` : firstName ? ' …' : '…'
    const showLast = lastName && firstName
    text = (
      <>Welcome, <span style={nameStyle}>{display}{showLast ? ` ${lastName}` : ''}</span>{trailing}</>
    )
  } else if (step === 2) {
    text = <>Welcome, <span style={nameStyle}>{fullName}</span>.</>
  } else if (step === 3) {
    text = <>Almost there, <span style={nameStyle}>{firstName}</span>.</>
  } else if (step === 4) {
    text = <>One more thing, <span style={nameStyle}>{firstName}</span>.</>
  } else {
    text = <>You&apos;re in, <span style={nameStyle}>{firstName}</span>.</>
  }

  return (
    <div style={{ fontSize: 28, fontWeight: 300, color: T.black, textAlign: 'center', marginBottom: 32, lineHeight: 1.3 }}>
      {text}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OnboardingForm({ token, inviteId }: { token: string; inviteId: string }) {
  const [step, setStep] = useState<Step>(1)
  const [dir,  setDir]  = useState<'forward' | 'back'>('forward')
  const [anim, setAnim] = useState(false)

  const [form, setForm] = useState<FormData>({
    firstName: '', lastName: '', country: '', phone: '',
    paymentMethod: '', paymentDetails: {}, referralCode: '',
  })

  // Country dropdown
  const [cOpen,    setCOpen]    = useState(false)
  const [cQuery,   setCQuery]   = useState('')
  const cRef = useRef<HTMLDivElement>(null)

  // Referral validation
  const [refState,    setRefState]    = useState<RefState>('idle')
  const [refName,     setRefName]     = useState<string | null>(null)
  const [refVaId,     setRefVaId]     = useState<string | null>(null)

  // Submit
  const [submitting,  setSubmitting]  = useState(false)
  const [loginCode,   setLoginCode]   = useState<string | null>(null)
  const [copied,      setCopied]      = useState(false)

  // Close country dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (cRef.current && !cRef.current.contains(e.target as Node)) setCOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Referral code validation (debounce 500ms)
  useEffect(() => {
    const v = form.referralCode.trim().toUpperCase()
    if (!v) { setRefState('idle'); setRefName(null); setRefVaId(null); return }
    setRefState('checking')
    const timer = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/affiliates/validate-code?code=${encodeURIComponent(v)}`)
        const data = await res.json() as { valid: boolean; referrer_name?: string; referrer_va_id?: string }
        if (data.valid) {
          setRefState('valid')
          setRefName(data.referrer_name ?? null)
          setRefVaId(data.referrer_va_id ?? null)
        } else {
          setRefState('invalid')
          setRefName(null)
          setRefVaId(null)
        }
      } catch {
        setRefState('invalid')
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [form.referralCode])

  // ── Navigation ──────────────────────────────────────────────────────────────

  function goTo(next: Step, direction: 'forward' | 'back') {
    setDir(direction)
    setAnim(true)
    setTimeout(() => {
      setStep(next)
      setAnim(false)
    }, 220)
  }

  function goForward() { goTo((step + 1) as Step, 'forward') }
  function goBack()    { goTo((step - 1) as Step, 'back')    }

  // ── Payment detail fields ───────────────────────────────────────────────────

  function pd(key: string) { return form.paymentDetails[key] ?? '' }
  function setPd(key: string, val: string) {
    setForm(f => ({ ...f, paymentDetails: { ...f.paymentDetails, [key]: val } }))
  }

  function renderPaymentDetails() {
    const m = form.paymentMethod
    if (!m) return null

    const emailField = (key: string, label: string) => (
      <Field key={key} label={label} value={pd(key)} onChange={v => setPd(key, v)} placeholder="your@email.com" />
    )
    const textField  = (key: string, label: string, placeholder: string) => (
      <Field key={key} label={label} value={pd(key)} onChange={v => setPd(key, v)} placeholder={placeholder} />
    )

    if (m === 'Wise')     return emailField('wise_email', 'Wise email')
    if (m === 'PayPal')   return emailField('paypal_email', 'PayPal email')

    if (['GCash', 'Maya', 'bKash', 'JazzCash', 'EasyPaisa', 'UPI'].includes(m)) return <>
      {textField('account_number', 'Account number', m === 'UPI' ? 'yourname@upi' : '+XX XXX XXX XXXX')}
      {textField('holder_name', 'Account holder name', 'Your full name')}
    </>

    if (m === 'Bank Transfer') return <>
      {textField('bank_name', 'Bank name', 'e.g. BDO, BCA, SBI')}
      {textField('holder_name', 'Account holder name', 'Full legal name on account')}
      {textField('account_number', 'Account number', 'Your bank account number')}
      {textField('swift', 'SWIFT / BIC code', 'e.g. BPABORPH (optional)')}
      {textField('iban', 'IBAN', 'IBAN if applicable (optional)')}
    </>

    return null
  }

  function isPaymentReady() {
    const m = form.paymentMethod
    if (!m) return false
    const details = form.paymentDetails
    if (m === 'Wise')   return !!details.wise_email?.trim()
    if (m === 'PayPal') return !!details.paypal_email?.trim()
    if (['GCash', 'Maya', 'bKash', 'JazzCash', 'EasyPaisa', 'UPI'].includes(m))
      return !!details.account_number?.trim() && !!details.holder_name?.trim()
    if (m === 'Bank Transfer')
      return !!details.bank_name?.trim() && !!details.holder_name?.trim() && !!details.account_number?.trim()
    return false
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    try {
      // 1. Generate login code
      const codeRes  = await fetch('/api/auth/generate-login-code', { method: 'POST' })
      const codeData = await codeRes.json() as { code?: string }
      const code     = codeData.code

      // 2. Create VA record
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

      // 3. Generate referral code for new VA
      console.log('[onboarding] Generating referral code for VA:', newVa.id)
      const gcRes  = await fetch('/api/affiliates/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ va_id: newVa.id }),
      })
      const gcData = await gcRes.json() as { ok?: boolean; code?: string }
      console.log('[onboarding] Generate-code result:', gcData)

      // 4. Register affiliate relation if valid referral code
      if (refState === 'valid' && refVaId && form.referralCode.trim()) {
        const refCode = form.referralCode.trim().toUpperCase()
        console.log('[onboarding] Registering affiliate relation:', { referred_va_id: newVa.id, referral_code: refCode, referrer_va_id: refVaId })

        const regRes  = await fetch('/api/affiliates/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referred_va_id: newVa.id, referral_code: refCode }),
        })
        const regData = await regRes.json() as { ok?: boolean; error?: string; already_exists?: boolean }
        console.log('[onboarding] Affiliate register result:', regRes.status, regData)

        // Fallback: direct DB insert if the API failed
        if (!regData.ok) {
          console.warn('[onboarding] API register failed — trying direct DB insert')
          const { data: rcRow } = await supabase
            .from('referral_codes')
            .select('va_id, code')
            .eq('code', refCode)
            .maybeSingle()
          console.log('[onboarding] Referral code DB lookup:', rcRow)

          if (rcRow?.va_id && rcRow.va_id !== newVa.id) {
            const { error: affErr } = await supabase.from('affiliates').insert({
              referrer_va_id: rcRow.va_id,
              referred_va_id: newVa.id,
              is_active:      true,
            })
            if (affErr) {
              console.error('[onboarding] Direct affiliate insert failed:', affErr.message)
            } else {
              console.log('[onboarding] Direct affiliate insert succeeded')
            }
          } else {
            console.warn('[onboarding] Could not find referral code in DB for fallback insert:', refCode)
          }
        }
      } else {
        console.log('[onboarding] No referral code — skipping affiliate registration. refState:', refState, 'refVaId:', refVaId)
      }

      // 5. Mark invite as used
      const { error: inviteErr } = await supabase
        .from('invites')
        .update({ used: true })
        .eq('id', inviteId)
      if (inviteErr) console.error('[onboarding] Failed to mark invite used:', inviteErr.message)

      setLoginCode(code ?? null)
      goTo(5, 'forward')
    } catch (err) {
      console.error('[onboarding] submit error:', err)
    } finally {
      setSubmitting(false)
    }
  }, [form, refState, refVaId, inviteId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Animation styles ────────────────────────────────────────────────────────

  const slideStyle: React.CSSProperties = anim ? {
    opacity: 0,
    transform: `translateX(${dir === 'forward' ? '-20px' : '20px'})`,
    transition: 'opacity 0.2s ease, transform 0.2s ease',
  } : {
    opacity: 1,
    transform: 'translateX(0)',
    transition: 'opacity 0.3s ease, transform 0.3s ease',
  }

  const filteredCountries = cQuery
    ? COUNTRIES.filter(c => c.toLowerCase().includes(cQuery.toLowerCase()))
    : COUNTRIES

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: T.bg, fontFamily: "'Inter', system-ui, sans-serif", padding: '40px 24px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Logo */}
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', color: T.black, textAlign: 'center', marginBottom: 40 }}>
          HigherUp
        </div>

        <div style={slideStyle}>

          {/* ── Welcome text ─────────────────────────────────────────────── */}
          <WelcomeText step={step} firstName={form.firstName} lastName={form.lastName} />

          {/* ── Back link ────────────────────────────────────────────────── */}
          {step > 1 && step < 5 && (
            <button
              onClick={goBack}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: T.ghost, fontFamily: 'inherit',
                padding: 0, marginBottom: 24, display: 'block',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = T.black}
              onMouseLeave={e => e.currentTarget.style.color = T.ghost}
            >
              ← Back
            </button>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* STEP 1: NAME                                                    */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <>
              <Field
                label="First name"
                value={form.firstName}
                onChange={v => setForm(f => ({ ...f, firstName: v }))}
                placeholder="First name"
                autoFocus
              />
              <Field
                label="Last name"
                value={form.lastName}
                onChange={v => setForm(f => ({ ...f, lastName: v }))}
                placeholder="Last name"
              />
              <div style={{ marginTop: 32 }}>
                <ContinueBtn
                  disabled={form.firstName.trim().length < 2 || form.lastName.trim().length < 2}
                  onClick={goForward}
                />
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* STEP 2: LOCATION                                                */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <>
              {/* Country dropdown */}
              <div style={{ marginBottom: 20 }}>
                <div style={label10}>Country</div>
                <div ref={cRef} style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={form.country ? form.country : cQuery}
                    onChange={e => {
                      setCQuery(e.target.value)
                      setForm(f => ({ ...f, country: '' }))
                      setCOpen(true)
                    }}
                    onFocus={() => { if (!form.country) setCOpen(true) }}
                    placeholder="Search country…"
                    style={{ ...inputBase }}
                  />
                  {cOpen && filteredCountries.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      background: T.bg, border: `1px solid ${T.border}`,
                      borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                      maxHeight: 200, overflowY: 'auto', zIndex: 50,
                    }}>
                      {filteredCountries.map(c => (
                        <button
                          key={c}
                          onClick={() => { setForm(f => ({ ...f, country: c })); setCOpen(false); setCQuery('') }}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '10px 16px', fontSize: 14, color: T.black,
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = T.row }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Phone */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={label10}>Phone number</div>
                  <span style={{ fontSize: 11, color: T.light }}>Optional</span>
                </div>
                <input
                  type="text"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+63 900 000 0000"
                  style={inputBase}
                  onFocus={e => { e.target.style.borderBottomColor = T.black }}
                  onBlur={e => { e.target.style.borderBottomColor = T.border }}
                />
              </div>

              <div style={{ marginTop: 32 }}>
                <ContinueBtn
                  disabled={!form.country}
                  onClick={goForward}
                />
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* STEP 3: PAYMENT                                                 */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={label10}>How should we pay you</div>
                <div style={{ fontSize: 12, color: T.light, marginBottom: 12 }}>
                  For affiliate earnings and bonuses
                </div>
                <div style={label10}>Payout method</div>
                <select
                  value={form.paymentMethod}
                  onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value, paymentDetails: {} }))}
                  style={{
                    width: '100%', background: 'none', border: 'none',
                    borderBottom: `1.5px solid ${T.border}`, outline: 'none',
                    fontSize: 15, color: form.paymentMethod ? T.black : T.ghost,
                    paddingBottom: 10, paddingTop: 4, fontFamily: 'inherit', cursor: 'pointer',
                  }}
                  onFocus={e => { e.target.style.borderBottomColor = T.black }}
                  onBlur={e => { e.target.style.borderBottomColor = T.border }}
                >
                  <option value="">Select a method</option>
                  {getPaymentMethods(form.country).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {renderPaymentDetails()}

              <div style={{ marginTop: 32 }}>
                <ContinueBtn
                  disabled={!isPaymentReady()}
                  onClick={goForward}
                />
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* STEP 4: REFERRAL                                                */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <>
              <div style={{ marginBottom: 8 }}>
                <div style={label10}>Referral code</div>
                <div style={{ fontSize: 13, color: T.gray, marginBottom: 12 }}>
                  Were you referred by someone?
                </div>
                <input
                  type="text"
                  value={form.referralCode}
                  onChange={e => setForm(f => ({ ...f, referralCode: e.target.value.toUpperCase() }))}
                  placeholder="e.g. JOHN-3F8A"
                  style={{ ...inputBase }}
                  onFocus={e => { e.target.style.borderBottomColor = T.black }}
                  onBlur={e => { e.target.style.borderBottomColor = T.border }}
                />
                {/* Validation feedback */}
                <div style={{ marginTop: 8, minHeight: 18 }}>
                  {refState === 'valid' && refName && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.green, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: T.green }}>Referred by {refName}</span>
                    </div>
                  )}
                  {refState === 'invalid' && form.referralCode.trim() && (
                    <span style={{ fontSize: 12, color: T.gray }}>Code not recognized</span>
                  )}
                </div>
              </div>

              <div style={{ fontSize: 11, color: T.light, marginTop: 8, marginBottom: 32 }}>
                Don&apos;t have a code? No problem. You can skip this.
              </div>

              <ContinueBtn
                label="Complete setup"
                onClick={handleSubmit}
                loading={submitting}
              />
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* STEP 5: CONFIRMATION                                            */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {step === 5 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 48 }} />

              <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
                Your login code
              </div>

              <div style={{ fontSize: 48, fontWeight: 600, color: T.black, letterSpacing: '0.1em', marginBottom: 8 }}>
                {loginCode ?? '——'}
              </div>

              <button
                onClick={() => {
                  if (loginCode) {
                    navigator.clipboard.writeText(loginCode)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }
                }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: copied ? T.green : T.ghost, fontFamily: 'inherit',
                  padding: 0, transition: 'color 0.15s',
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>

              <div style={{ fontSize: 13, color: T.gray, marginTop: 24 }}>
                Save this code. You need it every time you sign in.
              </div>

              <div style={{ fontSize: 13, color: T.ghost, marginTop: 32, lineHeight: 1.6 }}>
                Your account is pending approval.<br />
                You'll be able to sign in once approved.
              </div>

              <a
                href="/"
                style={{ display: 'block', fontSize: 14, color: T.black, marginTop: 32, textDecoration: 'underline' }}
              >
                Go to sign in →
              </a>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
