// ─── HigherUp payment details ─────────────────────────────────────────────────
// These are OUR bank details — VAs pay US via these methods.
// The VA's own payment_method in their profile is for payouts TO them.

export const HIGHERUP_PAYMENT = {
  bank: {
    holder:    'PROvision',
    iban:      'NL03 BUNQ 2147 9992 45',
    bic:       'BUNQNL2A',
    bank_name: 'Bunq',
  },
  wise: {
    // Replace with real Wise payment link once set up
    link:  'https://wise.com/pay/placeholder',
    email: 'placeholder@higherup.io',
  },
}

/**
 * Returns a Wise payment link pre-filled with amount and reference.
 * Falls back to base link if URLSearchParams encoding fails.
 */
export function getWisePaymentLink(amount: number, reference: string): string {
  try {
    const params = new URLSearchParams({
      amount:    amount.toFixed(2),
      currency:  'USD',
      reference,
    })
    return `${HIGHERUP_PAYMENT.wise.link}?${params.toString()}`
  } catch {
    return HIGHERUP_PAYMENT.wise.link
  }
}
