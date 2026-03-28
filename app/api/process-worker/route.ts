import { supabase } from '@/lib/supabase'
import { runPipeline } from '@/app/api/process-upload/route'

// ─── Vercel max function duration ─────────────────────────────────────────────
export const maxDuration = 300

const MAX_CONCURRENT = 5

// ─── GET /api/process-worker ──────────────────────────────────────────────────
//
// Polling worker: finds the oldest queued upload and processes it if a slot is
// available (< 5 concurrent jobs).
//
// Call this route every 5 seconds from the client dashboard or via a cron job
// to keep the queue moving.

export async function GET() {
  try {
    // Count active jobs
    const { count: activeCount } = await supabase
      .from('uploads')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'processing')

    if ((activeCount ?? 0) >= MAX_CONCURRENT) {
      return Response.json({ ok: true, message: 'Max concurrent jobs reached', started: null })
    }

    // Find oldest queued upload
    const { data: queued } = await supabase
      .from('uploads')
      .select('id')
      .eq('status', 'queued')
      .order('uploaded_at', { ascending: true })
      .limit(1)

    if (!queued || queued.length === 0) {
      return Response.json({ ok: true, message: 'No queued uploads', started: null })
    }

    const uploadId = queued[0].id

    // Process it
    try {
      await runPipeline(uploadId)
      return Response.json({ ok: true, started: uploadId, status: 'done' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Processing failed'
      console.error('[process-worker] pipeline error:', msg)
      await supabase.from('uploads')
        .update({ status: 'failed', error_message: msg })
        .eq('id', uploadId)
      return Response.json({ ok: false, started: uploadId, error: msg }, { status: 500 })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Worker error'
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }
}
