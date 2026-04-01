'use client'

import { useState, useCallback } from 'react'
import { useVA } from '@/context/va-context'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { PageVideo } from '@/components/dashboard/PageVideo'

const T = {
  black: '#111111', sec: '#555555', ter: '#999999',
  ghost: '#CCCCCC', div: '#EEEEEE', bg: '#FFFFFF',
  green: '#00A550', red: '#CC3300',
}

const PAYMENT_LABELS: Record<string, string> = {
  wise:          'Wise',
  paypal:        'PayPal',
  gcash:         'GCash',
  maya:          'Maya (PayMaya)',
  upi:           'UPI',
  jazzcash:      'JazzCash',
  easypaisa:     'EasyPaisa',
  bkash:         'bKash',
  bank_transfer: 'Bank Transfer',
}

const COUNTRY_NAMES: Record<string, string> = {
  PH:'Philippines', ID:'Indonesia', IN:'India', PK:'Pakistan', BD:'Bangladesh',
  US:'United States', GB:'United Kingdom', AU:'Australia', CA:'Canada', DE:'Germany',
  FR:'France', NL:'Netherlands', SG:'Singapore', MY:'Malaysia', VN:'Vietnam',
  TH:'Thailand', KE:'Kenya', NG:'Nigeria', ZA:'South Africa',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 20 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: 'flex', paddingBlock: 14, borderBottom: `1px solid ${T.div}` }}>
      <div style={{ width: 180, flexShrink: 0, fontSize: 12, color: T.ghost }}>{label}</div>
      <div style={{ fontSize: 14, color: T.black }}>{value || '—'}</div>
    </div>
  )
}

function EditableField({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 8 }}>
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', background: 'none', border: 'none',
          borderBottom: `1px solid ${T.div}`,
          outline: 'none', fontSize: 14, color: T.black,
          paddingBottom: 10, paddingTop: 4, fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
        onFocus={e => { e.target.style.borderBottomColor = T.black }}
        onBlur={e => { e.target.style.borderBottomColor = T.div }}
      />
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const color = status === 'active' ? T.green : status === 'blocked' ? T.red : T.ter
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 100,
      border: `1px solid ${color}`, fontSize: 11, color,
    }}>
      {status}
    </span>
  )
}

export default function ProfilePage() {
  const { currentVA, refreshVA } = useVA()

  const [editPersonal,  setEditPersonal]  = useState(false)
  const [editPayment,   setEditPayment]   = useState(false)
  const [savingPers,    setSavingPers]    = useState(false)
  const [savingPay,     setSavingPay]     = useState(false)
  const [errPers,       setErrPers]       = useState<string | null>(null)
  const [errPay,        setErrPay]        = useState<string | null>(null)
  const [copied,        setCopied]        = useState(false)

  // Personal edit state
  const [pName,  setPName]  = useState('')
  const [pEmail, setPEmail] = useState('')
  const [pPhone, setPPhone] = useState('')

  // Payment edit state
  const [payDetails, setPayDetails] = useState<Record<string, string>>({})

  const vaId = currentVA ? `VA-${currentVA.id.slice(0, 8)}` : ''

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(vaId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [vaId])

  function startEditPersonal() {
    setPName(currentVA?.full_legal_name ?? '')
    setPEmail(currentVA?.email ?? '')
    setPPhone(currentVA?.phone_number ?? '')
    setErrPers(null)
    setEditPersonal(true)
  }

  function startEditPayment() {
    setPayDetails(currentVA?.payment_details ?? {})
    setErrPay(null)
    setEditPayment(true)
  }

  async function savePersonal() {
    if (!currentVA) return
    if (!pName.trim()) { setErrPers('Full name is required.'); return }
    setSavingPers(true)
    const { error } = await supabase.from('vas').update({
      full_legal_name: pName.trim(),
      email:           pEmail.trim(),
      phone_number:    pPhone.trim(),
    }).eq('id', currentVA.id)
    if (error) { setErrPers(error.message); setSavingPers(false); return }
    void logActivity({
      action: 'profile_updated',
      va_id: currentVA.id,
      source: 'va',
      details: `${currentVA.name} updated personal profile`,
    })
    await refreshVA()
    setSavingPers(false)
    setEditPersonal(false)
  }

  async function savePayment() {
    if (!currentVA) return
    setSavingPay(true)
    const { error } = await supabase.from('vas').update({
      payment_details:    payDetails,
      preferred_currency: payDetails.currency ?? null,
    }).eq('id', currentVA.id)
    if (error) { setErrPay(error.message); setSavingPay(false); return }
    void logActivity({
      action: 'profile_updated',
      va_id: currentVA.id,
      source: 'va',
      details: `${currentVA.name} updated payment details`,
      metadata: { section: 'payment' },
    })
    await refreshVA()
    setSavingPay(false)
    setEditPayment(false)
  }

  function setDetail(key: string, val: string) {
    setPayDetails(d => ({ ...d, [key]: val }))
  }

  if (!currentVA) return null

  const pd = currentVA.payment_details ?? {}
  const country = currentVA.country ?? ''

  // Build readable payment details summary
  const paymentSummary = buildPaymentSummary(currentVA.payment_method ?? '', pd)

  return (
    <div style={{ paddingTop: 56, paddingBottom: 100, maxWidth: 680, margin: '0 auto', paddingInline: 48 }}>

      <div style={{ fontSize: 28, fontWeight: 300, color: T.black, marginBottom: 8 }}>Profile</div>
      <div style={{ fontSize: 13, color: T.ghost, marginBottom: 48 }}>Your account details and payment setup.</div>

      <PageVideo slug="profile" />

      {/* ── Identity ────────────────────────────────────────────────────────── */}
      <Section title="Identity">
        <div style={{ paddingBlock: 14, borderBottom: `1px solid ${T.div}`, display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 180, flexShrink: 0, fontSize: 12, color: T.ghost }}>VA ID</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 500, color: T.black }}>{vaId}</span>
            <button
              onClick={handleCopy}
              style={{ fontSize: 12, color: copied ? T.green : T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s', fontFamily: 'inherit' }}
              onMouseEnter={e => { if (!copied) e.currentTarget.style.color = T.black }}
              onMouseLeave={e => { if (!copied) e.currentTarget.style.color = T.ghost }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        <div style={{ paddingBlock: 14, borderBottom: `1px solid ${T.div}`, display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 180, flexShrink: 0, fontSize: 12, color: T.ghost }}>Status</div>
          <StatusPill status={currentVA.status} />
        </div>
        <Row label="Joined" value={currentVA.joined_at ? new Date(currentVA.joined_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : null} />
      </Section>

      {/* ── Personal information ─────────────────────────────────────────────── */}
      <Section title="Personal information">
        {editPersonal ? (
          <div>
            <EditableField label="Full legal name" value={pName} onChange={setPName} placeholder="As on your ID" />
            <EditableField label="Email address" value={pEmail} onChange={setPEmail} placeholder="your@email.com" type="email" />
            <EditableField label="Phone number" value={pPhone} onChange={setPPhone} placeholder="+XX XXXXXXXXX" type="tel" />
            {errPers && <div style={{ fontSize: 13, color: T.red, marginBottom: 16 }}>{errPers}</div>}
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button onClick={savePersonal} disabled={savingPers} style={btnStyle(T.black, T.bg)}>
                {savingPers ? 'Saving...' : 'Save changes'}
              </button>
              <button onClick={() => setEditPersonal(false)} style={btnStyle('none', T.ter, T.ter)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <Row label="Full name" value={currentVA.full_legal_name} />
            <Row label="Email" value={currentVA.email} />
            <Row label="Country" value={COUNTRY_NAMES[country] ?? country ?? null} />
            <Row label="Phone" value={currentVA.phone_number} />
            <div style={{ marginTop: 16 }}>
              <button onClick={startEditPersonal} style={linkBtnStyle()}>Edit personal info</button>
            </div>
          </>
        )}
      </Section>

      {/* ── Payout method ────────────────────────────────────────────────────── */}
      <Section title="Payout method">
        {editPayment ? (
          <div>
            <div style={{ fontSize: 13, color: T.ter, marginBottom: 20 }}>
              Editing: <strong style={{ color: T.black }}>{PAYMENT_LABELS[currentVA.payment_method ?? ''] ?? '—'}</strong>
            </div>
            {renderEditPaymentFields(currentVA.payment_method ?? '', country, payDetails, setDetail)}
            {errPay && <div style={{ fontSize: 13, color: T.red, marginBottom: 16 }}>{errPay}</div>}
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button onClick={savePayment} disabled={savingPay} style={btnStyle(T.black, T.bg)}>
                {savingPay ? 'Saving...' : 'Save changes'}
              </button>
              <button onClick={() => setEditPayment(false)} style={btnStyle('none', T.ter, T.ter)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <Row label="Method" value={PAYMENT_LABELS[currentVA.payment_method ?? ''] ?? null} />
            {paymentSummary.map(([label, value]) => (
              <Row key={label} label={label} value={value} />
            ))}
            <div style={{ marginTop: 16 }}>
              <button onClick={startEditPayment} style={linkBtnStyle()}>Edit payment details</button>
            </div>
          </>
        )}
      </Section>

    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPaymentSummary(method: string, pd: Record<string, string>): [string, string][] {
  switch (method) {
    case 'wise':          return [['Wise email', pd.wise_email], ['Name', pd.holder_name], ['Currency', pd.currency]]
    case 'paypal':        return [['PayPal email', pd.paypal_email]]
    case 'gcash':         return [['GCash number', pd.gcash_number], ['Name', pd.holder_name]]
    case 'maya':          return [['Maya number', pd.maya_number], ['Name', pd.holder_name]]
    case 'upi':           return [['UPI ID', pd.upi_id], ['Name', pd.holder_name]]
    case 'jazzcash':      return [['JazzCash number', pd.jazzcash_number], ['Name', pd.holder_name]]
    case 'easypaisa':     return [['EasyPaisa number', pd.easypaisa_number], ['Name', pd.holder_name]]
    case 'bkash':         return [['bKash number', pd.bkash_number], ['Name', pd.holder_name]]
    case 'bank_transfer': return [
      ['Account name', pd.holder_name],
      ['Bank', pd.bank_name],
      ['Account number', pd.account_number],
      ...(pd.swift ? [['SWIFT', pd.swift] as [string, string]] : []),
      ...(pd.ifsc  ? [['IFSC',  pd.ifsc]  as [string, string]] : []),
      ...(pd.iban  ? [['IBAN',  pd.iban]  as [string, string]] : []),
    ]
    default: return []
  }
}

function renderEditPaymentFields(
  method:    string,
  country:   string,
  details:   Record<string, string>,
  setDetail: (k: string, v: string) => void,
) {
  function EF({ label, k, placeholder, type = 'text' }: { label: string; k: string; placeholder?: string; type?: string }) {
    return (
      <EditableField
        label={label}
        value={details[k] ?? ''}
        onChange={v => setDetail(k, v)}
        placeholder={placeholder}
        type={type}
      />
    )
  }

  switch (method) {
    case 'wise': return <>
      <EF label="Wise email"    k="wise_email"   placeholder="Email linked to your Wise account" />
      <EF label="Account name"  k="holder_name"  placeholder="Full name on Wise" />
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost, marginBottom: 8 }}>Preferred currency</div>
        <select value={details.currency ?? ''} onChange={e => setDetail('currency', e.target.value)}
          style={{ width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${T.div}`, outline: 'none', fontSize: 14, color: T.black, paddingBottom: 10, paddingTop: 4, fontFamily: 'inherit', cursor: 'pointer' }}>
          <option value="">Select currency</option>
          {['USD','EUR','GBP','PHP','IDR','INR','PKR','BDT'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    </>
    case 'paypal':    return <EF label="PayPal email" k="paypal_email" placeholder="Email linked to your PayPal" />
    case 'gcash':     return <><EF label="GCash number" k="gcash_number" placeholder="+63 9XX XXX XXXX" /><EF label="Registered name" k="holder_name" /></>
    case 'maya':      return <><EF label="Maya number" k="maya_number" placeholder="+63 9XX XXX XXXX" /><EF label="Registered name" k="holder_name" /></>
    case 'upi':       return <><EF label="UPI ID" k="upi_id" placeholder="yourname@upi" /><EF label="Name" k="holder_name" /></>
    case 'jazzcash':  return <><EF label="JazzCash number" k="jazzcash_number" placeholder="+92 3XX XXXXXXX" /><EF label="Name" k="holder_name" /></>
    case 'easypaisa': return <><EF label="EasyPaisa number" k="easypaisa_number" placeholder="+92 3XX XXXXXXX" /><EF label="Name" k="holder_name" /></>
    case 'bkash':     return <><EF label="bKash number" k="bkash_number" placeholder="+880 1XXX XXXXXX" /><EF label="Name" k="holder_name" /></>
    case 'bank_transfer': return <>
      <EF label="Account holder name" k="holder_name" placeholder="Full legal name on account" />
      <EF label="Bank name" k="bank_name" placeholder="e.g. BDO, BCA, SBI" />
      <EF label="Account number" k="account_number" />
      {country === 'IN' && <EF label="IFSC code" k="ifsc" placeholder="e.g. HDFC0001234" />}
      {country === 'BD' && <EF label="Routing number" k="routing" />}
      {(country === 'PK' || country === 'BD') && <EF label="IBAN" k="iban" />}
      {!['PH','ID','IN','PK','BD'].includes(country) && <EF label="SWIFT / BIC" k="swift" placeholder="e.g. BPABORPH" />}
      <EF label="Branch name (optional)" k="branch" />
    </>
    default: return null
  }
}

function btnStyle(bg: string, color: string, border?: string): React.CSSProperties {
  return {
    fontSize: 13, fontWeight: 500, color,
    background: bg === 'none' ? 'none' : bg,
    border: border ? `1px solid ${border}` : 'none',
    borderRadius: 100, padding: '9px 22px', cursor: 'pointer',
    fontFamily: 'inherit', transition: 'opacity 0.15s',
  }
}

function linkBtnStyle(): React.CSSProperties {
  return {
    fontSize: 13, color: T.ter, background: 'none', border: 'none',
    cursor: 'pointer', padding: 0, fontFamily: 'inherit',
    textDecoration: 'underline', textUnderlineOffset: 3,
    transition: 'color 0.15s',
  }
}
