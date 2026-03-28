import { supabase } from '@/lib/supabase'

// ─── 48-Hour deadline check ────────────────────────────────────────────────────
//
// Finds all approved+active clients whose deadline_48h has passed,
// checks if they have at least one upload made after approval, and:
//   • No upload  → deactivate client + create notification
//   • Has upload → just clear the deadline (already fulfilled)
//
// This route is called:
//   - Manually: GET or POST /api/check-deadlines (for testing)
//   - Automatically: via a Vercel/Supabase cron job (hourly)

async function runDeadlineCheck(): Promise<{ checked: number; deactivated: number; cleared: number }> {
  const now = new Date().toISOString()

  // 1. Find all expired clients
  const { data: expired, error } = await supabase
    .from('clients')
    .select('*')
    .eq('approval_status', 'approved')
    .eq('is_active', true)
    .not('deadline_48h', 'is', null)
    .lt('deadline_48h', now)

  if (error) throw new Error(error.message)
  if (!expired || expired.length === 0) return { checked: 0, deactivated: 0, cleared: 0 }

  let deactivated = 0
  let cleared = 0

  for (const client of expired) {
    // 2. Check if at least one upload exists after approval
    const { data: uploads } = await supabase
      .from('uploads')
      .select('id')
      .eq('client_id', client.id)
      .gt('uploaded_at', client.approved_at)
      .limit(1)

    const hasUpload = uploads && uploads.length > 0

    if (hasUpload) {
      // Upload exists — client fulfilled the requirement, clear the deadline
      await supabase
        .from('clients')
        .update({ deadline_48h: null })
        .eq('id', client.id)

      cleared++
    } else {
      // No upload — deactivate the client
      await supabase
        .from('clients')
        .update({ is_active: false, deadline_48h: null })
        .eq('id', client.id)

      // Create notification for the VA
      await supabase.from('notifications').insert({
        va_id:   client.va_id,
        type:    '48h_expired',
        title:   `${client.store_name} has been deactivated`,
        message: 'No upload was made within 48 hours of approval. Register the client again when you are ready.',
        is_read: false,
      })

      deactivated++
    }
  }

  return { checked: expired.length, deactivated, cleared }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runDeadlineCheck()
    return Response.json({ ok: true, ...result })
  } catch (err: unknown) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runDeadlineCheck()
    return Response.json({ ok: true, ...result })
  } catch (err: unknown) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
