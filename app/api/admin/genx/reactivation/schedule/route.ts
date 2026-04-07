import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function POST(req: Request) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const db = genxDb()

  const { prospect_id, scheduled_at, reason, custom_message } = body
  if (!prospect_id || !scheduled_at || !reason) {
    return Response.json({ error: 'prospect_id, scheduled_at, and reason are required' }, { status: 400 })
  }

  // If reason is auto, fetch the template for this prospect's loss_reason
  let scriptToUse: string | null = null
  let message = custom_message || null

  if (reason === 'scheduled_auto' || !custom_message) {
    const { data: prospect } = await db
      .from('admin_prospects')
      .select('loss_reason')
      .eq('id', prospect_id)
      .single()

    if (prospect?.loss_reason) {
      const { data: templates } = await db
        .from('admin_reactivation_templates')
        .select('*')
        .eq('loss_reason', prospect.loss_reason)
        .eq('is_active', true)
        .order('days_after_loss', { ascending: true })
        .limit(1)

      if (templates?.[0]) {
        scriptToUse = templates[0].title
        if (!message) message = templates[0].content
      }
    }
  }

  const { data, error } = await db.from('admin_reactivation_cycles').insert({
    prospect_id,
    scheduled_at,
    reason_for_revisit: reason,
    script_to_use: scriptToUse,
    custom_message: message,
    status: 'scheduled',
  }).select().single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ cycle: data })
}
