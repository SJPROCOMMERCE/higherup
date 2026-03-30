'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useVA } from '@/context/va-context'
import { supabase, type Client, type Upload } from '@/lib/supabase'
import { getTiers, getTierSync, DEFAULT_TIERS, type Tier } from '@/lib/pricing'
import { downloadOutput, downloadInput } from '@/lib/download'

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  black: '#111111',
  sec:   '#555555',
  ter:   '#999999',
  ghost: '#CCCCCC',
  div:   '#F0F0F0',
  row:   '#FAFAFA',
  red:   '#EF4444',
  green: '#22C55E',
  bg:    '#FFFFFF',
}

const PAGE_SIZE = 20

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const date      = new Date(dateStr)
  const now       = new Date()
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (date.toDateString() === now.toDateString())       return `Today, ${time}`
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + time
}

function formatExact(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function formatFileSize(bytes: number): string {
  if (bytes < 1_024)           return `${bytes} B`
  if (bytes < 1_024 * 1_024)  return `${(bytes / 1_024).toFixed(0)} KB`
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(3)}¢`
  return `$${usd.toFixed(4)}`
}

// ─── Sub-label ────────────────────────────────────────────────────────────────

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.1em', color: T.ghost, marginBottom: 5,
    }}>
      {children}
    </div>
  )
}

// ─── Status components ────────────────────────────────────────────────────────

function StatusCell({ status }: { status: Upload['status'] }) {
  const dotBg: Record<Upload['status'], string> = {
    done: T.black, failed: T.black, processing: '#AAAAAA', queued: '#BBBBBB', on_hold: T.ghost,
  }
  const label: Record<Upload['status'], string> = {
    done: 'Done', failed: 'Failed', processing: 'Processing', queued: 'Queued', on_hold: 'On Hold',
  }
  const textColor = (status === 'done' || status === 'failed') ? T.black : T.ghost
  const pulse     = status === 'processing' || status === 'queued'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        className={pulse ? 'pulse-dot' : undefined}
        style={{ width: 5, height: 5, borderRadius: '50%', background: dotBg[status], flexShrink: 0 }}
      />
      <span style={{ fontSize: 13, color: textColor }}>{label[status]}</span>
    </div>
  )
}

function WaveDots() {
  const dot: React.CSSProperties = { width: 3, height: 3, borderRadius: '50%', background: T.ghost, display: 'inline-block' }
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <span className="wave-1" style={dot} />
      <span className="wave-2" style={dot} />
      <span className="wave-3" style={dot} />
    </div>
  )
}

// ─── Filter pill ──────────────────────────────────────────────────────────────

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 14px', borderRadius: 100, fontSize: 12,
        background: active ? T.black : 'none',
        color:      active ? T.bg : T.ghost,
        border:     `1px solid ${active ? T.black : '#EEEEEE'}`,
        cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit', whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = T.ghost }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = '#EEEEEE' }}
    >
      {label}
    </button>
  )
}

// ─── History row ──────────────────────────────────────────────────────────────

function HistoryRow({
  upload, clientName, vaRate, pricingTiers, expanded, onToggle,
}: {
  upload: Upload
  clientName: string
  vaRate: number | null
  pricingTiers: Tier[]
  expanded: boolean
  onToggle: () => void
}) {
  const u = upload

  // ── File metadata summary ────────────────────────────────────────────────
  const displayFilename  = u.original_filename
    ?? u.input_file_path?.split('/').pop()?.replace(/^\d+_/, '')
    ?? '—'
  const fileMeta = [
    u.file_type?.toUpperCase(),
    u.file_size_bytes ? formatFileSize(u.file_size_bytes) : null,
    u.detected_as_shopify != null ? (u.detected_as_shopify ? 'Shopify' : 'Custom') : null,
    u.sheet_name ? `Sheet: ${u.sheet_name}` : null,
  ].filter(Boolean).join(' · ')

  // ── Processing summary ───────────────────────────────────────────────────
  const hasProcessingDetail = u.batches_total != null || u.products_optimized != null
  const partialFail = (u.products_failed ?? 0) > 0

  // ── Cost ─────────────────────────────────────────────────────────────────
  const hasCost = u.api_cost_usd != null

  return (
    <div>
      {/* ── Main row ──────────────────────────────────────────── */}
      <div
        onClick={onToggle}
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 72px 88px 120px 160px 56px 40px',
          gap: 12, padding: '16px 0',
          borderBottom: `1px solid ${T.row}`,
          cursor: 'pointer', transition: 'opacity 0.15s',
          alignItems: 'center',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.6'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <span style={{ fontSize: 13.5, fontWeight: 500, color: T.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {clientName}
        </span>
        <span style={{ fontSize: 13.5, color: T.black, fontVariantNumeric: 'tabular-nums' }}>
          {u.product_row_count ?? '—'}
        </span>
        {/* Earned column */}
        {(() => {
          if (vaRate == null || u.product_row_count == null) {
            return <span style={{ fontSize: 13, color: '#DDDDDD' }}>—</span>
          }
          return (
            <span style={{ fontSize: 13, color: '#2DB87E', fontVariantNumeric: 'tabular-nums' }}>
              +${(u.product_row_count * vaRate).toFixed(2)}
            </span>
          )
        })()}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusCell status={u.status} />
          {(u as Upload & { awaiting_va_response?: boolean }).awaiting_va_response && (
            <a
              href={`/dashboard/uploads/${u.id}`}
              onClick={e => e.stopPropagation()}
              style={{ fontSize: 11, fontWeight: 500, color: T.black, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.black, display: 'inline-block' }} />
              Message
            </a>
          )}
        </div>
        <span style={{ fontSize: 12, color: T.ghost }}>{formatDate(u.uploaded_at)}</span>
        <span style={{ fontSize: 12, color: T.ghost }}>
          {u.status === 'done' && u.processing_time_seconds != null ? `${u.processing_time_seconds}s` : '—'}
        </span>

        {/* Action column */}
        <span onClick={e => e.stopPropagation()}>
          {u.status === 'done' && u.output_file_path && (
            u.output_locked
              ? <span title="File locked — pay your HigherUp share to unlock" style={{ fontSize: 13, color: T.ghost, cursor: 'default' }}>🔒</span>
              : <button
                  onClick={() => downloadOutput(u)}
                  style={{ fontSize: 14, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = T.black}
                  onMouseLeave={e => e.currentTarget.style.color = T.ghost}
                  title="Download result"
                >↓</button>
          )}
          {u.status === 'processing' && <WaveDots />}
          {u.status === 'failed' && (
            <Link
              href={`/dashboard/upload?client=${u.client_id}`}
              style={{ fontSize: 11, color: T.ghost, textDecoration: 'none', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = T.black}
              onMouseLeave={e => e.currentTarget.style.color = T.ghost}
            >
              Retry
            </Link>
          )}
        </span>
      </div>

      {/* ── Expanded content ──────────────────────────────────── */}
      <div style={{
        maxHeight: expanded ? 800 : 0,
        overflow: 'hidden',
        opacity: expanded ? 1 : 0,
        transition: 'max-height 0.35s ease, opacity 0.25s ease',
      }}>
        <div style={{ paddingLeft: 20, paddingTop: 12, paddingBottom: 20, paddingRight: 8 }}>

          {/* ── FILE ──────────────────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <SubLabel>File</SubLabel>
            <div style={{ fontSize: 12, color: T.sec, fontWeight: 500, marginBottom: 2 }}>
              {displayFilename}
            </div>
            {fileMeta && (
              <div style={{ fontSize: 11, color: T.ghost }}>{fileMeta}</div>
            )}
          </div>

          {/* ── COUNTS ────────────────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <SubLabel>Products</SubLabel>
            <div style={{ fontSize: 12, color: T.sec }}>
              {u.product_row_count ?? '—'} products
              {u.unique_product_count != null && ` · ${u.unique_product_count} unique products`}
              {u.image_row_count != null && u.image_row_count > 0 && ` · ${u.image_row_count} image rows`}
            </div>
          </div>

          {/* ── EARNINGS ──────────────────────────────────────── */}
          {vaRate != null && (u.product_row_count ?? 0) > 0 && (
            <div style={{ marginBottom: 16 }}>
              <SubLabel>Earnings</SubLabel>
              {(() => {
                const vars    = u.product_row_count ?? 0
                const earned  = vars * vaRate
                const tier    = getTierSync(pricingTiers, vars)
                const share   = tier.amount
                const profit  = earned - share
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 12, color: T.sec }}>
                      Earned: <strong style={{ color: '#2DB87E' }}>${earned.toFixed(2)}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: T.ter }}>
                      HigherUp share (est.): ${share.toFixed(0)}
                    </div>
                    <div style={{ fontSize: 12, color: T.sec, fontWeight: 500 }}>
                      Profit: <strong style={{ color: '#2DB87E' }}>${profit.toFixed(2)}</strong>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── PROCESSING ────────────────────────────────────── */}
          {(u.status === 'done' || u.status === 'failed') && (
            <div style={{ marginBottom: 16 }}>
              <SubLabel>Processing</SubLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {u.processing_started_at && (
                  <div style={{ fontSize: 12, color: T.ter }}>
                    Started: {formatExact(u.processing_started_at)}
                    {u.processing_completed_at && ` → ${formatExact(u.processing_completed_at)}`}
                  </div>
                )}
                {u.processing_time_seconds != null && (
                  <div style={{ fontSize: 12, color: T.sec }}>
                    Duration: {u.processing_time_seconds}s
                  </div>
                )}
                {hasProcessingDetail && (
                  <>
                    {u.batches_total != null && (
                      <div style={{ fontSize: 12, color: T.sec }}>
                        Batches: {u.batches_completed ?? 0}/{u.batches_total} completed
                        {(u.batches_failed ?? 0) > 0 && ` · ${u.batches_failed} failed`}
                      </div>
                    )}
                    {u.products_optimized != null && (
                      <div style={{ fontSize: 12, color: partialFail ? T.red : T.sec }}>
                        Products: {u.products_optimized} optimized
                        {(u.products_failed ?? 0) > 0 && ` · ${u.products_failed} failed`}
                      </div>
                    )}
                  </>
                )}
                {u.status === 'failed' && u.error_message && (
                  <div style={{ fontSize: 12, color: T.red }}>
                    Error: {u.error_message}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── ON HOLD ───────────────────────────────────────── */}
          {u.status === 'on_hold' && (
            <div style={{ marginBottom: 16 }}>
              <SubLabel>On hold</SubLabel>
              {u.held_reason && (
                <div style={{ fontSize: 12, color: T.ter }}>{u.held_reason}</div>
              )}
              {u.released_at && (
                <div style={{ fontSize: 12, color: T.sec }}>
                  Released by {u.released_by ?? 'admin'} · {formatExact(u.released_at)}
                </div>
              )}
            </div>
          )}

          {/* ── COST ──────────────────────────────────────────── */}
          {hasCost && (
            <div style={{ marginBottom: 16 }}>
              <SubLabel>API cost</SubLabel>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {u.api_calls_count != null && (
                  <div style={{ fontSize: 11, color: T.ghost }}>
                    {u.api_calls_count} call{u.api_calls_count !== 1 ? 's' : ''}
                  </div>
                )}
                <div style={{ fontSize: 11, color: T.ghost }}>
                  {(u.api_input_tokens ?? 0).toLocaleString()} in
                  {' · '}{(u.api_output_tokens ?? 0).toLocaleString()} out
                  {(u.api_cached_tokens ?? 0) > 0 && ` · ${(u.api_cached_tokens!).toLocaleString()} cached`}
                </div>
                <div style={{ fontSize: 11, color: T.ghost, fontWeight: 500 }}>
                  {formatCost(u.api_cost_usd!)}
                </div>
              </div>
            </div>
          )}

          {/* ── INSTRUCTIONS ──────────────────────────────────── */}
          {u.special_instructions && (
            <div style={{ marginBottom: 16 }}>
              <SubLabel>Instructions</SubLabel>
              <div style={{ fontSize: 12, color: T.sec, marginBottom: u.adjusted_instruction ? 4 : 0 }}>
                <span style={{ color: T.ghost }}>Original: </span>
                {u.special_instructions}
              </div>
              {u.adjusted_instruction && u.adjusted_instruction !== u.special_instructions && (
                <div style={{ fontSize: 12, color: T.sec }}>
                  <span style={{ color: T.ghost }}>Adjusted: </span>
                  {u.adjusted_instruction}
                </div>
              )}
            </div>
          )}

          {/* ── TEMPLATE ──────────────────────────────────────── */}
          {!!(u as Record<string, unknown>).prompts && (
            <div style={{ marginBottom: 16 }}>
              <SubLabel>Template</SubLabel>
              <span style={{ fontSize: 11, color: T.ghost }}>
                {((u as Record<string, unknown>).prompts as Record<string, string>)?.name ?? '—'}
              </span>
            </div>
          )}

          {/* ── UPLOADED ──────────────────────────────────────── */}
          <div style={{ marginBottom: u.status === 'done' ? 16 : 0 }}>
            <SubLabel>Uploaded</SubLabel>
            <div style={{ fontSize: 12, color: T.ter }}>{formatExact(u.uploaded_at)}</div>
          </div>

          {/* ── DOWNLOADS ─────────────────────────────────────── */}
          {u.status === 'done' && (
            <div>
              <SubLabel>Downloads</SubLabel>
              {u.output_locked ? (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: '#FEF3C7', borderRadius: 8, padding: '7px 12px', marginBottom: 10,
                }}>
                  <span style={{ fontSize: 12 }}>🔒</span>
                  <span style={{ fontSize: 12, color: '#92400E', fontWeight: 500 }}>Locked — pay your HigherUp share to unlock</span>
                </div>
              ) : (
                u.download_count != null && (
                  <div style={{ fontSize: 11, color: u.output_downloaded ? T.ter : T.ghost, marginBottom: 10 }}>
                    {u.output_downloaded
                      ? `Downloaded ${u.download_count} time${u.download_count !== 1 ? 's' : ''}${u.output_downloaded_at ? ` · Last ${formatDate(u.output_downloaded_at)}` : ''}`
                      : 'Not yet downloaded'}
                  </div>
                )
              )}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {u.output_file_path && !u.output_locked && (
                  <button
                    onClick={() => downloadOutput(u)}
                    style={{
                      fontSize: 13, color: T.black, background: 'none', border: 'none',
                      cursor: 'pointer', padding: 0, fontFamily: 'inherit',
                      borderBottom: '1px solid transparent', transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderBottomColor = T.black}
                    onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}
                  >
                    Download output
                  </button>
                )}
                {u.input_file_path && (
                  <button
                    onClick={() => downloadInput(u)}
                    style={{
                      fontSize: 12, color: T.ghost, background: 'none', border: 'none',
                      cursor: 'pointer', padding: 0, fontFamily: 'inherit',
                      borderBottom: '1px solid transparent', transition: 'border-color 0.15s, color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = T.black; e.currentTarget.style.borderBottomColor = T.black }}
                    onMouseLeave={e => { e.currentTarget.style.color = T.ghost; e.currentTarget.style.borderBottomColor = 'transparent' }}
                  >
                    Download original
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── More dropdown (client filter overflow) ────────────────────────────────────

function MoreDropdown({
  clients, activeId, onSelect,
}: { clients: Client[]; activeId: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  const hasActive = clients.some(c => c.id === activeId)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '5px 14px', borderRadius: 100, fontSize: 12,
          background: hasActive ? T.black : 'none',
          color:      hasActive ? T.bg : T.ghost,
          border:     `1px solid ${hasActive ? T.black : '#EEEEEE'}`,
          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!hasActive) e.currentTarget.style.borderColor = T.ghost }}
        onMouseLeave={e => { if (!hasActive) e.currentTarget.style.borderColor = '#EEEEEE' }}
      >
        More ▾
      </button>
      {open && (
        <div className="hu-dropdown-list" style={{ top: '110%', left: 0, minWidth: 160, background: '#FFFFFF', backgroundColor: '#FFFFFF' }}>
          {clients.map(c => (
            <button
              key={c.id}
              className={`hu-dropdown-option${activeId === c.id ? ' is-selected' : ''}`}
              onClick={() => { onSelect(c.id); setOpen(false) }}
              style={{ width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 13, color: T.black, border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'block' }}
            >
              {c.store_name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | Upload['status']
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all',        label: 'All' },
  { value: 'done',       label: 'Done' },
  { value: 'processing', label: 'Processing' },
  { value: 'failed',     label: 'Failed' },
]
const MAX_VISIBLE = 4

export default function UploadsPage() {
  const { currentVA } = useVA()

  const [uploads,      setUploads]      = useState<Upload[]>([])
  const [clients,      setClients]      = useState<Client[]>([])
  const [pricingTiers, setPricingTiers] = useState<Tier[]>(DEFAULT_TIERS)
  const [total,        setTotal]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [expandedId,   setExpandedId]   = useState<string | null>(null)

  const [clientFilter, setClientFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page,         setPage]         = useState(1)

  // ─── Load pricing tiers ─────────────────────────────────────────────────────
  useEffect(() => { getTiers().then(setPricingTiers) }, [])

  // ─── Load clients for filter ────────────────────────────────────────────────
  useEffect(() => {
    if (!currentVA) return
    supabase
      .from('clients')
      .select('*')
      .eq('va_id', currentVA.id)
      .order('store_name')
      .then(({ data }) => setClients((data ?? []) as Client[]))
  }, [currentVA])

  // ─── Fetch uploads ──────────────────────────────────────────────────────────
  const fetchUploads = useCallback(async () => {
    if (!currentVA) return
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from('uploads')
      .select('*, prompts(name)', { count: 'exact' })
      .eq('va_id', currentVA.id)
      .order('uploaded_at', { ascending: false })
      .range(from, to)

    if (clientFilter !== 'all') q = q.eq('client_id', clientFilter)
    if (statusFilter !== 'all') q = q.eq('status', statusFilter)

    const { data, count } = await q
    setUploads((data ?? []) as Upload[])
    setTotal(count ?? 0)
    setLoading(false)
  }, [currentVA, clientFilter, statusFilter, page])

  useEffect(() => { fetchUploads() }, [fetchUploads])

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [clientFilter, statusFilter])

  // ─── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!currentVA) return
    const channel = supabase
      .channel('uploads-history-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'uploads', filter: `va_id=eq.${currentVA.id}` },
        () => fetchUploads(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentVA, fetchUploads])

  if (!currentVA) return null

  // ─── Derived ────────────────────────────────────────────────────────────────
  const visibleClients = clients.slice(0, MAX_VISIBLE)
  const hiddenClients  = clients.slice(MAX_VISIBLE)
  const hasMore        = hiddenClients.length > 0

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd   = Math.min(page * PAGE_SIZE, total)

  const clientMap     = Object.fromEntries(clients.map(c => [c.id, c.store_name]))
  const clientRateMap = Object.fromEntries(clients.map(c => [c.id, c.va_rate_per_product ?? null]))

  function Bone({ w, h = 10 }: { w: number | string; h?: number }) {
    return <div style={{ width: w, height: h, borderRadius: 4, background: T.div, animation: 'pulse 1.8s ease infinite' }} />
  }

  return (
    <div style={{ paddingTop: 56, paddingBottom: 80, maxWidth: 880, margin: '0 auto', paddingInline: 48 }} className="content-pad">

      {/* ── Header ────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: 48 }} className="s1">
        <h1 style={{ fontSize: 28, fontWeight: 300, color: T.black, margin: 0 }}>Upload history</h1>
        <p style={{ fontSize: 13, color: T.ghost, marginTop: 8, marginBottom: 0 }}>
          All your processed listings in one place.
        </p>
      </div>

      {/* ── Filters ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 32 }} className="s2">

        {/* Client filter */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Pill label="All" active={clientFilter === 'all'} onClick={() => setClientFilter('all')} />
          {visibleClients.map(c => (
            <Pill key={c.id} label={c.store_name} active={clientFilter === c.id} onClick={() => setClientFilter(c.id)} />
          ))}
          {hasMore && (
            <MoreDropdown clients={hiddenClients} activeId={clientFilter} onSelect={id => setClientFilter(id)} />
          )}
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {STATUS_OPTIONS.map(o => (
            <Pill key={o.value} label={o.label} active={statusFilter === o.value} onClick={() => setStatusFilter(o.value)} />
          ))}
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────── */}
      <div className="s3">

        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 72px 88px 120px 160px 56px 40px',
          gap: 12, paddingBottom: 12, borderBottom: `1px solid ${T.div}`,
        }}>
          {['Client', 'Products', 'Earned', 'Status', 'Date', 'Duration', ''].map(h => (
            <span key={h} style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ghost }}>
              {h}
            </span>
          ))}
        </div>

        {/* Loading skeletons */}
        {loading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '2fr 72px 88px 120px 160px 56px 40px',
            gap: 12, padding: '16px 0', borderBottom: `1px solid ${T.row}`, alignItems: 'center',
          }}>
            <Bone w="55%" /><Bone w={28} /><Bone w={40} /><Bone w={70} /><Bone w={100} /><Bone w={28} /><span />
          </div>
        ))}

        {/* Empty state */}
        {!loading && uploads.length === 0 && (
          <div style={{ textAlign: 'center', padding: '72px 0' }}>
            <div style={{ fontSize: 20, fontWeight: 300, color: T.ghost, marginBottom: 8 }}>No uploads yet.</div>
            <div style={{ fontSize: 13, color: '#DDDDDD', marginBottom: 24 }}>
              {clientFilter !== 'all' || statusFilter !== 'all'
                ? 'No uploads match the current filters.'
                : 'Upload your first CSV to get started.'}
            </div>
            {clientFilter === 'all' && statusFilter === 'all' && (
              <Link
                href="/dashboard/upload"
                style={{
                  display: 'inline-block', padding: '11px 28px', borderRadius: 100,
                  background: T.black, color: T.bg, fontSize: 13, fontWeight: 500,
                  textDecoration: 'none', transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                Upload CSV
              </Link>
            )}
          </div>
        )}

        {/* Rows */}
        {!loading && uploads.map(u => (
          <HistoryRow
            key={u.id}
            upload={u}
            clientName={clientMap[u.client_id] ?? u.store_name ?? '—'}
            vaRate={clientRateMap[u.client_id] ?? null}
            pricingTiers={pricingTiers}
            expanded={expandedId === u.id}
            onToggle={() => setExpandedId(expandedId === u.id ? null : u.id)}
          />
        ))}
      </div>

      {/* ── Pagination ────────────────────────────────────────── */}
      {!loading && total > PAGE_SIZE && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 32, flexWrap: 'wrap', gap: 12,
        }}>
          <span style={{ fontSize: 12, color: T.ghost }}>
            Showing {rangeStart}–{rangeEnd} of {total}
          </span>
          <span style={{ fontSize: 12, color: T.ghost }}>Page {page}</span>
          <div style={{ display: 'flex', gap: 16 }}>
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 1}
              style={{
                fontSize: 12, color: page === 1 ? '#EEEEEE' : T.ghost,
                background: 'none', border: 'none', cursor: page === 1 ? 'default' : 'pointer',
                padding: 0, fontFamily: 'inherit', transition: 'color 0.15s',
              }}
              onMouseEnter={e => { if (page > 1) e.currentTarget.style.color = T.black }}
              onMouseLeave={e => { if (page > 1) e.currentTarget.style.color = T.ghost }}
            >← Previous</button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages}
              style={{
                fontSize: 12, color: page >= totalPages ? '#EEEEEE' : T.ghost,
                background: 'none', border: 'none', cursor: page >= totalPages ? 'default' : 'pointer',
                padding: 0, fontFamily: 'inherit', transition: 'color 0.15s',
              }}
              onMouseEnter={e => { if (page < totalPages) e.currentTarget.style.color = T.black }}
              onMouseLeave={e => { if (page < totalPages) e.currentTarget.style.color = T.ghost }}
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  )
}
