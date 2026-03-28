import { supabase } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogOptions {
  action:       string
  details:      string
  va_id?:       string
  admin_id?:    string
  client_id?:   string
  upload_id?:   string
  billing_id?:  string
  affiliate_id?: string
  request_id?:  string
  source?:      'va' | 'admin' | 'system' | 'api'
  severity?:    'info' | 'warning' | 'error' | 'critical'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?:    Record<string, any>
  ip_address?:  string
  user_agent?:  string
}

// ─── logActivity ──────────────────────────────────────────────────────────────
// Fire-and-forget activity logger. NEVER throws — logging failures are swallowed
// so they cannot crash the application.
//
// Usage:
//   await logActivity({ action: 'va_login', va_id: id, source: 'va', details: '…' })
//   void  logActivity({ … })   // fire-and-forget (client components)

export async function logActivity(options: LogOptions): Promise<void> {
  const {
    source   = 'system',
    severity = 'info',
    ...rest
  } = options

  try {
    await supabase.from('activity_log').insert({
      ...rest,
      source,
      severity,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    // NEVER throw — log to console and continue
    console.error('[activity-log] Failed to write log entry:', err)
  }
}
