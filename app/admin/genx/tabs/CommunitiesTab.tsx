'use client'
import { useState } from 'react'
import { S, type Community } from '../shared'

const PLATFORMS = ['facebook', 'whatsapp', 'telegram', 'linkedin', 'discord', 'onlinejobs', 'other']
const STATUSES = ['discovered', 'monitoring', 'active', 'paused', 'blacklisted']
const PRIORITIES = ['low', 'medium', 'high']
const STATUS_COLORS: Record<string, string> = {
  discovered: S.yellow, monitoring: S.accent, active: S.green, paused: S.textMuted, blacklisted: S.red,
}
const PRIORITY_COLORS: Record<string, string> = {
  low: S.textMuted, medium: S.accent, high: S.red,
}
const PLATFORM_ICONS: Record<string, string> = {
  facebook: 'FB', whatsapp: 'WA', telegram: 'TG', linkedin: 'LI', discord: 'DC', onlinejobs: 'OJ', other: '??',
}

type Props = {
  communities: Community[]
  onUpdate: (c: Community[]) => void
}

const STARS = [1, 2, 3, 4, 5]

export default function CommunitiesTab({ communities, onUpdate }: Props) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', platform: 'facebook', url: '', description: '', member_count: 0,
    quality_rating: 0, priority: 'medium', admin_name: '', admin_handle: '',
    admin_contacted: false, admin_notes: '', we_are_member: false, joined_date: '',
    active_lgs: '' as string, notes: '', status: 'discovered',
  })

  const filtered = communities.filter(c => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return c.name.toLowerCase().includes(q) || c.platform.toLowerCase().includes(q) ||
        (c.admin_name || '').toLowerCase().includes(q) || (c.active_lgs || []).join(' ').toLowerCase().includes(q)
    }
    return true
  })

  // Stats
  const totalVAs = communities.reduce((s, c) => s + (c.vas_from_here || 0), 0)
  const totalProducts = communities.reduce((s, c) => s + (c.total_products_from_here || 0), 0)
  const totalRevenue = communities.reduce((s, c) => s + (c.revenue_from_here || 0), 0)
  const activeCommunities = communities.filter(c => c.status === 'active').length

  async function saveCommunity() {
    if (!form.name.trim()) return
    const payload = {
      ...form,
      member_count: form.member_count || 0,
      quality_rating: form.quality_rating || 0,
      url: form.url || null,
      description: form.description || null,
      admin_name: form.admin_name || null,
      admin_handle: form.admin_handle || null,
      admin_notes: form.admin_notes || null,
      joined_date: form.joined_date || null,
      notes: form.notes || null,
      active_lgs: form.active_lgs ? form.active_lgs.split(',').map(s => s.trim()).filter(Boolean) : [],
    }
    if (editId) {
      await fetch(`/api/admin/genx/communities/${editId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      onUpdate(communities.map(c => c.id === editId ? { ...c, ...payload, active_lgs: payload.active_lgs, updated_at: new Date().toISOString() } as Community : c))
    } else {
      const res = await fetch('/api/admin/genx/communities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (res.ok) {
        const { community } = await res.json()
        onUpdate([community, ...communities])
      }
    }
    resetForm()
  }

  async function updateField(id: string, field: string, value: unknown) {
    await fetch(`/api/admin/genx/communities/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }),
    })
    onUpdate(communities.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  async function deleteCommunity(id: string) {
    await fetch(`/api/admin/genx/communities/${id}`, { method: 'DELETE' })
    onUpdate(communities.filter(c => c.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  function startEdit(c: Community) {
    setEditId(c.id)
    setForm({
      name: c.name, platform: c.platform, url: c.url || '', description: c.description || '',
      member_count: c.member_count, quality_rating: c.quality_rating || 0, priority: c.priority || 'medium',
      admin_name: c.admin_name || '', admin_handle: c.admin_handle || '',
      admin_contacted: c.admin_contacted || false, admin_notes: c.admin_notes || '',
      we_are_member: c.we_are_member || false, joined_date: c.joined_date || '',
      active_lgs: (c.active_lgs || []).join(', '), notes: c.notes || '', status: c.status,
    })
    setShowAdd(true)
    setExpandedId(null)
  }

  function resetForm() {
    setForm({
      name: '', platform: 'facebook', url: '', description: '', member_count: 0,
      quality_rating: 0, priority: 'medium', admin_name: '', admin_handle: '',
      admin_contacted: false, admin_notes: '', we_are_member: false, joined_date: '',
      active_lgs: '', notes: '', status: 'discovered',
    })
    setShowAdd(false)
    setEditId(null)
  }

  function daysAgo(dateStr: string | null): string {
    if (!dateStr) return 'Never'
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    return `${diff}d ago`
  }

  return (
    <div>
      {/* KPI Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Communities', value: communities.length, color: S.text },
          { label: 'Active', value: activeCommunities, color: S.green },
          { label: 'VAs Recruited', value: totalVAs, color: S.accent },
          { label: 'Products', value: totalProducts.toLocaleString(), color: S.purple },
          { label: 'Revenue', value: `$${totalRevenue.toFixed(2)}`, color: S.green },
        ].map(card => (
          <div key={card.label} style={{ background: S.surface, borderRadius: S.radius, padding: '14px 18px', border: `1px solid ${S.border}` }}>
            <div style={{ fontSize: 11, color: S.textSecondary, marginBottom: 4, fontWeight: 500 }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input placeholder="Search communities..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 14px', fontSize: 13, width: 260, outline: 'none' }} />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg }}>
            <option value="all">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button onClick={() => { resetForm(); setShowAdd(!showAdd) }}
          style={{ background: S.accent, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + New Community
        </button>
      </div>

      {/* Add/Edit form */}
      {showAdd && (
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: S.radius, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: S.text, marginBottom: 14 }}>{editId ? 'Edit Community' : 'Add New VA Community'}</div>

          {/* Row 1: Name, Platform, URL, Members */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 1fr', gap: 10, marginBottom: 10 }}>
            <input placeholder="Community Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
            <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg }}>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input placeholder="URL" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
            <input type="number" placeholder="Members" value={form.member_count || ''} onChange={e => setForm({ ...form, member_count: parseInt(e.target.value) || 0 })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
          </div>

          {/* Row 2: Quality, Priority, Status, Active LGs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: S.textMuted, marginBottom: 4 }}>Quality</div>
              <div style={{ display: 'flex', gap: 2 }}>
                {STARS.map(n => (
                  <button key={n} onClick={() => setForm({ ...form, quality_rating: form.quality_rating === n ? 0 : n })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: n <= form.quality_rating ? '#F59E0B' : S.borderLight }}>
                    ★
                  </button>
                ))}
              </div>
            </div>
            <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg }}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg }}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input placeholder="Active LGs (comma separated)" value={form.active_lgs} onChange={e => setForm({ ...form, active_lgs: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
          </div>

          {/* Row 3: Admin info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <input placeholder="Admin Name" value={form.admin_name} onChange={e => setForm({ ...form, admin_name: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
            <input placeholder="Admin Handle (@...)" value={form.admin_handle} onChange={e => setForm({ ...form, admin_handle: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: S.textSecondary, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.admin_contacted} onChange={e => setForm({ ...form, admin_contacted: e.target.checked })} />
              Admin Contacted
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: S.textSecondary, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.we_are_member} onChange={e => setForm({ ...form, we_are_member: e.target.checked })} />
              We Are Member
            </label>
          </div>

          {/* Row 4: Notes + Buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              style={{ flex: 1, border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
            <input placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              style={{ flex: 1, border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
            <button onClick={saveCommunity}
              style={{ background: S.accent, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {editId ? 'Update' : 'Save'}
            </button>
            <button onClick={resetForm}
              style={{ background: S.surface, color: S.textSecondary, border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background: S.surface, borderRadius: S.radius, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '40px 1fr 2fr 80px 60px 60px 80px 1.5fr 80px 60px',
          padding: '10px 16px', borderBottom: `1px solid ${S.border}`, fontSize: 11, color: S.textMuted, fontWeight: 600, textTransform: 'uppercase',
        }}>
          <div></div><div>Platform</div><div>Name</div><div>Members</div><div>Quality</div><div>VAs</div>
          <div>Products</div><div>Active LGs</div><div>Status</div><div></div>
        </div>

        {/* Rows */}
        {filtered.map(c => (
          <div key={c.id}>
            <div
              onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
              style={{
                display: 'grid', gridTemplateColumns: '40px 1fr 2fr 80px 60px 60px 80px 1.5fr 80px 60px',
                padding: '12px 16px', borderBottom: `1px solid ${S.borderLight}`, cursor: 'pointer', fontSize: 13,
                background: expandedId === c.id ? S.accentLight : S.bg, alignItems: 'center',
              }}
            >
              {/* Platform icon */}
              <div style={{
                width: 30, height: 30, borderRadius: S.radiusSm, background: S.accentLight,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: S.accent,
              }}>
                {PLATFORM_ICONS[c.platform] || '??'}
              </div>

              {/* Platform */}
              <div style={{ fontSize: 12, color: S.textSecondary, textTransform: 'capitalize' }}>{c.platform}</div>

              {/* Name */}
              <div>
                <span style={{ fontWeight: 600, color: S.text }}>{c.name}</span>
                {c.priority === 'high' && <span style={{ fontSize: 10, color: S.red, fontWeight: 600, marginLeft: 8 }}>HIGH</span>}
              </div>

              {/* Members */}
              <div style={{ color: S.text, fontWeight: 500 }}>{(c.member_count || 0).toLocaleString()}</div>

              {/* Quality */}
              <div style={{ color: '#F59E0B', fontSize: 12, letterSpacing: -1 }}>
                {'★'.repeat(c.quality_rating || 0)}{'☆'.repeat(5 - (c.quality_rating || 0))}
              </div>

              {/* VAs */}
              <div style={{ fontWeight: 600, color: c.vas_from_here > 0 ? S.accent : S.textMuted }}>{c.vas_from_here || 0}</div>

              {/* Products */}
              <div style={{ fontWeight: 500, color: c.total_products_from_here > 0 ? S.purple : S.textMuted }}>
                {(c.total_products_from_here || 0).toLocaleString()}
              </div>

              {/* Active LGs */}
              <div style={{ fontSize: 12, color: S.textSecondary }}>
                {(c.active_lgs || []).length > 0 ? (c.active_lgs || []).join(', ') : '—'}
              </div>

              {/* Status */}
              <div>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                  color: STATUS_COLORS[c.status] || S.textMuted,
                  background: `${STATUS_COLORS[c.status] || S.textMuted}15`,
                  textTransform: 'uppercase',
                }}>{c.status}</span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                <button onClick={() => startEdit(c)} style={{ fontSize: 11, color: S.accent, background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
              </div>
            </div>

            {/* Expanded Detail */}
            {expandedId === c.id && (
              <div style={{ padding: '20px 24px', background: S.accentLight, borderBottom: `1px solid ${S.border}` }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>

                  {/* Column 1: Community Info */}
                  <div>
                    <h4 style={{ fontSize: 15, fontWeight: 700, color: S.text, marginBottom: 4 }}>{c.name}</h4>
                    <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 12 }}>
                      {c.platform} · {(c.member_count || 0).toLocaleString()} members
                    </div>

                    {c.url && (
                      <div style={{ fontSize: 12, marginBottom: 8 }}>
                        <span style={{ color: S.textMuted }}>URL: </span>
                        <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: S.accent }}>{c.url}</a>
                      </div>
                    )}

                    {c.description && <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 8 }}>{c.description}</div>}

                    <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 4 }}>
                      <strong>Admin:</strong> {c.admin_name || 'Unknown'} {c.admin_handle ? `(${c.admin_handle})` : ''}
                    </div>
                    <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 4 }}>
                      <strong>Admin contacted:</strong>{' '}
                      <span style={{ color: c.admin_contacted ? S.green : S.red }}>{c.admin_contacted ? 'Yes' : 'No'}</span>
                    </div>
                    {c.admin_notes && (
                      <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 4, fontStyle: 'italic' }}>
                        &ldquo;{c.admin_notes}&rdquo;
                      </div>
                    )}

                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 4 }}>
                        <strong>We are member:</strong>{' '}
                        <span style={{ color: c.we_are_member ? S.green : S.textMuted }}>{c.we_are_member ? `Yes${c.joined_date ? ` (joined ${c.joined_date})` : ''}` : 'No'}</span>
                      </div>
                      <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 4 }}>
                        <strong>Posts made:</strong> {c.posts_made || 0}
                      </div>
                      <div style={{ fontSize: 12, color: S.textSecondary }}>
                        <strong>Last posted:</strong> {daysAgo(c.last_posted_at)}
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Active LGs */}
                  <div>
                    <h4 style={{ fontSize: 13, fontWeight: 600, color: S.text, marginBottom: 12 }}>Active LGs in this Community</h4>
                    {(c.active_lgs || []).length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(c.active_lgs || []).map(lg => (
                          <div key={lg} style={{ padding: '8px 12px', background: S.bg, borderRadius: S.radiusSm, border: `1px solid ${S.borderLight}`, fontSize: 13, fontWeight: 500, color: S.text }}>
                            {lg}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: S.textMuted }}>No LGs active here yet</div>
                    )}

                    {/* Quick actions */}
                    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 11, color: S.textMuted, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Status</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {STATUSES.map(s => (
                          <button key={s} onClick={() => updateField(c.id, 'status', s)}
                            style={{
                              fontSize: 11, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                              border: c.status === s ? `2px solid ${STATUS_COLORS[s]}` : `1px solid ${S.border}`,
                              background: c.status === s ? `${STATUS_COLORS[s]}15` : S.bg,
                              color: STATUS_COLORS[s], fontWeight: c.status === s ? 600 : 400,
                            }}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Performance */}
                  <div>
                    <h4 style={{ fontSize: 13, fontWeight: 600, color: S.text, marginBottom: 12 }}>Performance</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { label: 'VAs from this community', value: c.vas_from_here || 0, color: S.accent },
                        { label: 'Total products listed', value: (c.total_products_from_here || 0).toLocaleString(), color: S.purple },
                        { label: 'Revenue generated', value: `$${(c.revenue_from_here || 0).toFixed(2)}`, color: S.green },
                        { label: 'LG earnings generated', value: `$${(c.lg_earnings_from_here || 0).toFixed(2)}`, color: S.orange },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: S.bg, borderRadius: S.radiusSm, border: `1px solid ${S.borderLight}` }}>
                          <span style={{ fontSize: 12, color: S.textSecondary }}>{row.label}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: row.color }}>{row.value}</span>
                        </div>
                      ))}
                    </div>

                    {c.notes && (
                      <div style={{ marginTop: 12, padding: '8px 12px', background: S.bg, borderRadius: S.radiusSm, border: `1px solid ${S.borderLight}` }}>
                        <div style={{ fontSize: 11, color: S.textMuted, marginBottom: 4 }}>Notes</div>
                        <div style={{ fontSize: 12, color: S.textSecondary }}>{c.notes}</div>
                      </div>
                    )}

                    <button onClick={() => { if (confirm('Delete this community?')) deleteCommunity(c.id) }}
                      style={{ marginTop: 12, fontSize: 11, color: S.red, background: 'none', border: 'none', cursor: 'pointer' }}>
                      Delete Community
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: S.textMuted, fontSize: 13 }}>No communities found</div>
        )}
      </div>
    </div>
  )
}
