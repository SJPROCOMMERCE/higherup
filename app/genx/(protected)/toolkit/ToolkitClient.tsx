'use client'
import { useState, useCallback } from 'react'

// ─── Types ───────────────────────────────────────────────────
type DefaultScript = {
  id: string; category: string; subcategory: string | null; channel: string | null
  title: string; description: string | null; content: string
  attachment_url: string | null; attachment_name: string | null; usage_count: number
}
type CustomScript = {
  id: string; lg_id: string; category: string; channel: string
  title: string; content: string; notes: string | null
  is_modified_from: string | null; times_used: number
  conversion_note: string | null; is_pinned: boolean
  created_at: string
}
type DayData = { day_of_week: number; dms_sent: number; posts_made: number; followups_sent: number }
type Props = {
  items: DefaultScript[]
  myScripts: CustomScript[]
  weeklyDays: DayData[]
  weekStart: string
  signupsThisWeek: number
  lgId: string
  migrationNeeded: boolean
}

// ─── Design tokens ────────────────────────────────────────────
const C = {
  bg:        '#0A0A0A',
  surface:   '#141414',
  surface2:  '#1A1A1A',
  border:    '#1F1F1F',
  border2:   '#2A2A2A',
  text:      '#FFFFFF',
  muted:     '#888888',
  dim:       '#555555',
  accent:    '#FFFFFF',
  green:     '#22C55E',
}
const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', 'Courier New', monospace" }
const label: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }

// ─── Category + subcategory labels ───────────────────────────
const SUBCATEGORY_LABELS: Record<string, string> = {
  first_contact:  'First Contact',
  follow_up:      'Follow Up',
  va_onboarding:  'VA Onboarding',
  reengagement:   'Re-engagement',
  objections:     'Objections & FAQ',
  community_post: 'Community Posts',
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
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ─── Tiny reusable button ────────────────────────────────────
function Btn({
  children, onClick, variant = 'default', style,
}: {
  children: React.ReactNode; onClick?: () => void
  variant?: 'default' | 'green' | 'white' | 'ghost'
  style?: React.CSSProperties
}) {
  const base: React.CSSProperties = {
    border: 'none', borderRadius: 4, padding: '6px 12px',
    fontSize: 11, fontWeight: 500, cursor: 'pointer',
    transition: 'opacity 0.15s', ...style,
  }
  const vars: Record<string, React.CSSProperties> = {
    default: { background: C.surface2, color: C.muted, border: `1px solid ${C.border2}` },
    green:   { background: C.green, color: '#000' },
    white:   { background: C.text, color: '#000' },
    ghost:   { background: 'transparent', color: C.dim, border: `1px solid ${C.border}` },
  }
  return <button onClick={onClick} style={{ ...base, ...vars[variant] }}>{children}</button>
}

// ─── Script Card (default toolkit) ───────────────────────────
function DefaultCard({ item, onCopy, onCustomize }: {
  item: DefaultScript
  onCopy: (item: DefaultScript) => void
  onCustomize: (item: DefaultScript) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const channelLabel = CHANNEL_LABELS[item.channel || 'general'] || item.channel || 'General'
  const subLabel = SUBCATEGORY_LABELS[item.subcategory || ''] || item.subcategory || ''

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Top row: labels + actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {subLabel && <span style={{ ...label }}>{subLabel}</span>}
            {item.channel && item.channel !== 'general' && (
              <span style={{ ...label, color: '#444' }}>· {channelLabel}</span>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.title}</div>
          {item.description && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{item.description}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <CopyBtn onCopy={() => onCopy(item)} />
          <Btn onClick={() => onCustomize(item)}>Customize</Btn>
        </div>
      </div>

      {/* Expandable content */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ cursor: 'pointer', fontSize: 12, color: C.muted }}
      >
        {expanded ? (
          <pre style={{
            ...mono, fontSize: 12, color: C.muted, whiteSpace: 'pre-wrap', lineHeight: 1.65,
            background: '#0D0D0D', border: `1px solid ${C.border}`, borderRadius: 6,
            padding: 14, margin: 0,
          }}>{item.content}</pre>
        ) : (
          <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {item.content.split('\n')[0]}
          </div>
        )}
        <div style={{ ...label, marginTop: 6 }}>{expanded ? '▲ hide' : '▼ show full'}</div>
      </div>

      {item.usage_count > 0 && (
        <div style={{ ...mono, fontSize: 11, color: C.dim }}>Used {item.usage_count}×</div>
      )}
    </div>
  )
}

// ─── Copy button with "Copied" flash ─────────────────────────
function CopyBtn({ onCopy }: { onCopy: () => void }) {
  const [copied, setCopied] = useState(false)
  function handleClick() {
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handleClick} style={{
      background: copied ? C.green : C.surface2,
      color: copied ? '#000' : C.muted,
      border: `1px solid ${copied ? C.green : C.border2}`,
      borderRadius: 4, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    }}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ─── Custom Script Card ───────────────────────────────────────
function CustomCard({ script, onCopy, onEdit, onDelete, onPin }: {
  script: CustomScript
  onCopy: (s: CustomScript) => void
  onEdit: (s: CustomScript) => void
  onDelete: (id: string) => void
  onPin: (s: CustomScript) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const subLabel = SUBCATEGORY_LABELS[script.category] || script.category
  const channelLabel = CHANNEL_LABELS[script.channel] || script.channel

  return (
    <div style={{
      background: C.surface, border: `1px solid ${script.is_pinned ? C.border2 : C.border}`,
      borderRadius: 8, padding: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <span style={{ ...label }}>{subLabel}</span>
            {script.channel !== 'general' && <span style={{ ...label, color: '#444' }}>· {channelLabel}</span>}
            {script.is_modified_from && <span style={{ ...label, color: '#444' }}>· Customized</span>}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{script.title}</div>
          {script.notes && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{script.notes}</div>}
        </div>
        <button
          onClick={() => onPin(script)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, color: script.is_pinned ? C.text : C.dim, padding: '2px 6px' }}
          title={script.is_pinned ? 'Unpin' : 'Pin to top'}
        >
          {script.is_pinned ? '📌' : '⬜'}
        </button>
      </div>

      <div
        onClick={() => setExpanded(e => !e)}
        style={{ margin: '10px 0', cursor: 'pointer' }}
      >
        {expanded ? (
          <pre style={{
            ...mono, fontSize: 12, color: C.muted, whiteSpace: 'pre-wrap', lineHeight: 1.65,
            background: '#0D0D0D', border: `1px solid ${C.border}`, borderRadius: 6,
            padding: 14, margin: 0,
          }}>{script.content}</pre>
        ) : (
          <div style={{ fontSize: 12, color: C.muted, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {script.content.split('\n')[0]}
          </div>
        )}
        <div style={{ ...label, marginTop: 6 }}>{expanded ? '▲ hide' : '▼ show full'}</div>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <CopyBtn onCopy={() => onCopy(script)} />
        <Btn onClick={() => onEdit(script)}>Edit</Btn>
        <Btn onClick={() => onDelete(script.id)} style={{ color: '#666' }}>Delete</Btn>
        {script.times_used > 0 && (
          <span style={{ ...mono, fontSize: 11, color: C.dim, marginLeft: 6 }}>Used {script.times_used}×</span>
        )}
      </div>
    </div>
  )
}

// ─── Weekly Planner ───────────────────────────────────────────
function WeeklyPlanner({
  days, signupsThisWeek, lgId,
}: {
  days: DayData[]; signupsThisWeek: number; lgId: string
}) {
  const [data, setData] = useState<DayData[]>(days)
  const TARGET_SIGNUPS = 5

  async function increment(dayIndex: number, field: 'dms_sent' | 'posts_made' | 'followups_sent', delta: 1 | -1) {
    const res = await fetch('/api/genx/toolkit/weekly', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_of_week: dayIndex, field, increment: delta }),
    })
    if (res.ok) {
      const { new_value } = await res.json()
      setData(prev => prev.map((d, i) => i === dayIndex ? { ...d, [field]: new_value } : d))
    }
  }

  const totals = {
    dms:     data.reduce((s, d) => s + d.dms_sent, 0),
    posts:   data.reduce((s, d) => s + d.posts_made, 0),
    follows: data.reduce((s, d) => s + d.followups_sent, 0),
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, marginTop: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Weekly Outreach Plan</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Target: 5 new VA sign-ups</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: signupsThisWeek >= TARGET_SIGNUPS ? C.green : C.text }}>
            {signupsThisWeek}<span style={{ fontSize: 14, color: C.dim, fontWeight: 400 }}> / 5</span>
          </div>
          <div style={{ ...label }}>Sign-ups this week</div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
          <thead>
            <tr>
              <td style={{ ...label, paddingBottom: 8, width: 80 }}></td>
              {DAY_LABELS.map(d => (
                <td key={d} style={{ ...label, textAlign: 'center', paddingBottom: 8 }}>{d}</td>
              ))}
              <td style={{ ...label, textAlign: 'center', paddingBottom: 8 }}>Total</td>
            </tr>
          </thead>
          <tbody>
            {([
              { key: 'dms_sent',       label: 'DMs',        target: 10 },
              { key: 'posts_made',     label: 'Posts',      target: 1  },
              { key: 'followups_sent', label: 'Follow-ups', target: 5  },
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
                  <span style={{ ...mono, fontSize: 12, color: C.muted }}>{totals[row.key === 'dms_sent' ? 'dms' : row.key === 'posts_made' ? 'posts' : 'follows']}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: C.dim, lineHeight: 1.7 }}>
        Target: 10 DMs/day · 1 post/day · 5 follow-ups/day.
        Math: 70 DMs × 7% = 5 leads × 60% = 3 sign-ups. 5 posts × 2 DMs × 40% = 2 sign-ups. Total ~5/week.
      </div>
    </div>
  )
}

// ─── Script Form Modal (create + edit) ───────────────────────
type FormState = {
  mode: 'new' | 'edit'
  script?: CustomScript
}
function ScriptModal({ form, onClose, onSave }: {
  form: FormState
  onClose: () => void
  onSave: (script: CustomScript) => void
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
      const url = isEdit
        ? `/api/genx/toolkit/my-scripts/${form.script!.id}`
        : '/api/genx/toolkit/my-scripts'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, category, channel, notes }),
      })
      const data = await res.json()
      if (data.script) onSave(data.script)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#0D0D0D', border: `1px solid ${C.border}`,
    borderRadius: 6, padding: '10px 12px', fontSize: 13, color: C.text,
    outline: 'none', boxSizing: 'border-box',
  }
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20,
    }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 32, width: '100%', maxWidth: 540 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
            {form.mode === 'new' ? 'New Script' : 'Edit Script'}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.dim, fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ ...label, marginBottom: 6 }}>Title *</div>
            <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder="e.g., My follow-up for PH VAs" />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...label, marginBottom: 6 }}>Category</div>
              <select value={category} onChange={e => setCategory(e.target.value)} style={selectStyle}>
                {Object.entries(SUBCATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ ...label, marginBottom: 6 }}>Channel</div>
              <select value={channel} onChange={e => setChannel(e.target.value)} style={selectStyle}>
                {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div style={{ ...label, marginBottom: 6 }}>Script Content *</div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={7}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.65, fontFamily: 'inherit' }}
              placeholder="Write your script here..."
            />
          </div>

          <div>
            <div style={{ ...label, marginBottom: 6 }}>Notes (when does this work best?)</div>
            <input value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle} placeholder="e.g., Works great in PH VA groups on weekends" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <Btn onClick={onClose} variant="ghost">Cancel</Btn>
          <Btn onClick={save} variant="white" style={{ opacity: saving || !title.trim() || !content.trim() ? 0.5 : 1 }}>
            {saving ? 'Saving...' : 'Save Script'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────
export default function ToolkitClient({
  items, myScripts: initialMyScripts, weeklyDays, weekStart,
  signupsThisWeek, lgId, migrationNeeded,
}: Props) {
  const [activeTab, setActiveTab] = useState<'default' | 'mine'>('default')
  const [myScripts, setMyScripts] = useState<CustomScript[]>(initialMyScripts)
  const [modal, setModal] = useState<FormState | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterChannel, setFilterChannel] = useState<string>('all')

  // Default scripts: categories found in data
  const categories = [...new Set(items.map(i => i.category))].filter(Boolean)
  const channels   = [...new Set(items.map(i => i.channel || 'general'))].filter(c => c !== 'general')

  const filteredItems = items.filter(item => {
    if (filterCategory !== 'all' && item.category !== filterCategory) return false
    if (filterChannel !== 'all' && (item.channel || 'general') !== filterChannel) return false
    return true
  })

  // Group by subcategory
  const grouped: Record<string, DefaultScript[]> = {}
  for (const item of filteredItems) {
    const sub = item.subcategory || 'general'
    if (!grouped[sub]) grouped[sub] = []
    grouped[sub].push(item)
  }

  // Copy handler for default scripts
  async function copyDefault(item: DefaultScript) {
    await navigator.clipboard.writeText(item.content).catch(() => {})
    fetch(`/api/genx/toolkit/${item.id}/copy`, { method: 'POST' }).catch(() => {})
  }

  // Customize: create copy in My Scripts
  async function customizeDefault(item: DefaultScript) {
    const res = await fetch(`/api/genx/toolkit/customize/${item.id}`, { method: 'POST' })
    const data = await res.json()
    if (data.script) {
      if (!data.already_exists) {
        setMyScripts(prev => [data.script, ...prev])
      }
      setActiveTab('mine')
    }
  }

  // Copy custom script
  async function copyCustom(script: CustomScript) {
    await navigator.clipboard.writeText(script.content).catch(() => {})
    fetch(`/api/genx/toolkit/my-scripts/${script.id}/copy`, { method: 'POST' }).catch(() => {})
  }

  // Save from modal
  function handleSave(saved: CustomScript) {
    const isEdit = modal?.mode === 'edit'
    if (isEdit) {
      setMyScripts(prev => prev.map(s => s.id === saved.id ? saved : s))
    } else {
      setMyScripts(prev => [saved, ...prev])
    }
    setModal(null)
  }

  // Delete
  async function handleDelete(id: string) {
    if (!confirm('Delete this script?')) return
    await fetch(`/api/genx/toolkit/my-scripts/${id}`, { method: 'DELETE' })
    setMyScripts(prev => prev.filter(s => s.id !== id))
  }

  // Pin
  async function handlePin(script: CustomScript) {
    const res = await fetch(`/api/genx/toolkit/my-scripts/${script.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_pinned: !script.is_pinned }),
    })
    const data = await res.json()
    if (data.script) {
      setMyScripts(prev => prev.map(s => s.id === script.id ? data.script : s))
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', fontSize: 12, fontWeight: 600,
    background: active ? C.text : 'transparent',
    color: active ? '#000' : C.muted,
    border: `1px solid ${active ? C.text : C.border}`,
    borderRadius: 6, cursor: 'pointer',
    letterSpacing: '0.03em',
  })

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 0' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ ...label, marginBottom: 8 }}>TOOLKIT</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 8 }}>
          Your Arsenal
        </div>
        <div style={{ fontSize: 13, color: C.muted, maxWidth: 520, lineHeight: 1.6 }}>
          Everything you need to bring in 5 VAs per week. Copy our scripts or write your own.
          Track what works. The system is here. The only variable is you.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button onClick={() => setActiveTab('default')} style={tabStyle(activeTab === 'default')}>
          HigherUp Scripts <span style={{ opacity: 0.6, fontWeight: 400 }}>({items.length})</span>
        </button>
        <button onClick={() => setActiveTab('mine')} style={tabStyle(activeTab === 'mine')}>
          My Scripts <span style={{ opacity: 0.6, fontWeight: 400 }}>({myScripts.length})</span>
        </button>
      </div>

      {/* ─── DEFAULT SCRIPTS TAB ─────────────────────────── */}
      {activeTab === 'default' && (
        <>
          {/* Filters */}
          {(categories.length > 1 || channels.length > 0) && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 12px', fontSize: 12, color: C.muted, cursor: 'pointer', outline: 'none' }}
              >
                <option value="all">All categories</option>
                {categories.map(c => (
                  <option key={c} value={c}>
                    {c === 'script' ? 'Scripts' : c === 'faq' ? 'FAQ' : c}
                  </option>
                ))}
              </select>

              {channels.length > 0 && (
                <select
                  value={filterChannel}
                  onChange={e => setFilterChannel(e.target.value)}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 12px', fontSize: 12, color: C.muted, cursor: 'pointer', outline: 'none' }}
                >
                  <option value="all">All channels</option>
                  {channels.map(c => (
                    <option key={c} value={c}>{CHANNEL_LABELS[c] || c}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.dim, fontSize: 13, padding: '48px 0' }}>
              No scripts found.
              {migrationNeeded && (
                <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
                  Run <code style={mono}>scripts/genx-migrate.sql</code> in Supabase SQL Editor to seed 30 scripts.
                </div>
              )}
            </div>
          ) : (
            Object.entries(grouped).map(([subcat, subItems]) => (
              <div key={subcat} style={{ marginBottom: 28 }}>
                <div style={{ ...label, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
                  {SUBCATEGORY_LABELS[subcat] || subcat.replace(/_/g, ' ')}
                  <span style={{ color: '#333', marginLeft: 8 }}>({subItems.length})</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
                  {subItems.map(item => (
                    <DefaultCard
                      key={item.id}
                      item={item}
                      onCopy={copyDefault}
                      onCustomize={customizeDefault}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* ─── MY SCRIPTS TAB ──────────────────────────────── */}
      {activeTab === 'mine' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: C.muted }}>
              {myScripts.length === 0 ? 'No custom scripts yet.' : `${myScripts.length} script${myScripts.length !== 1 ? 's' : ''}`}
            </div>
            <Btn variant="white" onClick={() => setModal({ mode: 'new' })}>+ New Script</Btn>
          </div>

          {migrationNeeded && myScripts.length === 0 && (
            <div style={{ background: '#1A1400', border: '1px solid #3A2E00', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 12, color: '#B8A000' }}>
              Run <code style={mono}>scripts/genx-migrate.sql</code> in Supabase SQL Editor to enable custom scripts.
            </div>
          )}

          {myScripts.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
              {myScripts.map(script => (
                <CustomCard
                  key={script.id}
                  script={script}
                  onCopy={copyCustom}
                  onEdit={s => setModal({ mode: 'edit', script: s })}
                  onDelete={handleDelete}
                  onPin={handlePin}
                />
              ))}
            </div>
          ) : (
            !migrationNeeded && (
              <div style={{ textAlign: 'center', color: C.dim, fontSize: 13, padding: '48px 0' }}>
                <div style={{ marginBottom: 12 }}>No custom scripts yet.</div>
                <div style={{ marginBottom: 20, fontSize: 12 }}>
                  Customize a default script or write your own from scratch.
                </div>
                <Btn variant="white" onClick={() => setModal({ mode: 'new' })}>+ Write Your First Script</Btn>
              </div>
            )
          )}
        </>
      )}

      {/* ─── WEEKLY PLANNER ──────────────────────────────── */}
      {!migrationNeeded ? (
        <WeeklyPlanner
          days={weeklyDays}
          signupsThisWeek={signupsThisWeek}
          lgId={lgId}
        />
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, marginTop: 32, opacity: 0.4 }}>
          <div style={{ ...label, marginBottom: 8 }}>Weekly Planner</div>
          <div style={{ fontSize: 13, color: C.dim }}>
            Unlocks after running the migration. Run <code style={mono}>scripts/genx-migrate.sql</code> in Supabase.
          </div>
        </div>
      )}

      {/* Modal */}
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
