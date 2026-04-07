'use client'
import { useState } from 'react'
import { S, type Community } from '../shared'

const PLATFORMS = ['facebook', 'whatsapp', 'telegram', 'linkedin', 'discord', 'other']
const STATUS_COLORS: Record<string, string> = {
  active: S.green, inactive: S.textMuted, blacklisted: S.red,
}
const PLATFORM_ICONS: Record<string, string> = {
  facebook: 'FB', whatsapp: 'WA', telegram: 'TG', linkedin: 'LI', discord: 'DC', other: '??',
}

type Props = {
  communities: Community[]
  onUpdate: (c: Community[]) => void
}

export default function CommunitiesTab({ communities, onUpdate }: Props) {
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', platform: 'facebook', url: '', description: '', member_count: 0, notes: '' })

  const filtered = communities.filter(c => {
    if (search) {
      const q = search.toLowerCase()
      return c.name.toLowerCase().includes(q) || c.platform.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q)
    }
    return true
  })

  // Stats
  const totalMembers = communities.reduce((s, c) => s + (c.member_count || 0), 0)
  const activeCommunities = communities.filter(c => c.status === 'active').length

  async function addCommunity() {
    if (!form.name.trim()) return
    const res = await fetch('/api/admin/genx/communities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const { community } = await res.json()
      onUpdate([community, ...communities])
      resetForm()
    }
  }

  async function updateCommunity(id: string) {
    await fetch(`/api/admin/genx/communities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    onUpdate(communities.map(c => c.id === id ? { ...c, ...form, updated_at: new Date().toISOString() } : c))
    resetForm()
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/admin/genx/communities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    onUpdate(communities.map(c => c.id === id ? { ...c, status } : c))
  }

  async function deleteCommunity(id: string) {
    await fetch(`/api/admin/genx/communities/${id}`, { method: 'DELETE' })
    onUpdate(communities.filter(c => c.id !== id))
  }

  function startEdit(c: Community) {
    setEditId(c.id)
    setForm({ name: c.name, platform: c.platform, url: c.url || '', description: c.description || '', member_count: c.member_count, notes: c.notes || '' })
    setShowAdd(true)
  }

  function resetForm() {
    setForm({ name: '', platform: 'facebook', url: '', description: '', member_count: 0, notes: '' })
    setShowAdd(false)
    setEditId(null)
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <div style={{ background: S.surface, borderRadius: S.radius, padding: '16px 20px', border: `1px solid ${S.border}` }}>
          <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 4 }}>Total Communities</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: S.text }}>{communities.length}</div>
        </div>
        <div style={{ background: S.surface, borderRadius: S.radius, padding: '16px 20px', border: `1px solid ${S.border}` }}>
          <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 4 }}>Active</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: S.green }}>{activeCommunities}</div>
        </div>
        <div style={{ background: S.surface, borderRadius: S.radius, padding: '16px 20px', border: `1px solid ${S.border}` }}>
          <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 4 }}>Total Members</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: S.accent }}>{totalMembers.toLocaleString()}</div>
        </div>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <input
          placeholder="Search communities..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 14px', fontSize: 13, width: 280, outline: 'none' }}
        />
        <button
          onClick={() => { resetForm(); setShowAdd(!showAdd) }}
          style={{ background: S.accent, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + Add Community
        </button>
      </div>

      {/* Add/Edit form */}
      {showAdd && (
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: S.radius, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
            <input placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
            <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, background: S.bg }}>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input placeholder="URL" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
            <input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
            <input type="number" placeholder="Member count" value={form.member_count || ''} onChange={e => setForm({ ...form, member_count: parseInt(e.target.value) || 0 })}
              style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <input placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              style={{ flex: 1, border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13 }} />
            <button onClick={() => editId ? updateCommunity(editId) : addCommunity()}
              style={{ background: S.accent, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {editId ? 'Update' : 'Save'}
            </button>
            <button onClick={resetForm}
              style={{ background: S.surface, color: S.textSecondary, border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Communities grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {filtered.map(c => (
          <div key={c.id} style={{ background: S.bg, borderRadius: S.radius, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: S.radiusSm, background: S.accentLight,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: S.accent,
                  }}>
                    {PLATFORM_ICONS[c.platform] || '??'}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: S.text }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: S.textMuted, textTransform: 'capitalize' }}>{c.platform}</div>
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: STATUS_COLORS[c.status], textTransform: 'uppercase' }}>{c.status}</span>
              </div>

              {c.description && <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 8 }}>{c.description}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                <div style={{ background: S.surface, borderRadius: S.radiusSm, padding: '6px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: S.text }}>{(c.member_count || 0).toLocaleString()}</div>
                  <div style={{ fontSize: 10, color: S.textMuted }}>Members</div>
                </div>
                <div style={{ background: S.surface, borderRadius: S.radiusSm, padding: '6px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: S.accent }}>{c.prospect_count || 0}</div>
                  <div style={{ fontSize: 10, color: S.textMuted }}>Prospects</div>
                </div>
                <div style={{ background: S.surface, borderRadius: S.radiusSm, padding: '6px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: S.green }}>{c.lg_count || 0}</div>
                  <div style={{ fontSize: 10, color: S.textMuted }}>LGs</div>
                </div>
              </div>

              {c.url && (
                <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: S.accent, textDecoration: 'none' }}>
                  Open link
                </a>
              )}

              {c.notes && <div style={{ fontSize: 11, color: S.textMuted, marginTop: 4 }}>{c.notes}</div>}
            </div>

            <div style={{ borderTop: `1px solid ${S.borderLight}`, padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {c.status === 'active' && (
                  <button onClick={() => updateStatus(c.id, 'inactive')} style={{ fontSize: 11, color: S.textSecondary, background: 'none', border: 'none', cursor: 'pointer' }}>Deactivate</button>
                )}
                {c.status === 'inactive' && (
                  <button onClick={() => updateStatus(c.id, 'active')} style={{ fontSize: 11, color: S.green, background: 'none', border: 'none', cursor: 'pointer' }}>Activate</button>
                )}
                <button onClick={() => startEdit(c)} style={{ fontSize: 11, color: S.accent, background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
              </div>
              <button onClick={() => deleteCommunity(c.id)} style={{ fontSize: 11, color: S.red, background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: S.textMuted, fontSize: 13 }}>No communities found</div>
        )}
      </div>
    </div>
  )
}
