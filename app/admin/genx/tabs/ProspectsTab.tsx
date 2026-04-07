'use client'
import { useState } from 'react'
import { S, PIPELINE_STAGES, TERMINAL_STAGES, ALL_STAGES, LOSS_REASONS, LOSS_CATEGORY_COLORS, REACTIVATION_REASONS, getLossReasonLabel, type Prospect, type Community, type LossHistoryEntry, type ReactivationCycle } from '../shared'

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

// ── Loss Reason Modal ──
function LossReasonModal({ targetStage, onConfirm, onCancel }: {
  targetStage: 'lost' | 'declined'
  onConfirm: (reason: string, detail: string, changedBy: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [changedBy, setChangedBy] = useState('')

  const selectedReason = LOSS_REASONS.find(r => r.id === reason)
  const revisitDays = selectedReason?.revisitDays ?? 0
  const canSubmit = reason && (reason !== 'other' || detail.trim()) && changedBy

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
    }} onClick={onCancel}>
      <div style={{
        background: '#fff', borderRadius: 14, padding: 28, width: 480, maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: S.text, margin: '0 0 4px' }}>
          Why did this prospect not convert?
        </h3>
        <p style={{ fontSize: 12, color: S.textSecondary, marginBottom: 20 }}>
          Select a reason for marking as <strong style={{ color: S.red }}>{targetStage}</strong>
        </p>

        {/* Reason radio buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {LOSS_REASONS.map(r => (
            <label key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              borderRadius: S.radiusSm, cursor: 'pointer',
              border: `1px solid ${reason === r.id ? LOSS_CATEGORY_COLORS[r.category] || S.accent : S.borderLight}`,
              background: reason === r.id ? `${LOSS_CATEGORY_COLORS[r.category] || S.accent}08` : S.bg,
              transition: 'all 0.1s',
            }}>
              <input type="radio" name="loss_reason" value={r.id}
                checked={reason === r.id} onChange={() => setReason(r.id)}
                style={{ accentColor: LOSS_CATEGORY_COLORS[r.category] || S.accent }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: reason === r.id ? 600 : 400, color: S.text }}>{r.label}</div>
              </div>
              <span style={{
                fontSize: 9, fontWeight: 600, textTransform: 'uppercase', padding: '2px 6px',
                borderRadius: 4, color: LOSS_CATEGORY_COLORS[r.category], background: `${LOSS_CATEGORY_COLORS[r.category]}15`,
              }}>{r.category}</span>
            </label>
          ))}
        </div>

        {/* Detail text */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: S.textSecondary, display: 'block', marginBottom: 4 }}>
            Details {reason === 'other' ? '(required)' : '(optional)'}
          </label>
          <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={2}
            placeholder="Extra context..."
            style={{
              width: '100%', border: `1px solid ${reason === 'other' && !detail.trim() ? S.red : S.border}`,
              borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, resize: 'vertical',
              fontFamily: S.font, boxSizing: 'border-box',
            }} />
        </div>

        {/* Changed by */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: S.textSecondary, display: 'block', marginBottom: 4 }}>
            Marked by (required)
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            {SENDERS.map(s => (
              <button key={s} onClick={() => setChangedBy(s)}
                style={{
                  padding: '6px 16px', fontSize: 12, fontWeight: changedBy === s ? 600 : 400,
                  borderRadius: S.radiusSm, cursor: 'pointer', textTransform: 'capitalize',
                  border: `1px solid ${changedBy === s ? S.accent : S.border}`,
                  background: changedBy === s ? S.accentLight : S.bg,
                  color: changedBy === s ? S.accent : S.textSecondary,
                }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Revisit info */}
        {reason && (
          <div style={{
            background: revisitDays > 0 ? S.greenLight : S.surface,
            borderRadius: S.radiusSm, padding: '8px 12px', marginBottom: 20,
            fontSize: 12, color: revisitDays > 0 ? S.green : S.textMuted,
          }}>
            {revisitDays > 0
              ? `This prospect will be revisited in ${revisitDays} days.`
              : 'This prospect will not be automatically revisited (wrong prospect type).'}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onCancel}
            style={{ padding: '8px 20px', fontSize: 13, borderRadius: S.radiusSm, border: `1px solid ${S.border}`, background: S.bg, color: S.textSecondary, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => canSubmit && onConfirm(reason, detail, changedBy)}
            disabled={!canSubmit}
            style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: S.radiusSm,
              border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed',
              background: canSubmit ? S.red : S.border, color: canSubmit ? '#fff' : S.textMuted,
              opacity: canSubmit ? 1 : 0.6,
            }}>
            Mark as {targetStage === 'lost' ? 'Lost' : 'Declined'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ──
export default function ProspectsTab({ prospects, communities, onUpdate }: Props) {
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline')
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activities, setActivities] = useState<ProspectActivity[]>([])
  const [lossHistory, setLossHistory] = useState<LossHistoryEntry[]>([])
  const [reactivationCycles, setReactivationCycles] = useState<ReactivationCycle[]>([])
  const [actLoading, setActLoading] = useState(false)
  // Schedule reactivation modal
  const [scheduleModal, setScheduleModal] = useState<{ prospect: Prospect } | null>(null)
  const [schedDate, setSchedDate] = useState('')
  const [schedReason, setSchedReason] = useState('scheduled_manual')
  const [schedMessage, setSchedMessage] = useState('')

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

  const [form, setForm] = useState({ name: '', email: '', phone: '', platform: '', handle: '', source: 'manual', community_id: '', priority: 'normal', notes: '' })
  const [actForm, setActForm] = useState({ activity_type: 'call', description: '', direction: '' as '' | 'inbound' | 'outbound', channel_used: '', sender: '' })

  // Loss reason modal state
  const [lossModal, setLossModal] = useState<{ prospect: Prospect; targetStage: 'lost' | 'declined' } | null>(null)

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

  // Stage change — intercept lost/declined with modal
  function requestStageChange(prospect: Prospect, newStage: string) {
    if (newStage === prospect.stage) return
    if (newStage === 'lost' || newStage === 'declined') {
      setLossModal({ prospect, targetStage: newStage as 'lost' | 'declined' })
    } else {
      executeStageChange(prospect, newStage)
    }
  }

  async function executeStageChange(prospect: Prospect, newStage: string, lossReason?: string, lossDetail?: string, changedBy?: string) {
    const body: Record<string, string | undefined> = { stage: newStage, old_stage: prospect.stage }
    if (lossReason) body.loss_reason = lossReason
    if (lossDetail) body.loss_reason_detail = lossDetail
    if (changedBy) body.changed_by = changedBy
    const res = await fetch(`/api/admin/genx/prospects/${prospect.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (res.ok) {
      onUpdate(prospects.map(p => p.id === prospect.id ? {
        ...p, stage: newStage, updated_at: new Date().toISOString(),
        ...(lossReason ? { loss_reason: lossReason, loss_reason_detail: lossDetail || null, lost_at: new Date().toISOString(), lost_by: changedBy || null } : {}),
        ...((prospect.stage === 'lost' || prospect.stage === 'declined') && newStage !== 'lost' && newStage !== 'declined' ? { loss_reason: null, loss_reason_detail: null, revisit_at: null } : {}),
      } : p))
    }
  }

  async function handleLossConfirm(reason: string, detail: string, changedBy: string) {
    if (!lossModal) return
    await executeStageChange(lossModal.prospect, lossModal.targetStage, reason, detail, changedBy)
    setLossModal(null)
  }

  async function reactivateProspect(prospect: Prospect) {
    await executeStageChange(prospect, 'identified', undefined, undefined, undefined)
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
    const res = await fetch(`/api/admin/genx/prospects/${prospectId}`)
    if (res.ok) {
      const data = await res.json()
      setActivities(data.activities || [])
      setLossHistory(data.loss_history || [])
      setReactivationCycles(data.reactivation_cycles || [])
    }
    setActLoading(false)
  }

  async function logActivity(prospectId: string) {
    if (!actForm.description.trim() && !actForm.activity_type) return
    const payload: Record<string, string> = { activity_type: actForm.activity_type, description: actForm.description }
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
      {/* Schedule Reactivation Modal */}
      {scheduleModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)',
        }} onClick={() => setScheduleModal(null)}>
          <div style={{
            background: '#fff', borderRadius: 14, padding: 28, width: 440,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: S.text, margin: '0 0 4px' }}>
              Schedule reactivation for {scheduleModal.prospect.name}
            </h3>
            <p style={{ fontSize: 12, color: S.textSecondary, marginBottom: 16 }}>Plan a future follow-up attempt</p>

            <label style={{ fontSize: 12, fontWeight: 500, color: S.textSecondary, display: 'block', marginBottom: 4 }}>When</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                style={{ flex: 1, border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
              {[30, 60, 90].map(d => (
                <button key={d} onClick={() => setSchedDate(new Date(Date.now() + d * 86400000).toISOString().slice(0, 10))}
                  style={{
                    padding: '6px 12px', fontSize: 11, fontWeight: 500, borderRadius: S.radiusSm,
                    border: `1px solid ${S.border}`, background: S.bg, color: S.textSecondary, cursor: 'pointer',
                  }}>{d}d</button>
              ))}
            </div>

            <label style={{ fontSize: 12, fontWeight: 500, color: S.textSecondary, display: 'block', marginBottom: 4 }}>Reason</label>
            <select value={schedReason} onChange={e => setSchedReason(e.target.value)}
              style={{ width: '100%', border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, marginBottom: 14, background: S.bg }}>
              {REACTIVATION_REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>

            <label style={{ fontSize: 12, fontWeight: 500, color: S.textSecondary, display: 'block', marginBottom: 4 }}>Custom message (optional)</label>
            <textarea value={schedMessage} onChange={e => setSchedMessage(e.target.value)} rows={3}
              placeholder="Leave blank to use the default template for this loss reason"
              style={{ width: '100%', border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, marginBottom: 20, fontFamily: S.font, boxSizing: 'border-box', resize: 'vertical' }} />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setScheduleModal(null)}
                style={{ padding: '8px 20px', fontSize: 13, borderRadius: S.radiusSm, border: `1px solid ${S.border}`, background: S.bg, color: S.textSecondary, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                disabled={!schedDate}
                onClick={async () => {
                  await fetch('/api/admin/genx/reactivation/schedule', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      prospect_id: scheduleModal.prospect.id,
                      scheduled_at: new Date(schedDate).toISOString(),
                      reason: schedReason,
                      custom_message: schedMessage || undefined,
                    }),
                  })
                  setScheduleModal(null)
                  // Reload prospect detail to show new cycle
                  loadActivities(scheduleModal.prospect.id)
                }}
                style={{
                  padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: S.radiusSm,
                  border: 'none', cursor: schedDate ? 'pointer' : 'not-allowed',
                  background: schedDate ? S.purple : S.border, color: schedDate ? '#fff' : S.textMuted,
                  opacity: schedDate ? 1 : 0.6,
                }}>
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loss Reason Modal */}
      {lossModal && (
        <LossReasonModal
          targetStage={lossModal.targetStage}
          onConfirm={handleLossConfirm}
          onCancel={() => setLossModal(null)}
        />
      )}

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

      {/* Pipeline View */}
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
                    if (prospect && prospect.stage !== stage.key) requestStageChange(prospect, stage.key)
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
          {(filtered.some(p => TERMINAL_STAGES.some(t => t.key === p.stage)) || draggingId) && (
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              {TERMINAL_STAGES.map(ts => {
                const items = filtered.filter(p => p.stage === ts.key)
                return (
                  <div key={ts.key}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                    onDragEnter={e => { e.preventDefault(); setDragOverStage(ts.key) }}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={e => {
                      e.preventDefault(); setDragOverStage(null)
                      const pid = e.dataTransfer.getData('text/plain')
                      const prospect = prospects.find(p => p.id === pid)
                      if (prospect && prospect.stage !== ts.key) requestStageChange(prospect, ts.key)
                      setDraggingId(null)
                    }}
                    style={{
                      flex: 1, background: `${ts.color}08`, borderRadius: S.radius, padding: 14,
                      border: dragOverStage === ts.key ? `2px solid ${ts.color}` : `1px solid ${ts.color}30`,
                      minHeight: draggingId ? 60 : undefined,
                    }}>
                    <h4 style={{ fontSize: 12, fontWeight: 600, color: ts.color, marginBottom: 8 }}>{ts.label} ({items.length})</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {items.map(p => (
                        <div key={p.id} draggable
                          onDragStart={e => { setDraggingId(p.id); e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move' }}
                          onDragEnd={() => { setDraggingId(null); setDragOverStage(null) }}
                          onClick={() => loadActivities(p.id)}
                          style={{ background: S.bg, borderRadius: S.radiusSm, padding: '6px 10px', fontSize: 11, border: `1px solid ${ts.color}20`, cursor: 'grab' }}>
                          <span style={{ fontWeight: 600 }}>{p.name}</span>
                          {p.loss_reason && <span style={{ color: S.textMuted, marginLeft: 4 }}>— {getLossReasonLabel(p.loss_reason)}</span>}
                        </div>
                      ))}
                      {items.length === 0 && draggingId && (
                        <div style={{
                          textAlign: 'center', width: '100%', padding: 12, fontSize: 11,
                          color: dragOverStage === ts.key ? ts.color : S.textMuted,
                          border: dragOverStage === ts.key ? `2px dashed ${ts.color}40` : '2px dashed transparent',
                          borderRadius: S.radiusSm,
                        }}>
                          Drop → {ts.label}
                        </div>
                      )}
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

                        {/* Inline loss info */}
                        {(p.stage === 'lost' || p.stage === 'declined') && p.loss_reason && (
                          <div style={{ background: S.redLight, borderRadius: S.radiusSm, padding: 12, marginBottom: 10, border: '1px solid #FECACA' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: S.red, marginBottom: 4 }}>
                              {p.stage.toUpperCase()} — {getLossReasonLabel(p.loss_reason)}
                            </div>
                            {p.loss_reason_detail && <div style={{ fontSize: 12, color: '#991B1B', marginBottom: 4 }}>"{p.loss_reason_detail}"</div>}
                            <div style={{ fontSize: 11, color: S.textMuted }}>
                              {p.lost_by && <span>By {p.lost_by}</span>}
                              {p.lost_at && <span> · {new Date(p.lost_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                              {p.times_lost > 1 && <span> · Lost {p.times_lost}x</span>}
                            </div>
                            {p.revisit_at && (
                              <div style={{ fontSize: 11, color: S.green, marginTop: 4 }}>
                                Revisit: {new Date(p.revisit_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                            )}
                            {/* Loss history */}
                            {lossHistory.length > 0 && (
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #FECACA' }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: S.textMuted, marginBottom: 4 }}>LOSS HISTORY</div>
                                {lossHistory.map(h => (
                                  <div key={h.id} style={{ fontSize: 11, color: S.textSecondary, padding: '2px 0' }}>
                                    {new Date(h.lost_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} — {getLossReasonLabel(h.loss_reason)}
                                    {h.days_in_pipeline != null && <span> · {h.days_in_pipeline}d in pipeline</span>}
                                    {h.channel && <span> · {h.channel}</span>}
                                    {h.reactivated_at && <span style={{ color: S.green }}> · reactivated</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                            <button onClick={() => reactivateProspect(p)}
                              style={{ marginTop: 8, background: S.green, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '6px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                              Reactivate
                            </button>
                          </div>
                        )}

                        {/* Reactivation History */}
                        {reactivationCycles.length > 0 && (
                          <div style={{ background: S.purpleLight, borderRadius: S.radiusSm, padding: 12, marginBottom: 10, border: `1px solid ${S.purple}20` }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: S.purple, textTransform: 'uppercase', marginBottom: 6 }}>REACTIVATION HISTORY</div>
                            {reactivationCycles.map((rc, i) => (
                              <div key={rc.id} style={{ fontSize: 11, color: S.textSecondary, padding: '3px 0', borderBottom: i < reactivationCycles.length - 1 ? `1px solid ${S.purple}10` : 'none' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>
                                    {new Date(rc.scheduled_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    {' — '}
                                    <span style={{
                                      fontWeight: 600,
                                      color: rc.status === 'converted' ? S.green : rc.status === 'declined_again' ? S.red : rc.status === 'sent' ? S.accent : rc.status === 'expired' ? S.textMuted : S.purple,
                                    }}>
                                      {rc.status === 'scheduled' ? 'Scheduled' : rc.status === 'sent' ? 'Sent' : rc.status === 'converted' ? 'Converted' : rc.status === 'declined_again' ? 'Declined again' : rc.status === 'skipped' ? 'Skipped' : rc.status === 'expired' ? 'Expired' : rc.status}
                                    </span>
                                  </span>
                                  {rc.executed_by && <span style={{ fontSize: 10, color: S.textMuted }}>{rc.executed_by}</span>}
                                </div>
                                {rc.result_note && <div style={{ fontSize: 10, color: S.textMuted, marginTop: 1 }}>{rc.result_note}</div>}
                              </div>
                            ))}
                            <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                              {reactivationCycles.some(rc => rc.status === 'scheduled') && (
                                <span style={{ fontSize: 10, color: S.purple }}>
                                  {reactivationCycles.filter(rc => rc.status === 'scheduled').length} upcoming
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Schedule Reactivation button for lost/declined prospects */}
                        {(p.stage === 'lost' || p.stage === 'declined') && (
                          <button onClick={() => { setScheduleModal({ prospect: p }); setSchedDate(''); setSchedReason('scheduled_manual'); setSchedMessage('') }}
                            style={{
                              marginBottom: 10, background: S.purpleLight, color: S.purple, border: `1px solid ${S.purple}30`,
                              borderRadius: S.radiusSm, padding: '6px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            }}>
                            Schedule Reactivation
                          </button>
                        )}

                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {[...PIPELINE_STAGES, ...TERMINAL_STAGES].filter(s => s.key !== p.stage).map(s => (
                            <button key={s.key} onClick={() => requestStageChange(p, s.key)}
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

                        {/* Activity form */}
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
                                }}>{label}</button>
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

                        {/* Activity timeline */}
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                          {actLoading ? <div style={{ fontSize: 12, color: S.textMuted }}>Loading...</div> :
                            activities.length === 0 ? <div style={{ fontSize: 12, color: S.textMuted }}>No activities yet</div> :
                            activities.map(a => (
                              <div key={a.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: `1px solid ${S.borderLight}` }}>
                                <div style={{
                                  width: 6, height: 6, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                                  background: a.direction === 'inbound' ? S.orange : a.direction === 'outbound' ? S.accent : a.activity_type === 'reactivation' ? S.green : S.textMuted,
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
