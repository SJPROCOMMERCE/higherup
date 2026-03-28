import { supabase } from './supabase'

// ─── sendNotification ─────────────────────────────────────────────────────────
// Centralized notification helper. Always inserts in-app notification.
// Optionally fires email placeholder (no-op until email service is configured).

export async function sendNotification(options: {
  va_id: string
  type: string
  title: string
  message: string
  send_email?: boolean
}): Promise<void> {
  // 1. In-app notification
  await supabase.from('notifications').insert({
    va_id:    options.va_id,
    type:     options.type,
    title:    options.title,
    message:  options.message,
    is_read:  false,
    created_at: new Date().toISOString(),
  })

  // 2. Email (placeholder — logs only, no actual email sent yet)
  if (options.send_email !== false) {
    try {
      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          va_id:   options.va_id,
          subject: options.title,
          body:    options.message,
        }),
      })
    } catch {
      console.log('[notifications] Email endpoint not reachable — skipping')
    }
  }
}
