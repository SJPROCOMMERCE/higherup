import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

// ─── GET /api/billing/check-overdue ───────────────────────────────────────────
// Run frequently (cron or admin trigger). Escalates unpaid invoices.
//
// New escalation schedule (hours / days past generated_at):
//   >= 48h  → status = overdue + VA immediately paused
//   >= 14d  → VA soft-deleted (status = 'deleted'), clients deactivated

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Load all non-paid, non-waived invoices
  const { data: bills, error } = await supabase
    .from('billing')
    .select('*')
    .in('status', ['outstanding', 'overdue'])

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!bills || bills.length === 0) return Response.json({ ok: true, processed: 0, message: 'No bills to check.' })

  let reminded = 0, paused = 0, deleted = 0

  for (const bill of bills) {
    const generatedAt  = new Date(bill.generated_at as string)
    const hoursElapsed = (now.getTime() - generatedAt.getTime()) / 3_600_000
    const daysElapsed  = hoursElapsed / 24

    const monthLabel = formatMonth(bill.month as string)
    const amount     = `$${bill.total_amount}`

    // ── 48h: mark overdue + pause VA immediately ───────────────────────────
    if (hoursElapsed >= 48 && !bill.reminded_at) {
      // Mark invoice overdue, set due_date = generated_at + 48h, set reminded_at
      await supabase.from('billing').update({
        status:      'overdue',
        due_date:    new Date(generatedAt.getTime() + 48 * 3_600_000).toISOString(),
        reminded_at: now.toISOString(),
      }).eq('id', bill.id)

      const overdueTitle = `Invoice overdue — ${amount}`
      const overdueMsg   = `Your HigherUp share of ${amount} for ${monthLabel} is overdue. Pay now to keep your account active and your outputs accessible.`

      await supabase.from('notifications').insert({
        va_id:   bill.va_id,
        type:    'invoice_overdue',
        title:   overdueTitle,
        message: overdueMsg,
        is_read: false,
      })
      await logActivity({
        action: 'invoice_overdue', va_id: bill.va_id, billing_id: bill.id,
        source: 'system', severity: 'warning',
        details: `Invoice overdue: ${amount} for ${monthLabel} (${Math.floor(hoursElapsed)}h elapsed)`,
      })
      reminded++

      // Immediately pause VA (new rule: pause on overdue, not after 3 days)
      if (!bill.paused_at) {
        await supabase.from('billing').update({ paused_at: now.toISOString() }).eq('id', bill.id)

        const { data: va } = await supabase.from('vas').select('status').eq('id', bill.va_id).single()
        if (va?.status === 'active') {
          await supabase.from('vas').update({ status: 'paused' }).eq('id', bill.va_id)

          const pauseTitle = 'Account paused — unpaid invoice'
          const pauseMsg   = `Your account has been paused due to an unpaid HigherUp share of ${amount} for ${monthLabel}. Pay within 14 days to avoid account deletion.`

          await supabase.from('notifications').insert({
            va_id:   bill.va_id,
            type:    'account_paused',
            title:   pauseTitle,
            message: pauseMsg,
            is_read: false,
          })
          await logActivity({
            action: 'va_auto_paused', va_id: bill.va_id, billing_id: bill.id,
            source: 'system', severity: 'warning',
            details: `VA auto-paused: ${amount} invoice for ${monthLabel} unpaid after ${Math.floor(hoursElapsed)}h`,
          })
          paused++
        }
      }
    }

    // ── 14 days: soft-delete VA ────────────────────────────────────────────
    if (daysElapsed >= 14 && !bill.blocked_at) {
      await supabase.from('billing').update({
        blocked_at: now.toISOString(),
        status:     'overdue',
      }).eq('id', bill.id)

      const { data: va } = await supabase.from('vas').select('status, name').eq('id', bill.va_id).single()
      if (va && va.status !== 'deleted') {
        // Soft delete — set status to 'deleted'
        await supabase.from('vas').update({
          status: 'deleted',
        }).eq('id', bill.va_id)

        // Deactivate all clients
        await supabase.from('clients')
          .update({ is_active: false, deactivation_reason: 'VA deleted: non-payment' })
          .eq('va_id', bill.va_id)

        // Deactivate affiliate relations
        await supabase.from('affiliates').update({ is_active: false }).eq('referrer_va_id', bill.va_id)

        await logActivity({
          action: 'va_deleted', va_id: bill.va_id, billing_id: bill.id,
          source: 'system', severity: 'critical',
          details: `VA auto-deleted: ${amount} invoice for ${monthLabel} unpaid after ${Math.floor(daysElapsed)} days`,
          metadata: { reason: 'non_payment', days_elapsed: Math.floor(daysElapsed), amount: bill.total_amount },
        })
        deleted++
      }
    }
  }

  console.log(`[check-overdue] reminded=${reminded} paused=${paused} deleted=${deleted}`)
  return Response.json({ ok: true, processed: bills.length, reminded, paused, deleted })
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
