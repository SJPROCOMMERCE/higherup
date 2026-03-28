'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, type VA } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'info' | 'warning' | 'error' | 'critical'
type Source   = 'va' | 'admin' | 'system' | 'api'
type ViewMode = 'list' | 'timeline'

type LogEntry = {
  id:           string
  va_id:        string | null
  admin_id:     string | null
  action:       string
  details:      string | null
  source:       Source
  severity:     Severity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata:     Record<string, any> | null
  client_id:    string | null
  upload_id:    string | null
  billing_id:   string | null
  affiliate_id: string | null
  request_id:   string | null
  ip_address:   string | null
  user_agent:   string | null
  created_at:   string
}

type Client = {
  id:         string
  store_name: string
}

type HeatmapRow = {
  va_id:   string
  va_name: string
  days:    number[]
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  black:  '#111111',
  gray:   '#86868B',
  ghost:  '#AEAEB2',
  light:  '#F5F5F7',
  border: '#E8E8ED',
  white:  '#FFFFFF',
  green:  '#10B981',
  red:    '#EF4444',
  amber:  '#F59E0B',
  blue:   '#007AFF',
}

const PAGE_SIZE = 50

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function fmtFull(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    timeZoneName: 'short',
  })
}

function startOfToday(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function getHourKey(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours().toString().padStart(2, '0')
  const hEnd = ((d.getHours() + 1) % 24).toString().padStart(2, '0')
  return `${h}:00 — ${hEnd}:59`
}

function getHourNum(iso: string): number {
  return new Date(iso).getHours()
}

function dayName(dayIndex: number): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const d = new Date()
  d.setDate(d.getDate() - (6 - dayIndex))
  return days[d.getDay()]
}

const SEV_BORDER: Record<Severity, string> = {
  info:     '3px solid transparent',
  warning:  '3px solid #FEF3C7',
  error:    '3px solid #FEE2E2',
  critical: '3px solid #EF4444',
}
const SEV_BG: Record<Severity, string> = {
  info:     T.white,
  warning:  T.white,
  error:    T.white,
  critical: '#FFFBFB',
}
const SEV_DOT: Record<Severity, string | null> = {
  info:     null,
  warning:  '#F59E0B',
  error:    '#EF4444',
  critical: '#EF4444',
}
const SOURCE_COLOR: Record<Source, string> = {
  va:     '#007AFF',
  admin:  '#8B5CF6',
  system: '#64748B',
  api:    '#10B981',
}

function heatmapColor(count: number): string {
  if (count === 0)    return '#F5F5F5'
  if (count <= 5)     return '#E0E0E0'
  if (count <= 15)    return '#AAAAAA'
  return '#111111'
}

// ─── Inner Page (uses useSearchParams) ───────────────────────────────────────

function AdminLogsInner() {
  const router        = useRouter()
  const searchParams  = useSearchParams()

  // ── Filter state (initialized from URL params) ──────────────────────────────

  const [filterSource,   setFilterSource]   = useState<Source | 'all'>(
    (searchParams.get('source') as Source | 'all') || 'all'
  )
  const [filterSeverity, setFilterSeverity] = useState<Severity | 'all'>(
    (searchParams.get('severity') as Severity | 'all') || 'all'
  )
  const [filterVAId,     setFilterVAId]     = useState(searchParams.get('va') ?? '')
  const [filterClientId, setFilterClientId] = useState(searchParams.get('client') ?? '')
  const [filterUploadId, setFilterUploadId] = useState(searchParams.get('upload') ?? '')
  const [filterFrom,     setFilterFrom]     = useState(searchParams.get('from') ?? todayStr())
  const [filterTo,       setFilterTo]       = useState(searchParams.get('to') ?? todayStr())
  const [search,         setSearch]         = useState(searchParams.get('search') ?? '')

  // ── Data state ──────────────────────────────────────────────────────────────

  const [logs,         setLogs]         = useState<LogEntry[]>([])
  const [total,        setTotal]        = useState(0)
  const [todayCount,   setTodayCount]   = useState(0)
  const [todayWarnings, setTodayWarnings] = useState(0)
  const [todayErrors,   setTodayErrors]   = useState(0)
  const [todayCritical, setTodayCritical] = useState(0)
  const [page,         setPage]         = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [expanded,     setExpanded]     = useState<string | null>(null)

  // ── Dropdown data ────────────────────────────────────────────────────────────

  const [vas,       setVas]       = useState<Pick<VA, 'id' | 'name'>[]>([])
  const [vaMap,     setVaMap]     = useState<Record<string, string>>({})
  const [clients,   setClients]   = useState<Client[]>([])
  const [clientMap, setClientMap] = useState<Record<string, string>>({})

  // ── Live mode ────────────────────────────────────────────────────────────────

  const [liveMode,      setLiveMode]      = useState(false)
  const [soundEnabled,  setSoundEnabled]  = useState(false)
  const [newEvents,     setNewEvents]     = useState(0)
  const [scrolledDown,  setScrolledDown]  = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // ── View mode ────────────────────────────────────────────────────────────────

  const [viewMode, setViewMode] = useState<ViewMode>('list')

  // ── Export / Cleanup ─────────────────────────────────────────────────────────

  const [exportLoading,  setExportLoading]  = useState(false)
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [cleanupResult,  setCleanupResult]  = useState<string | null>(null)

  // ── Heatmap ──────────────────────────────────────────────────────────────────

  const [heatmapData, setHeatmapData] = useState<HeatmapRow[]>([])

  // ── URL sync ─────────────────────────────────────────────────────────────────

  const syncUrl = useCallback((
    source: Source | 'all',
    severity: Severity | 'all',
    va: string,
    client: string,
    upload: string,
    from: string,
    to: string,
    q: string,
  ) => {
    const params: Record<string, string> = {}
    if (source   !== 'all') params.source   = source
    if (severity !== 'all') params.severity = severity
    if (va)                 params.va       = va
    if (client)             params.client   = client
    if (upload)             params.upload   = upload
    if (from)               params.from     = from
    if (to && to !== from)  params.to       = to
    if (q)                  params.search   = q
    router.replace('/admin/logs?' + new URLSearchParams(params).toString(), { scroll: false })
  }, [router])

  // ── Scroll listener ──────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = () => setScrolledDown(window.scrollY > 200)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  // ── Load VAs + Clients + Stats ───────────────────────────────────────────────

  useEffect(() => {
    // VAs
    supabase.from('vas').select('id, name').order('name').then(({ data }) => {
      const list = (data ?? []) as Pick<VA, 'id' | 'name'>[]
      setVas(list)
      const m: Record<string, string> = {}
      for (const v of list) m[v.id] = v.name
      setVaMap(m)
    })

    // Clients
    supabase.from('clients').select('id, store_name').order('store_name').then(({ data }) => {
      const list = (data ?? []) as Client[]
      setClients(list)
      const m: Record<string, string> = {}
      for (const c of list) m[c.id] = c.store_name
      setClientMap(m)
    })

    const sod = startOfToday()

    // Today total
    supabase.from('activity_log').select('id', { count: 'exact', head: true })
      .gte('created_at', sod)
      .then(({ count }) => setTodayCount(count ?? 0))

    // Today warnings
    supabase.from('activity_log').select('id', { count: 'exact', head: true })
      .gte('created_at', sod).eq('severity', 'warning')
      .then(({ count }) => setTodayWarnings(count ?? 0))

    // Today errors
    supabase.from('activity_log').select('id', { count: 'exact', head: true })
      .gte('created_at', sod).eq('severity', 'error')
      .then(({ count }) => setTodayErrors(count ?? 0))

    // Today critical
    supabase.from('activity_log').select('id', { count: 'exact', head: true })
      .gte('created_at', sod).eq('severity', 'critical')
      .then(({ count }) => setTodayCritical(count ?? 0))

    // Heatmap: last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    supabase.from('activity_log').select('va_id, created_at')
      .not('va_id', 'is', null)
      .gte('created_at', sevenDaysAgo)
      .then(({ data }) => {
        if (!data) return
        const byVa: Record<string, number[]> = {}
        const now = Date.now()
        for (const row of data as { va_id: string; created_at: string }[]) {
          if (!row.va_id) continue
          if (!byVa[row.va_id]) byVa[row.va_id] = [0, 0, 0, 0, 0, 0, 0]
          const msAgo = now - new Date(row.created_at).getTime()
          const dayIdx = Math.floor(msAgo / 86400000)
          if (dayIdx >= 0 && dayIdx < 7) {
            byVa[row.va_id][6 - dayIdx]++
          }
        }
        // We'll populate va_name after vaMap is ready — handled in a follow-up effect
        const rows: HeatmapRow[] = Object.entries(byVa).map(([va_id, days]) => ({
          va_id,
          va_name: va_id,
          days,
        }))
        setHeatmapData(rows)
      })
  }, [])

  // ── Populate heatmap va_name once vaMap is ready ─────────────────────────────

  useEffect(() => {
    if (Object.keys(vaMap).length === 0) return
    setHeatmapData(prev => prev.map(row => ({
      ...row,
      va_name: vaMap[row.va_id] ?? row.va_id.slice(0, 8),
    })))
  }, [vaMap])

  // ── Load logs ─────────────────────────────────────────────────────────────────

  const loadLogs = useCallback(async (p: number) => {
    setLoading(true)
    let q = supabase
      .from('activity_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE - 1)

    if (filterSource   !== 'all') q = q.eq('source',    filterSource)
    if (filterSeverity !== 'all') q = q.eq('severity',  filterSeverity)
    if (filterVAId)               q = q.eq('va_id',     filterVAId)
    if (filterClientId)           q = q.eq('client_id', filterClientId)
    if (filterUploadId.trim())    q = q.eq('upload_id', filterUploadId.trim())
    if (filterFrom)               q = q.gte('created_at', filterFrom + 'T00:00:00Z')
    if (filterTo)                 q = q.lte('created_at', filterTo   + 'T23:59:59Z')
    if (search.trim())            q = q.ilike('details', `%${search.trim()}%`)

    const { data, count } = await q
    setLogs((data ?? []) as LogEntry[])
    setTotal(count ?? 0)
    setNewEvents(0)
    setLoading(false)
  }, [filterSource, filterSeverity, filterVAId, filterClientId, filterUploadId, filterFrom, filterTo, search])

  useEffect(() => {
    setPage(0)
    loadLogs(0)
    syncUrl(filterSource, filterSeverity, filterVAId, filterClientId, filterUploadId, filterFrom, filterTo, search)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadLogs])

  useEffect(() => {
    loadLogs(page)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  // ── Live mode ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!liveMode) {
      channelRef.current?.unsubscribe()
      channelRef.current = null
      return
    }

    const ch = supabase
      .channel('admin_logs_live')
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'activity_log' },
        (payload: { new: LogEntry }) => {
          const newLog = payload.new
          setNewEvents(n => n + 1)
          setTodayCount(c => c + 1)

          if (soundEnabled) {
            const matchesSeverity = filterSeverity === 'all' || newLog.severity === filterSeverity
            if (matchesSeverity) {
              try {
                const ctx  = new AudioContext()
                const osc  = ctx.createOscillator()
                const gain = ctx.createGain()
                osc.connect(gain)
                gain.connect(ctx.destination)
                osc.frequency.value = 440
                gain.gain.value     = 0.1
                osc.start()
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
                osc.stop(ctx.currentTime + 0.1)
              } catch {
                // Web Audio might not be available in all contexts
              }
            }
          }
        },
      )
      .subscribe()

    channelRef.current = ch
    return () => { ch.unsubscribe() }
  }, [liveMode, soundEnabled, filterSeverity])

  // ── Export CSV ────────────────────────────────────────────────────────────────

  async function exportCSV() {
    setExportLoading(true)
    let q = supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })

    if (filterSource   !== 'all') q = q.eq('source',    filterSource)
    if (filterSeverity !== 'all') q = q.eq('severity',  filterSeverity)
    if (filterVAId)               q = q.eq('va_id',     filterVAId)
    if (filterClientId)           q = q.eq('client_id', filterClientId)
    if (filterUploadId.trim())    q = q.eq('upload_id', filterUploadId.trim())
    if (filterFrom)               q = q.gte('created_at', filterFrom + 'T00:00:00Z')
    if (filterTo)                 q = q.lte('created_at', filterTo   + 'T23:59:59Z')
    if (search.trim())            q = q.ilike('details', `%${search.trim()}%`)

    q = q.range(0, 9999)

    const { data } = await q
    const allLogs  = (data ?? []) as LogEntry[]

    const headers = ['timestamp', 'source', 'severity', 'action', 'va_name', 'client_name', 'details', 'metadata_json']
    const rows = allLogs.map(log => [
      log.created_at,
      log.source,
      log.severity,
      log.action,
      log.va_id     ? (vaMap[log.va_id]     ?? log.va_id)     : '',
      log.client_id ? (clientMap[log.client_id] ?? log.client_id) : '',
      log.details   ?? '',
      log.metadata  ? JSON.stringify(log.metadata) : '',
    ])

    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url

    const fname = [
      'activity-log',
      filterSource   !== 'all' ? '-' + filterSource   : '',
      filterSeverity !== 'all' ? '-' + filterSeverity : '',
      filterFrom               ? '-' + filterFrom     : '',
      filterTo && filterTo !== filterFrom ? '-to-' + filterTo : '',
    ].join('')
    a.download = fname + '.csv'
    a.click()
    URL.revokeObjectURL(url)
    setExportLoading(false)
  }

  // ── Cleanup functions ─────────────────────────────────────────────────────────

  async function cleanupInfoLogs() {
    setCleanupLoading(true)
    setCleanupResult(null)
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString()
    const { count } = await supabase.from('activity_log')
      .delete({ count: 'exact' })
      .eq('severity', 'info')
      .lt('created_at', cutoff)
    setCleanupResult(`Removed ${count ?? 0} old log entries`)
    setCleanupLoading(false)
    loadLogs(0)
  }

  async function cleanupApiLogs() {
    setCleanupLoading(true)
    setCleanupResult(null)
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
    const { count } = await supabase.from('activity_log')
      .delete({ count: 'exact' })
      .eq('source', 'api')
      .lt('created_at', cutoff)
    setCleanupResult(`Removed ${count ?? 0} old log entries`)
    setCleanupLoading(false)
    loadLogs(0)
  }

  // ── Scroll to top ─────────────────────────────────────────────────────────────

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const startIdx   = page * PAGE_SIZE + 1
  const endIdx     = Math.min(startIdx + logs.length - 1, total)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Timeline grouping ─────────────────────────────────────────────────────────

  function renderTimeline() {
    if (logs.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 0', fontSize: 13, color: T.ghost }}>
          No log entries matching the current filters.
        </div>
      )
    }

    const minHour = Math.min(...logs.map(l => getHourNum(l.created_at)))
    const maxHour = page === 0
      ? Math.max(new Date().getHours(), Math.max(...logs.map(l => getHourNum(l.created_at))))
      : Math.max(...logs.map(l => getHourNum(l.created_at)))

    const hours: number[] = []
    for (let h = maxHour; h >= minHour; h--) hours.push(h)

    return (
      <div style={{ paddingInline: 48 }}>
        {hours.map(h => {
          const hourLogs = logs.filter(l => getHourNum(l.created_at) === h)
          const hStr     = h.toString().padStart(2, '0')
          const hEndStr  = ((h + 1) % 24).toString().padStart(2, '0')
          return (
            <div key={h}>
              <div style={{
                fontSize: 11, color: '#CCCCCC', letterSpacing: '0.08em',
                paddingInline: 0, marginTop: 16, marginBottom: 4,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              }}>
                {hStr}:00 — {hEndStr}:59
              </div>
              {hourLogs.length === 0 ? (
                <div style={{ fontSize: 11, color: '#EEEEEE', textAlign: 'center', padding: '4px 0' }}>—</div>
              ) : (
                hourLogs.map(log => renderLogRow(log, true))
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ── Render a single log row ───────────────────────────────────────────────────

  function renderLogRow(log: LogEntry, inTimeline = false) {
    const isExpanded = expanded === log.id
    const vaName     = log.va_id ? (vaMap[log.va_id] ?? log.va_id.slice(0, 8)) : null
    const dot        = SEV_DOT[log.severity]

    return (
      <div
        key={log.id}
        style={{
          borderLeft:   SEV_BORDER[log.severity],
          background:   SEV_BG[log.severity],
          borderBottom: '1px solid #FAFAFA',
          transition:   'opacity 0.15s',
        }}
      >
        {/* Main row */}
        <div
          onClick={() => setExpanded(isExpanded ? null : log.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: inTimeline ? '6px 12px' : '9px 12px',
            cursor: 'pointer',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          {/* Timestamp */}
          <div style={{
            fontSize: 11, color: '#CCCCCC', fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            flexShrink: 0, width: 78,
          }}>
            {fmtTime(log.created_at)}
          </div>

          {/* Severity dot */}
          <div style={{ width: 16, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            {dot && (
              <div style={{
                width: 5, height: 5, borderRadius: '50%', background: dot,
                animation: log.severity === 'critical' ? 'criticalPulse 1.5s infinite' : 'none',
              }} />
            )}
          </div>

          {/* Source badge */}
          <div style={{
            fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: SOURCE_COLOR[log.source],
            flexShrink: 0, width: 48,
          }}>
            {log.source}
          </div>

          {/* Details */}
          <div style={{
            flex: 1, fontSize: 13, color: T.black,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {log.details ?? log.action}
          </div>

          {/* VA name */}
          {vaName && (
            <div style={{ fontSize: 12, color: '#999999', flexShrink: 0 }}>
              {vaName}
            </div>
          )}
        </div>

        {/* Expanded detail */}
        <div style={{
          overflow: 'hidden',
          maxHeight: isExpanded ? 1000 : 0,
          transition: 'max-height 0.2s ease',
        }}>
          <div style={{
            padding: '12px 24px 20px 100px',
            background: '#FAFAFA', borderTop: `1px solid ${T.border}`,
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 32px',
          }}>
            {[
              ['TIMESTAMP', fmtFull(log.created_at)],
              ['ACTION',    log.action],
              ['SOURCE',    log.source],
              ['SEVERITY',  log.severity],
              vaName ? ['VA', vaName] : null,
              log.admin_id ? ['ADMIN', log.admin_id] : null,
            ].filter((x): x is [string, string] => Array.isArray(x)).map(([label, value]) => (
              <div key={label as string}>
                <div style={{ fontSize: 9, color: '#CCCCCC', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
                  {label}
                </div>
                <div style={{ fontSize: 13, color: T.black }}>{value}</div>
              </div>
            ))}

            {log.details && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 9, color: '#CCCCCC', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>DETAILS</div>
                <div style={{ fontSize: 13, color: T.black }}>{log.details}</div>
              </div>
            )}

            {/* Clickable references */}
            {(log.va_id || log.client_id || log.upload_id || log.billing_id || log.affiliate_id || log.request_id) && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 9, color: '#CCCCCC', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>REFERENCES</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {log.va_id && (
                    <Link href={`/admin/vas?expand=${log.va_id}`} style={{ fontSize: 12, color: T.blue, textDecoration: 'none' }}>
                      VA: {vaMap[log.va_id] ?? log.va_id.slice(0, 8)}…
                    </Link>
                  )}
                  {log.client_id && (
                    <Link href={`/admin/clients?expand=${log.client_id}`} style={{ fontSize: 12, color: T.blue, textDecoration: 'none' }}>
                      Client: {clientMap[log.client_id] ?? log.client_id.slice(0, 8)}…
                    </Link>
                  )}
                  {log.upload_id && (
                    <Link href={`/admin/flagged?upload=${log.upload_id}`} style={{ fontSize: 12, color: T.blue, textDecoration: 'none' }}>
                      Upload: {log.upload_id.slice(0, 8)}…
                    </Link>
                  )}
                  {log.billing_id && (
                    <Link href={`/admin/billing?invoice=${log.billing_id}`} style={{ fontSize: 12, color: T.blue, textDecoration: 'none' }}>
                      Invoice: {log.billing_id.slice(0, 8)}…
                    </Link>
                  )}
                  {log.request_id && (
                    <Link href="/admin/requests" style={{ fontSize: 12, color: T.blue, textDecoration: 'none' }}>
                      Request: {log.request_id.slice(0, 8)}…
                    </Link>
                  )}
                  {log.affiliate_id && (
                    <Link href="/admin/affiliates" style={{ fontSize: 12, color: T.blue, textDecoration: 'none' }}>
                      Affiliate: {log.affiliate_id.slice(0, 8)}…
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Metadata */}
            {log.metadata && Object.keys(log.metadata).length > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 9, color: '#CCCCCC', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>METADATA</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {Object.entries(log.metadata).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 12 }}>
                      <div style={{ fontSize: 10, color: '#CCCCCC', letterSpacing: '0.04em', textTransform: 'uppercase', minWidth: 140, flexShrink: 0 }}>{k}</div>
                      <div style={{ fontSize: 13, color: T.black, wordBreak: 'break-all' }}>
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* IP / User Agent */}
            {log.ip_address && (
              <div>
                <div style={{ fontSize: 9, color: '#CCCCCC', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>IP</div>
                <div style={{ fontSize: 12, color: T.gray, fontFamily: 'monospace' }}>{log.ip_address}</div>
              </div>
            )}
            {log.user_agent && (
              <div>
                <div style={{ fontSize: 9, color: '#CCCCCC', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>USER AGENT</div>
                <div style={{ fontSize: 11, color: T.gray, fontFamily: 'monospace', wordBreak: 'break-all' }}>{log.user_agent}</div>
              </div>
            )}

            {/* Quick actions */}
            {log.action === 'upload_processing_failed' && log.upload_id && (
              <div style={{ gridColumn: '1/-1', marginTop: 8 }}>
                <Link href={`/admin/flagged?upload=${log.upload_id}`}
                  style={{ fontSize: 12, color: T.white, background: T.black, borderRadius: 6, padding: '6px 14px', textDecoration: 'none', display: 'inline-block' }}>
                  View in Flagged →
                </Link>
              </div>
            )}
            {log.action === 'invoice_overdue' && log.billing_id && (
              <div style={{ gridColumn: '1/-1', marginTop: 8 }}>
                <Link href={`/admin/billing?invoice=${log.billing_id}`}
                  style={{ fontSize: 12, color: T.white, background: T.black, borderRadius: 6, padding: '6px 14px', textDecoration: 'none', display: 'inline-block' }}>
                  View invoice →
                </Link>
              </div>
            )}
            {log.action === 'va_auto_paused' && log.va_id && (
              <div style={{ gridColumn: '1/-1', marginTop: 8 }}>
                <Link href={`/admin/vas?expand=${log.va_id}`}
                  style={{ fontSize: 12, color: T.white, background: T.black, borderRadius: 6, padding: '6px 14px', textDecoration: 'none', display: 'inline-block' }}>
                  Unpause VA →
                </Link>
              </div>
            )}
            {log.action === 'store_mismatch' && (
              <div style={{ gridColumn: '1/-1', marginTop: 8 }}>
                <Link href="/admin/flagged"
                  style={{ fontSize: 12, color: T.white, background: '#F59E0B', borderRadius: 6, padding: '6px 14px', textDecoration: 'none', display: 'inline-block' }}>
                  View in Flagged →
                </Link>
              </div>
            )}
            {(log.action === 'deadline_48h_expired' || log.action === 'deadline_expired') && log.client_id && (
              <div style={{ gridColumn: '1/-1', marginTop: 8 }}>
                <Link href={`/admin/clients?expand=${log.client_id}`}
                  style={{ fontSize: 12, color: T.white, background: T.black, borderRadius: 6, padding: '6px 14px', textDecoration: 'none', display: 'inline-block' }}>
                  Reactivate client →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ paddingBottom: 80, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Pulse animation */}
      <style>{`
        @keyframes criticalPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        paddingTop: 40, paddingInline: 48, paddingBottom: 20,
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 300, color: T.black, letterSpacing: '-0.03em' }}>
            Activity log
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>

          {/* View mode toggle */}
          <div style={{ display: 'flex', gap: 2, background: T.light, borderRadius: 8, padding: 2 }}>
            {(['list', 'timeline'] as ViewMode[]).map(m => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                style={{
                  fontSize: 11, fontWeight: viewMode === m ? 500 : 400,
                  color:      viewMode === m ? T.white : T.gray,
                  background: viewMode === m ? T.black : 'transparent',
                  border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {m === 'list' ? '≡ List' : '⏱ Timeline'}
              </button>
            ))}
          </div>

          {/* Sound toggle (only when live) */}
          {liveMode && (
            <button
              onClick={() => setSoundEnabled(v => !v)}
              style={{
                fontSize: 11, fontWeight: 500,
                color:      soundEnabled ? T.white : T.gray,
                background: soundEnabled ? T.amber : T.light,
                border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
              }}
            >
              ♪ Sound
            </button>
          )}

          {/* Live toggle */}
          <button
            onClick={() => setLiveMode(v => !v)}
            style={{
              fontSize: 12, fontWeight: 500,
              color:      liveMode ? T.white : T.gray,
              background: liveMode ? '#10B981' : T.light,
              border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
              background: liveMode ? T.white : T.gray,
              animation: liveMode ? 'criticalPulse 1.5s infinite' : 'none',
            }} />
            Live
          </button>

          {/* Export */}
          <button
            onClick={exportCSV}
            disabled={exportLoading}
            style={{
              fontSize: 12, fontWeight: 500, color: T.black,
              background: T.light, border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
              opacity: exportLoading ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (!exportLoading) e.currentTarget.style.background = T.border }}
            onMouseLeave={e => { e.currentTarget.style.background = T.light }}
          >
            {exportLoading ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <div style={{
        paddingInline: 48, paddingTop: 12, paddingBottom: 0,
        display: 'flex', gap: 24, alignItems: 'center',
      }}>
        <span style={{ fontSize: 13, color: '#111111' }}>
          {todayCount.toLocaleString()} event{todayCount !== 1 ? 's' : ''} today
        </span>
        <span style={{ fontSize: 13, color: todayWarnings === 0 ? '#CCCCCC' : '#999999' }}>
          {todayWarnings.toLocaleString()} warning{todayWarnings !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 13, color: todayErrors > 0 ? '#111111' : '#999999', fontWeight: todayErrors > 0 ? 500 : 400 }}>
          {todayErrors.toLocaleString()} error{todayErrors !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 13, color: todayCritical > 0 ? '#111111' : '#999999', fontWeight: todayCritical > 0 ? 700 : 400 }}>
          {todayCritical.toLocaleString()} critical
        </span>
      </div>

      {/* ── New events banner ──────────────────────────────────────────────── */}
      {newEvents > 0 && (
        <div
          onClick={() => { setPage(0); loadLogs(0) }}
          style={{
            background: '#10B981', color: T.white, textAlign: 'center',
            padding: '8px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            marginTop: 12,
          }}
        >
          {newEvents} new event{newEvents !== 1 ? 's' : ''} — click to refresh
        </div>
      )}

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 48px', borderBottom: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Row 1: Source + Severity */}
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Source */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: T.ghost }}>Source:</span>
            {(['all', 'va', 'admin', 'system', 'api'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterSource(s)}
                style={{
                  fontSize: 11, fontWeight: filterSource === s ? 500 : 400,
                  color: filterSource === s ? T.white : T.gray,
                  background: filterSource === s ? T.black : T.light,
                  border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {s === 'all' ? 'All' : s.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Severity */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: T.ghost }}>Severity:</span>
            {(['all', 'info', 'warning', 'error', 'critical'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterSeverity(s)}
                style={{
                  fontSize: 11, fontWeight: filterSeverity === s ? 500 : 400,
                  color: filterSeverity === s ? T.white
                       : s === 'warning'  ? '#F59E0B'
                       : s === 'error' || s === 'critical' ? T.red
                       : T.gray,
                  background: filterSeverity === s
                    ? s === 'warning' ? '#F59E0B' : s === 'error' || s === 'critical' ? T.red : T.black
                    : T.light,
                  border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: VA + Client + Upload + Date range + Search */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* VA dropdown */}
          <select
            value={filterVAId}
            onChange={e => setFilterVAId(e.target.value)}
            style={{
              fontSize: 12, color: T.black, background: T.light, border: 'none',
              borderRadius: 8, padding: '7px 12px', cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">All VA&apos;s</option>
            {vas.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>

          {/* Client dropdown */}
          <select
            value={filterClientId}
            onChange={e => setFilterClientId(e.target.value)}
            style={{
              fontSize: 12, color: T.black, background: T.light, border: 'none',
              borderRadius: 8, padding: '7px 12px', cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">All clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.store_name}</option>)}
          </select>

          {/* Upload ID search */}
          <input
            type="text"
            value={filterUploadId}
            onChange={e => setFilterUploadId(e.target.value)}
            placeholder="Upload ID or filename…"
            style={{
              fontSize: 12, color: T.black, background: T.light, border: 'none',
              borderRadius: 8, padding: '7px 14px', outline: 'none', width: 180,
            }}
          />

          {/* Date from */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: T.ghost }}>From</span>
            <input
              type="date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              style={{ fontSize: 12, color: T.black, background: T.light, border: 'none', borderRadius: 8, padding: '7px 10px', outline: 'none', cursor: 'pointer' }}
            />
          </div>

          {/* Date to */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: T.ghost }}>To</span>
            <input
              type="date"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              style={{ fontSize: 12, color: T.black, background: T.light, border: 'none', borderRadius: 8, padding: '7px 10px', outline: 'none', cursor: 'pointer' }}
            />
          </div>

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search logs…"
            style={{
              fontSize: 12, color: T.black, background: T.light, border: 'none',
              borderRadius: 8, padding: '7px 14px', outline: 'none', width: 200,
            }}
          />

          {/* Total count */}
          <div style={{ fontSize: 11, color: T.ghost, marginLeft: 'auto' }}>
            {loading ? 'Loading…' : `${total.toLocaleString()} log${total !== 1 ? 's' : ''}`}
          </div>
        </div>
      </div>

      {/* ── Log list / Timeline ─────────────────────────────────────────────── */}
      {viewMode === 'list' ? (
        <div style={{ paddingInline: 48 }}>
          {logs.length === 0 && !loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', fontSize: 13, color: T.ghost }}>
              No log entries matching the current filters.
            </div>
          ) : (
            logs.map(log => renderLogRow(log, false))
          )}
        </div>
      ) : (
        renderTimeline()
      )}

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      {total > PAGE_SIZE && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 48px', borderTop: `1px solid ${T.border}`, marginTop: 8,
        }}>
          <div style={{ fontSize: 13, color: T.gray }}>
            Showing {startIdx.toLocaleString()}–{endIdx.toLocaleString()} of {total.toLocaleString()}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                fontSize: 13, color: page === 0 ? T.ghost : T.black,
                background: T.light, border: 'none', borderRadius: 8,
                padding: '8px 16px', cursor: page === 0 ? 'default' : 'pointer',
              }}
            >
              ← Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{
                fontSize: 13, color: page >= totalPages - 1 ? T.ghost : T.black,
                background: T.light, border: 'none', borderRadius: 8,
                padding: '8px 16px', cursor: page >= totalPages - 1 ? 'default' : 'pointer',
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* ── VA Activity Heatmap ─────────────────────────────────────────────── */}
      {heatmapData.length > 0 && (
        <div style={{ paddingInline: 48, paddingTop: 32, paddingBottom: 16 }}>
          <div style={{
            fontSize: 10, color: '#CCCCCC', letterSpacing: '0.08em',
            textTransform: 'uppercase', marginBottom: 12,
          }}>
            VA Activity — Last 7 Days
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {heatmapData.map(row => {
              const weekTotal = row.days.reduce((a, b) => a + b, 0)
              return (
                <div key={row.va_id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 13, color: '#111111', width: 160, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.va_name}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {row.days.map((count, i) => (
                      <div
                        key={i}
                        title={`${dayName(i)}: ${count} event${count !== 1 ? 's' : ''}`}
                        style={{
                          width: 16, height: 16, borderRadius: 2,
                          background: heatmapColor(count),
                          cursor: 'default',
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: '#CCCCCC' }}>[{weekTotal}]</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Retention + Cleanup ─────────────────────────────────────────────── */}
      <div style={{ paddingInline: 48, paddingTop: 32, paddingBottom: 48, borderTop: '1px solid #F5F5F5' }}>
        <div style={{ fontSize: 11, color: '#DDDDDD', marginBottom: 12 }}>
          Info logs are retained for 90 days. API logs for 30 days. Warnings and errors are retained permanently.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={cleanupInfoLogs}
            disabled={cleanupLoading}
            style={{
              fontSize: 11, color: '#CCCCCC', background: 'none',
              border: '1px solid #EEEEEE', borderRadius: 6, padding: '4px 12px',
              cursor: cleanupLoading ? 'default' : 'pointer',
              opacity: cleanupLoading ? 0.6 : 1,
            }}
          >
            Clean info logs older than 90 days
          </button>
          <button
            onClick={cleanupApiLogs}
            disabled={cleanupLoading}
            style={{
              fontSize: 11, color: '#CCCCCC', background: 'none',
              border: '1px solid #EEEEEE', borderRadius: 6, padding: '4px 12px',
              cursor: cleanupLoading ? 'default' : 'pointer',
              opacity: cleanupLoading ? 0.6 : 1,
            }}
          >
            Clean API logs older than 30 days
          </button>
          {cleanupResult && (
            <span style={{ fontSize: 12, color: '#10B981' }}>{cleanupResult}</span>
          )}
        </div>
      </div>

      {/* ── Floating badge (new events while scrolled down) ─────────────────── */}
      {scrolledDown && newEvents > 0 && (
        <div
          onClick={scrollToTop}
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: '#10B981', color: '#fff', borderRadius: 20, padding: '8px 20px',
            fontSize: 12, fontWeight: 500, cursor: 'pointer', zIndex: 50,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          ↑ {newEvents} new event{newEvents !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

// ─── Page (Suspense boundary for useSearchParams) ─────────────────────────────

export default function AdminLogsPage() {
  return (
    <Suspense fallback={
      <div style={{ paddingTop: 80, textAlign: 'center', fontSize: 13, color: '#AEAEB2', fontFamily: "'Inter', system-ui, sans-serif" }}>
        Loading…
      </div>
    }>
      <AdminLogsInner />
    </Suspense>
  )
}
