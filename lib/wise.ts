// ─── Wise API integration (placeholder) ───────────────────────────────────────
// Full integration will use WISE_API_KEY + WISE_PROFILE_ID once accounts are
// connected. All functions are stubs — they return sensible defaults so the
// rest of the codebase can call them without breaking.

export const WISE_CONFIG = {
  apiKey:    process.env.WISE_API_KEY    ?? '',
  profileId: process.env.WISE_PROFILE_ID ?? '',
  baseUrl:   'https://api.wise.com',
}

/**
 * Creates a Wise payment request link for the given amount and reference.
 * Placeholder — will call Wise Pay Links API once integrated.
 */
export async function createWisePaymentLink(
  _amount:    number,
  _reference: string,
): Promise<string | null> {
  // TODO: POST /v1/pay-links with amount, currency, reference
  return null
}

/**
 * Checks for incoming Wise transfers matching a given reference.
 * Placeholder — will call Wise Transfers API once integrated.
 */
export async function checkIncomingPayments(
  _reference: string,
): Promise<{ found: boolean; amount?: number; transferId?: string }> {
  // TODO: GET /v1/transfers?profile={WISE_PROFILE_ID} + filter by reference
  return { found: false }
}
