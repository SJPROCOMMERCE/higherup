'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getTiers, invalidateTiersCache, formatTierRange, type Tier } from '@/lib/pricing'
import { logActivity } from '@/lib/activity-log'

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  black: '#111111', sec: '#555555', ter: '#999999',
  ghost: '#CCCCCC', div: '#EEEEEE', bg: '#FFFFFF',
  green: '#10B981', red: '#EF4444', amber: '#F59E0B',
}

// ─── Types ────────────────────────────────────────────────────────────────────
type PricingHistory = {
  id: string
  tier_id: string
  tier_name: string
  old_amount: number
  new_amount: number
  old_min: number | null
  old_max: number | null
  new_min: number | null
  new_max: number | null
  changed_by: string
  change_reason: string | null
  effective_from: string
  created_at: string
}

type ClientTierCount = {
  tier_name: string
  count: number
}

// ─── Shared input style ───────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  fontSize: 13,
  border: `1px solid ${T.div}`,
  borderRadius: 6,
  padding: '5px 10px',
  outline: 'none',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminPricingPage() {
  const [tiers, setTiers] = useState<Tier[]>([])
  const [history, setHistory] = useState<PricingHistory[]>([])
  const [clientCounts, setClientCounts] = useState<ClientTierCount[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<Tier> | null>(null)
  const [editReason, setEditReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newDraft, setNewDraft] = useState<Partial<Tier>>({})
  const [simPrices, setSimPrices] = useState<Record<string, number>>({})

  // ─── Load ──────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true)
    const [{ data: tiersData }, { data: histData }, { data: countData }] = await Promise.all([
      supabase.from('pricing_tiers').select('*').order('sort_order'),
      supabase.from('pricing_tier_history').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('clients').select('current_month_tier').eq('is_active', true).eq('approval_status', 'approved'),
    ])
    const allTiers = (tiersData ?? []) as Tier[]
    setTiers(allTiers)
    setHistory((histData ?? []) as PricingHistory[])
    // Count clients per tier
    const counts: Record<string, number> = {}
    for (const c of (countData ?? [])) {
      const t = (c as { current_month_tier: string | null }).current_month_tier
      if (t) counts[t] = (counts[t] ?? 0) + 1
    }
    setClientCounts(Object.entries(counts).map(([tier_name, count]) => ({ tier_name, count })))
    // Init simulator prices
    const sim: Record<string, number> = {}
    for (const t of allTiers) sim[t.id] = t.amount
    setSimPrices(sim)
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  // ─── Simulator totals ─────────────────────────────────────────────────────
  const simCurrentTotal = useMemo(() => tiers.reduce((s, t) => {
    const count = clientCounts.find(c => c.tier_name === t.tier_name)?.count ?? 0
    return s + count * t.amount
  }, 0), [tiers, clientCounts])

  const simNewTotal = useMemo(() => tiers.reduce((s, t) => {
    const count = clientCounts.find(c => c.tier_name === t.tier_name)?.count ?? 0
    return s + count * (simPrices[t.id] ?? t.amount)
  }, 0), [tiers, clientCounts, simPrices])

  // ─── Save edit ────────────────────────────────────────────────────────────
  async function saveEdit() {
    if (!editDraft || !editId) return
    const original = tiers.find(t => t.id === editId)
    if (!original) return

    // Validate range overlap
    const otherTiers = tiers.filter(t => t.id !== editId && t.is_active)
    const newMin = editDraft.min_variants ?? original.min_variants
    const newMax = editDraft.max_variants !== undefined ? editDraft.max_variants : original.max_variants
    for (const other of otherTiers) {
      const otherMin = other.min_variants
      const otherMax = other.max_variants
      const overlap = newMin <= (otherMax ?? 999999) && (newMax ?? 999999) >= otherMin
      if (overlap) {
        setSaveResult(`Range overlaps with "${other.display_name}". Adjust the ranges.`)
        setTimeout(() => setSaveResult(null), 5000)
        return
      }
    }

    setSaving(true)

    // 1. Write history
    await supabase.from('pricing_tier_history').insert({
      tier_id: original.id,
      tier_name: original.tier_name,
      old_amount: original.amount,
      new_amount: editDraft.amount ?? original.amount,
      old_min: original.min_variants,
      old_max: original.max_variants,
      new_min: editDraft.min_variants ?? original.min_variants,
      new_max: editDraft.max_variants !== undefined ? editDraft.max_variants : original.max_variants,
      changed_by: 'admin',
      change_reason: editReason || null,
    })

    // 2. Update tier
    await supabase.from('pricing_tiers').update({
      display_name: editDraft.display_name ?? original.display_name,
      min_variants: editDraft.min_variants ?? original.min_variants,
      max_variants: editDraft.max_variants !== undefined ? editDraft.max_variants : original.max_variants,
      amount: editDraft.amount ?? original.amount,
      description: editDraft.description ?? original.description,
      updated_at: new Date().toISOString(),
    }).eq('id', editId)

    // 3. Log
    void logActivity({
      action: 'pricing_tier_updated',
      source: 'admin',
      severity: 'warning',
      details: `Tier "${original.display_name}" updated: $${original.amount} → $${editDraft.amount ?? original.amount}`,
      metadata: { tier_name: original.tier_name, old_amount: original.amount, new_amount: editDraft.amount },
    })

    // 4. Invalidate cache
    invalidateTiersCache()

    setEditId(null)
    setEditDraft(null)
    setSaveResult('Tier updated. Changes apply to future invoices only.')
    setSaving(false)
    await load()
    setTimeout(() => setSaveResult(null), 5000)
  }

  // ─── Deactivate ───────────────────────────────────────────────────────────
  async function deactivateTier(tier: Tier) {
    const count = clientCounts.find(c => c.tier_name === tier.tier_name)?.count ?? 0
    if (count > 0) {
      setSaveResult(`Cannot deactivate "${tier.display_name}". ${count} active clients are on this tier.`)
      setTimeout(() => setSaveResult(null), 5000)
      return
    }
    await supabase.from('pricing_tiers').update({ is_active: false }).eq('id', tier.id)
    invalidateTiersCache()
    await load()
  }

  // ─── Activate ─────────────────────────────────────────────────────────────
  async function activateTier(tier: Tier) {
    await supabase.from('pricing_tiers').update({ is_active: true }).eq('id', tier.id)
    invalidateTiersCache()
    await load()
  }

  // ─── Move up/down ─────────────────────────────────────────────────────────
  async function moveUp(tier: Tier) {
    const idx = tiers.findIndex(t => t.id === tier.id)
    if (idx === 0) return
    const prev = tiers[idx - 1]
    await Promise.all([
      supabase.from('pricing_tiers').update({ sort_order: prev.sort_order }).eq('id', tier.id),
      supabase.from('pricing_tiers').update({ sort_order: tier.sort_order }).eq('id', prev.id),
    ])
    await load()
  }

  async function moveDown(tier: Tier) {
    const idx = tiers.findIndex(t => t.id === tier.id)
    if (idx >= tiers.length - 1) return
    const next = tiers[idx + 1]
    await Promise.all([
      supabase.from('pricing_tiers').update({ sort_order: next.sort_order }).eq('id', tier.id),
      supabase.from('pricing_tiers').update({ sort_order: tier.sort_order }).eq('id', next.id),
    ])
    await load()
  }

  // ─── Create tier ──────────────────────────────────────────────────────────
  async function createTier() {
    if (!newDraft.display_name || newDraft.min_variants === undefined || !newDraft.amount) return
    const maxSortOrder = Math.max(...tiers.map(t => t.sort_order), 0)
    const { error } = await supabase.from('pricing_tiers').insert({
      tier_name: newDraft.tier_name || newDraft.display_name.toLowerCase().replace(/\s+/g, '_'),
      display_name: newDraft.display_name,
      min_variants: newDraft.min_variants,
      max_variants: newDraft.max_variants ?? null,
      amount: newDraft.amount,
      description: newDraft.description || null,
      is_active: true,
      sort_order: maxSortOrder + 1,
    })
    if (!error) {
      invalidateTiersCache()
      setShowAdd(false)
      setNewDraft({})
      await load()
      void logActivity({ action: 'pricing_tier_created', source: 'admin', details: `New tier created: ${newDraft.display_name}` })
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ paddingTop: 80, paddingInline: 48, color: T.ghost, fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ─── Save result banner ────────────────────────────────────────────── */}
      {saveResult && (
        <div style={{
          position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)',
          background: T.black, color: T.bg, fontSize: 13, padding: '10px 20px',
          borderRadius: 100, zIndex: 100, whiteSpace: 'nowrap',
        }}>
          {saveResult}
        </div>
      )}

      {/* ─── Header ───────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 32, paddingTop: 40, paddingInline: 48, paddingBottom: 24,
        borderBottom: `1px solid ${T.div}`,
      }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 300, color: T.black, letterSpacing: '-0.02em' }}>Pricing tiers</div>
          {history.length > 0 && (
            <div style={{ fontSize: 12, color: T.ghost, marginTop: 4 }}>
              Last changed {new Date(history[0].created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} by {history[0].changed_by}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            fontSize: 13, fontWeight: 500, color: T.bg, background: T.black,
            border: 'none', borderRadius: 100, padding: '9px 20px', cursor: 'pointer',
          }}
        >
          + Add tier
        </button>
      </div>

      {/* ─── Tier rows ────────────────────────────────────────────────────── */}
      <div>
        {tiers.map(tier => (
          <div key={tier.id}>

            {/* View mode row */}
            {editId !== tier.id && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 20,
                paddingBlock: 20, borderBottom: `1px solid #FAFAFA`, paddingInline: 48,
              }}>
                {/* Status dot */}
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: tier.is_active ? T.green : T.ghost,
                  flexShrink: 0, display: 'inline-block',
                }} />

                {/* Name */}
                <div style={{ width: 120, flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: T.black }}>{tier.display_name}</div>
                  <div style={{ fontSize: 11, color: T.ghost }}>{tier.tier_name}</div>
                </div>

                {/* Range */}
                <div style={{ width: 140, flexShrink: 0, fontSize: 13, color: T.ter }}>
                  {formatTierRange(tier)} products
                </div>

                {/* Price */}
                <div style={{ width: 80, flexShrink: 0, fontSize: 18, fontWeight: 600, color: T.black }}>
                  ${tier.amount}
                </div>

                {/* Client count */}
                <div style={{ width: 100, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, color: T.black }}>
                    {clientCounts.find(c => c.tier_name === tier.tier_name)?.count ?? 0}
                  </div>
                  <div style={{ fontSize: 11, color: T.ghost }}>active clients</div>
                </div>

                {/* Description */}
                <div style={{ flex: 1, fontSize: 12, color: T.ghost }}>{tier.description ?? '—'}</div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
                  <button
                    onClick={() => { setEditId(tier.id); setEditDraft({ ...tier }); setEditReason('') }}
                    style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onMouseEnter={e => e.currentTarget.style.color = T.black}
                    onMouseLeave={e => e.currentTarget.style.color = T.ghost}
                  >Edit</button>
                  {tier.is_active && (
                    <button
                      onClick={() => void deactivateTier(tier)}
                      style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      onMouseEnter={e => e.currentTarget.style.color = T.red}
                      onMouseLeave={e => e.currentTarget.style.color = T.ghost}
                    >Deactivate</button>
                  )}
                  {!tier.is_active && (
                    <button
                      onClick={() => void activateTier(tier)}
                      style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      onMouseEnter={e => e.currentTarget.style.color = T.green}
                      onMouseLeave={e => e.currentTarget.style.color = T.ghost}
                    >Activate</button>
                  )}
                  <button
                    onClick={() => void moveUp(tier)}
                    style={{ fontSize: 11, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >↑</button>
                  <button
                    onClick={() => void moveDown(tier)}
                    style={{ fontSize: 11, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >↓</button>
                </div>
              </div>
            )}

            {/* Edit mode panel */}
            {editId === tier.id && editDraft && (
              <div style={{ paddingInline: 48, paddingBlock: 24, borderBottom: `1px solid ${T.div}`, background: '#FAFAFA' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>

                  {/* Display name */}
                  <div>
                    <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Display name</div>
                    <input
                      style={inputStyle}
                      value={editDraft.display_name ?? ''}
                      onChange={e => setEditDraft(d => ({ ...d, display_name: e.target.value }))}
                    />
                  </div>

                  {/* Min variants */}
                  <div>
                    <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Min products</div>
                    <input
                      type="text" inputMode="numeric" style={inputStyle}
                      value={editDraft.min_variants ?? ''}
                      onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setEditDraft(d => ({ ...d, min_variants: v === '' ? undefined : parseInt(v) })) }}
                    />
                  </div>

                  {/* Max variants */}
                  <div>
                    <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Max products (empty = unlimited)</div>
                    <input
                      type="text" inputMode="numeric" style={inputStyle}
                      value={editDraft.max_variants ?? ''}
                      onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setEditDraft(d => ({ ...d, max_variants: v === '' ? null : parseInt(v) })) }}
                    />
                  </div>

                  {/* Amount */}
                  <div>
                    <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Amount ($)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 13, color: T.ghost }}>$</span>
                      <input
                        type="text" inputMode="decimal" style={{ ...inputStyle }}
                        value={editDraft.amount ?? ''}
                        onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setEditDraft(d => ({ ...d, amount: v === '' ? undefined : parseFloat(v) })) }}
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Description</div>
                    <input
                      style={inputStyle}
                      value={editDraft.description ?? ''}
                      onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Change reason */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Change reason (optional but encouraged)</div>
                  <input
                    style={{ ...inputStyle, maxWidth: 480 }}
                    value={editReason}
                    onChange={e => setEditReason(e.target.value)}
                    placeholder="e.g. Adjusted for market rates Q2 2026"
                  />
                </div>

                {/* Impact preview */}
                {editDraft.amount !== tier.amount && (
                  <div style={{ marginBottom: 16, padding: '12px 16px', background: '#F0F0F0', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>IMPACT PREVIEW</div>
                    {(() => {
                      const affected = clientCounts.find(c => c.tier_name === tier.tier_name)?.count ?? 0
                      const currentRevenue = affected * tier.amount
                      const newRevenue = affected * (editDraft.amount ?? tier.amount)
                      const diff = newRevenue - currentRevenue
                      return (
                        <>
                          <div style={{ fontSize: 12, color: T.ter }}>Current monthly revenue from this tier: ${currentRevenue.toLocaleString()}</div>
                          <div style={{ fontSize: 12, color: T.ter }}>New monthly revenue: ${newRevenue.toLocaleString()}</div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: diff > 0 ? T.green : diff < 0 ? T.red : T.ter }}>
                            Difference: {diff > 0 ? '+' : ''}{diff.toLocaleString()} per month
                          </div>
                          <div style={{ fontSize: 12, color: T.ghost, marginTop: 4 }}>Affected clients: {affected}</div>
                        </>
                      )
                    })()}
                  </div>
                )}

                {/* Warning */}
                <div style={{ fontSize: 12, color: T.ter, marginBottom: 16 }}>
                  This will affect all future invoices. Existing invoices are not affected.
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <button
                    onClick={() => void saveEdit()}
                    disabled={saving}
                    style={{
                      fontSize: 13, fontWeight: 500, color: T.bg, background: T.black,
                      border: 'none', borderRadius: 100, padding: '8px 20px', cursor: saving ? 'default' : 'pointer',
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    onClick={() => { setEditId(null); setEditDraft(null) }}
                    style={{ fontSize: 13, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ─── Add new tier form ────────────────────────────────────────────── */}
      {showAdd && (
        <div style={{ paddingInline: 48, paddingBlock: 28, borderTop: `1px solid ${T.div}`, background: '#FAFAFA' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.black, marginBottom: 16 }}>New tier</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>

            <div>
              <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Display name</div>
              <input
                style={inputStyle}
                value={newDraft.display_name ?? ''}
                onChange={e => setNewDraft(d => ({ ...d, display_name: e.target.value }))}
                placeholder="e.g. Elite"
              />
            </div>

            <div>
              <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Tier name (auto)</div>
              <input
                style={inputStyle}
                value={newDraft.tier_name ?? (newDraft.display_name ? newDraft.display_name.toLowerCase().replace(/\s+/g, '_') : '')}
                onChange={e => setNewDraft(d => ({ ...d, tier_name: e.target.value }))}
                placeholder="auto-filled"
              />
            </div>

            <div>
              <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Min products</div>
              <input
                type="text" inputMode="numeric" style={inputStyle}
                value={newDraft.min_variants ?? ''}
                onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setNewDraft(d => ({ ...d, min_variants: v === '' ? undefined : parseInt(v) })) }}
              />
            </div>

            <div>
              <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Max products (empty = ∞)</div>
              <input
                type="text" inputMode="numeric" style={inputStyle}
                value={newDraft.max_variants ?? ''}
                onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setNewDraft(d => ({ ...d, max_variants: v === '' ? undefined : parseInt(v) })) }}
              />
            </div>

            <div>
              <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Amount ($)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 13, color: T.ghost }}>$</span>
                <input
                  type="text" inputMode="decimal" style={inputStyle}
                  value={newDraft.amount ?? ''}
                  onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setNewDraft(d => ({ ...d, amount: v === '' ? undefined : parseFloat(v) })) }}
                />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Description</div>
              <input
                style={inputStyle}
                value={newDraft.description ?? ''}
                onChange={e => setNewDraft(d => ({ ...d, description: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={() => void createTier()}
              style={{
                fontSize: 13, fontWeight: 500, color: T.bg, background: T.black,
                border: 'none', borderRadius: 100, padding: '8px 20px', cursor: 'pointer',
              }}
            >
              Create
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewDraft({}) }}
              style={{ fontSize: 13, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ─── Pricing history ──────────────────────────────────────────────── */}
      <div style={{ paddingInline: 48, marginTop: 40 }}>
        <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
          PRICING HISTORY
        </div>
        {history.length === 0 ? (
          <div style={{ fontSize: 13, color: T.ghost }}>No price changes yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.div}` }}>
                {['Date', 'Tier', 'Change', 'By', 'Reason'].map(h => (
                  <th key={h} style={{ fontSize: 10, color: T.ghost, textAlign: 'left', padding: '6px 0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} style={{ borderBottom: `1px solid #FAFAFA` }}>
                  <td style={{ fontSize: 12, color: T.ghost, padding: '10px 0' }}>
                    {new Date(h.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ fontSize: 13, color: T.black, padding: '10px 0' }}>{h.tier_name}</td>
                  <td style={{ fontSize: 13, color: T.ter, padding: '10px 0' }}>
                    ${h.old_amount} → ${h.new_amount}
                    {(h.old_min !== h.new_min || h.old_max !== h.new_max) && (
                      <span style={{ fontSize: 11, color: T.ghost, marginLeft: 8 }}>
                        ({h.old_min}–{h.old_max ?? '∞'} → {h.new_min}–{h.new_max ?? '∞'})
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: T.ghost, padding: '10px 0' }}>{h.changed_by}</td>
                  <td style={{ fontSize: 12, color: T.ghost, padding: '10px 0' }}>{h.change_reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── Revenue simulator ────────────────────────────────────────────── */}
      <div style={{ paddingInline: 48, marginTop: 40, paddingBottom: 80 }}>
        <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
          REVENUE SIMULATOR
        </div>
        <div style={{ fontSize: 13, color: T.ter, marginBottom: 20 }}>
          What if you changed prices? (simulation only — nothing is saved)
        </div>

        {tiers.filter(t => t.is_active).map(tier => {
          const count = clientCounts.find(c => c.tier_name === tier.tier_name)?.count ?? 0
          const simPrice = simPrices[tier.id] ?? tier.amount
          return (
            <div key={tier.id} style={{
              display: 'flex', alignItems: 'center', gap: 20,
              paddingBlock: 12, borderBottom: `1px solid #FAFAFA`,
            }}>
              <div style={{ width: 120, fontSize: 13, fontWeight: 500, color: T.black }}>{tier.display_name}</div>
              <div style={{ width: 80, fontSize: 13, color: T.ghost }}>Current: ${tier.amount}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, color: T.ghost }}>$</span>
                <input
                  type="text" inputMode="decimal" value={simPrice}
                  onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setSimPrices(p => ({ ...p, [tier.id]: v === '' ? 0 : (parseFloat(v) || 0) })) }}
                  style={{ width: 70, fontSize: 13, border: `1px solid ${T.div}`, borderRadius: 6, padding: '4px 8px', outline: 'none' }}
                />
              </div>
              <div style={{ width: 80, fontSize: 12, color: T.ghost }}>{count} clients</div>
              <div style={{ fontSize: 13, color: T.black }}>
                ${(count * tier.amount).toLocaleString()} → ${(count * simPrice).toLocaleString()}
              </div>
            </div>
          )
        })}

        <div style={{ paddingTop: 16, display: 'flex', gap: 32 }}>
          <div>
            <div style={{ fontSize: 12, color: T.ghost }}>Current total</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: T.black }}>${simCurrentTotal.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: T.ghost }}>Simulated total</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: T.black }}>${simNewTotal.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: T.ghost }}>Difference</div>
            <div style={{
              fontSize: 18, fontWeight: 600,
              color: simNewTotal - simCurrentTotal > 0 ? T.green : simNewTotal - simCurrentTotal < 0 ? T.red : T.ghost,
            }}>
              {simNewTotal >= simCurrentTotal ? '+' : ''}{(simNewTotal - simCurrentTotal).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
