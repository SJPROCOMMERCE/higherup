'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { VA, Client, Affiliate, ReferralCode } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { generateUniqueLoginCode } from '@/lib/generate-login-code'
import { createInvite } from '@/lib/invite'
import { SelectAllCheckbox } from '@/components/admin/SelectAllCheckbox'

// ─── Design Tokens ────────────────────────────────────────────────────────────

const T = {
  black: '#111111', sec: '#555555', ter: '#999999', ghost: '#CCCCCC',
  div: '#EEEEEE', row: '#FAFAFA', bg: '#FFFFFF',
}

// ─── Extended Types ───────────────────────────────────────────────────────────

type VAx = VA & { admin_notes?: string | null }

type UploadRow = {
  id: string
  va_id: string
  client_id: string
  store_name: string | null
  product_row_count: number | null
  status: string
  uploaded_at: string
  api_cost_usd: number | null
}

type BillingRow = {
  id: string
  va_id: string
  month: string
  total_amount: number
  status: string
}

type ActivityRow = {
  id: string
  action: string
  details: string
  created_at: string
  source: string
  severity: string
}

type CurrentMonthUpload = {
  client_id: string
  product_row_count: number | null
  clients: { store_name: string } | null
}

type InviteRow = {
  id: string
  token: string
  note: string | null
  invited_by: string
  created_at: string
  expires_at: string
  used: boolean
  revoked: boolean
}

type VADetail = {
  clients: Client[]
  uploads: UploadRow[]
  billing: BillingRow[]
  currentMonthUploads: CurrentMonthUpload[]
  allTimePaid: number
  lockedCount: number
  referralCode: ReferralCode | null
  affiliatesReferred: Affiliate[]
  referrerName: string | null
  activityLog: ActivityRow[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  wise: 'Wise', paypal: 'PayPal', gcash: 'GCash', maya: 'Maya',
  upi: 'UPI', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa',
  bkash: 'bKash', bank_transfer: 'Bank Transfer',
}

const COUNTRY_NAMES: Record<string, string> = {
  PH: 'Philippines', ID: 'Indonesia', IN: 'India', PK: 'Pakistan',
  BD: 'Bangladesh', US: 'United States', GB: 'United Kingdom',
  AU: 'Australia', CA: 'Canada', DE: 'Germany', FR: 'France',
  NL: 'Netherlands', SG: 'Singapore', MY: 'Malaysia', VN: 'Vietnam',
  TH: 'Thailand', KE: 'Kenya', NG: 'Nigeria', ZA: 'South Africa',
}

const TIER_LABELS: Record<string, string> = {
  tier_1: 'T1 $50', tier_2: 'T2 $110', tier_3: 'T3 $220', tier_4: 'T4 $350',
}

const PAGE_SIZE = 20

type SortKey = 'recent' | 'name_asc' | 'name_desc' | 'most_clients' | 'most_variants' | 'highest_revenue' | 'newest' | 'oldest'
type FilterStatus = 'all' | 'active' | 'pending_approval' | 'paused' | 'blocked'
type BulkActionKey = 'pause' | 'block' | 'reactivate' | 'reminder' | 'export'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  const months = Math.floor(days / 30)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 30) return `${days}d ago`
  return `${months}mo ago`
}

function monthsAgo(iso: string): number {
  const then = new Date(iso)
  const now = new Date()
  return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth())
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function shortVAId(id: string): string {
  return `VA-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

function getMonthBounds(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
  return { start, end }
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text)
}

// ─── Field Component ──────────────────────────────────────────────────────────

function Field({ label, value, mono = false, link }: { label: string; value: React.ReactNode; mono?: boolean; link?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#DDDDDD', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
      {link ? (
        <a href={link} style={{ fontSize: 14, color: T.black, fontFamily: mono ? 'monospace' : 'inherit', textDecoration: 'none' }}>{value}</a>
      ) : (
        <div style={{ fontSize: 14, color: T.black, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminVAsPage() {
  // ─── Page-level data ──────────────────────────────────────────────────────
  const [vas, setVAs] = useState<VAx[]>([])
  const [clientCounts, setClientCounts] = useState<Record<string, { count: number; variants: number }>>({})
  const [outstandingBilling, setOutstandingBilling] = useState<Record<string, number>>({})
  const [allTimePaidMap, setAllTimePaidMap] = useState<Record<string, number>>({})
  const [lastUploadMap, setLastUploadMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  // ─── Per-VA detail (lazy) ──────────────────────────────────────────────────
  const [details, setDetails] = useState<Record<string, VADetail>>({})
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({})

  // ─── UI state ─────────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [sortKey, setSortKey] = useState<SortKey>('recent')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkAction, setBulkAction] = useState<BulkActionKey | null>(null)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [working, setWorking] = useState<string | null>(null)
  const [actionState, setActionState] = useState<Record<string, string>>({}) // vaId → active action
  const [actionReason, setActionReason] = useState<Record<string, string>>({}) // vaId → reason text
  const [deleteStep, setDeleteStep] = useState<Record<string, 1 | 2>>({})
  const [deleteText, setDeleteText] = useState<Record<string, string>>({})
  const [unblockReactivate, setUnblockReactivate] = useState<Record<string, boolean>>({})
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({})
  const [notesSaved, setNotesSaved] = useState<Record<string, boolean>>({})
  const [exportHover, setExportHover] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)

  // ─── Add VA modal ─────────────────────────────────────────────────────────
  const [showAddVA, setShowAddVA]       = useState(false)
  const [addVAName, setAddVAName]       = useState('')
  const [addVAWorking, setAddVAWorking] = useState(false)
  const [addVAError, setAddVAError]     = useState<string | null>(null)
  const [addVACode, setAddVACode]       = useState<string | null>(null) // code shown after creation
  const [addVACodeCopied, setAddVACodeCopied] = useState(false)

  // ─── Invite modal ─────────────────────────────────────────────────────────
  const [showInvite,      setShowInvite]      = useState(false)
  const [inviteNote,      setInviteNote]      = useState('')
  const [inviteWorking,   setInviteWorking]   = useState(false)
  const [inviteError,     setInviteError]     = useState<string | null>(null)
  const [inviteLink,      setInviteLink]      = useState<string | null>(null)
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false)
  const [invites,         setInvites]         = useState<InviteRow[]>([])
  const [invitesLoaded,   setInvitesLoaded]   = useState(false)

  // ─── Load page-level data ─────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    const { start, end } = getMonthBounds()

    const [vaRes, clientRes, uploadsMonthRes, outstandingRes, paidRes, lastUploadRes] = await Promise.all([
      supabase.from('vas').select('*').neq('status', 'deleted').order('joined_at', { ascending: false }),
      supabase.from('clients').select('va_id, id, current_month_variants'),
      supabase.from('uploads').select('va_id, product_row_count, uploaded_at').eq('status', 'done').gte('uploaded_at', start).lt('uploaded_at', end),
      supabase.from('billing').select('va_id, total_amount, status').in('status', ['outstanding', 'overdue']),
      supabase.from('billing').select('va_id, total_amount').eq('status', 'paid'),
      supabase.from('uploads').select('va_id, uploaded_at').eq('status', 'done').order('uploaded_at', { ascending: false }).limit(500),
    ])

    setVAs((vaRes.data ?? []) as unknown as VAx[])

    // Client counts + variants
    const cc: Record<string, { count: number; variants: number }> = {}
    for (const row of (clientRes.data ?? []) as { va_id: string; id: string; current_month_variants: number | null }[]) {
      if (!cc[row.va_id]) cc[row.va_id] = { count: 0, variants: 0 }
      cc[row.va_id].count += 1
      cc[row.va_id].variants += row.current_month_variants ?? 0
    }
    setClientCounts(cc)

    // Month variants already counted per-client above; current month uploads
    // (used for variant accuracy per VA)
    const monthVariants: Record<string, number> = {}
    for (const row of (uploadsMonthRes.data ?? []) as { va_id: string; product_row_count: number | null }[]) {
      monthVariants[row.va_id] = (monthVariants[row.va_id] ?? 0) + (row.product_row_count ?? 0)
    }

    // Outstanding billing
    const ob: Record<string, number> = {}
    for (const row of (outstandingRes.data ?? []) as { va_id: string; total_amount: number }[]) {
      ob[row.va_id] = (ob[row.va_id] ?? 0) + row.total_amount
    }
    setOutstandingBilling(ob)

    // All-time paid
    const ap: Record<string, number> = {}
    for (const row of (paidRes.data ?? []) as { va_id: string; total_amount: number }[]) {
      ap[row.va_id] = (ap[row.va_id] ?? 0) + row.total_amount
    }
    setAllTimePaidMap(ap)

    // Last upload per VA
    const lu: Record<string, string> = {}
    for (const row of (lastUploadRes.data ?? []) as { va_id: string; uploaded_at: string }[]) {
      if (!lu[row.va_id]) lu[row.va_id] = row.uploaded_at
    }
    setLastUploadMap(lu)

    setLoading(false)
  }, [])

  useEffect(() => { void loadAll() }, [loadAll])

  // ─── Load per-VA detail ───────────────────────────────────────────────────
  const loadDetail = useCallback(async (va: VAx) => {
    if (details[va.id] || detailLoading[va.id]) return
    setDetailLoading(prev => ({ ...prev, [va.id]: true }))

    const { start, end } = getMonthBounds()

    const [
      clientsRes,
      uploadsRes,
      billingRes,
      currentMonthRes,
      allTimePaidRes,
      refCodeRes,
      affiliatesReferredRes,
      affiliateAsReferredRes,
      activityRes,
      lockedRes,
    ] = await Promise.all([
      supabase.from('clients').select('*').eq('va_id', va.id).limit(10),
      supabase.from('uploads').select('id, store_name, product_row_count, status, uploaded_at, api_cost_usd, client_id').eq('va_id', va.id).order('uploaded_at', { ascending: false }).limit(10),
      supabase.from('billing').select('id, month, total_amount, status').eq('va_id', va.id).order('month', { ascending: false }).limit(6),
      supabase.from('uploads').select('client_id, product_row_count, clients(store_name)').eq('va_id', va.id).eq('status', 'done').gte('uploaded_at', start).lt('uploaded_at', end),
      supabase.from('billing').select('total_amount').eq('va_id', va.id).eq('status', 'paid'),
      supabase.from('referral_codes').select('*').eq('va_id', va.id).maybeSingle(),
      supabase.from('affiliates').select('referred_va_id, referred_va_name, referred_va_status, referred_at').eq('referrer_va_id', va.id).limit(10),
      supabase.from('affiliates').select('referrer_va_id').eq('referred_va_id', va.id).maybeSingle(),
      supabase.from('activity_log').select('id, action, details, created_at, source, severity').eq('va_id', va.id).order('created_at', { ascending: false }).limit(15),
      supabase.from('uploads').select('id', { count: 'exact', head: true }).eq('va_id', va.id).eq('output_locked', true),
    ])

    // Resolve referrer name
    let referrerName: string | null = null
    const referrerVaId = (affiliateAsReferredRes.data as { referrer_va_id: string } | null)?.referrer_va_id
    if (referrerVaId) {
      const { data: rva } = await supabase.from('vas').select('name').eq('id', referrerVaId).maybeSingle()
      referrerName = (rva as { name: string } | null)?.name ?? null
    }

    const allTimePaid = ((allTimePaidRes.data ?? []) as { total_amount: number }[]).reduce((s, r) => s + r.total_amount, 0)

    setDetails(prev => ({
      ...prev,
      [va.id]: {
        clients: (clientsRes.data ?? []) as Client[],
        uploads: (uploadsRes.data ?? []) as UploadRow[],
        billing: (billingRes.data ?? []) as BillingRow[],
        currentMonthUploads: (currentMonthRes.data ?? []) as unknown as CurrentMonthUpload[],
        allTimePaid,
        lockedCount: lockedRes.count ?? 0,
        referralCode: (refCodeRes.data ?? null) as ReferralCode | null,
        affiliatesReferred: (affiliatesReferredRes.data ?? []) as Affiliate[],
        referrerName,
        activityLog: (activityRes.data ?? []) as ActivityRow[],
      },
    }))
    setAdminNotes(prev => ({ ...prev, [va.id]: va.admin_notes ?? '' }))
    setDetailLoading(prev => ({ ...prev, [va.id]: false }))
  }, [details, detailLoading])

  // ─── Top stats ────────────────────────────────────────────────────────────
  const totalRevenue = useMemo(() => Object.values(allTimePaidMap).reduce((s, v) => s + v, 0), [allTimePaidMap])
  const activeVAs = useMemo(() => vas.filter(v => v.status === 'active'), [vas])
  const avgRevenuePerVA = activeVAs.length ? totalRevenue / activeVAs.length : 0
  const avgClientsPerVA = activeVAs.length
    ? activeVAs.reduce((s, v) => s + (clientCounts[v.id]?.count ?? 0), 0) / activeVAs.length
    : 0
  const avgVariantsPerVA = activeVAs.length
    ? activeVAs.reduce((s, v) => s + (clientCounts[v.id]?.variants ?? 0), 0) / activeVAs.length
    : 0

  const statusCounts = useMemo(() => ({
    active: vas.filter(v => v.status === 'active').length,
    pending: vas.filter(v => v.status === 'pending_approval').length,
    paused: vas.filter(v => v.status === 'paused').length,
    blocked: vas.filter(v => v.status === 'blocked').length,
  }), [vas])

  // ─── Filtered + sorted + paginated list ──────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...vas]
    if (filterStatus !== 'all') list = list.filter(v => v.status === filterStatus)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(v =>
        v.name.toLowerCase().includes(q) ||
        (v.email ?? '').toLowerCase().includes(q) ||
        shortVAId(v.id).toLowerCase().includes(q) ||
        (v.country ?? '').toLowerCase().includes(q) ||
        (COUNTRY_NAMES[v.country ?? ''] ?? '').toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      switch (sortKey) {
        case 'name_asc': return a.name.localeCompare(b.name)
        case 'name_desc': return b.name.localeCompare(a.name)
        case 'most_clients': return (clientCounts[b.id]?.count ?? 0) - (clientCounts[a.id]?.count ?? 0)
        case 'most_variants': return (clientCounts[b.id]?.variants ?? 0) - (clientCounts[a.id]?.variants ?? 0)
        case 'highest_revenue': return (allTimePaidMap[b.id] ?? 0) - (allTimePaidMap[a.id] ?? 0)
        case 'newest': return new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()
        case 'oldest': return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
        case 'recent': {
          const la = lastUploadMap[a.id] ?? a.joined_at
          const lb = lastUploadMap[b.id] ?? b.joined_at
          return new Date(lb).getTime() - new Date(la).getTime()
        }
      }
    })
    return list
  }, [vas, filterStatus, search, sortKey, clientCounts, allTimePaidMap, lastUploadMap])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageVAs = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page])

  // ─── Actions ──────────────────────────────────────────────────────────────
  async function notifyVA(va_id: string, type: string, title: string, message: string) {
    await supabase.from('notifications').insert({ va_id, type, title, message, is_read: false })
  }

  async function handleApprove(va: VAx) {
    setWorking(va.id)
    await supabase.from('vas').update({ status: 'active' }).eq('id', va.id)
    await notifyVA(va.id, 'account_approved', 'Welcome to HigherUp!', 'Your account has been approved. Start by registering your first client.')
    void logActivity({ action: 'va_approved', va_id: va.id, source: 'admin', details: `VA ${va.name} approved` })
    await loadAll()
    setWorking(null)
    setActionState(prev => { const n = { ...prev }; delete n[va.id]; return n })
  }

  async function handleReject(va: VAx) {
    const reason = actionReason[va.id]?.trim() ?? ''
    if (!reason) return
    setWorking(va.id)
    await supabase.from('vas').update({ status: 'blocked' }).eq('id', va.id)
    await notifyVA(va.id, 'account_rejected', 'Account not approved', reason)
    void logActivity({ action: 'va_rejected', va_id: va.id, source: 'admin', severity: 'warning', details: `VA ${va.name} rejected: ${reason}` })
    await loadAll()
    setWorking(null)
    setActionState(prev => { const n = { ...prev }; delete n[va.id]; return n })
  }

  async function handlePause(va: VAx) {
    const reason = actionReason[va.id]?.trim() ?? ''
    if (!reason) return
    setWorking(va.id)
    await supabase.from('vas').update({ status: 'paused' }).eq('id', va.id)
    await notifyVA(va.id, 'account_paused', 'Account paused', reason)
    void logActivity({ action: 'va_paused', va_id: va.id, source: 'admin', severity: 'warning', details: `VA ${va.name} paused: ${reason}` })
    await loadAll()
    setWorking(null)
    setActionState(prev => { const n = { ...prev }; delete n[va.id]; return n })
  }

  async function handleBlock(va: VAx) {
    const reason = actionReason[va.id]?.trim() ?? ''
    if (!reason) return
    setWorking(va.id)
    await supabase.from('vas').update({ status: 'blocked' }).eq('id', va.id)
    await supabase.from('clients').update({ is_active: false, deactivation_reason: 'VA blocked' }).eq('va_id', va.id)
    await notifyVA(va.id, 'account_blocked', 'Account blocked', reason)
    void logActivity({ action: 'va_blocked', va_id: va.id, source: 'admin', severity: 'warning', details: `VA ${va.name} blocked: ${reason}` })
    await loadAll()
    setWorking(null)
    setActionState(prev => { const n = { ...prev }; delete n[va.id]; return n })
  }

  async function handleReactivate(va: VAx) {
    setWorking(va.id)
    await supabase.from('vas').update({ status: 'active' }).eq('id', va.id)
    await notifyVA(va.id, 'account_reactivated' as string, 'Account reactivated', 'Your account has been reactivated.')
    void logActivity({ action: 'va_unblocked', va_id: va.id, source: 'admin', details: `VA ${va.name} reactivated from paused` })
    await loadAll()
    setWorking(null)
    setActionState(prev => { const n = { ...prev }; delete n[va.id]; return n })
  }

  async function handleUnblock(va: VAx) {
    setWorking(va.id)
    await supabase.from('vas').update({ status: 'active' }).eq('id', va.id)
    if (unblockReactivate[va.id] !== false) {
      await supabase.from('clients').update({ is_active: true, deactivation_reason: null }).eq('va_id', va.id).eq('deactivation_reason', 'VA blocked')
    }
    await notifyVA(va.id, 'account_reactivated' as string, 'Account reactivated', 'Your account has been reactivated.')
    void logActivity({ action: 'va_unblocked', va_id: va.id, source: 'admin', details: `VA ${va.name} unblocked` })
    await loadAll()
    setWorking(null)
    setActionState(prev => { const n = { ...prev }; delete n[va.id]; return n })
  }

  async function handleDelete(va: VAx) {
    if (deleteText[va.id] !== 'DELETE') return
    setWorking(va.id)
    await supabase.from('vas').update({ status: 'deleted' as VA['status'] }).eq('id', va.id)
    await supabase.from('clients').update({ is_active: false, deactivation_reason: 'VA deleted' }).eq('va_id', va.id)
    await supabase.from('affiliates').update({ is_active: false }).or(`referrer_va_id.eq.${va.id},referred_va_id.eq.${va.id}`)
    void logActivity({ action: 'va_deleted', va_id: va.id, source: 'admin', severity: 'critical', details: `VA ${va.name} permanently deleted` })
    await loadAll()
    setWorking(null)
    setExpanded(null)
    setActionState(prev => { const n = { ...prev }; delete n[va.id]; return n })
  }

  // ─── Create VA ────────────────────────────────────────────────────────────
  async function handleAddVA() {
    const name = addVAName.trim()
    if (!name) { setAddVAError('Name is required.'); return }
    setAddVAWorking(true)
    setAddVAError(null)
    try {
      const code = await generateUniqueLoginCode()
      const { error: insertErr } = await supabase
        .from('vas')
        .insert({
          name,
          status: 'pending_approval',
          payment_status: 'paid',
          login_code: code,
          onboarding_complete: false,
        } as Partial<VA>)
      if (insertErr) {
        setAddVAError(insertErr.message)
        setAddVAWorking(false)
        return
      }
      void logActivity({ action: 'va_created', source: 'admin', details: `Created VA "${name}" with code ${code}` })
      await loadAll()
      setAddVACode(code)
      setAddVAName('')
    } catch (err) {
      setAddVAError(err instanceof Error ? err.message : 'Failed to create VA')
    }
    setAddVAWorking(false)
  }

  function closeAddVAModal() {
    setShowAddVA(false)
    setAddVAName('')
    setAddVAError(null)
    setAddVACode(null)
    setAddVACodeCopied(false)
  }

  // ─── Invite ───────────────────────────────────────────────────────────────
  async function loadInvites() {
    const { data } = await supabase
      .from('invites')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setInvites((data ?? []) as InviteRow[])
    setInvitesLoaded(true)
  }

  async function handleCreateInvite() {
    setInviteWorking(true)
    setInviteError(null)
    try {
      const { link } = await createInvite(inviteNote.trim() || undefined, 'admin')
      setInviteLink(`${window.location.origin}${link}`)
      void loadInvites()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to create invite')
    }
    setInviteWorking(false)
  }

  async function handleRevokeInvite(id: string) {
    await supabase.from('invites').update({ revoked: true }).eq('id', id)
    void loadInvites()
  }

  function closeInviteModal() {
    setShowInvite(false)
    setInviteNote('')
    setInviteError(null)
    setInviteLink(null)
    setInviteLinkCopied(false)
  }

  async function handleSaveNotes(va: VAx) {
    await supabase.from('vas').update({ admin_notes: adminNotes[va.id] ?? '' } as Partial<VAx>).eq('id', va.id)
    setNotesSaved(prev => ({ ...prev, [va.id]: true }))
    setTimeout(() => setNotesSaved(prev => ({ ...prev, [va.id]: false })), 2000)
  }

  // ─── Bulk actions ─────────────────────────────────────────────────────────
  async function handleBulkAction() {
    if (!bulkAction) return
    const ids = Array.from(selected)
    if (bulkAction === 'export') {
      exportCSV(vas.filter(v => ids.includes(v.id)))
      setSelected(new Set()); setBulkOpen(false); setBulkAction(null); setBulkConfirm(false)
      return
    }
    setWorking('bulk')
    for (const id of ids) {
      const va = vas.find(v => v.id === id)
      if (!va) continue
      if (bulkAction === 'pause') {
        await supabase.from('vas').update({ status: 'paused' }).eq('id', id)
        void logActivity({ action: 'va_paused', va_id: id, source: 'admin', details: `Bulk pause: ${va.name}` })
      } else if (bulkAction === 'block') {
        await supabase.from('vas').update({ status: 'blocked' }).eq('id', id)
        await supabase.from('clients').update({ is_active: false, deactivation_reason: 'VA blocked' }).eq('va_id', id)
        void logActivity({ action: 'va_blocked', va_id: id, source: 'admin', details: `Bulk block: ${va.name}` })
      } else if (bulkAction === 'reactivate') {
        await supabase.from('vas').update({ status: 'active' }).eq('id', id)
        void logActivity({ action: 'va_unblocked', va_id: id, source: 'admin', details: `Bulk reactivate: ${va.name}` })
      } else if (bulkAction === 'reminder') {
        await notifyVA(id, 'invoice_overdue', 'Payment reminder', 'This is a reminder that you have an outstanding invoice.')
      }
    }
    await loadAll()
    setWorking(null)
    setSelected(new Set())
    setBulkOpen(false)
    setBulkAction(null)
    setBulkConfirm(false)
  }

  // ─── Select all ───────────────────────────────────────────────────────────
  const allVAsSelected  = pageVAs.length > 0 && pageVAs.every(v => selected.has(v.id))
  const someVAsSelected = pageVAs.some(v => selected.has(v.id))
  function toggleSelectAllVAs() {
    if (allVAsSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(pageVAs.map(v => v.id)))
    }
  }

  // ─── CSV Export ───────────────────────────────────────────────────────────
  function exportCSV(list: VAx[]) {
    const headers = ['VA ID', 'Name', 'Email', 'Country', 'Phone', 'Payment Method', 'Status', 'Joined', 'Clients Count', 'Monthly Products', 'Revenue All Time', 'Referred By', 'Referral Code', 'Streak']
    const rows = list.map(v => [
      shortVAId(v.id),
      v.name,
      v.email ?? '',
      v.country ?? '',
      v.phone_number ?? '',
      PAYMENT_LABELS[v.payment_method ?? ''] ?? '',
      v.status,
      formatDate(v.joined_at),
      String(clientCounts[v.id]?.count ?? 0),
      String(clientCounts[v.id]?.variants ?? 0),
      `$${(allTimePaidMap[v.id] ?? 0).toFixed(2)}`,
      v.referred_by ?? '',
      '',
      '',
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `vas_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Toggle expand ────────────────────────────────────────────────────────
  function toggleExpand(va: VAx) {
    if (expanded === va.id) {
      setExpanded(null)
    } else {
      setExpanded(va.id)
      void loadDetail(va)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ paddingTop: 48, paddingBottom: 100, maxWidth: 1100, margin: '0 auto', paddingInline: 48, fontFamily: 'inherit' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 40 }}>
        <div style={{ fontSize: 28, fontWeight: 300, color: T.black }}>VA management</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ fontSize: 13, color: T.ghost }}>
            {statusCounts.active} active · {statusCounts.pending} pending · {statusCounts.paused} paused · {statusCounts.blocked} blocked · {vas.length} total
          </span>
          <button
            onClick={() => exportCSV(filtered)}
            onMouseEnter={() => setExportHover(true)}
            onMouseLeave={() => setExportHover(false)}
            style={{
              fontSize: 12, color: exportHover ? T.black : T.ghost,
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', transition: 'color 0.15s', padding: 0,
            }}
          >
            Export all VAs
          </button>
          <button
            onClick={() => { setShowInvite(true); if (!invitesLoaded) void loadInvites() }}
            style={{
              fontSize: 12, fontWeight: 500, color: T.black,
              background: 'none', border: `1px solid ${T.div}`, cursor: 'pointer',
              fontFamily: 'inherit', borderRadius: 8,
              padding: '7px 16px', transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            + Invite operator
          </button>
          <button
            onClick={() => setShowAddVA(true)}
            style={{
              fontSize: 12, fontWeight: 500, color: T.bg,
              background: T.black, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', borderRadius: 8,
              padding: '7px 16px', transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.8' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            + Add VA
          </button>
        </div>
      </div>

      {/* ── Top Stats ── */}
      <div style={{ display: 'flex', gap: 48, marginBottom: 48 }}>
        {[
          { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
          { label: 'Avg Revenue/VA', value: `$${avgRevenuePerVA.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
          { label: 'Avg Clients/VA', value: avgClientsPerVA.toFixed(1) },
          { label: 'Avg Products/VA', value: `${avgVariantsPerVA.toFixed(0)}/mo` },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: 36, fontWeight: 600, color: T.black, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em', marginTop: 6 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Search ── */}
      <input
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1) }}
        placeholder="Search by name, email, VA ID, or country…"
        style={{
          width: '100%', border: 'none', borderBottom: `1.5px solid ${T.div}`,
          padding: '10px 0', fontSize: 13, color: T.black, background: 'transparent',
          outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 24,
        }}
        onFocus={e => { e.target.style.borderBottomColor = T.black }}
        onBlur={e => { e.target.style.borderBottomColor = T.div }}
      />

      {/* ── Filter Pills + Sort ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['all', 'active', 'pending_approval', 'paused', 'blocked'] as FilterStatus[]).map(status => {
            const label = status === 'all' ? 'All' : status === 'pending_approval' ? 'Pending' : status.charAt(0).toUpperCase() + status.slice(1)
            const active = filterStatus === status
            return (
              <button
                key={status}
                onClick={() => { setFilterStatus(status); setPage(1) }}
                style={{
                  fontSize: 12, padding: '5px 14px',
                  borderRadius: 100, cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'all 0.15s',
                  border: active ? `1px solid ${T.black}` : `1px solid ${T.div}`,
                  color: active ? T.black : T.ghost,
                  background: active ? T.row : T.bg,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setSortOpen(v => !v)}
            style={{
              fontSize: 12, color: T.sec, background: 'none',
              border: `1px solid ${T.div}`, borderRadius: 6, padding: '5px 12px',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {sortKey === 'recent' ? 'Recent activity' : sortKey === 'name_asc' ? 'Name A–Z' : sortKey === 'name_desc' ? 'Name Z–A' : sortKey === 'most_clients' ? 'Most clients' : sortKey === 'most_variants' ? 'Most products' : sortKey === 'highest_revenue' ? 'Highest revenue' : sortKey === 'newest' ? 'Newest joined' : 'Oldest joined'} ▾
          </button>
          {sortOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 4,
              background: T.bg, border: `1px solid ${T.div}`, borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)', zIndex: 100, minWidth: 180,
            }}>
              {([
                ['recent', 'Recent activity'], ['name_asc', 'Name A–Z'], ['name_desc', 'Name Z–A'],
                ['most_clients', 'Most clients'], ['most_variants', 'Most products'],
                ['highest_revenue', 'Highest revenue'], ['newest', 'Newest joined'], ['oldest', 'Oldest joined'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setSortKey(key); setSortOpen(false); setPage(1) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                    color: sortKey === key ? T.black : T.sec,
                    fontWeight: sortKey === key ? 500 : 400,
                    background: 'none', border: 'none', fontFamily: 'inherit',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Bulk Actions Bar ── */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16,
          padding: '10px 16px', background: T.row, borderRadius: 8, border: `1px solid ${T.div}`,
        }}>
          <span style={{ fontSize: 13, color: T.black }}>{selected.size} selected</span>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setBulkOpen(v => !v)}
              style={{
                fontSize: 12, color: T.black, background: 'none',
                border: `1px solid ${T.div}`, borderRadius: 6, padding: '5px 12px',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Bulk actions ▾
            </button>
            {bulkOpen && (
              <div style={{
                position: 'absolute', left: 0, top: '100%', marginTop: 4,
                background: T.bg, border: `1px solid ${T.div}`, borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)', zIndex: 100, minWidth: 180,
              }}>
                {([
                  ['pause', 'Pause selected'], ['block', 'Block selected'],
                  ['reactivate', 'Reactivate selected'], ['reminder', 'Send reminder'],
                  ['export', 'Export selected (CSV)'],
                ] as [BulkActionKey, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { setBulkAction(key); setBulkOpen(false); setBulkConfirm(true) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                      color: T.sec, background: 'none', border: 'none', fontFamily: 'inherit',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {bulkConfirm && bulkAction && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: T.sec }}>
                {bulkAction === 'pause' ? 'Pause' : bulkAction === 'block' ? 'Block' : bulkAction === 'reactivate' ? 'Reactivate' : bulkAction === 'reminder' ? 'Send reminder to' : 'Export'} {selected.size} VA&apos;s?
              </span>
              <button
                onClick={() => void handleBulkAction()}
                disabled={working === 'bulk'}
                style={{
                  fontSize: 12, color: T.bg, background: T.black,
                  border: 'none', borderRadius: 6, padding: '5px 14px',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {working === 'bulk' ? 'Working…' : 'Confirm'}
              </button>
              <button
                onClick={() => { setBulkConfirm(false); setBulkAction(null) }}
                style={{ fontSize: 12, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── VA List ── */}
      {!loading && pageVAs.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${T.div}`, marginBottom: 4 }}>
          <SelectAllCheckbox
            allSelected={allVAsSelected}
            someSelected={someVAsSelected}
            onChange={toggleSelectAllVAs}
          />
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, fontWeight: 400 }}>
            {allVAsSelected ? 'Deselect all' : someVAsSelected ? `${selected.size} selected` : 'Select all'}
          </span>
        </div>
      )}
      {loading ? (
        <div style={{ fontSize: 13, color: T.ghost }}>Loading…</div>
      ) : pageVAs.length === 0 ? (
        <div style={{ fontSize: 13, color: T.ghost }}>No VAs found.</div>
      ) : (
        <div>
          {pageVAs.map(va => {
            const isExpanded = expanded === va.id
            const isWorking = working === va.id
            const cc = clientCounts[va.id] ?? { count: 0, variants: 0 }
            const owed = outstandingBilling[va.id] ?? 0
            const vaShortId = shortVAId(va.id)
            const country = va.country ? (COUNTRY_NAMES[va.country] ?? va.country) : null
            const rowOpacity = va.status === 'pending_approval' ? 0.6 : va.status === 'paused' ? 0.5 : va.status === 'blocked' ? 0.35 : 1
            const detail = details[va.id]
            const isDetailLoading = detailLoading[va.id] ?? false
            const act = actionState[va.id] ?? ''

            return (
              <div
                key={va.id}
                style={{ borderBottom: `1px solid ${T.row}`, opacity: rowOpacity, transition: 'opacity 0.15s' }}
                onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLDivElement).style.opacity = String(rowOpacity * 0.6) }}
                onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLDivElement).style.opacity = String(rowOpacity) }}
              >
                {/* ── Row ── */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBlock: 16, cursor: 'pointer' }}
                  onClick={() => toggleExpand(va)}
                >
                  {/* Checkbox */}
                  <div
                    onClick={e => {
                      e.stopPropagation()
                      setSelected(prev => {
                        const n = new Set(prev)
                        if (n.has(va.id)) n.delete(va.id); else n.add(va.id)
                        return n
                      })
                    }}
                    style={{
                      width: 15, height: 15, border: `1.5px solid ${selected.has(va.id) ? T.black : T.ghost}`,
                      borderRadius: 3, flexShrink: 0, cursor: 'pointer',
                      background: selected.has(va.id) ? T.black : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {selected.has(va.id) && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1 }}>✓</span>}
                  </div>

                  {/* VA ID */}
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: T.ghost, flexShrink: 0, width: 100 }}>{vaShortId}</span>

                  {/* Name */}
                  <span style={{ fontSize: 14, fontWeight: 500, color: T.black, width: 180, flexShrink: 0 }}>{va.name}</span>

                  {/* Middle */}
                  <span style={{ fontSize: 12, color: T.ter, flex: 1, minWidth: 0 }}>
                    {[country, `${cc.count} client${cc.count !== 1 ? 's' : ''}`, `${cc.variants} products this month`, owed > 0 ? `$${owed.toFixed(0)} owed` : null].filter(Boolean).join(' · ')}
                  </span>

                  {/* Status */}
                  <span style={{
                    fontSize: 11, flexShrink: 0,
                    color: va.status === 'active' ? T.black : va.status === 'pending_approval' ? T.ghost : T.ter,
                    fontStyle: va.status === 'pending_approval' ? 'italic' : 'normal',
                  }}>
                    {va.status === 'active' ? 'Active' : va.status === 'pending_approval' ? 'Pending' : va.status === 'paused' ? 'Paused' : 'Blocked'}
                  </span>
                </div>

                {/* ── Expanded Detail ── */}
                {isExpanded && (
                  <div style={{ paddingBottom: 32, paddingLeft: 29, paddingRight: 0, overflow: 'hidden' }}>
                    {isDetailLoading ? (
                      <div style={{ fontSize: 13, color: T.ghost, paddingBottom: 16 }}>Loading…</div>
                    ) : !detail ? null : (
                      <>
                        {/* ── Section A: Personal Info ── */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 48px', marginBottom: 32 }}>
                          {/* Left column */}
                          <div>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.08em', marginBottom: 20 }}>Personal Info</div>
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#DDDDDD', letterSpacing: '0.06em', marginBottom: 3 }}>VA ID</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 14, color: T.black, fontFamily: 'monospace' }}>{vaShortId}</span>
                                <button
                                  onClick={() => copyToClipboard(vaShortId)}
                                  style={{ fontSize: 10, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                                >
                                  copy
                                </button>
                              </div>
                            </div>
                            <Field label="Full Name" value={va.full_legal_name ?? '—'} />
                            <Field label="Email" value={va.email ?? '—'} link={va.email ? `mailto:${va.email}` : undefined} />
                            <Field label="Country" value={va.country ? (COUNTRY_NAMES[va.country] ?? va.country) : '—'} />
                            <Field label="Phone" value={va.phone_number ?? '—'} />
                            <Field
                              label="Joined"
                              value={
                                <span>
                                  {formatDate(va.joined_at)}
                                  {' '}<span style={{ color: T.ghost }}>({monthsAgo(va.joined_at)} months ago)</span>
                                </span>
                              }
                            />
                          </div>
                          {/* Right column */}
                          <div>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.08em', marginBottom: 20 }}>&nbsp;</div>
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#DDDDDD', letterSpacing: '0.06em', marginBottom: 3 }}>Status</div>
                              <div style={{
                                fontSize: 14,
                                color: va.status === 'active' ? T.black : va.status === 'pending_approval' ? T.ghost : T.ter,
                              }}>
                                {va.status === 'active' ? 'Active' : va.status === 'pending_approval' ? 'Pending approval' : va.status === 'paused' ? 'Paused' : 'Blocked'}
                              </div>
                            </div>
                            <Field label="Onboarding" value={va.onboarding_complete ? 'Complete' : 'Incomplete'} />
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#DDDDDD', letterSpacing: '0.06em', marginBottom: 3 }}>Referred By</div>
                              <div style={{ fontSize: 14, color: detail.referrerName ? T.black : '#DDDDDD' }}>{detail.referrerName ?? 'None'}</div>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#DDDDDD', letterSpacing: '0.06em', marginBottom: 3 }}>Login Code</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 16, color: T.black, fontFamily: 'monospace', letterSpacing: '0.15em', fontWeight: 500 }}>
                                  {va.login_code ?? '—'}
                                </span>
                                {va.login_code && (
                                  <button
                                    onClick={() => copyToClipboard(va.login_code!)}
                                    style={{ fontSize: 10, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                                  >
                                    copy
                                  </button>
                                )}
                                {!va.login_code && (
                                  <span style={{ fontSize: 11, color: '#F59E0B' }}>No code — run DB migration</span>
                                )}
                              </div>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#DDDDDD', letterSpacing: '0.06em', marginBottom: 3 }}>Referral Code</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 14, color: T.black, fontFamily: 'monospace' }}>{detail.referralCode?.code ?? '—'}</span>
                                {detail.referralCode?.code && (
                                  <button
                                    onClick={() => copyToClipboard(detail.referralCode!.code)}
                                    style={{ fontSize: 10, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                                  >
                                    copy
                                  </button>
                                )}
                              </div>
                            </div>
                            <Field label="Agreed to Terms" value={va.agreed_to_terms ? (va.agreed_at ? formatDate(va.agreed_at) : 'Yes') : 'No'} />
                          </div>
                        </div>

                        {/* ── Section B: Payment Details ── */}
                        <div style={{ marginBottom: 32 }}>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.08em', marginBottom: 16 }}>Payment Details</div>
                          <div style={{ marginBottom: 8 }}>
                            <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em' }}>Payment Method</span>
                            <span style={{ fontSize: 13, color: T.black, marginLeft: 12 }}>{PAYMENT_LABELS[va.payment_method ?? ''] ?? '—'}</span>
                          </div>
                          {va.payment_details && va.payment_method && (
                            <PaymentDetailsSection method={va.payment_method} details={va.payment_details} />
                          )}
                        </div>

                        {/* ── Section C: Clients ── */}
                        <div style={{ marginBottom: 32 }}>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.08em', marginBottom: 12 }}>
                            Clients ({detail.clients.length})
                          </div>
                          {detail.clients.length === 0 ? (
                            <div style={{ fontSize: 13, color: T.ghost }}>No clients yet.</div>
                          ) : (
                            <>
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr>
                                    {['Store', 'Niche', 'Products (mo)', 'Tier', 'Status'].map(h => (
                                      <th key={h} style={{ textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.05em', paddingBottom: 8, fontWeight: 400 }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.clients.slice(0, 5).map(c => (
                                    <tr key={c.id}>
                                      <td style={{ fontSize: 13, color: T.black, paddingBlock: 6, paddingRight: 16 }}>{c.store_name}</td>
                                      <td style={{ fontSize: 12, color: T.ter, paddingBlock: 6, paddingRight: 16 }}>{c.niche ?? '—'}</td>
                                      <td style={{ fontSize: 12, color: T.ter, paddingBlock: 6, paddingRight: 16 }}>{c.current_month_variants ?? 0}</td>
                                      <td style={{ fontSize: 12, color: T.ter, paddingBlock: 6, paddingRight: 16 }}>{TIER_LABELS[c.current_month_tier ?? ''] ?? '—'}</td>
                                      <td style={{ fontSize: 12, color: T.ter, paddingBlock: 6 }}>
                                        {c.approval_status === 'pending' ? 'Pending' : c.approval_status === 'rejected' ? 'Rejected' : c.is_active ? 'Active' : 'Inactive'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {detail.clients.length > 5 && (
                                <a href={`/admin/clients?va=${va.id}`} style={{ fontSize: 12, color: T.ter, textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
                                  View all →
                                </a>
                              )}
                            </>
                          )}
                        </div>

                        {/* ── Section D: Recent Uploads ── */}
                        <div style={{ marginBottom: 32 }}>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.08em', marginBottom: 12 }}>
                            Recent Uploads ({detail.uploads.length} total)
                          </div>
                          {detail.uploads.length === 0 ? (
                            <div style={{ fontSize: 13, color: T.ghost }}>No uploads yet.</div>
                          ) : (
                            <>
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr>
                                    {['Client', 'Products', 'Status', 'Date', 'Cost'].map(h => (
                                      <th key={h} style={{ textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.05em', paddingBottom: 8, fontWeight: 400 }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.uploads.map(u => (
                                    <tr key={u.id}>
                                      <td style={{ fontSize: 13, color: T.black, paddingBlock: 6, paddingRight: 16 }}>{u.store_name ?? '—'}</td>
                                      <td style={{ fontSize: 12, color: T.ter, paddingBlock: 6, paddingRight: 16 }}>{u.product_row_count ?? 0}</td>
                                      <td style={{ fontSize: 12, color: T.ter, paddingBlock: 6, paddingRight: 16 }}>{u.status}</td>
                                      <td style={{ fontSize: 12, color: T.ter, paddingBlock: 6, paddingRight: 16 }}>{timeAgo(u.uploaded_at)}</td>
                                      <td style={{ fontSize: 12, color: T.ter, paddingBlock: 6 }}>${(u.api_cost_usd ?? 0).toFixed(3)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <a href={`/admin/uploads?va=${va.id}`} style={{ fontSize: 12, color: T.ter, textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
                                View all uploads →
                              </a>
                            </>
                          )}
                        </div>

                        {/* ── Section E: Billing ── */}
                        <div style={{ marginBottom: 32 }}>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.08em', marginBottom: 12 }}>Billing</div>
                          {/* Current month */}
                          <CurrentMonthBilling uploads={detail.currentMonthUploads} />
                          {/* Locked files */}
                          {detail.lockedCount > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '8px 12px', background: '#FEF3C7', borderRadius: 8 }}>
                              <span style={{ fontSize: 12 }}>🔒</span>
                              <span style={{ fontSize: 12, color: '#92400E' }}>{detail.lockedCount} file{detail.lockedCount !== 1 ? 's' : ''} locked</span>
                              <button
                                onClick={async () => {
                                  await supabase.from('uploads')
                                    .update({ output_locked: false, output_unlocked_at: new Date().toISOString() })
                                    .eq('va_id', va.id)
                                    .eq('output_locked', true)
                                  void loadDetail(va)
                                }}
                                style={{ fontSize: 11, color: '#92400E', background: 'none', border: '1px solid #D97706', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}
                              >
                                Unlock all
                              </button>
                            </div>
                          )}

                          {/* Invoice history */}
                          {detail.billing.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                              <div style={{ fontSize: 11, color: T.ter, marginBottom: 8 }}>Invoice history</div>
                              {detail.billing.map(b => (
                                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBlock: 5, borderBottom: `1px solid ${T.div}` }}>
                                  <span style={{ fontSize: 13, color: T.black, width: 72 }}>{b.month}</span>
                                  <span style={{ fontSize: 13, color: T.black }}>${b.total_amount.toFixed(2)}</span>
                                  <span style={{
                                    fontSize: 11, padding: '2px 8px', borderRadius: 100,
                                    color: b.status === 'paid' ? T.black : b.status === 'overdue' ? '#CC3300' : T.ter,
                                    border: `1px solid ${b.status === 'paid' ? T.div : b.status === 'overdue' ? '#CC3300' : T.div}`,
                                  }}>
                                    {b.status}
                                  </span>
                                </div>
                              ))}
                              <div style={{ fontSize: 13, fontWeight: 500, color: T.black, marginTop: 12 }}>
                                Total revenue all time: ${detail.allTimePaid.toFixed(2)}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* ── Section F: Affiliates ── */}
                        <div style={{ marginBottom: 32 }}>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.08em', marginBottom: 12 }}>Affiliates</div>
                          {detail.referralCode ? (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#DDDDDD' }}>Referral Code</span>
                                <span style={{ fontSize: 13, color: T.black, fontFamily: 'monospace' }}>{detail.referralCode.code}</span>
                                <button
                                  onClick={() => copyToClipboard(detail.referralCode!.code)}
                                  style={{ fontSize: 10, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                                >
                                  copy
                                </button>
                              </div>
                              <div style={{ fontSize: 13, color: T.sec, marginBottom: 4 }}>
                                Referrals: {detail.referralCode.total_referrals ?? 0} total, {detail.referralCode.active_referrals ?? 0} active
                              </div>
                              <div style={{ fontSize: 13, color: T.sec, marginBottom: 4 }}>
                                Streak: {detail.referralCode.payment_streak ?? 0} months ({detail.referralCode.current_percentage ?? 0}%)
                              </div>
                              <div style={{ fontSize: 13, color: T.sec, marginBottom: 12 }}>
                                Total earned: ${(detail.referralCode.total_earned ?? 0).toFixed(2)} · This month: ${(detail.referralCode.current_month_earned ?? 0).toFixed(2)}
                              </div>
                              {detail.affiliatesReferred.length > 0 && (
                                <div>
                                  {detail.affiliatesReferred.map(af => (
                                    <div key={af.referred_va_id} style={{ display: 'flex', gap: 16, paddingBlock: 5, borderBottom: `1px solid ${T.div}`, fontSize: 12, color: T.ter }}>
                                      <span style={{ color: T.black }}>{af.referred_va_name ?? af.referred_va_id}</span>
                                      <span>{af.referred_va_status}</span>
                                      <span>{formatDate(af.referred_at)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            <div style={{ fontSize: 13, color: T.ghost }}>No referral code.</div>
                          )}
                        </div>

                        {/* ── Section G: Activity Log ── */}
                        <div style={{ marginBottom: 32 }}>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.08em', marginBottom: 12 }}>Recent Activity</div>
                          {detail.activityLog.length === 0 ? (
                            <div style={{ fontSize: 13, color: T.ghost }}>No activity yet.</div>
                          ) : (
                            <div>
                              {detail.activityLog.map(entry => (
                                <div key={entry.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBlock: 5, borderBottom: `1px solid ${T.div}` }}>
                                  {(entry.severity === 'warning' || entry.severity === 'error' || entry.severity === 'critical') && (
                                    <span style={{
                                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                                      background: entry.severity === 'critical' ? '#CC3300' : entry.severity === 'error' ? '#CC3300' : '#FF6600',
                                    }} />
                                  )}
                                  {!(entry.severity === 'warning' || entry.severity === 'error' || entry.severity === 'critical') && (
                                    <span style={{ width: 6, flexShrink: 0 }} />
                                  )}
                                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: T.ghost, flexShrink: 0, width: 130 }}>{timeAgo(entry.created_at)}</span>
                                  <span style={{ fontSize: 13, color: T.black }}>{entry.details || entry.action}</span>
                                </div>
                              ))}
                              <a href={`/admin/logs?va=${va.id}`} style={{ fontSize: 12, color: T.ter, textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
                                View full log →
                              </a>
                            </div>
                          )}
                        </div>

                        {/* ── Action Buttons ── */}
                        <div style={{ marginBottom: 24 }}>
                          <ActionButtons
                            va={va}
                            act={act}
                            working={isWorking}
                            actionReason={actionReason[va.id] ?? ''}
                            deleteStep={deleteStep[va.id]}
                            deleteText={deleteText[va.id] ?? ''}
                            unblockReactivate={unblockReactivate[va.id] !== false}
                            onSetAct={a => setActionState(prev => ({ ...prev, [va.id]: a }))}
                            onSetReason={r => setActionReason(prev => ({ ...prev, [va.id]: r }))}
                            onSetDeleteStep={s => setDeleteStep(prev => ({ ...prev, [va.id]: s }))}
                            onSetDeleteText={t => setDeleteText(prev => ({ ...prev, [va.id]: t }))}
                            onSetUnblockReactivate={v => setUnblockReactivate(prev => ({ ...prev, [va.id]: v }))}
                            onApprove={() => void handleApprove(va)}
                            onReject={() => void handleReject(va)}
                            onPause={() => void handlePause(va)}
                            onBlock={() => void handleBlock(va)}
                            onReactivate={() => void handleReactivate(va)}
                            onUnblock={() => void handleUnblock(va)}
                            onDelete={() => void handleDelete(va)}
                          />
                        </div>

                        {/* ── Admin Notes ── */}
                        <div>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.08em', marginBottom: 10 }}>Admin Notes</div>
                          <textarea
                            value={adminNotes[va.id] ?? ''}
                            onChange={e => setAdminNotes(prev => ({ ...prev, [va.id]: e.target.value }))}
                            style={{
                              width: '100%', minHeight: 60, border: `1px solid ${T.div}`,
                              borderRadius: 8, padding: 12, fontSize: 13, fontFamily: 'inherit',
                              resize: 'vertical', outline: 'none', color: T.black,
                              boxSizing: 'border-box',
                            }}
                            onFocus={e => { e.target.style.borderColor = T.black }}
                            onBlur={e => { e.target.style.borderColor = T.div }}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                            <button
                              onClick={() => void handleSaveNotes(va)}
                              style={{
                                fontSize: 12, color: T.black, background: 'none',
                                border: `1px solid ${T.div}`, borderRadius: 6, padding: '5px 14px',
                                cursor: 'pointer', fontFamily: 'inherit',
                              }}
                            >
                              Save notes
                            </button>
                            {notesSaved[va.id] && <span style={{ fontSize: 12, color: T.ter }}>Saved ✓</span>}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add VA Modal ── */}
      {showAddVA && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeAddVAModal() }}
        >
          <div style={{
            background: T.bg, borderRadius: 16, padding: 36,
            width: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            fontFamily: 'inherit',
          }}>
            {addVACode ? (
              /* ── Success state: show the generated code ── */
              <>
                <div style={{ fontSize: 16, fontWeight: 500, color: T.black, marginBottom: 8 }}>VA created!</div>
                <div style={{ fontSize: 13, color: T.ter, marginBottom: 28, lineHeight: 1.6 }}>
                  Share this login code with the VA. They&apos;ll use it to log in and complete their onboarding.
                </div>
                <div style={{
                  background: T.row, borderRadius: 10, padding: '18px 20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 20,
                }}>
                  <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: '0.25em', color: T.black, fontFamily: 'monospace' }}>
                    {addVACode}
                  </span>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(addVACode)
                      setAddVACodeCopied(true)
                      setTimeout(() => setAddVACodeCopied(false), 1500)
                    }}
                    style={{
                      fontSize: 12, fontWeight: 500,
                      color: addVACodeCopied ? '#00A550' : T.ghost,
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', transition: 'color 0.15s', padding: 0,
                    }}
                  >
                    {addVACodeCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <button
                  onClick={closeAddVAModal}
                  style={{
                    width: '100%', padding: '11px 0',
                    fontSize: 13, fontWeight: 500, color: T.black,
                    background: T.div, border: 'none', borderRadius: 8,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Done
                </button>
              </>
            ) : (
              /* ── Input state: enter VA name ── */
              <>
                <div style={{ fontSize: 16, fontWeight: 500, color: T.black, marginBottom: 20 }}>Add VA</div>
                <div style={{ fontSize: 12, color: T.ghost, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</div>
                <input
                  autoFocus
                  value={addVAName}
                  onChange={e => { setAddVAName(e.target.value); setAddVAError(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') void handleAddVA() }}
                  placeholder="e.g. Maria Santos"
                  style={{
                    width: '100%', padding: '11px 14px',
                    fontSize: 14, color: T.black,
                    border: `1.5px solid ${addVAError ? '#CC3300' : T.div}`,
                    borderRadius: 8, outline: 'none',
                    background: T.row, fontFamily: 'inherit',
                    boxSizing: 'border-box', marginBottom: 8,
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { if (!addVAError) e.target.style.borderColor = T.black }}
                  onBlur={e => { if (!addVAError) e.target.style.borderColor = T.div }}
                />
                {addVAError && (
                  <div style={{ fontSize: 12, color: '#CC3300', marginBottom: 8 }}>{addVAError}</div>
                )}
                <div style={{ fontSize: 12, color: T.ghost, marginBottom: 24, lineHeight: 1.5 }}>
                  A unique 6-digit login code will be generated automatically.
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={closeAddVAModal}
                    style={{
                      flex: 1, padding: '11px 0',
                      fontSize: 13, color: T.ter,
                      background: 'none', border: `1px solid ${T.div}`, borderRadius: 8,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleAddVA()}
                    disabled={addVAWorking || !addVAName.trim()}
                    style={{
                      flex: 2, padding: '11px 0',
                      fontSize: 13, fontWeight: 500,
                      color: T.bg,
                      background: addVAWorking || !addVAName.trim() ? T.ghost : T.black,
                      border: 'none', borderRadius: 8,
                      cursor: addVAWorking || !addVAName.trim() ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', transition: 'background 0.15s',
                    }}
                  >
                    {addVAWorking ? 'Creating…' : 'Create VA'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Invite Modal ── */}
      {showInvite && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeInviteModal() }}
        >
          <div style={{
            background: T.bg, borderRadius: 16, padding: 36,
            width: 480, maxHeight: '80vh', overflowY: 'auto',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)', fontFamily: 'inherit',
          }}>
            {inviteLink ? (
              /* ── Success: show invite link ── */
              <>
                <div style={{ fontSize: 16, fontWeight: 500, color: T.black, marginBottom: 8 }}>Invite link created</div>
                <div style={{ fontSize: 13, color: T.ter, marginBottom: 24, lineHeight: 1.6 }}>
                  Share this link with the operator. It expires in 7 days and can only be used once.
                </div>
                <div style={{
                  background: T.row, borderRadius: 10, padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  marginBottom: 24, wordBreak: 'break-all',
                }}>
                  <span style={{ fontSize: 12, color: T.sec, flex: 1, fontFamily: 'monospace' }}>
                    {inviteLink}
                  </span>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(inviteLink)
                      setInviteLinkCopied(true)
                      setTimeout(() => setInviteLinkCopied(false), 1500)
                    }}
                    style={{
                      fontSize: 12, fontWeight: 500, flexShrink: 0,
                      color: inviteLinkCopied ? '#00A550' : T.ghost,
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', transition: 'color 0.15s', padding: 0,
                    }}
                  >
                    {inviteLinkCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <button
                  onClick={() => { setInviteLink(null); setInviteNote('') }}
                  style={{
                    width: '100%', padding: '11px 0', marginBottom: 10,
                    fontSize: 13, fontWeight: 500, color: T.black,
                    background: T.div, border: 'none', borderRadius: 8,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Create another
                </button>
                <button
                  onClick={closeInviteModal}
                  style={{
                    width: '100%', padding: '11px 0',
                    fontSize: 13, color: T.ter,
                    background: 'none', border: `1px solid ${T.div}`, borderRadius: 8,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Done
                </button>
              </>
            ) : (
              /* ── Input: create invite ── */
              <>
                <div style={{ fontSize: 16, fontWeight: 500, color: T.black, marginBottom: 20 }}>Invite operator</div>
                <div style={{ fontSize: 12, color: T.ghost, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Note (optional)</div>
                <input
                  autoFocus
                  value={inviteNote}
                  onChange={e => { setInviteNote(e.target.value); setInviteError(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') void handleCreateInvite() }}
                  placeholder="e.g. Maria Santos — referral from John"
                  style={{
                    width: '100%', padding: '11px 14px',
                    fontSize: 14, color: T.black,
                    border: `1.5px solid ${inviteError ? '#CC3300' : T.div}`,
                    borderRadius: 8, outline: 'none',
                    background: T.row, fontFamily: 'inherit',
                    boxSizing: 'border-box', marginBottom: 8,
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { if (!inviteError) e.target.style.borderColor = T.black }}
                  onBlur={e => { if (!inviteError) e.target.style.borderColor = T.div }}
                />
                {inviteError && (
                  <div style={{ fontSize: 12, color: '#CC3300', marginBottom: 8 }}>{inviteError}</div>
                )}
                <div style={{ fontSize: 12, color: T.ghost, marginBottom: 24, lineHeight: 1.5 }}>
                  Creates a one-time invite link valid for 7 days.
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: invites.length > 0 ? 32 : 0 }}>
                  <button
                    onClick={closeInviteModal}
                    style={{
                      flex: 1, padding: '11px 0',
                      fontSize: 13, color: T.ter,
                      background: 'none', border: `1px solid ${T.div}`, borderRadius: 8,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleCreateInvite()}
                    disabled={inviteWorking}
                    style={{
                      flex: 2, padding: '11px 0',
                      fontSize: 13, fontWeight: 500, color: T.bg,
                      background: inviteWorking ? T.ghost : T.black,
                      border: 'none', borderRadius: 8,
                      cursor: inviteWorking ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', transition: 'background 0.15s',
                    }}
                  >
                    {inviteWorking ? 'Creating…' : 'Generate link'}
                  </button>
                </div>

                {/* Invite history */}
                {invites.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#DDDDDD', letterSpacing: '0.06em', marginBottom: 12 }}>Recent invites</div>
                    {invites.map(inv => {
                      const expired = !inv.used && !inv.revoked && new Date(inv.expires_at) < new Date()
                      const status  = inv.revoked ? 'revoked' : inv.used ? 'used' : expired ? 'expired' : 'active'
                      const dot     = status === 'active' ? '#00A550' : status === 'used' ? '#999' : '#CC3300'
                      const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
                      const link    = `${baseUrl}/join/${inv.token}`
                      return (
                        <div key={inv.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 0', borderBottom: `1px solid ${T.div}`,
                        }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: dot, flexShrink: 0,
                          }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: T.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {inv.note || <span style={{ color: T.ghost }}>No note</span>}
                            </div>
                            <div style={{ fontSize: 11, color: T.ter }}>
                              {status} · {formatDate(inv.created_at)}
                            </div>
                          </div>
                          {status === 'active' && (
                            <>
                              <button
                                onClick={() => {
                                  void navigator.clipboard.writeText(link)
                                }}
                                style={{ fontSize: 11, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                              >
                                Copy
                              </button>
                              <button
                                onClick={() => void handleRevokeInvite(inv.id)}
                                style={{ fontSize: 11, color: '#CC3300', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                              >
                                Revoke
                              </button>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && filtered.length > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 32 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              fontSize: 13, color: page === 1 ? T.ghost : T.black,
              background: 'none', border: `1px solid ${T.div}`, borderRadius: 6,
              padding: '6px 14px', cursor: page === 1 ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: 13, color: T.ter }}>
            Page {page} of {totalPages} · {filtered.length} total
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              fontSize: 13, color: page === totalPages ? T.ghost : T.black,
              background: 'none', border: `1px solid ${T.div}`, borderRadius: 6,
              padding: '6px 14px', cursor: page === totalPages ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Payment Details Section ──────────────────────────────────────────────────

function PaymentDetailsSection({ method, details }: { method: string; details: Record<string, string> }) {
  const fields: [string, string][] = []
  switch (method) {
    case 'wise':
      if (details.wise_email) fields.push(['Email', details.wise_email])
      if (details.holder_name) fields.push(['Holder name', details.holder_name])
      if (details.currency) fields.push(['Currency', details.currency])
      break
    case 'paypal':
      if (details.paypal_email) fields.push(['Email', details.paypal_email])
      break
    case 'gcash':
      if (details.gcash_number) fields.push(['Number', details.gcash_number])
      if (details.holder_name) fields.push(['Holder name', details.holder_name])
      break
    case 'maya':
      if (details.maya_number) fields.push(['Number', details.maya_number])
      if (details.holder_name) fields.push(['Holder name', details.holder_name])
      break
    case 'upi':
      if (details.upi_id) fields.push(['UPI ID', details.upi_id])
      break
    case 'jazzcash':
      if (details.jazzcash_number) fields.push(['Number', details.jazzcash_number])
      break
    case 'easypaisa':
      if (details.easypaisa_number) fields.push(['Number', details.easypaisa_number])
      break
    case 'bkash':
      if (details.bkash_number) fields.push(['Number', details.bkash_number])
      break
    case 'bank_transfer':
      if (details.holder_name) fields.push(['Holder name', details.holder_name])
      if (details.bank_name) fields.push(['Bank name', details.bank_name])
      if (details.account_number) fields.push(['Account number', details.account_number])
      if (details.swift) fields.push(['SWIFT', details.swift])
      if (details.iban) fields.push(['IBAN', details.iban])
      if (details.branch) fields.push(['Branch', details.branch])
      if (details.routing) fields.push(['Routing', details.routing])
      break
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 32px' }}>
      {fields.map(([label, value]) => (
        <div key={label}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.ghost, letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 13, color: T.black }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Current Month Billing ────────────────────────────────────────────────────

function CurrentMonthBilling({ uploads }: { uploads: CurrentMonthUpload[] }) {
  const TIER_AMOUNTS: Record<string, number> = { tier_1: 50, tier_2: 110, tier_3: 220, tier_4: 350 }

  // Group by client
  const byClient = new Map<string, { storeName: string; variants: number }>()
  for (const u of uploads) {
    const existing = byClient.get(u.client_id)
    const storeName = u.clients?.store_name ?? u.client_id
    if (existing) {
      existing.variants += u.product_row_count ?? 0
    } else {
      byClient.set(u.client_id, { storeName, variants: u.product_row_count ?? 0 })
    }
  }

  function getTier(variants: number): string {
    if (variants <= 200) return 'tier_1'
    if (variants <= 500) return 'tier_2'
    if (variants <= 1200) return 'tier_3'
    return 'tier_4'
  }

  const entries = Array.from(byClient.entries())
  const totalVariants = entries.reduce((s, [, v]) => s + v.variants, 0)
  const totalAmount = entries.reduce((s, [, v]) => s + (TIER_AMOUNTS[getTier(v.variants)] ?? 0), 0)

  return (
    <div>
      <div style={{ fontSize: 13, color: T.sec, marginBottom: 10 }}>
        This month: {totalVariants} products across {entries.length} client{entries.length !== 1 ? 's' : ''} = ${totalAmount.toFixed(2)}
      </div>
      {entries.map(([clientId, { storeName, variants }]) => {
        const tier = getTier(variants)
        return (
          <div key={clientId} style={{ display: 'flex', gap: 16, paddingBlock: 4, fontSize: 12, color: T.ter, borderBottom: `1px solid ${T.div}` }}>
            <span style={{ color: T.black }}>{storeName}</span>
            <span>{variants} products</span>
            <span>{TIER_LABELS[tier] ?? tier}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Action Buttons ───────────────────────────────────────────────────────────

type ActionButtonsProps = {
  va: VAx
  act: string
  working: boolean
  actionReason: string
  deleteStep: 1 | 2 | undefined
  deleteText: string
  unblockReactivate: boolean
  onSetAct: (a: string) => void
  onSetReason: (r: string) => void
  onSetDeleteStep: (s: 1 | 2) => void
  onSetDeleteText: (t: string) => void
  onSetUnblockReactivate: (v: boolean) => void
  onApprove: () => void
  onReject: () => void
  onPause: () => void
  onBlock: () => void
  onReactivate: () => void
  onUnblock: () => void
  onDelete: () => void
}

function ActionButtons({
  va, act, working, actionReason,
  deleteStep, deleteText, unblockReactivate,
  onSetAct, onSetReason, onSetDeleteStep, onSetDeleteText, onSetUnblockReactivate,
  onApprove, onReject, onPause, onBlock, onReactivate, onUnblock, onDelete,
}: ActionButtonsProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  function primaryStyle(h: boolean): React.CSSProperties {
    return {
      fontSize: 12, padding: '6px 16px', borderRadius: 100, cursor: 'pointer',
      fontFamily: 'inherit', transition: 'all 0.15s',
      border: `1px solid ${T.black}`,
      color: h ? T.bg : T.black,
      background: h ? T.black : T.bg,
    }
  }

  function secondaryStyle(h: boolean): React.CSSProperties {
    return {
      fontSize: 12, padding: '6px 16px', borderRadius: 100, cursor: 'pointer',
      fontFamily: 'inherit', transition: 'all 0.15s',
      border: `1px solid ${h ? T.black : T.div}`,
      color: h ? T.black : T.ter,
      background: T.bg,
    }
  }

  function deleteStyle(h: boolean): React.CSSProperties {
    return {
      fontSize: 12, padding: '6px 12px', cursor: 'pointer',
      fontFamily: 'inherit', transition: 'color 0.15s',
      border: 'none', background: 'none',
      color: h ? T.black : '#DDDDDD',
    }
  }

  // ── Action form ──
  if (act === 'pause') {
    return (
      <div style={{ maxWidth: 440 }}>
        <div style={{ fontSize: 12, color: T.ghost, marginBottom: 8 }}>Reason for pausing:</div>
        <textarea
          value={actionReason}
          onChange={e => onSetReason(e.target.value)}
          rows={3}
          style={{ width: '100%', border: `1px solid ${T.div}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', color: T.black, boxSizing: 'border-box' }}
          onFocus={e => { e.target.style.borderColor = T.black }}
          onBlur={e => { e.target.style.borderColor = T.div }}
        />
        <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center' }}>
          <button
            onClick={onPause}
            disabled={!actionReason.trim() || working}
            style={{ ...primaryStyle(false), opacity: !actionReason.trim() || working ? 0.4 : 1 }}
          >
            {working ? 'Pausing…' : 'Confirm pause'}
          </button>
          <button onClick={() => onSetAct('')} style={deleteStyle(false)}>Cancel</button>
        </div>
      </div>
    )
  }

  if (act === 'block') {
    return (
      <div style={{ maxWidth: 440 }}>
        <div style={{ fontSize: 12, color: T.ghost, marginBottom: 8 }}>Reason for blocking:</div>
        <textarea
          value={actionReason}
          onChange={e => onSetReason(e.target.value)}
          rows={3}
          style={{ width: '100%', border: `1px solid ${T.div}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', color: T.black, boxSizing: 'border-box' }}
          onFocus={e => { e.target.style.borderColor = T.black }}
          onBlur={e => { e.target.style.borderColor = T.div }}
        />
        <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center' }}>
          <button
            onClick={onBlock}
            disabled={!actionReason.trim() || working}
            style={{ ...primaryStyle(false), opacity: !actionReason.trim() || working ? 0.4 : 1 }}
          >
            {working ? 'Blocking…' : 'Confirm block'}
          </button>
          <button onClick={() => onSetAct('')} style={deleteStyle(false)}>Cancel</button>
        </div>
      </div>
    )
  }

  if (act === 'reject') {
    return (
      <div style={{ maxWidth: 440 }}>
        <div style={{ fontSize: 12, color: T.ghost, marginBottom: 8 }}>Reason for rejection (sent to VA):</div>
        <textarea
          value={actionReason}
          onChange={e => onSetReason(e.target.value)}
          rows={3}
          style={{ width: '100%', border: `1px solid ${T.div}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', color: T.black, boxSizing: 'border-box' }}
          onFocus={e => { e.target.style.borderColor = T.black }}
          onBlur={e => { e.target.style.borderColor = T.div }}
        />
        <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center' }}>
          <button
            onClick={onReject}
            disabled={!actionReason.trim() || working}
            style={{ ...primaryStyle(false), opacity: !actionReason.trim() || working ? 0.4 : 1 }}
          >
            {working ? 'Rejecting…' : 'Confirm rejection'}
          </button>
          <button onClick={() => onSetAct('')} style={deleteStyle(false)}>Cancel</button>
        </div>
      </div>
    )
  }

  if (act === 'reactivate') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 13, color: T.sec }}>Reactivate {va.name}?</span>
        <button
          onClick={onReactivate}
          disabled={working}
          style={{ ...primaryStyle(false), opacity: working ? 0.4 : 1 }}
        >
          {working ? 'Reactivating…' : 'Confirm'}
        </button>
        <button onClick={() => onSetAct('')} style={deleteStyle(false)}>Cancel</button>
      </div>
    )
  }

  if (act === 'unblock') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: T.sec }}>Unblock {va.name}?</span>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={unblockReactivate}
            onChange={e => onSetUnblockReactivate(e.target.checked)}
          />
          <span style={{ fontSize: 13, color: T.sec }}>Also reactivate all clients</span>
        </label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            onClick={onUnblock}
            disabled={working}
            style={{ ...primaryStyle(false), opacity: working ? 0.4 : 1 }}
          >
            {working ? 'Unblocking…' : 'Confirm unblock'}
          </button>
          <button onClick={() => onSetAct('')} style={deleteStyle(false)}>Cancel</button>
        </div>
      </div>
    )
  }

  if (act === 'delete') {
    if (!deleteStep || deleteStep === 1) {
      return (
        <div>
          <div style={{ fontSize: 13, color: T.sec, marginBottom: 12 }}>
            Are you sure? This will permanently delete {va.name} and all their data.
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={() => onSetDeleteStep(2)}
              style={primaryStyle(false)}
            >
              Yes, continue
            </button>
            <button onClick={() => onSetAct('')} style={deleteStyle(false)}>Cancel</button>
          </div>
        </div>
      )
    }
    return (
      <div style={{ maxWidth: 340 }}>
        <div style={{ fontSize: 12, color: T.ghost, marginBottom: 8 }}>Type DELETE to confirm:</div>
        <input
          value={deleteText}
          onChange={e => onSetDeleteText(e.target.value)}
          placeholder="DELETE"
          style={{
            width: '100%', border: `1px solid ${T.div}`, borderRadius: 6,
            padding: '8px 12px', fontSize: 13, fontFamily: 'monospace',
            outline: 'none', color: T.black, boxSizing: 'border-box',
          }}
          onFocus={e => { e.target.style.borderColor = T.black }}
          onBlur={e => { e.target.style.borderColor = T.div }}
        />
        <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center' }}>
          <button
            onClick={onDelete}
            disabled={deleteText !== 'DELETE' || working}
            style={{
              ...primaryStyle(false),
              opacity: deleteText !== 'DELETE' || working ? 0.4 : 1,
            }}
          >
            {working ? 'Deleting…' : 'Confirm delete'}
          </button>
          <button onClick={() => onSetAct('')} style={deleteStyle(false)}>Cancel</button>
        </div>
      </div>
    )
  }

  // ── Default pill row ──
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      {va.status === 'active' && (
        <>
          <button
            style={secondaryStyle(hovered === 'pause')}
            onMouseEnter={() => setHovered('pause')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => { onSetAct('pause'); onSetReason('') }}
          >
            Pause
          </button>
          <button
            style={secondaryStyle(hovered === 'block')}
            onMouseEnter={() => setHovered('block')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => { onSetAct('block'); onSetReason('') }}
          >
            Block
          </button>
        </>
      )}
      {va.status === 'pending_approval' && (
        <>
          <button
            style={primaryStyle(hovered === 'approve')}
            onMouseEnter={() => setHovered('approve')}
            onMouseLeave={() => setHovered(null)}
            onClick={onApprove}
            disabled={working}
          >
            {working ? 'Approving…' : 'Approve'}
          </button>
          <button
            style={secondaryStyle(hovered === 'reject')}
            onMouseEnter={() => setHovered('reject')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => { onSetAct('reject'); onSetReason('') }}
          >
            Reject
          </button>
        </>
      )}
      {va.status === 'paused' && (
        <>
          <button
            style={primaryStyle(hovered === 'reactivate')}
            onMouseEnter={() => setHovered('reactivate')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onSetAct('reactivate')}
          >
            Reactivate
          </button>
          <button
            style={secondaryStyle(hovered === 'block')}
            onMouseEnter={() => setHovered('block')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => { onSetAct('block'); onSetReason('') }}
          >
            Block
          </button>
        </>
      )}
      {va.status === 'blocked' && (
        <button
          style={primaryStyle(hovered === 'unblock')}
          onMouseEnter={() => setHovered('unblock')}
          onMouseLeave={() => setHovered(null)}
          onClick={() => onSetAct('unblock')}
        >
          Unblock
        </button>
      )}
      <button
        style={deleteStyle(hovered === 'delete')}
        onMouseEnter={() => setHovered('delete')}
        onMouseLeave={() => setHovered(null)}
        onClick={() => { onSetAct('delete'); onSetDeleteStep(1) }}
      >
        Delete
      </button>
    </div>
  )
}
