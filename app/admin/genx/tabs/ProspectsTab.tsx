'use client'
import { useState } from 'react'
import { S, PIPELINE_STAGES, TERMINAL_STAGES, ALL_STAGES, type Prospect, type Community } from '../shared'

const SOURCES = ['manual', 'referral', 'community', 'inbound', 'event', 'facebook', 'whatsapp', 'linkedin', 'onlinejobs']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const ACTIVITY_TYPES = ['call', 'dm', 'email', 'meeting', 'note', 'follow_up']
const CHANNELS = ['whatsapp', 'facebook', 'instagram', 'linkedin', 'email', 'phone', 'telegram', 'other']
const SENDERS = ['safouane', 'joep']

const PRIORITY_COLORS: Record<string, string> = {
  low: S.textMuted, normal: S.textSecondary, high: S.orange, urgent: S.red,
}

type ProspectActivity = {
  id: string; prospect_id: string; activity_type: string; description: string | null
  old_stage: string | null; new_stage: string | null; created_at: string
  direction: string | null; sender: string | null; channel_used: string | null
  response_time_minutes: number | null
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

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

  const [form, setForm] = useState({ name: '', email: '', phone: '', platform: '', handle: '', source: 'manual', community_id: '', priority: 'normal', notes: '' })
  const [actForm, setActForm] = useState({ activity_type: 'call', description: '', direction: '' as '' | 'inbound' | 'outbound', channel_used: '', sender: '' })

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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage, old_stage: prospect.stage }),
    })
    if (res.ok) {
      onUpdate(prospects.map(p => p.id === prospect.id ? { ...p, stage: newStage, updated_at: new Date().toISOString() } : p))
    }
  }

  async function updatePriority(prospect: Prospect, priority: string) {
    await fetch(`/api/admin/genx/prospects/${prospect.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority }),
    })
    onUpdate(prospects.map(p => p.id === prospect.id ? { ...p, priority } : p))
  }

  async function setFollowUp(prospect: Prospect, date: string) {
    await fetch(`/api/admin/genx/prospects/${prospect.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ follow_up_date: date || null }),
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
    const payload: Record<string, string> = {
      activity_type: actForm.activity_type,
      description: actForm.description,
    }
    if (actForm.direction) payload.direction = actForm.direction
    if (actForm.channel_used) payload.channel_used = actForm.channel_used
    if (actForm.sender) payload.sender = actForm.sender
    const res = await fetch(`/api/admin/genx/prospects/${prospectId}/activity`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    if (res.ok) {
      const { activity } = await res.json()
      setActivities([activity, ...activities])
      setActForm({ activity_type: 'call', description: '', direction: '', channel_used: '', sender: '' })
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input placeholder="Search prospects..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 14px', fontSize: 13, width: 220, outline: 'none' }} />
          <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
            style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg }}>
            <option value="all">All Stages</option>
            {ALL_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
            {(['pipeline', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 500, border: `1px solid ${S.border}`,
                  borderRadius: v === 'pipeline' ? `${S.radiusSm}px 0 0 ${S.radiusSm}px` : `0 ${S.radiusSm}px ${S.radiusSm}px 0`,
                  background: view === v ? S.accent : S.bg, color: view === v ? '#fff' : S.textSecondary, cursor: 'pointer',
                }}>
                {v === 'pipeline' ? 'Pipeline' : 'List'}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          style={{ background: S.accent, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
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
            <input placeholder="Platform" value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <input placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              style={{ flex: 1, border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
            <button onClick={addProspect} style={{ background: S.accent, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save</button>
          </div>
        </div>
      )}

      {/* Pipeline View — Drag & Drop Kanban (horizontally scrollable) */}
      {view === 'pipeline' && (
        <div style={{ overflowX: 'auto', paddingBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, minWidth: PIPELINE_STAGES.length * 185 }}>
            {PIPELINE_STAGES.map(stage => {
              const items = filtered.filter(p => p.stage === stage.key)
              const isOver = dragOverStage === stage.key
              return (
                <div key={stage.key}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                  onDragEnter={e => { e.preventDefault(); setDragOverStage(stage.key) }}
                  onDragLeave={e => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) setDragOverStage(null)
                  }}
                  onDrop={e => {
                    e.preventDefault(); setDragOverStage(null)
                    const pid = e.dataTransfer.getData('text/plain')
                    const prospect = prospects.find(p => p.id === pid)
                    if (prospect && prospect.stage !== stage.key) updateStage(prospect, stage.key)
                    setDraggingId(null)
                  }}
                  style={{
                    width: 180, minWidth: 180, flexShrink: 0,
                    background: isOver ? `${stage.color}08` : S.surface,
                    borderRadius: S.radius, border: isOver ? `2px solid ${stage.color}` : `1px solid ${S.border}`,
                    transition: 'border 0.15s, background 0.15s', minHeight: 200,
                  }}>
                  <div style={{ padding: '10px 12px', borderBottom: `2px solid ${stage.color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: S.text }}>{stage.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: stage.color, background: `${stage.color}15`, padding: '1px 6px', borderRadius: 8 }}>{items.length}</span>
                  </div>
                  <div style={{ padding: 6, maxHeight: 500, overflowY: 'auto' }}>
                    {items.map(p => (
                      <div key={p.id} draggable
                        onDragStart={e => { setDraggingId(p.id); e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move' }}
                        onDragEnd={() => { setDraggingId(null); setDragOverStage(null) }}
                        onClick={() => loadActivities(p.id)}
                        style={{
                          background: S.bg, borderRadius: S.radiusSm, padding: '8px 10px', marginBottom: 6,
                          border: `1px solid ${p.follow_up_date && p.follow_up_date <= today ? '#FBBF24' : S.borderLight}`,
                          cursor: 'grab', opacity: draggingId === p.id ? 0.4 : 1, transition: 'opacity 0.15s',
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: S.text }}>{p.name}</div>
                          {p.priority !== 'normal' && <span style={{ fontSize: 9, fontWeight: 600, color: PRIORITY_COLORS[p.priority], textTransform: 'uppercase' }}>{p.priority}</span>}
                        </div>
                        {p.handle && <div style={{ fontSize: 10, color: S.textMuted, marginTop: 1 }}>{p.handle}</div>}
                        {p.source && <div style={{ fontSize: 9, color: S.textMuted, marginTop: 1, textTransform: 'uppercase' }}>{p.source}</div>}
                        {p.follow_up_date && (
                          <div style={{ fontSize: 10, marginTop: 3, color: p.follow_up_date <= today ? S.red : S.textSecondary }}>
                            FU: {p.follow_up_date}
                          </div>
                        )}
                      </div>
                    ))}
                    {items.length === 0 && (
                      <div style={{
                        textAlign: 'center', padding: isOver ? 24 : 16, color: isOver ? stage.color : S.textMuted,
                        fontSize: 11, fontWeight: isOver ? 600 : 400,
                        border: isOver ? `2px dashed ${stage.color}40` : '2px dashed transparent',
                        borderRadius: S.radiusSm, transition: 'all 0.15s',
                      }}>
                        {isOver ? `Drop → ${stage.label}` : 'Empty'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Terminal stages row */}
          {filtered.some(p => TERMINAL_STAGES.some(t => t.key === p.stage)) && (
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              {TERMINAL_STAGES.map(ts => {
                const items = filtered.filter(p => p.stage === ts.key)
                if (items.length === 0) return null
                return (
                  <div key={ts.key}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                    onDragEnter={e => { e.preventDefault(); setDragOverStage(ts.key) }}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={e => {
                      e.preventDefault(); setDragOverStage(null)
                      const pid = e.dataTransfer.getData('text/plain')
                      const prospect = prospects.find(p => p.id === pid)
                      if (prospect && prospect.stage !== ts.key) updateStage(prospect, ts.key)
                      setDraggingId(null)
                    }}
                    style={{
                      flex: 1, background: `${ts.color}08`, borderRadius: S.radius, padding: 14,
                      border: dragOverStage === ts.key ? `2px solid ${ts.color}` : `1px solid ${ts.color}30`,
                    }}>
                    <h4 style={{ fontSize: 12, fontWeight: 600, color: ts.color, marginBottom: 8 }}>{ts.label} ({items.length})</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {items.map(p => (
                        <div key={p.id} draggable
                          onDragStart={e => { setDraggingId(p.id); e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move' }}
                          onDragEnd={() => { setDraggingId(null); setDragOverStage(null) }}
                          style={{ background: S.bg, borderRadius: S.radiusSm, padding: '6px 10px', fontSize: 11, border: `1px solid ${ts.color}20`, cursor: 'grab' }}>
                          <span style={{ fontWeight: 600 }}>{p.name}</span>
                          {p.lost_reason && <span style={{ color: S.textMuted, marginLeft: 4 }}>— {p.lost_reason}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div style={{ background: S.surface, borderRadius: S.radius, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 60px', padding: '10px 16px', borderBottom: `1px solid ${S.border}`, fontSize: 11, color: S.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>
            <div>Name</div><div>Stage</div><div>Source</div><div>Priority</div><div>Follow-up</div><div>Added</div><div></div>
          </div>
          {filtered.map(p => {
            const stageInfo = ALL_STAGES.find(s => s.key === p.stage)
            return (
              <div key={p.id}>
                <div onClick={() => loadActivities(p.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 60px', padding: '12px 16px',
                    borderBottom: `1px solid ${S.borderLight}`, cursor: 'pointer', fontSize: 13,
                    background: expandedId === p.id ? S.accentLight : S.bg,
                  }}>
                  <div>
                    <span style={{ fontWeight: 600, color: S.text }}>{p.name}</span>
                    {p.handle && <span style={{ color: S.textMuted, marginLeft: 8, fontSize: 12 }}>{p.handle}</span>}
                  </div>
                  <div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                      color: stageInfo?.color || S.textMuted, background: `${stageInfo?.color || S.textMuted}15`,
                    }}>{stageInfo?.label || p.stage}</span>
                  </div>
                  <div style={{ color: S.textSecondary, textTransform: 'capitalize', fontSize: 12 }}>{p.source}</div>
                  <div>
                    <select value={p.priority} onClick={e => e.stopPropagation()} onChange={e => updatePriority(p, e.target.value)}
                      style={{ fontSize: 12, border: 'none', background: 'transparent', color: PRIORITY_COLORS[p.priority], fontWeight: 600, cursor: 'pointer' }}>
                      {PRIORITIES.map(pr => <option key={pr} value={pr}>{pr}</option>)}
                    </select>
                  </div>
                  <div>
                    <input type="date" value={p.follow_up_date || ''} onClick={e => e.stopPropagation()} onChange={e => setFollowUp(p, e.target.value)}
                      style={{ fontSize: 12, border: 'none', background: 'transparent', cursor: 'pointer', color: p.follow_up_date && p.follow_up_date <= today ? S.red : S.textSecondary }} />
                  </div>
                  <div style={{ fontSize: 11, color: S.textMuted }}>{new Date(p.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</div>
                  <div>
                    <button onClick={e => { e.stopPropagation(); deleteProspect(p.id) }}
                      style={{ fontSize: 11, color: S.red, background: 'transparent', border: 'none', cursor: 'pointer' }}>Del</button>
                  </div>
                </div>

                {/* Expanded detail */}
                {expandedId === p.id && (
                  <div style={{ padding: '16px 20px', background: S.accentLight, borderBottom: `1px solid ${S.border}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                      <div>
                        <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 8 }}>
                          {p.email && <span>Email: {p.email} · </span>}
                          {p.phone && <span>Phone: {p.phone} · </span>}
                          {p.platform && <span>Platform: {p.platform}</span>}
                        </div>
                        {p.notes && <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 8 }}>Notes: {p.notes}</div>}
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {[...PIPELINE_STAGES, ...TERMINAL_STAGES].filter(s => s.key !== p.stage).map(s => (
                            <button key={s.key} onClick={() => updateStage(p, s.key)}
                              style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${s.color}30`, background: `${s.color}10`, color: s.color, fontWeight: 500 }}>
                              → {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        {/* Response speed inline */}
                        {p.has_unreplied && p.last_replied_at && (
                          <div style={{
                            background: S.redLight, border: '1px solid #FECACA', borderRadius: S.radiusSm,
                            padding: '6px 12px', marginBottom: 10, fontSize: 12, color: S.red, fontWeight: 600,
                          }}>
                            ⚠ Waiting for response since {new Date(p.last_replied_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                        {p.last_response_time_minutes != null && !p.has_unreplied && (
                          <div style={{ fontSize: 11, color: S.textSecondary, marginBottom: 8 }}>
                            Last response time: <strong style={{
                              color: p.last_response_time_minutes <= 5 ? S.green : p.last_response_time_minutes <= 60 ? S.yellow : S.red,
                            }}>
                              {p.last_response_time_minutes < 60 ? `${p.last_response_time_minutes}m` : `${(p.last_response_time_minutes / 60).toFixed(1)}h`}
                            </strong>
                          </div>
                        )}

                        {/* Activity form with direction */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <div style={{ display: 'flex', gap: 2 }}>
                            {([['', 'Any'], ['inbound', '← In'], ['outbound', '→ Out']] as const).map(([val, label]) => (
                              <button key={val} onClick={() => setActForm({ ...actForm, direction: val as '' | 'inbound' | 'outbound' })}
                                style={{
                                  padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                                  border: `1px solid ${actForm.direction === val ? (val === 'inbound' ? S.orange : val === 'outbound' ? S.accent : S.border) : S.border}`,
                                  borderRadius: S.radiusSm,
                                  background: actForm.direction === val ? (val === 'inbound' ? S.orangeLight : val === 'outbound' ? S.accentLight : S.surface) : S.bg,
                                  color: actForm.direction === val ? (val === 'inbound' ? S.orange : val === 'outbound' ? S.accent : S.text) : S.textSecondary,
                                }}>
                                {label}
                              </button>
                            ))}
                          </div>
                          <select value={actForm.activity_type} onChange={e => setActForm({ ...actForm, activity_type: e.target.value })}
                            style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '4px 8px', fontSize: 11, background: S.bg }}>
                            {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <select value={actForm.channel_used} onChange={e => setActForm({ ...actForm, channel_used: e.target.value })}
                            style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '4px 8px', fontSize: 11, background: S.bg, width: 90 }}>
                            <option value="">Channel</option>
                            {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <select value={actForm.sender} onChange={e => setActForm({ ...actForm, sender: e.target.value })}
                            style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '4px 8px', fontSize: 11, background: S.bg, width: 80 }}>
                            <option value="">By</option>
                            {SENDERS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                          <input placeholder="Description..." value={actForm.description} onChange={e => setActForm({ ...actForm, description: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && logActivity(p.id)}
                            style={{ flex: 1, border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '6px 10px', fontSize: 12 }} />
                          <button onClick={() => logActivity(p.id)}
                            style={{ background: S.accent, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Log</button>
                        </div>

                        {/* Activity timeline with speed indicators */}
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                          {actLoading ? <div style={{ fontSize: 12, color: S.textMuted }}>Loading...</div> :
                            activities.length === 0 ? <div style={{ fontSize: 12, color: S.textMuted }}>No activities yet</div> :
                            activities.map(a => (
                              <div key={a.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: `1px solid ${S.borderLight}` }}>
                                <div style={{
                                  width: 6, height: 6, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                                  background: a.direction === 'inbound' ? S.orange : a.direction === 'outbound' ? S.accent : S.textMuted,
                                }} />
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 12, color: S.text }}>
                                    {a.direction === 'inbound' && <span style={{ color: S.orange, fontWeight: 600, fontSize: 10, marginRight: 4 }}>← IN</span>}
                                    {a.direction === 'outbound' && <span style={{ color: S.accent, fontWeight: 600, fontSize: 10, marginRight: 4 }}>→ OUT</span>}
                                    <strong>{a.activity_type}</strong>
                                    {a.description ? ` — ${a.description}` : ''}
                                    {a.response_time_minutes != null && (
                                      <span style={{
                                        marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                                        background: a.response_time_minutes <= 5 ? S.greenLight : a.response_time_minutes <= 60 ? S.yellowLight : S.redLight,
                                        color: a.response_time_minutes <= 5 ? S.green : a.response_time_minutes <= 60 ? S.yellow : S.red,
                                      }}>
                                        ⏱ {a.response_time_minutes < 60 ? `${a.response_time_minutes}m` : `${(a.response_time_minutes / 60).toFixed(1)}h`}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 10, color: S.textMuted }}>
                                    {new Date(a.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    {a.sender && <span style={{ marginLeft: 4 }}>· {a.sender}</span>}
                                    {a.channel_used && <span style={{ marginLeft: 4 }}>· {a.channel_used}</span>}
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
            )
          })}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: S.textMuted, fontSize: 13 }}>No prospects found</div>
          )}
        </div>
      )}
    </div>
  )
}
