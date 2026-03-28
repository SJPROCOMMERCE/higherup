// ─── Email placeholder endpoint ───────────────────────────────────────────────
// TODO: Replace with real email service (Resend, SendGrid, Postmark, etc.)
// For now, this only logs — no actual email is sent.

export async function POST(request: Request) {
  try {
    const { va_id, subject, body } = await request.json() as {
      va_id: string
      subject: string
      body: string
    }

    // Placeholder log — swap this block for real email API call
    console.log(`[EMAIL PLACEHOLDER] To VA ${va_id}: ${subject}`)
    console.log(`[EMAIL PLACEHOLDER] Body: ${body?.slice(0, 120)}`)

    return Response.json({ sent: false, reason: 'Email not configured' })
  } catch (err) {
    console.error('[send-email] Error:', err)
    return Response.json({ sent: false, reason: 'Invalid request' }, { status: 400 })
  }
}
