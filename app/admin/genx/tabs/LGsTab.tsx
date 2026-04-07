'use client'
import { useState } from 'react'
import { S, type LG, type Community, type Payout } from '../shared'

const STATUS_COLORS: Record<string, string> = {
  active: S.green, pending: S.yellow, paused: S.textSecondary, deactivated: S.red,
}
const TIER_COLORS: Record<string, string> = {
  bronze: '#CD7F32', silver: '#C0C0C0', gold: '#FFD700', platinum: '#E5E4E2',
}

type ChecklistItem = { id: string; lg_id: string; step_key: string; step_label: string; completed: boolean; completed_at: string | null }
type Note = { id: string; lg_id: string; content: string; created_at: string }
type TimelineEvent = { id: string; lg_id: string; event_type: string; description: string; created_at: string }

type Props = {
  lgs: LG[]
  communities: Community[]
  pendingPayouts: Payout[]
  onUpdate: (l: LG[]) => void
}

export default function LGsTab({ lgs, communities, pendingPayouts, onUpdate }: Props) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  // Detail data
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [noteText, setNoteText] = useState('')

  const filtered = lgs.filter(l => {
    if (filterStatus !== 'all' && l.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return l.display_name.toLowerCase().includes(q) || (l.email || '').toLowerCase().includes(q) || l.referral_code.toLowerCase().includes(q)
    }
    return true
  })

  async function action(lgId: string, type: 'approve' | 'pause' | 'deactivate') {
    setLoading(lgId + type)
    await fetch(`/api/admin/genx/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lg_id: lgId }),
    })
    setLoading(null)
    const newStatus = type === 'approve' ? 'active' : type === 'pause' ? 'paused' : 'deactivated'
    onUpdate(lgs.map(l => l.id === lgId ? { ...l, status: newStatus } : l))
  }

  async function loadDetail(lgId: string) {
    if (expandedId === lgId) { setExpandedId(null); return }
    setExpandedId(lgId)
    setDetailLoading(true)
    const res = await fetch(`/api/admin/genx/lg/${lgId}`)
    if (res.ok) {
      const data = await res.json()
      setChecklist(data.checklist || [])
      setNotes(data.notes || [])
      setTimeline(data.timeline || [])
    }
    setDetailLoading(false)
  }

  async function toggleChecklist(lgId: string, stepKey: string, completed: boolean) {
    await fetch(`/api/admin/genx/lg/${lgId}/checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step_key: stepKey, completed }),
    })
    setChecklist(checklist.map(c => c.step_key === stepKey ? { ...c, completed, completed_at: completed ? new Date().toISOString() : null } : c))
  }

  async function seedChecklist(lgId: string) {
    const res = await fetch(`/api/admin/genx/lg/${lgId}/checklist`, { method: 'POST' })
    if (res.ok) {
      const { checklist: items } = await res.json()
      setChecklist(items)
    }
  }

  async function addNote(lgId: string) {
    if (!noteText.trim()) return
    const res = await fetch(`/api/admin/genx/lg/${lgId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: noteText }),
    })
    if (res.ok) {
      const { note } = await res.json()
      setNotes([note, ...notes])
      setNoteText('')
    }
  }

  async function updateLG(lgId: string, field: string, value: string) {
    await fetch(`/api/admin/genx/lg/${lgId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    onUpdate(lgs.map(l => l.id === lgId ? { ...l, [field]: value } : l))
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            placeholder="Search LGs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 14px', fontSize: 13, width: 240, outline: 'none' }}
          />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg, cursor: 'pointer' }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="paused">Paused</option>
            <option value="deactivated">Deactivated</option>
          </select>
        </div>
        <div style={{ fontSize: 13, color: S.textSecondary }}>
          {filtered.length} LGs
        </div>
      </div>

      {/* LG List */}
      <div style={{ background: S.surface, borderRadius: S.radius, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
        {filtered.map((lg, i) => (
          <div key={lg.id}>
            <div
              onClick={() => loadDetail(lg.id)}
              style={{
                padding: '14px 20px', borderBottom: i < filtered.length - 1 || expandedId === lg.id ? `1px solid ${S.borderLight}` : 'none',
                cursor: 'pointer', background: expandedId === lg.id ? S.accentLight : S.bg,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: S.text }}>{lg.display_name}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS[lg.status], textTransform: 'uppercase' }}>{lg.status}</span>
                    {lg.lg_tier && lg.lg_tier !== 'bronze' && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: TIER_COLORS[lg.lg_tier] || S.textMuted, textTransform: 'uppercase' }}>{lg.lg_tier}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: S.textSecondary }}>
                    {lg.email} · Code: <strong>{lg.login_code}</strong> · Ref: {lg.referral_code}
                  </div>
                  <div style={{ fontSize: 12, color: S.textSecondary, marginTop: 2 }}>
                    {lg.total_vas || 0} referred · {lg.active_vas || 0} active · ${parseFloat(String(lg.total_earned || 0)).toFixed(2)} lifetime
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                  {lg.status === 'pending' && (
                    <button onClick={() => action(lg.id, 'approve')} disabled={loading === lg.id + 'approve'}
                      style={{ background: S.green, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {loading === lg.id + 'approve' ? '...' : 'Approve'}
                    </button>
                  )}
                  {lg.status === 'active' && (
                    <button onClick={() => action(lg.id, 'pause')} disabled={loading === lg.id + 'pause'}
                      style={{ background: S.surface, color: S.text, border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
                      Pause
                    </button>
                  )}
                  {lg.status !== 'deactivated' && (
                    <button onClick={() => action(lg.id, 'deactivate')} disabled={loading === lg.id + 'deactivate'}
                      style={{ background: S.redLight, color: S.red, border: 'none', borderRadius: S.radiusSm, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
                      Deactivate
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Expanded detail */}
            {expandedId === lg.id && (
              <div style={{ padding: '20px 24px', background: S.accentLight, borderBottom: `1px solid ${S.border}` }}>
                {detailLoading ? (
                  <div style={{ color: S.textMuted, fontSize: 13 }}>Loading...</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                    {/* Onboarding Checklist */}
                    <div>
                      <h4 style={{ fontSize: 13, fontWeight: 600, color: S.text, marginBottom: 12 }}>Onboarding Checklist</h4>
                      {checklist.length === 0 ? (
                        <button onClick={() => seedChecklist(lg.id)}
                          style={{ background: S.accent, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Initialize Checklist
                        </button>
                      ) : (
                        <div>
                          {checklist.map(c => (
                            <label key={c.step_key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={c.completed}
                                onChange={e => toggleChecklist(lg.id, c.step_key, e.target.checked)}
                                style={{ width: 16, height: 16, accentColor: S.green }}
                              />
                              <span style={{ fontSize: 13, color: c.completed ? S.green : S.text, textDecoration: c.completed ? 'line-through' : 'none' }}>
                                {c.step_label}
                              </span>
                            </label>
                          ))}
                          <div style={{ marginTop: 8, fontSize: 12, color: S.textMuted }}>
                            {checklist.filter(c => c.completed).length}/{checklist.length} completed
                          </div>
                        </div>
                      )}

                      {/* Tier + Community */}
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 4 }}>Tier</div>
                        <select
                          value={lg.lg_tier || 'bronze'}
                          onChange={e => updateLG(lg.id, 'lg_tier', e.target.value)}
                          style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '6px 10px', fontSize: 12, background: S.bg, width: '100%' }}
                        >
                          <option value="bronze">Bronze</option>
                          <option value="silver">Silver</option>
                          <option value="gold">Gold</option>
                          <option value="platinum">Platinum</option>
                        </select>
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 4 }}>Community</div>
                        <select
                          value={lg.community_id || ''}
                          onChange={e => updateLG(lg.id, 'community_id', e.target.value)}
                          style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '6px 10px', fontSize: 12, background: S.bg, width: '100%' }}
                        >
                          <option value="">None</option>
                          {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <h4 style={{ fontSize: 13, fontWeight: 600, color: S.text, marginBottom: 12 }}>Notes</h4>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <input
                          placeholder="Add a note..."
                          value={noteText}
                          onChange={e => setNoteText(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addNote(lg.id)}
                          style={{ flex: 1, border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '6px 10px', fontSize: 12 }}
                        />
                        <button onClick={() => addNote(lg.id)}
                          style={{ background: S.accent, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Add
                        </button>
                      </div>
                      <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                        {notes.map(n => (
                          <div key={n.id} style={{ padding: '8px 10px', background: S.bg, borderRadius: S.radiusSm, marginBottom: 6, border: `1px solid ${S.borderLight}` }}>
                            <div style={{ fontSize: 12, color: S.text }}>{n.content}</div>
                            <div style={{ fontSize: 10, color: S.textMuted, marginTop: 4 }}>
                              {new Date(n.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        ))}
                        {notes.length === 0 && <div style={{ fontSize: 12, color: S.textMuted }}>No notes yet</div>}
                      </div>
                    </div>

                    {/* Timeline */}
                    <div>
                      <h4 style={{ fontSize: 13, fontWeight: 600, color: S.text, marginBottom: 12 }}>Timeline</h4>
                      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                        {timeline.map(t => (
                          <div key={t.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: `1px solid ${S.borderLight}` }}>
                            <div style={{
                              width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                              background: t.event_type === 'approved' ? S.green :
                                t.event_type === 'milestone' ? S.purple :
                                t.event_type === 'note' ? S.accent :
                                t.event_type === 'deactivated' ? S.red : S.textMuted,
                            }} />
                            <div>
                              <div style={{ fontSize: 12, color: S.text }}>{t.description}</div>
                              <div style={{ fontSize: 10, color: S.textMuted }}>
                                {new Date(t.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                        ))}
                        {timeline.length === 0 && <div style={{ fontSize: 12, color: S.textMuted }}>No timeline events</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: S.textMuted, fontSize: 13 }}>No Lead Generators found</div>
        )}
      </div>
    </div>
  )
}
