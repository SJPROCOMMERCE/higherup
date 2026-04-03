'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { SupportCannedResponse } from '@/lib/supabase'
import Link from 'next/link'

const T = {
  black:  '#111111',
  muted:  '#666666',
  ghost:  '#999999',
  border: '#EEEEEE',
  bg:     '#FAFAFA',
  green:  '#2DB87E',
}

const CATEGORIES = ['bug', 'question', 'feature_request', 'billing', 'general']

export default function CannedResponsesPage() {
  const [canned,    setCanned]    = useState<SupportCannedResponse[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [editItem,  setEditItem]  = useState<SupportCannedResponse | null>(null)
  const [adminId,   setAdminId]   = useState<string | null>(null)

  // Form state
  const [title,    setTitle]    = useState('')
  const [message,  setMessage]  = useState('')
  const [category, setCategory] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) setAdminId(data.user.id) })
    void load()
  }, [])

  async function load() {
    setLoading(true)
    const res  = await fetch('/api/support/canned')
    const data = await res.json()
    if (Array.isArray(data)) setCanned(data)
    setLoading(false)
  }

  function openCreate() {
    setEditItem(null); setTitle(''); setMessage(''); setCategory(''); setError(''); setShowForm(true)
  }

  function openEdit(item: SupportCannedResponse) {
    setEditItem(item); setTitle(item.title); setMessage(item.message); setCategory(item.category ?? ''); setError(''); setShowForm(true)
  }

  async function save() {
    if (!title.trim()) return setError('Title is required')
    if (!message.trim()) return setError('Message is required')
    setSaving(true); setError('')
    try {
      if (editItem) {
        await fetch(`/api/support/canned/${editItem.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, message, category: category || null }),
        })
      } else {
        await fetch('/api/support/canned', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, message, category: category || null, created_by: adminId }),
        })
      }
      setShowForm(false)
      void load()
    } catch { setError('Failed to save') } finally { setSaving(false) }
  }

  async function deleteCanned(id: string) {
    if (!confirm('Delete this canned response?')) return
    await fetch(`/api/support/canned/${id}`, { method: 'DELETE' })
    void load()
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ marginBottom: 6 }}>
            <Link href="/admin/support" style={{ fontSize: 12, color: T.ghost, textDecoration: 'none' }}>← Back to Support</Link>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: T.black, margin: 0 }}>Canned Responses</h1>
          <p style={{ fontSize: 13, color: T.muted, margin: '4px 0 0' }}>Pre-written answers for common VA questions</p>
        </div>
        <button
          onClick={openCreate}
          style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: T.black, color: '#FFFFFF', border: 'none', cursor: 'pointer' }}
        >
          + Add response
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{
          background: '#FAFAFA', border: `1px solid ${T.border}`, borderRadius: 12,
          padding: 24, marginBottom: 28,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: T.black, margin: '0 0 18px' }}>
            {editItem ? 'Edit response' : 'New canned response'}
          </h3>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: T.muted, marginBottom: 5 }}>Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. CSV upload error"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 7, fontSize: 13, border: `1.5px solid ${T.border}`, outline: 'none', color: T.black, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: T.muted, marginBottom: 5 }}>Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 7, fontSize: 13, border: `1.5px solid ${T.border}`, outline: 'none', color: T.black, background: '#FFFFFF', boxSizing: 'border-box' }}
            >
              <option value="">All categories</option>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: T.muted, marginBottom: 5 }}>Message *</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="The full response text..."
              rows={5}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 7, fontSize: 13, border: `1.5px solid ${T.border}`, outline: 'none', color: T.black, resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5 }}
            />
          </div>
          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 7, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: '#B91C1C' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', borderRadius: 7, fontSize: 13, border: `1.5px solid ${T.border}`, background: 'none', color: T.muted, cursor: 'pointer' }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500, background: saving ? '#999' : T.black, color: '#FFFFFF', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: T.ghost, fontSize: 13 }}>Loading...</div>
      ) : canned.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: T.ghost }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <p style={{ fontSize: 14, margin: 0 }}>No canned responses yet. Create your first one above.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {canned.map(item => (
            <div
              key={item.id}
              style={{
                background: '#FFFFFF', border: `1px solid ${T.border}`, borderRadius: 10,
                padding: '16px 20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.black }}>{item.title}</span>
                    {item.category && (
                      <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: '#F3F4F6', color: T.muted, border: `1px solid ${T.border}` }}>
                        {item.category.replace('_', ' ')}
                      </span>
                    )}
                    {item.usage_count > 0 && (
                      <span style={{ fontSize: 11, color: T.ghost }}>Used {item.usage_count}×</span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: T.muted, margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.message}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => openEdit(item)}
                    style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#F9FAFB', color: T.muted, cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteCanned(item.id)}
                    style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
