'use client'
import { useState } from 'react'
import { S, type Prospect, type Community } from '../AdminGenxClient'

const STAGES = [
  { key: 'lead', label: 'Lead', color: '#6B7280' },
  { key: 'contacted', label: 'Contacted', color: '#2563EB' },
  { key: 'interested', label: 'Interested', color: '#7C3AED' },
  { key: 'scheduled', label: 'Scheduled', color: '#EA580C' },
  { key: 'converted', label: 'Converted', color: '#059669' },
  { key: 'lost', label: 'Lost', color: '#DC2626' },
]

const PLATFORMS = ['whatsapp', 'instagram', 'facebook', 'linkedin', 'telegram', 'tiktok', 'other']
const SOURCES = ['manual', 'referral', 'community', 'inbound', 'event']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const ACTIVITY_TYPES = ['call', 'dm', 'email', 'meeting', 'note', 'follow_up']

const PRIORITY_COLORS: Record<string, string> = {
  low: S.textMuted, normal: S.textSecondary, high: S.orange, urgent: S.red,
}

type ProspectActivity = {
  id: string; prospect_id: string; activity_type: string; description: string | null
  old_stage: string | null; new_stage: string | null; created_at: string
}

type Props = {
  prospects: Prospect[]
  communities: Community[]
  onUpdate: (p: Prospect[]) => void
}

export default function ProspectsTab({ prospects, communities, onUpdate }: Props) {
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline')
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activities, setActivities] = useState<ProspectActivity[]>([])
  const [actLoading, setActLoading] = useState(false)

  // Add form state
  const [form, setForm] = useState({ name: '', email: '', phone: '', platform: '', handle: '', source: 'manual', community_id: '', priority: 'normal', notes: '' })

  // Activity form
  const [actForm, setActForm] = useState({ activity_type: 'call', description: '' })

  const filtered = prospects.filter(p => {
    if (filterStage !== 'all' && p.stage !== filterStage) return false
    if (search) {
      const q = search.toLowerCase()
      return p.name.toLowerCase().includes(q) || (p.handle || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q)
    }
    return true
  })

  async function addProspect() {
    if (!form.name.trim()) return
    const res = await fetch('/api/admin/genx/prospects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, community_id: form.community_id || null }),
    })
    if (res.ok) {
      const { prospect } = await res.json()
      onUpdate([prospect, ...prospects])
      setForm({ name: '', email: '', phone: '', platform: '', handle: '', source: 'manual', community_id: '', priority: 'normal', notes: '' })
      setShowAdd(false)
    }
  }

  async function updateStage(prospect: Prospect, newStage: string) {
    const res = await fetch(`/api/admin/genx/prospects/${prospect.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage, old_stage: prospect.stage }),
    })
    if (res.ok) {
      onUpdate(prospects.map(p => p.id === prospect.id ? { ...p, stage: newStage, updated_at: new Date().toISOString() } : p))
    }
  }

  async function updatePriority(prospect: Prospect, priority: string) {
    await fetch(`/api/admin/genx/prospects/${prospect.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority }),
    })
    onUpdate(prospects.map(p => p.id === prospect.id ? { ...p, priority } : p))
  }

  async function setFollowUp(prospect: Prospect, date: string) {
    await fetch(`/api/admin/genx/prospects/${prospect.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ follow_up_date: date || null }),
    })
    onUpdate(prospects.map(p => p.id === prospect.id ? { ...p, follow_up_date: date || null } : p))
  }

  async function deleteProspect(id: string) {
    await fetch(`/api/admin/genx/prospects/${id}`, { method: 'DELETE' })
    onUpdate(prospects.filter(p => p.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  async function loadActivities(prospectId: string) {
    if (expandedId === prospectId) { setExpandedId(null); return }
    setExpandedId(prospectId)
    setActLoading(true)
    const res = await fetch(`/api/admin/genx/prospects/${prospectId}/activity`)
    if (res.ok) {
      const { activities: acts } = await res.json()
      setActivities(acts)
    }
    setActLoading(false)
  }

  async function logActivity(prospectId: string) {
    if (!actForm.description.trim() && !actForm.activity_type) return
    const res = await fetch(`/api/admin/genx/prospects/${prospectId}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actForm),
    })
    if (res.ok) {
      const { activity } = await res.json()
      setActivities([activity, ...activities])
      setActForm({ activity_type: 'call', description: '' })
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            placeholder="Search prospects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 14px', fontSize: 13, width: 240, outline: 'none' }}
          />
          <select
            value={filterStage}
            onChange={e => setFilterStage(e.target.value)}
            style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg, cursor: 'pointer' }}
          >
            <option value="all">All Stages</option>
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
            {(['pipeline', 'list'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 500, border: `1px solid ${S.border}`,
                  borderRadius: v === 'pipeline' ? `${S.radiusSm}px 0 0 ${S.radiusSm}px` : `0 ${S.radiusSm}px ${S.radiusSm}px 0`,
                  background: view === v ? S.accent : S.bg, color: view === v ? '#fff' : S.textSecondary, cursor: 'pointer',
                }}
              >
                {v === 'pipeline' ? 'Pipeline' : 'List'}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{ background: S.accent, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + Add Prospect
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: S.radius, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
            <input placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
            <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
            <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
            <input placeholder="Handle (@...)" value={form.handle} onChange={e => setForm({ ...form, handle: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
            <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg }}>
              <option value="">Platform</option>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg }}>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={form.community_id} onChange={e => setForm({ ...form, community_id: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg }}>
              <option value="">No Community</option>
              {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg }}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <input placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              style={{ flex: 1, border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
            <button onClick={addProspect} style={{ background: S.accent, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Save
            </button>
          </div>
        </div>
      )}

      {/* Pipeline View */}
      {view === 'pipeline' && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STAGES.filter(s => s.key !== 'lost').length}, 1fr)`, gap: 12 }}>
          {STAGES.filter(s => s.key !== 'lost').map(stage => {
            const items = filtered.filter(p => p.stage === stage.key)
            return (
              <div key={stage.key} style={{ background: S.surface, borderRadius: S.radius, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', borderBottom: `2px solid ${stage.color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{stage.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: stage.color, background: `${stage.color}15`, padding: '2px 8px', borderRadius: 10 }}>{items.length}</span>
                </div>
                <div style={{ padding: 8, maxHeight: 500, overflowY: 'auto' }}>
                  {items.map(p => (
                    <div key={p.id} style={{
                      background: S.bg, borderRadius: S.radiusSm, padding: '10px 12px', marginBottom: 8,
                      border: `1px solid ${p.follow_up_date && p.follow_up_date <= today ? '#FBBF24' : S.borderLight}`,
                      cursor: 'pointer',
                    }} onClick={() => loadActivities(p.id)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{p.name}</div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: PRIORITY_COLORS[p.priority], textTransform: 'uppercase' }}>
                          {p.priority !== 'normal' ? p.priority : ''}
                        </span>
                      </div>
                      {p.handle && <div style={{ fontSize: 11, color: S.textMuted, marginTop: 2 }}>{p.handle}</div>}
                      {p.platform && <div style={{ fontSize: 10, color: S.textMuted, marginTop: 2, textTransform: 'uppercase' }}>{p.platform}</div>}
                      {p.follow_up_date && (
                        <div style={{ fontSize: 11, marginTop: 4, color: p.follow_up_date <= today ? S.red : S.textSecondary }}>
                          Follow-up: {p.follow_up_date}
                        </div>
                      )}
                      {/* Stage transition buttons */}
                      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                        {STAGES.filter(s => s.key !== p.stage).map(s => (
                          <button
                            key={s.key}
                            onClick={(e) => { e.stopPropagation(); updateStage(p, s.key) }}
                            style={{
                              fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                              border: `1px solid ${s.color}30`, background: `${s.color}10`, color: s.color, fontWeight: 500,
                            }}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 20, color: S.textMuted, fontSize: 12 }}>Empty</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div style={{ background: S.surface, borderRadius: S.radius, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 80px', padding: '10px 16px', borderBottom: `1px solid ${S.border}`, fontSize: 11, color: S.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>
            <div>Name</div><div>Stage</div><div>Platform</div><div>Priority</div><div>Follow-up</div><div>Source</div><div></div>
          </div>
          {filtered.map(p => (
            <div key={p.id}>
              <div
                onClick={() => loadActivities(p.id)}
                style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 80px', padding: '12px 16px',
                  borderBottom: `1px solid ${S.borderLight}`, cursor: 'pointer', fontSize: 13,
                  background: expandedId === p.id ? S.accentLight : S.bg,
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, color: S.text }}>{p.name}</span>
                  {p.handle && <span style={{ color: S.textMuted, marginLeft: 8, fontSize: 12 }}>{p.handle}</span>}
                </div>
                <div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                    color: STAGES.find(s => s.key === p.stage)?.color,
                    background: `${STAGES.find(s => s.key === p.stage)?.color}15`,
                  }}>{p.stage}</span>
                </div>
                <div style={{ color: S.textSecondary, textTransform: 'capitalize' }}>{p.platform || '-'}</div>
                <div>
                  <select
                    value={p.priority}
                    onClick={e => e.stopPropagation()}
                    onChange={e => updatePriority(p, e.target.value)}
                    style={{ fontSize: 12, border: 'none', background: 'transparent', color: PRIORITY_COLORS[p.priority], fontWeight: 600, cursor: 'pointer' }}
                  >
                    {PRIORITIES.map(pr => <option key={pr} value={pr}>{pr}</option>)}
                  </select>
                </div>
                <div>
                  <input
                    type="date"
                    value={p.follow_up_date || ''}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setFollowUp(p, e.target.value)}
                    style={{
                      fontSize: 12, border: 'none', background: 'transparent', cursor: 'pointer',
                      color: p.follow_up_date && p.follow_up_date <= today ? S.red : S.textSecondary,
                    }}
                  />
                </div>
                <div style={{ color: S.textSecondary, textTransform: 'capitalize', fontSize: 12 }}>{p.source}</div>
                <div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteProspect(p.id) }}
                    style={{ fontSize: 11, color: S.red, background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >Delete</button>
                </div>
              </div>

              {/* Expanded detail */}
              {expandedId === p.id && (
                <div style={{ padding: '16px 20px', background: S.accentLight, borderBottom: `1px solid ${S.border}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    {/* Info + Stage buttons */}
                    <div>
                      <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 8 }}>
                        {p.email && <span>Email: {p.email} · </span>}
                        {p.phone && <span>Phone: {p.phone} · </span>}
                        {p.admin_communities?.name && <span>Community: {p.admin_communities.name}</span>}
                      </div>
                      {p.notes && <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 8 }}>Notes: {p.notes}</div>}
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {STAGES.filter(s => s.key !== p.stage).map(s => (
                          <button key={s.key} onClick={() => updateStage(p, s.key)}
                            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${s.color}40`, background: `${s.color}10`, color: s.color, fontWeight: 500 }}>
                            Move to {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Activity timeline */}
                    <div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <select value={actForm.activity_type} onChange={e => setActForm({ ...actForm, activity_type: e.target.value })}
                          style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '6px 10px', fontSize: 12, background: S.bg }}>
                          {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input placeholder="Description..." value={actForm.description} onChange={e => setActForm({ ...actForm, description: e.target.value })}
                          onKeyDown={e => e.key === 'Enter' && logActivity(p.id)}
                          style={{ flex: 1, border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '6px 10px', fontSize: 12 }} />
                        <button onClick={() => logActivity(p.id)}
                          style={{ background: S.accent, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Log
                        </button>
                      </div>
                      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {actLoading ? <div style={{ fontSize: 12, color: S.textMuted }}>Loading...</div> :
                          activities.length === 0 ? <div style={{ fontSize: 12, color: S.textMuted }}>No activities yet</div> :
                          activities.map(a => (
                            <div key={a.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: `1px solid ${S.borderLight}` }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: S.accent, marginTop: 5, flexShrink: 0 }} />
                              <div>
                                <div style={{ fontSize: 12, color: S.text }}>
                                  <strong>{a.activity_type}</strong>{a.description ? ` — ${a.description}` : ''}
                                </div>
                                <div style={{ fontSize: 10, color: S.textMuted }}>
                                  {new Date(a.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: S.textMuted, fontSize: 13 }}>No prospects found</div>
          )}
        </div>
      )}

      {/* Lost prospects section */}
      {view === 'pipeline' && filtered.some(p => p.stage === 'lost') && (
        <div style={{ marginTop: 20, background: S.surface, borderRadius: S.radius, border: `1px solid ${S.border}`, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: S.red, marginBottom: 12 }}>Lost ({filtered.filter(p => p.stage === 'lost').length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {filtered.filter(p => p.stage === 'lost').map(p => (
              <div key={p.id} style={{ background: S.redLight, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 12, border: `1px solid ${S.red}20` }}>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                {p.lost_reason && <span style={{ color: S.textSecondary, marginLeft: 6 }}>— {p.lost_reason}</span>}
                <button onClick={() => updateStage(p, 'lead')} style={{ marginLeft: 8, fontSize: 10, color: S.accent, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  Reopen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
