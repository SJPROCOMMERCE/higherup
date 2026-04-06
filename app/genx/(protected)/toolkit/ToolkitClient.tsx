'use client'
import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────
type DefaultScript = {
  id: string; category: string; subcategory: string | null; channel: string | null
  title: string; description: string | null; content: string
  attachment_url: string | null; attachment_name: string | null; usage_count: number
}
type CustomScript = {
  id: string; lg_id: string; category: string; channel: string
  title: string; content: string; notes: string | null
  is_modified_from: string | null; times_used: number
  times_replied: number; times_converted: number
  conversion_note: string | null; is_pinned: boolean
  sort_order: number; updated_at: string; created_at: string
}
type Contact = {
  id: string; lg_id: string; name: string; channel: string; handle: string | null
  status: string; source: string | null; notes: string | null
  next_followup_at: string | null; followup_count: number
  first_contacted_at: string | null; last_contacted_at: string | null
  last_replied_at: string | null; last_message_sent: string | null
  last_objection: string | null; tags: string[]; is_starred: boolean
  is_archived: boolean; created_at: string; updated_at: string
  overdue?: boolean
}
type Activity = {
  id: string; contact_id: string; lg_id: string; activity_type: string
  note: string | null; created_at: string
}
type ReferralLink = {
  id: string; lg_id: string; source: string; label: string | null
  link_code: string; full_url: string; click_count: number
  signup_count: number; activated_count: number; is_active: boolean; created_at: string
}
type Asset = {
  id: string; title: string; description: string | null; asset_type: string
  file_url: string | null; file_name: string | null; category: string
  download_count: number; sort_order: number; is_active: boolean; created_at: string
}
type DayData = { day_of_week: number; dms_sent: number; posts_made: number; followups_sent: number }

type Props = {
  lgId: string
  referralCode: string
  items: DefaultScript[]
  myScripts: CustomScript[]
  contacts: Contact[]
  links: ReferralLink[]
  assets: Asset[]
  weeklyDays: DayData[]
  weekStart: string
  signupsThisWeek: number
  contactsMigrationNeeded: boolean
  linksMigrationNeeded: boolean
  assetsMigrationNeeded: boolean
}

// ─── Design tokens ────────────────────────────────────────────
const C = {
  bg:       '#0A0A0A',
  surface:  '#141414',
  surface2: '#1A1A1A',
  border:   '#1F1F1F',
  border2:  '#2A2A2A',
  text:     '#FFFFFF',
  muted:    '#888888',
  dim:      '#555555',
  green:    '#22C55E',
}
const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', 'Courier New', monospace" }
const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: C.dim,
  textTransform: 'uppercase', letterSpacing: '0.08em',
}

// ─── Label maps ───────────────────────────────────────────────
const SUBCATEGORY_LABELS: Record<string, string> = {
  first_contact:  'First Contact',
  follow_up:      'Follow Up',
  va_onboarding:  'VA Onboarding',
  reengagement:   'Re-engagement',
  objections:     'Objections & FAQ',
  community_post: 'Community Posts',
  competitive:    'Competitive',
  closing:        'Closing',
  custom:         'Custom',
  general:        'General',
}
const CHANNEL_LABELS: Record<string, string> = {
  whatsapp:  'WhatsApp',
  instagram: 'Instagram',
  facebook:  'Facebook',
  linkedin:  'LinkedIn',
  telegram:  'Telegram',
  tiktok:    'TikTok',
  email:     'Email',
  general:   'General',
}
const STATUS_LABELS: Record<string, string> = {
  prospect:   'Prospect',
  contacted:  'Contacted',
  replied:    'Replied',
  interested: 'Interested',
  link_sent:  'Link Sent',
  signed_up:  'Signed Up',
  activated:  'Activated',
  lost:       'Lost',
}
const STATUS_COLORS: Record<string, string> = {
  prospect:   C.dim,
  contacted:  '#888',
  replied:    '#FFF',
  interested: C.green,
  link_sent:  C.green,
  signed_up:  C.green,
  activated:  C.green,
  lost:       C.dim,
}
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
type MainTab = 'scripts' | 'pipeline' | 'links' | 'assets' | 'planner' | 'analytics'

// ─── Helpers ──────────────────────────────────────────────────
function timeAgo(ts: string | null | undefined): string {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDate(ts: string | null | undefined): string {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Tiny reusable button ─────────────────────────────────────
function Btn({
  children, onClick, variant = 'default', style, disabled,
}: {
  children: React.ReactNode; onClick?: () => void
  variant?: 'default' | 'green' | 'white' | 'ghost'
  style?: React.CSSProperties; disabled?: boolean
}) {
  const vars: Record<string, React.CSSProperties> = {
    default: { background: C.surface2, color: C.muted, border: `1px solid ${C.border2}` },
    green:   { background: C.green, color: '#000' },
    white:   { background: C.text, color: '#000' },
    ghost:   { background: 'transparent', color: C.dim, border: `1px solid ${C.border}` },
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: 'none', borderRadius: 4, padding: '6px 12px',
        fontSize: 11, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 0.15s',
        ...vars[variant], ...style,
      }}
    >
      {children}
    </button>
  )
}

// ─── Copy button ──────────────────────────────────────────────
function CopyBtn({ text, onCopy }: { text: string; onCopy?: () => void }) {
  const [copied, setCopied] = useState(false)
  function handleClick() {
    navigator.clipboard.writeText(text).catch(() => {})
    onCopy?.()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleClick}
      style={{
        background: copied ? C.green : C.surface2,
        color: copied ? '#000' : C.muted,
        border: `1px solid ${copied ? C.green : C.border2}`,
        borderRadius: 4, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ─── Sub nav ──────────────────────────────────────────────────
function SubNav({
  tabs, active, onChange,
}: { tabs: { key: MainTab; label: string; count?: number }[]; active: MainTab; onChange: (t: MainTab) => void }) {
  return (
    <div style={{
      display: 'flex', gap: 4, marginBottom: 28, flexWrap: 'wrap',
      borderBottom: `1px solid ${C.border}`, paddingBottom: 0,
    }}>
      {tabs.map(tab => {
        const isActive = tab.key === active
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              padding: '10px 16px', fontSize: 12, fontWeight: 600,
              background: 'transparent',
              color: isActive ? C.text : C.muted,
              border: 'none',
              borderBottom: isActive ? `2px solid ${C.green}` : '2px solid transparent',
              cursor: 'pointer', letterSpacing: '0.04em',
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span style={{ marginLeft: 6, fontSize: 10, color: isActive ? C.muted : '#444' }}>
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SCRIPTS TAB
// ═══════════════════════════════════════════════════════════════
function ScriptsTab({
  items, myScripts: initialMyScripts,
}: { items: DefaultScript[]; myScripts: CustomScript[] }) {
  const [subTab, setSubTab] = useState<'library' | 'mine'>('library')
  const [myScripts, setMyScripts] = useState<CustomScript[]>(initialMyScripts)
  const [filterSubcat, setFilterSubcat] = useState('all')
  const [filterChannel, setFilterChannel] = useState('all')
  const [modal, setModal] = useState<{ mode: 'new' | 'edit'; script?: CustomScript } | null>(null)

  const subcategories = [...new Set(items.map(i => i.subcategory || 'general'))].filter(Boolean)
  const channels = [...new Set(items.map(i => i.channel || 'general'))].filter(c => c !== 'general')

  const filteredItems = items.filter(item => {
    if (filterSubcat !== 'all' && (item.subcategory || 'general') !== filterSubcat) return false
    if (filterChannel !== 'all' && (item.channel || 'general') !== filterChannel) return false
    return true
  })

  const grouped: Record<string, DefaultScript[]> = {}
  for (const item of filteredItems) {
    const sub = item.subcategory || 'general'
    if (!grouped[sub]) grouped[sub] = []
    grouped[sub].push(item)
  }

  async function copyDefault(item: DefaultScript) {
    await navigator.clipboard.writeText(item.content).catch(() => {})
    fetch(`/api/genx/toolkit/${item.id}/copy`, { method: 'POST' }).catch(() => {})
  }

  async function customizeDefault(item: DefaultScript) {
    const res = await fetch(`/api/genx/toolkit/customize/${item.id}`, { method: 'POST' })
    const data = await res.json()
    if (data.script) {
      if (!data.already_exists) setMyScripts(prev => [data.script, ...prev])
      setSubTab('mine')
    }
  }

  function handleSave(saved: CustomScript) {
    const isEdit = modal?.mode === 'edit'
    if (isEdit) setMyScripts(prev => prev.map(s => s.id === saved.id ? saved : s))
    else setMyScripts(prev => [saved, ...prev])
    setModal(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this script?')) return
    await fetch(`/api/genx/toolkit/my-scripts/${id}`, { method: 'DELETE' })
    setMyScripts(prev => prev.filter(s => s.id !== id))
  }

  async function handlePin(script: CustomScript) {
    const res = await fetch(`/api/genx/toolkit/my-scripts/${script.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_pinned: !script.is_pinned }),
    })
    const data = await res.json()
    if (data.script) setMyScripts(prev => prev.map(s => s.id === script.id ? data.script : s))
  }

  async function handleTrack(id: string, result: 'used' | 'reply' | 'convert') {
    const res = await fetch(`/api/genx/toolkit/my-scripts/${id}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result }),
    })
    const data = await res.json()
    if (data.script) setMyScripts(prev => prev.map(s => s.id === id ? data.script : s))
  }

  const subTabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', fontSize: 12, fontWeight: 600,
    background: active ? C.text : 'transparent',
    color: active ? '#000' : C.muted,
    border: `1px solid ${active ? C.text : C.border}`,
    borderRadius: 6, cursor: 'pointer',
  })

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setSubTab('library')} style={subTabStyle(subTab === 'library')}>
          HigherUp Library <span style={{ opacity: 0.6 }}>({items.length})</span>
        </button>
        <button onClick={() => setSubTab('mine')} style={subTabStyle(subTab === 'mine')}>
          My Scripts <span style={{ opacity: 0.6 }}>({myScripts.length})</span>
        </button>
      </div>

      {/* ── Library ── */}
      {subTab === 'library' && (
        <>
          {(subcategories.length > 1 || channels.length > 0) && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <select
                value={filterSubcat}
                onChange={e => setFilterSubcat(e.target.value)}
                style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 12px', fontSize: 12, color: C.muted, cursor: 'pointer', outline: 'none' }}
              >
                <option value="all">All categories</option>
                {subcategories.map(s => (
                  <option key={s} value={s}>{SUBCATEGORY_LABELS[s] || s}</option>
                ))}
              </select>
              {channels.length > 0 && (
                <select
                  value={filterChannel}
                  onChange={e => setFilterChannel(e.target.value)}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 12px', fontSize: 12, color: C.muted, cursor: 'pointer', outline: 'none' }}
                >
                  <option value="all">All channels</option>
                  {channels.map(c => <option key={c} value={c}>{CHANNEL_LABELS[c] || c}</option>)}
                </select>
              )}
            </div>
          )}

          {filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.dim, fontSize: 13, padding: '48px 0' }}>No scripts found.</div>
          ) : (
            Object.entries(grouped).map(([subcat, subItems]) => (
              <div key={subcat} style={{ marginBottom: 28 }}>
                <div style={{ ...labelStyle, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
                  {SUBCATEGORY_LABELS[subcat] || subcat.replace(/_/g, ' ')}
                  <span style={{ color: '#333', marginLeft: 8 }}>({subItems.length})</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
                  {subItems.map(item => (
                    <DefaultScriptCard key={item.id} item={item} onCopy={copyDefault} onCustomize={customizeDefault} />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* ── My Scripts ── */}
      {subTab === 'mine' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: C.muted }}>
              {myScripts.length === 0 ? 'No custom scripts yet.' : `${myScripts.length} script${myScripts.length !== 1 ? 's' : ''}`}
            </div>
            <Btn variant="white" onClick={() => setModal({ mode: 'new' })}>+ New Script</Btn>
          </div>

          {myScripts.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
              {myScripts.map(script => (
                <CustomScriptCard
                  key={script.id} script={script}
                  onCopy={s => { navigator.clipboard.writeText(s.content).catch(() => {}); fetch(`/api/genx/toolkit/my-scripts/${s.id}/copy`, { method: 'POST' }).catch(() => {}) }}
                  onEdit={s => setModal({ mode: 'edit', script: s })}
                  onDelete={handleDelete}
                  onPin={handlePin}
                  onTrack={handleTrack}
                />
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: C.dim, fontSize: 13, padding: '48px 0' }}>
              <div style={{ marginBottom: 12 }}>No custom scripts yet.</div>
              <div style={{ marginBottom: 20, fontSize: 12 }}>Customize a default script or write your own from scratch.</div>
              <Btn variant="white" onClick={() => setModal({ mode: 'new' })}>+ Write Your First Script</Btn>
            </div>
          )}
        </>
      )}

      {modal && (
        <ScriptModal
          form={modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

function DefaultScriptCard({ item, onCopy, onCustomize }: {
  item: DefaultScript; onCopy: (i: DefaultScript) => void; onCustomize: (i: DefaultScript) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const subLabel = SUBCATEGORY_LABELS[item.subcategory || ''] || item.subcategory || ''
  const channelLabel = CHANNEL_LABELS[item.channel || 'general'] || item.channel || 'General'

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {subLabel && <span style={{ ...labelStyle }}>{subLabel}</span>}
            {item.channel && item.channel !== 'general' && (
              <span style={{ ...labelStyle, color: '#444' }}>· {channelLabel}</span>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.title}</div>
          {item.description && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{item.description}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <CopyBtn text={item.content} onCopy={() => fetch(`/api/genx/toolkit/${item.id}/copy`, { method: 'POST' }).catch(() => {})} />
          <Btn onClick={() => onCustomize(item)}>Customize</Btn>
        </div>
      </div>
      <div onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer', fontSize: 12, color: C.muted }}>
        {expanded ? (
          <pre style={{ ...mono, fontSize: 12, color: C.muted, whiteSpace: 'pre-wrap', lineHeight: 1.65, background: '#0D0D0D', border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, margin: 0 }}>
            {item.content}
          </pre>
        ) : (
          <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {item.content.split('\n')[0]}
          </div>
        )}
        <div style={{ ...labelStyle, marginTop: 6 }}>{expanded ? '▲ hide' : '▼ show full'}</div>
      </div>
      {item.usage_count > 0 && <div style={{ ...mono, fontSize: 11, color: C.dim }}>Used {item.usage_count}×</div>}
    </div>
  )
}

function CustomScriptCard({ script, onCopy, onEdit, onDelete, onPin, onTrack }: {
  script: CustomScript; onCopy: (s: CustomScript) => void; onEdit: (s: CustomScript) => void
  onDelete: (id: string) => void; onPin: (s: CustomScript) => void
  onTrack: (id: string, result: 'used' | 'reply' | 'convert') => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showTrack, setShowTrack] = useState(false)
  const replyRate = script.times_used > 0 ? Math.round((script.times_replied / script.times_used) * 100) : 0
  return (
    <div style={{ background: C.surface, border: `1px solid ${script.is_pinned ? C.border2 : C.border}`, borderRadius: 8, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <span style={{ ...labelStyle }}>{SUBCATEGORY_LABELS[script.category] || script.category}</span>
            {script.channel !== 'general' && <span style={{ ...labelStyle, color: '#444' }}>· {CHANNEL_LABELS[script.channel] || script.channel}</span>}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{script.title}</div>
          {script.notes && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{script.notes}</div>}
        </div>
        <button onClick={() => onPin(script)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, color: script.is_pinned ? C.text : C.dim, padding: '2px 6px' }}>
          {script.is_pinned ? '📌' : '⬜'}
        </button>
      </div>
      <div onClick={() => setExpanded(e => !e)} style={{ margin: '10px 0', cursor: 'pointer' }}>
        {expanded ? (
          <pre style={{ ...mono, fontSize: 12, color: C.muted, whiteSpace: 'pre-wrap', lineHeight: 1.65, background: '#0D0D0D', border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, margin: 0 }}>
            {script.content}
          </pre>
        ) : (
          <div style={{ fontSize: 12, color: C.muted, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {script.content.split('\n')[0]}
          </div>
        )}
        <div style={{ ...labelStyle, marginTop: 6 }}>{expanded ? '▲ hide' : '▼ show full'}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <CopyBtn text={script.content} onCopy={() => onCopy(script)} />
        <Btn onClick={() => onEdit(script)}>Edit</Btn>
        <Btn onClick={() => onDelete(script.id)} style={{ color: '#666' }}>Delete</Btn>
        <Btn onClick={() => setShowTrack(v => !v)} style={{ color: C.muted }}>Track</Btn>
        {script.times_used > 0 && (
          <span style={{ ...mono, fontSize: 11, color: C.dim, marginLeft: 4 }}>
            Used {script.times_used}× · {script.times_replied} replies
            {replyRate > 0 && ` · ${replyRate}%`}
            {script.times_converted > 0 && ` · ${script.times_converted} converts`}
          </span>
        )}
      </div>
      {showTrack && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: '#0D0D0D', border: `1px solid ${C.border}`, borderRadius: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ ...labelStyle }}>Log result:</span>
          {[
            { result: 'used' as const, label: 'No response' },
            { result: 'reply' as const, label: 'Got a reply' },
            { result: 'convert' as const, label: 'They signed up' },
          ].map(opt => (
            <Btn key={opt.result} onClick={() => { onTrack(script.id, opt.result); setShowTrack(false) }} variant={opt.result === 'convert' ? 'green' : 'default'}>
              {opt.label}
            </Btn>
          ))}
          <button onClick={() => setShowTrack(false)} style={{ background: 'transparent', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 12 }}>cancel</button>
        </div>
      )}
    </div>
  )
}

function ScriptModal({ form, onClose, onSave }: {
  form: { mode: 'new' | 'edit'; script?: CustomScript }
  onClose: () => void; onSave: (s: CustomScript) => void
}) {
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState(form.script?.title || '')
  const [content, setContent] = useState(form.script?.content || '')
  const [category, setCategory] = useState(form.script?.category || 'custom')
  const [channel, setChannel] = useState(form.script?.channel || 'general')
  const [notes, setNotes] = useState(form.script?.notes || '')

  async function save() {
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    try {
      const isEdit = form.mode === 'edit' && form.script
      const url = isEdit ? `/api/genx/toolkit/my-scripts/${form.script!.id}` : '/api/genx/toolkit/my-scripts'
      const res = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content, category, channel, notes }) })
      const data = await res.json()
      if (data.script) onSave(data.script)
    } finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = { width: '100%', background: '#0D0D0D', border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px', fontSize: 13, color: C.text, outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 32, width: '100%', maxWidth: 540 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{form.mode === 'new' ? 'New Script' : 'Edit Script'}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.dim, fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><div style={{ ...labelStyle, marginBottom: 6 }}>Title *</div><input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder="e.g., My follow-up for PH VAs" /></div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Category</div>
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {Object.entries(SUBCATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Channel</div>
              <select value={channel} onChange={e => setChannel(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div><div style={{ ...labelStyle, marginBottom: 6 }}>Script Content *</div><textarea value={content} onChange={e => setContent(e.target.value)} rows={7} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.65, fontFamily: 'inherit' }} placeholder="Write your script here..." /></div>
          <div><div style={{ ...labelStyle, marginBottom: 6 }}>Notes (optional)</div><input value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle} placeholder="e.g., Works great in PH VA groups on weekends" /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <Btn onClick={onClose} variant="ghost">Cancel</Btn>
          <Btn onClick={save} variant="white" disabled={saving || !title.trim() || !content.trim()}>{saving ? 'Saving...' : 'Save Script'}</Btn>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE TAB
// ═══════════════════════════════════════════════════════════════
function PipelineTab({
  contacts: initialContacts, migrationNeeded,
}: { contacts: Contact[]; migrationNeeded: boolean }) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterChannel, setFilterChannel] = useState('all')
  const [filterStarred, setFilterStarred] = useState(false)
  const [filterDue, setFilterDue] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [activities, setActivities] = useState<Record<string, Activity[]>>({})
  const [loadingActivities, setLoadingActivities] = useState<Record<string, boolean>>({})

  const now = new Date().toISOString()

  const total = contacts.length
  const active = contacts.filter(c => !['lost'].includes(c.status)).length
  const followupsDue = contacts.filter(c => c.overdue).length
  const activated = contacts.filter(c => c.status === 'activated').length
  const convRate = total > 0 ? ((activated / total) * 100).toFixed(1) : '0.0'

  const filtered = contacts.filter(c => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    if (filterChannel !== 'all' && c.channel !== filterChannel) return false
    if (filterStarred && !c.is_starred) return false
    if (filterDue && !c.overdue) return false
    return true
  })

  const channels = [...new Set(contacts.map(c => c.channel))].filter(Boolean)

  async function loadActivities(contactId: string) {
    if (activities[contactId] || loadingActivities[contactId]) return
    setLoadingActivities(prev => ({ ...prev, [contactId]: true }))
    try {
      const res = await fetch(`/api/genx/toolkit/contacts/${contactId}/activity`).catch(() => null)
      if (res?.ok) {
        const data = await res.json()
        setActivities(prev => ({ ...prev, [contactId]: data.activities || [] }))
      } else {
        setActivities(prev => ({ ...prev, [contactId]: [] }))
      }
    } finally {
      setLoadingActivities(prev => ({ ...prev, [contactId]: false }))
    }
  }

  async function toggleExpand(contactId: string) {
    if (expandedId === contactId) {
      setExpandedId(null)
    } else {
      setExpandedId(contactId)
      loadActivities(contactId)
    }
  }

  async function updateContact(id: string, updates: Partial<Contact>) {
    const res = await fetch(`/api/genx/toolkit/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const data = await res.json()
    if (data.contact) {
      setContacts(prev => prev.map(c => c.id === id ? {
        ...data.contact,
        overdue: data.contact.next_followup_at
          && data.contact.next_followup_at < now
          && !['signed_up', 'activated', 'lost'].includes(data.contact.status),
      } : c))
    }
  }

  async function deleteContact(id: string) {
    if (!confirm('Delete this contact?')) return
    await fetch(`/api/genx/toolkit/contacts/${id}`, { method: 'DELETE' })
    setContacts(prev => prev.filter(c => c.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  async function logActivity(contactId: string, activityType: string, note?: string) {
    await fetch(`/api/genx/toolkit/contacts/${contactId}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity_type: activityType, note }),
    })
    // Update last_contacted_at optimistically
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, last_contacted_at: new Date().toISOString() } : c))
  }

  async function handleNewContact(data: { name: string; channel: string; handle?: string; source?: string; notes?: string; status?: string }) {
    const res = await fetch('/api/genx/toolkit/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const result = await res.json()
    if (result.contact) {
      const c = result.contact
      setContacts(prev => [{
        ...c,
        overdue: c.next_followup_at
          && c.next_followup_at < now
          && !['signed_up', 'activated', 'lost'].includes(c.status),
      }, ...prev])
      setShowNewModal(false)
    }
  }

  if (migrationNeeded) {
    return (
      <div style={{ background: '#1A1400', border: '1px solid #3A2E00', borderRadius: 8, padding: 24, fontSize: 13, color: '#B8A000' }}>
        Pipeline requires the V2 database migration. Run <code style={mono}>scripts/genx-migrate-v2.sql</code> in the Supabase SQL Editor to enable this feature.
      </div>
    )
  }

  return (
    <div>
      {/* Stats bar */}
      <div style={{
        display: 'flex', gap: 24, marginBottom: 20, padding: '14px 20px',
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, flexWrap: 'wrap',
      }}>
        {[
          { label: 'Total', value: total },
          { label: 'Active', value: active },
          { label: 'Follow-ups due', value: followupsDue, highlight: followupsDue > 0 },
          { label: 'Conversion', value: `${convRate}%` },
        ].map(stat => (
          <div key={stat.label} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: stat.highlight ? C.green : C.text }}>
              {stat.value}
            </span>
            <span style={{ fontSize: 11, color: C.muted }}>{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Filters + Add */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 11, color: C.muted, cursor: 'pointer', outline: 'none' }}
        >
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select
          value={filterChannel}
          onChange={e => setFilterChannel(e.target.value)}
          style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 11, color: C.muted, cursor: 'pointer', outline: 'none' }}
        >
          <option value="all">All channels</option>
          {channels.map(c => <option key={c} value={c}>{CHANNEL_LABELS[c] || c}</option>)}
        </select>
        <button
          onClick={() => setFilterStarred(v => !v)}
          style={{ background: filterStarred ? '#1A1A00' : C.surface, border: `1px solid ${filterStarred ? '#3A3A00' : C.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 11, color: filterStarred ? '#FFD700' : C.muted, cursor: 'pointer' }}
        >
          ⭐ Starred
        </button>
        <button
          onClick={() => setFilterDue(v => !v)}
          style={{ background: filterDue ? '#1A0000' : C.surface, border: `1px solid ${filterDue ? '#3A0000' : C.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 11, color: filterDue ? '#FF4444' : C.muted, cursor: 'pointer' }}
        >
          ⏰ Due
        </button>
        <div style={{ flex: 1 }} />
        <Btn variant="white" onClick={() => setShowNewModal(true)}>+ New Contact</Btn>
      </div>

      {/* Contact list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: C.dim, fontSize: 13, padding: '48px 0' }}>
          {contacts.length === 0 ? (
            <>
              <div style={{ marginBottom: 12 }}>No contacts yet. Start building your pipeline.</div>
              <Btn variant="white" onClick={() => setShowNewModal(true)}>+ Add First Contact</Btn>
            </>
          ) : 'No contacts match the current filters.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filtered.map(contact => (
            <ContactRow
              key={contact.id}
              contact={contact}
              expanded={expandedId === contact.id}
              activities={activities[contact.id] || []}
              loadingActivities={loadingActivities[contact.id] || false}
              onToggle={() => toggleExpand(contact.id)}
              onUpdate={updates => updateContact(contact.id, updates)}
              onDelete={() => deleteContact(contact.id)}
              onLogActivity={(type, note) => logActivity(contact.id, type, note)}
              onStar={() => updateContact(contact.id, { is_starred: !contact.is_starred })}
            />
          ))}
        </div>
      )}

      {showNewModal && (
        <NewContactModal
          onClose={() => setShowNewModal(false)}
          onSave={handleNewContact}
        />
      )}
    </div>
  )
}

function ContactRow({ contact, expanded, activities, loadingActivities, onToggle, onUpdate, onDelete, onLogActivity, onStar }: {
  contact: Contact
  expanded: boolean
  activities: Activity[]
  loadingActivities: boolean
  onToggle: () => void
  onUpdate: (updates: Partial<Contact>) => void
  onDelete: () => void
  onLogActivity: (type: string, note?: string) => void
  onStar: () => void
}) {
  const [actNote, setActNote] = useState('')
  const statusColor = STATUS_COLORS[contact.status] || C.dim
  const isActivated = contact.status === 'activated'

  return (
    <div style={{
      background: isActivated ? '#0D1A0D' : C.surface,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${statusColor}`,
      borderRadius: 6,
      opacity: contact.status === 'lost' ? 0.45 : 1,
    }}>
      {/* Row summary */}
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', gap: 12 }}
      >
        {/* Star */}
        <button
          onClick={e => { e.stopPropagation(); onStar() }}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, color: contact.is_starred ? '#FFD700' : C.dim, flexShrink: 0, padding: 0 }}
        >
          {contact.is_starred ? '⭐' : '☆'}
        </button>

        {/* Name + channel */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {contact.name}
            {contact.handle && <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>@{contact.handle}</span>}
          </div>
          <div style={{ fontSize: 11, color: C.dim }}>{CHANNEL_LABELS[contact.channel] || contact.channel}</div>
        </div>

        {/* Status badge */}
        <div style={{ fontSize: 11, color: statusColor, fontWeight: 600, flexShrink: 0 }}>
          {STATUS_LABELS[contact.status] || contact.status}
        </div>

        {/* Time */}
        <div style={{ fontSize: 11, color: C.dim, flexShrink: 0, minWidth: 60, textAlign: 'right' }}>
          {timeAgo(contact.updated_at)}
        </div>

        {/* Overdue indicator */}
        {contact.overdue && <span style={{ fontSize: 12, flexShrink: 0 }} title="Follow-up overdue">⏰</span>}

        {/* Expand arrow */}
        <div style={{ fontSize: 10, color: C.dim, flexShrink: 0 }}>{expanded ? '▲' : '▼'}</div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${C.border}` }}>
          <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Status change */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ ...labelStyle }}>Status</div>
              <select
                value={contact.status}
                onChange={e => onUpdate({ status: e.target.value })}
                style={{ background: '#0D0D0D', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: C.text, cursor: 'pointer', outline: 'none' }}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {/* Notes */}
            <div>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Notes</div>
              <textarea
                defaultValue={contact.notes || ''}
                onBlur={e => { if (e.target.value !== (contact.notes || '')) onUpdate({ notes: e.target.value }) }}
                rows={2}
                style={{ width: '100%', background: '#0D0D0D', border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, color: C.text, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                placeholder="Add notes..."
              />
            </div>

            {/* Next follow-up */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ ...labelStyle }}>Next follow-up</div>
              <input
                type="datetime-local"
                defaultValue={contact.next_followup_at ? contact.next_followup_at.slice(0, 16) : ''}
                onBlur={e => { if (e.target.value) onUpdate({ next_followup_at: new Date(e.target.value).toISOString() }) }}
                style={{ background: '#0D0D0D', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: C.text, outline: 'none' }}
              />
            </div>

            {/* Info row */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {contact.first_contacted_at && (
                <div><span style={{ ...labelStyle }}>First contacted</span><div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{formatDate(contact.first_contacted_at)}</div></div>
              )}
              {contact.last_contacted_at && (
                <div><span style={{ ...labelStyle }}>Last contacted</span><div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{formatDate(contact.last_contacted_at)}</div></div>
              )}
              {contact.source && (
                <div><span style={{ ...labelStyle }}>Source</span><div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{contact.source}</div></div>
              )}
            </div>

            {/* Log activity */}
            <div>
              <div style={{ ...labelStyle, marginBottom: 8 }}>Log Activity</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={actNote}
                  onChange={e => setActNote(e.target.value)}
                  placeholder="Optional note..."
                  style={{ flex: 1, minWidth: 180, background: '#0D0D0D', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: C.text, outline: 'none' }}
                />
                {[
                  { type: 'follow_up', label: 'Follow-up' },
                  { type: 'reply_received', label: 'Reply' },
                  { type: 'link_sent', label: 'Link Sent' },
                  { type: 'note', label: 'Note' },
                ].map(act => (
                  <Btn key={act.type} onClick={() => { onLogActivity(act.type, actNote || undefined); setActNote('') }}>
                    {act.label}
                  </Btn>
                ))}
              </div>
            </div>

            {/* Timeline */}
            {(activities.length > 0 || loadingActivities) && (
              <div>
                <div style={{ ...labelStyle, marginBottom: 8 }}>Timeline</div>
                {loadingActivities ? (
                  <div style={{ fontSize: 12, color: C.dim }}>Loading...</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {activities.slice(0, 8).map(act => (
                      <div key={act.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, color: C.muted }}>
                        <span style={{ color: C.dim, flexShrink: 0, ...mono, fontSize: 10 }}>{timeAgo(act.created_at)}</span>
                        <span style={{ color: C.muted }}>{act.activity_type.replace(/_/g, ' ')}</span>
                        {act.note && <span style={{ color: C.dim }}>— {act.note}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
              <Btn
                onClick={() => { onUpdate({ status: 'lost', is_archived: false }); setActNote('') }}
                style={{ color: '#666' }}
              >
                Mark Lost
              </Btn>
              <Btn onClick={onDelete} style={{ color: '#555' }}>Delete</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NewContactModal({ onClose, onSave }: {
  onClose: () => void
  onSave: (data: { name: string; channel: string; handle?: string; source?: string; notes?: string; status?: string }) => void
}) {
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [channel, setChannel] = useState('whatsapp')
  const [handle, setHandle] = useState('')
  const [source, setSource] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('prospect')

  async function save() {
    if (!name.trim() || !channel) return
    setSaving(true)
    await onSave({ name: name.trim(), channel, handle: handle.trim() || undefined, source: source.trim() || undefined, notes: notes.trim() || undefined, status })
    setSaving(false)
  }

  const inputStyle: React.CSSProperties = { width: '100%', background: '#0D0D0D', border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px', fontSize: 13, color: C.text, outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 32, width: '100%', maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>New Contact</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.dim, fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><div style={{ ...labelStyle, marginBottom: 6 }}>Name *</div><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="e.g., Maria Santos" /></div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Channel *</div>
              <select value={channel} onChange={e => setChannel(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {Object.entries(CHANNEL_LABELS).filter(([k]) => k !== 'general').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Status</div>
              <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div><div style={{ ...labelStyle, marginBottom: 6 }}>Handle (optional)</div><input value={handle} onChange={e => setHandle(e.target.value)} style={inputStyle} placeholder="@username or phone" /></div>
          <div><div style={{ ...labelStyle, marginBottom: 6 }}>Source (optional)</div><input value={source} onChange={e => setSource(e.target.value)} style={inputStyle} placeholder="e.g., TikTok, VA group, referral" /></div>
          <div><div style={{ ...labelStyle, marginBottom: 6 }}>Notes (optional)</div><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Initial notes..." /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <Btn onClick={onClose} variant="ghost">Cancel</Btn>
          <Btn onClick={save} variant="white" disabled={saving || !name.trim()}>{saving ? 'Saving...' : 'Save & Add'}</Btn>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// LINKS TAB
// ═══════════════════════════════════════════════════════════════
function LinksTab({
  links: initialLinks, migrationNeeded, referralCode,
}: { links: ReferralLink[]; migrationNeeded: boolean; referralCode: string }) {
  const [links, setLinks] = useState<ReferralLink[]>(initialLinks)
  const [showModal, setShowModal] = useState(false)
  const [newChannel, setNewChannel] = useState('whatsapp')
  const [newLabel, setNewLabel] = useState('')
  const [saving, setSaving] = useState(false)

  async function createLink() {
    if (!newChannel) return
    setSaving(true)
    const res = await fetch('/api/genx/toolkit/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: newChannel, label: newLabel || undefined }),
    })
    const data = await res.json()
    if (data.link) {
      setLinks(prev => [...prev, data.link])
      setShowModal(false)
      setNewChannel('whatsapp')
      setNewLabel('')
    }
    setSaving(false)
  }

  if (migrationNeeded) {
    return (
      <div style={{ background: '#1A1400', border: '1px solid #3A2E00', borderRadius: 8, padding: 24, fontSize: 13, color: '#B8A000' }}>
        Links feature requires the V2 migration. Run <code style={mono}>scripts/genx-migrate-v2.sql</code> in Supabase.
      </div>
    )
  }

  const CHANNEL_ABBREVS: Record<string, string> = { facebook: 'fb', instagram: 'ig', whatsapp: 'wa', linkedin: 'li', telegram: 'tg', tiktok: 'tt', email: 'em' }
  const previewCode = `${referralCode}-${CHANNEL_ABBREVS[newChannel] || newChannel.substring(0, 2)}`
  const appUrl = typeof window !== 'undefined' ? window.location.origin.replace('localhost:3000', 'higherup.me') : 'https://higherup.me'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: C.muted }}>{links.length} link{links.length !== 1 ? 's' : ''}</div>
        <Btn variant="white" onClick={() => setShowModal(true)}>+ New Link</Btn>
      </div>

      {links.length === 0 ? (
        <div style={{ textAlign: 'center', color: C.dim, fontSize: 13, padding: '48px 0' }}>
          <div style={{ marginBottom: 12 }}>No custom links yet.</div>
          <div style={{ fontSize: 12, marginBottom: 20 }}>Create channel-specific links to track where your sign-ups come from.</div>
          <Btn variant="white" onClick={() => setShowModal(true)}>+ Create First Link</Btn>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Label', 'Link', 'Clicks', 'Signups', 'Conv%', 'Status'].map(h => (
                  <th key={h} style={{ ...labelStyle, textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {links.map(link => {
                const conv = link.click_count > 0 ? ((link.signup_count / link.click_count) * 100).toFixed(1) : '—'
                return (
                  <tr key={link.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: link.is_active ? 1 : 0.4 }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: C.text }}>
                      {link.label || <span style={{ color: C.dim }}>{CHANNEL_LABELS[link.source] || link.source}</span>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ ...mono, fontSize: 11, color: C.muted, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {link.full_url}
                        </span>
                        <CopyBtn text={link.full_url} />
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', ...mono, fontSize: 12, color: C.muted }}>{link.click_count}</td>
                    <td style={{ padding: '10px 12px', ...mono, fontSize: 12, color: C.muted }}>{link.signup_count}</td>
                    <td style={{ padding: '10px 12px', ...mono, fontSize: 12, color: C.muted }}>{conv}%</td>
                    <td style={{ padding: '10px 12px', fontSize: 11, color: link.is_active ? C.green : C.dim }}>
                      {link.is_active ? 'Active' : 'Inactive'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 32, width: '100%', maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>New Referral Link</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', color: C.dim, fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ ...labelStyle, marginBottom: 6 }}>Channel</div>
                <select value={newChannel} onChange={e => setNewChannel(e.target.value)} style={{ width: '100%', background: '#0D0D0D', border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px', fontSize: 13, color: C.text, outline: 'none', cursor: 'pointer' }}>
                  {Object.entries(CHANNEL_LABELS).filter(([k]) => k !== 'general').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom: 6 }}>Label (optional)</div>
                <input value={newLabel} onChange={e => setNewLabel(e.target.value)} style={{ width: '100%', background: '#0D0D0D', border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px', fontSize: 13, color: C.text, outline: 'none', boxSizing: 'border-box' }} placeholder="e.g., TikTok bio link" />
              </div>
              <div style={{ background: '#0D0D0D', border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ ...labelStyle, marginBottom: 4 }}>Generated link code</div>
                <div style={{ ...mono, fontSize: 12, color: C.green }}>{previewCode}</div>
                <div style={{ ...mono, fontSize: 11, color: C.muted, marginTop: 4 }}>{appUrl}/ref/{previewCode}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
              <Btn onClick={() => setShowModal(false)} variant="ghost">Cancel</Btn>
              <Btn onClick={createLink} variant="white" disabled={saving}>{saving ? 'Creating...' : 'Create'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ASSETS TAB
// ═══════════════════════════════════════════════════════════════
function AssetsTab({ assets, migrationNeeded }: { assets: Asset[]; migrationNeeded: boolean }) {
  if (migrationNeeded || assets.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: C.dim, fontSize: 13, padding: '48px 0' }}>
        No assets yet. Admin will add materials here.
      </div>
    )
  }

  const TYPE_COLORS: Record<string, string> = { pdf: '#FF6B6B', video: '#4ECDC4', doc: '#45B7D1', image: '#96CEB4', link: '#888' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
      {assets.map(asset => (
        <div key={asset.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1 }}>{asset.title}</div>
            <span style={{ fontSize: 10, fontWeight: 600, color: TYPE_COLORS[asset.asset_type] || C.muted, background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4, marginLeft: 8, flexShrink: 0 }}>
              {asset.asset_type.toUpperCase()}
            </span>
          </div>
          {asset.description && <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>{asset.description}</div>}
          {asset.file_url && (
            <a href={asset.file_url} target="_blank" rel="noopener noreferrer">
              <Btn variant="white" style={{ fontSize: 12 }}>
                {asset.asset_type === 'link' ? 'Open Link' : 'Download'}
              </Btn>
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// PLANNER TAB
// ═══════════════════════════════════════════════════════════════
function PlannerTab({ days, signupsThisWeek }: { days: DayData[]; signupsThisWeek: number }) {
  const [data, setData] = useState<DayData[]>(days)
  const TARGET_SIGNUPS = 5

  // Streak: consecutive days where dms_sent >= 1 (counting from today backward)
  const todayIndex = (new Date().getUTCDay() + 6) % 7 // 0=Mon
  let streak = 0
  for (let i = todayIndex; i >= 0; i--) {
    if ((data[i]?.dms_sent || 0) >= 1) streak++
    else break
  }

  function increment(dayIndex: number, field: 'dms_sent' | 'posts_made' | 'followups_sent', delta: 1 | -1) {
    setData(prev => prev.map((d, i) => i === dayIndex ? { ...d, [field]: Math.max(0, (d[field] as number) + delta) } : d))
    fetch('/api/genx/toolkit/weekly', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_of_week: dayIndex, field, increment: delta }),
    }).catch(() => {
      setData(prev => prev.map((d, i) => i === dayIndex ? { ...d, [field]: Math.max(0, (d[field] as number) - delta) } : d))
    })
  }

  const totals = {
    dms:     data.reduce((s, d) => s + d.dms_sent, 0),
    posts:   data.reduce((s, d) => s + d.posts_made, 0),
    follows: data.reduce((s, d) => s + d.followups_sent, 0),
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Target: 5 new VA sign-ups this week</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>10 DMs/day · 1 post/day · 5 follow-ups/day</div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: signupsThisWeek >= TARGET_SIGNUPS ? C.green : C.text }}>
              {signupsThisWeek}<span style={{ fontSize: 14, color: C.dim, fontWeight: 400 }}> / 5</span>
            </div>
            <div style={{ ...labelStyle }}>Sign-ups</div>
          </div>
          {streak > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: streak >= 3 ? C.green : C.text }}>
                {streak}<span style={{ fontSize: 14, color: C.dim, fontWeight: 400 }}> day{streak !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ ...labelStyle }}>DM streak</div>
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
          <thead>
            <tr>
              <td style={{ ...labelStyle, paddingBottom: 8, width: 80 }}></td>
              {DAY_LABELS.map(d => (
                <td key={d} style={{ ...labelStyle, textAlign: 'center', paddingBottom: 8 }}>{d}</td>
              ))}
              <td style={{ ...labelStyle, textAlign: 'center', paddingBottom: 8 }}>Total</td>
            </tr>
          </thead>
          <tbody>
            {([
              { key: 'dms_sent', label: 'DMs', target: 10 },
              { key: 'posts_made', label: 'Posts', target: 1 },
              { key: 'followups_sent', label: 'Follow-ups', target: 5 },
            ] as { key: keyof DayData; label: string; target: number }[]).map(row => (
              <tr key={row.key}>
                <td style={{ fontSize: 12, color: C.muted, paddingBottom: 4 }}>{row.label}</td>
                {data.map((day, i) => (
                  <td key={i} style={{ textAlign: 'center', paddingBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <button
                        onClick={() => increment(i, row.key as 'dms_sent' | 'posts_made' | 'followups_sent', -1)}
                        style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 3, width: 18, height: 18, cursor: 'pointer', color: C.dim, fontSize: 10, lineHeight: 1, padding: 0 }}
                      >−</button>
                      <span style={{ ...mono, fontSize: 12, color: (day[row.key] as number) >= row.target ? C.green : C.muted, minWidth: 16, textAlign: 'center' }}>
                        {day[row.key] as number}
                      </span>
                      <button
                        onClick={() => increment(i, row.key as 'dms_sent' | 'posts_made' | 'followups_sent', 1)}
                        style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 3, width: 18, height: 18, cursor: 'pointer', color: C.muted, fontSize: 10, lineHeight: 1, padding: 0 }}
                      >+</button>
                    </div>
                  </td>
                ))}
                <td style={{ textAlign: 'center' }}>
                  <span style={{ ...mono, fontSize: 12, color: C.muted }}>
                    {totals[row.key === 'dms_sent' ? 'dms' : row.key === 'posts_made' ? 'posts' : 'follows']}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: C.dim, lineHeight: 1.7 }}>
        Math: 70 DMs × 7% = 5 leads × 60% = 3 sign-ups. 5 posts × 2 DMs × 40% = 2 sign-ups. Total ~5/week.
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ANALYTICS TAB
// ═══════════════════════════════════════════════════════════════
function AnalyticsTab({ contacts, weeklyNewContacts }: { contacts: Contact[]; weeklyNewContacts: number }) {
  const total = contacts.length

  if (total === 0) {
    return (
      <div style={{ textAlign: 'center', color: C.dim, fontSize: 13, padding: '48px 0' }}>
        No data yet. Add contacts to the Pipeline to see analytics.
      </div>
    )
  }

  const now = new Date().toISOString()
  const activated = contacts.filter(c => c.status === 'activated').length
  const active = contacts.filter(c => !['lost'].includes(c.status)).length
  const convRate = total > 0 ? ((activated / total) * 100).toFixed(1) : '0.0'
  const followupsDue = contacts.filter(c => c.overdue).length

  // Status counts
  const statusOrder = ['prospect', 'contacted', 'replied', 'interested', 'link_sent', 'signed_up', 'activated', 'lost']
  const statusCounts: Record<string, number> = {}
  for (const c of contacts) statusCounts[c.status] = (statusCounts[c.status] || 0) + 1
  const maxStatusCount = Math.max(...Object.values(statusCounts), 1)

  // Channel data
  const channelData: Record<string, { total: number; activated: number }> = {}
  for (const c of contacts) {
    if (!channelData[c.channel]) channelData[c.channel] = { total: 0, activated: 0 }
    channelData[c.channel].total++
    if (c.status === 'activated') channelData[c.channel].activated++
  }

  // Funnel
  const funnelSteps = [
    { status: 'prospect', label: 'Prospect' },
    { status: 'contacted', label: 'Contacted' },
    { status: 'replied', label: 'Replied' },
    { status: 'interested', label: 'Interested' },
    { status: 'link_sent', label: 'Link Sent' },
    { status: 'signed_up', label: 'Signed Up' },
    { status: 'activated', label: 'Activated' },
  ]
  // Cumulative funnel (everyone at or past this stage)
  const funnelCounts = funnelSteps.map((step, idx) => {
    const laterStatuses = funnelSteps.slice(idx).map(s => s.status)
    return contacts.filter(c => laterStatuses.includes(c.status)).length
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Contacts', value: total },
          { label: 'Active', value: active },
          { label: 'Conversion Rate', value: `${convRate}%` },
          { label: 'Follow-ups Due', value: followupsDue, highlight: followupsDue > 0 },
          { label: 'New This Week', value: weeklyNewContacts },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, minWidth: 120, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.highlight ? C.green : C.text }}>{s.value}</div>
            <div style={{ ...labelStyle, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Status bar chart */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20 }}>
        <div style={{ ...labelStyle, marginBottom: 16 }}>Contacts by Status</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {statusOrder.filter(s => statusCounts[s]).map(s => {
            const count = statusCounts[s] || 0
            const pct = Math.round((count / maxStatusCount) * 100)
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 80, fontSize: 11, color: C.muted, textAlign: 'right', flexShrink: 0 }}>{STATUS_LABELS[s]}</div>
                <div style={{ flex: 1, background: C.border, borderRadius: 3, height: 8 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: STATUS_COLORS[s] || C.muted, borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
                <div style={{ ...mono, fontSize: 11, color: C.muted, width: 24, textAlign: 'right', flexShrink: 0 }}>{count}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Funnel */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20 }}>
        <div style={{ ...labelStyle, marginBottom: 16 }}>Conversion Funnel</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {funnelSteps.map((step, idx) => {
            const count = funnelCounts[idx]
            const pct = funnelCounts[0] > 0 ? Math.round((count / funnelCounts[0]) * 100) : 0
            return (
              <div key={step.status} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 80, fontSize: 11, color: C.muted, textAlign: 'right', flexShrink: 0 }}>{step.label}</div>
                <div style={{ flex: 1, background: C.border, borderRadius: 3, height: 20, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: idx === funnelSteps.length - 1 ? C.green : '#2A2A2A', borderRadius: 3, transition: 'width 0.3s', display: 'flex', alignItems: 'center', paddingLeft: 8, boxSizing: 'border-box' }}>
                    {pct > 10 && <span style={{ ...mono, fontSize: 10, color: idx === funnelSteps.length - 1 ? '#000' : C.muted }}>{pct}%</span>}
                  </div>
                </div>
                <div style={{ ...mono, fontSize: 11, color: C.muted, width: 24, textAlign: 'right', flexShrink: 0 }}>{count}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Channel breakdown */}
      {Object.keys(channelData).length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20 }}>
          <div style={{ ...labelStyle, marginBottom: 16 }}>Contacts by Channel</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(channelData).sort((a, b) => b[1].total - a[1].total).map(([channel, d]) => {
              const conv = d.total > 0 ? ((d.activated / d.total) * 100).toFixed(1) : '0.0'
              return (
                <div key={channel} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: C.surface2, borderRadius: 6 }}>
                  <div style={{ fontSize: 13, color: C.text }}>{CHANNEL_LABELS[channel] || channel}</div>
                  <div style={{ display: 'flex', gap: 20 }}>
                    <div style={{ textAlign: 'right' }}><div style={{ ...mono, fontSize: 12, color: C.muted }}>{d.total}</div><div style={{ fontSize: 10, color: C.dim }}>total</div></div>
                    <div style={{ textAlign: 'right' }}><div style={{ ...mono, fontSize: 12, color: d.activated > 0 ? C.green : C.muted }}>{d.activated}</div><div style={{ fontSize: 10, color: C.dim }}>activated</div></div>
                    <div style={{ textAlign: 'right' }}><div style={{ ...mono, fontSize: 12, color: C.muted }}>{conv}%</div><div style={{ fontSize: 10, color: C.dim }}>conv</div></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20 }}>
        <div style={{ ...labelStyle, marginBottom: 12 }}>Recommendations</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {followupsDue > 0 && (
            <div style={{ fontSize: 13, color: C.text }}>→ You have {followupsDue} overdue follow-up{followupsDue !== 1 ? 's' : ''}. Follow up today — interested contacts go cold fast.</div>
          )}
          {weeklyNewContacts === 0 && (
            <div style={{ fontSize: 13, color: C.muted }}>→ You haven&apos;t added new contacts this week. Aim for at least 10 new prospects per day.</div>
          )}
          {activated === 0 && total >= 10 && (
            <div style={{ fontSize: 13, color: C.muted }}>→ No activations yet. Focus on moving &apos;Interested&apos; contacts to Link Sent and following up within 24 hours.</div>
          )}
          {activated > 0 && (
            <div style={{ fontSize: 13, color: C.green }}>→ {activated} activated VA{activated !== 1 ? 's' : ''}! Keep it up — you&apos;re building momentum.</div>
          )}
          {total > 0 && activated === 0 && total < 10 && (
            <div style={{ fontSize: 13, color: C.muted }}>→ Keep adding contacts. More outreach = more chances. Volume is the game early on.</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function ToolkitClient({
  lgId, referralCode,
  items, myScripts, contacts, links, assets,
  weeklyDays, weekStart, signupsThisWeek,
  contactsMigrationNeeded, linksMigrationNeeded, assetsMigrationNeeded,
}: Props) {
  void lgId; void weekStart
  const [activeTab, setActiveTab] = useState<MainTab>('pipeline')

  const now = new Date().toISOString()
  const weeklyNewContacts = contacts.filter(c => {
    const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    return c.created_at >= sevenAgo
  }).length

  const tabs: { key: MainTab; label: string; count?: number }[] = [
    { key: 'scripts',   label: 'Scripts',   count: items.length },
    { key: 'pipeline',  label: 'Pipeline',  count: contacts.length },
    { key: 'links',     label: 'Links',     count: links.length },
    { key: 'assets',    label: 'Assets',    count: assets.length },
    { key: 'planner',   label: 'Planner' },
    { key: 'analytics', label: 'Analytics' },
  ]

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 0' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>TOOLKIT V2</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 8 }}>Your Arsenal</div>
        <div style={{ fontSize: 13, color: C.muted, maxWidth: 520, lineHeight: 1.6 }}>
          Scripts, pipeline, links, assets, and planner. Everything you need to bring in 5 VAs per week.
        </div>
      </div>

      <SubNav tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'scripts' && (
        <ScriptsTab items={items} myScripts={myScripts} />
      )}
      {activeTab === 'pipeline' && (
        <PipelineTab contacts={contacts} migrationNeeded={contactsMigrationNeeded} />
      )}
      {activeTab === 'links' && (
        <LinksTab links={links} migrationNeeded={linksMigrationNeeded} referralCode={referralCode} />
      )}
      {activeTab === 'assets' && (
        <AssetsTab assets={assets} migrationNeeded={assetsMigrationNeeded} />
      )}
      {activeTab === 'planner' && (
        <PlannerTab days={weeklyDays} signupsThisWeek={signupsThisWeek} />
      )}
      {activeTab === 'analytics' && (
        <AnalyticsTab contacts={contacts} weeklyNewContacts={weeklyNewContacts} />
      )}
    </div>
  )
}
