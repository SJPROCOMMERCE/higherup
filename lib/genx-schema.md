# GENX Database Schema — BRON VAN WAARHEID
# Laatste update: 2026-04-06
# GEBRUIK ALLEEN DEZE KOLOM NAMEN IN ALLE CODE
# Gegenereerd via live database dump — niet uit code, niet uit geheugen

---

## lead_generators
- id: uuid (PK)
- display_name: text — naam van de LG (gebruik DIT, NIET "name")
- login_code: text — unieke inlogcode (bijv. "TEST01")
- email: text | null
- phone: text | null
- status: text — 'active' | 'pending' | 'paused' | 'deactivated'
- source: text | null — bijv. 'become-lg'
- notes: text | null
- referral_code: text — unieke referral code (bijv. "ca8496e6"), altijd lowercase
- joined_at: timestamptz | null — ⚠️ NIET created_at, het heet joined_at
- activated_at: timestamptz | null
- total_vas: integer — GECACHEDE teller, kan stale zijn. Gebruik referral_tracking voor live count
- active_vas: integer — GECACHEDE teller, kan stale zijn
- total_earned: numeric — GECACHEDE som, kan stale zijn. Gebruik lg_earnings voor live sum
- pending_payout: numeric
- last_active: timestamptz | null
- ⚠️ GEEN created_at kolom
- ⚠️ GEEN approved_at kolom

---

## referral_tracking
- id: uuid (PK)
- va_user_id: uuid — FK → vas.id
- lg_id: uuid — FK → lead_generators.id
- referred_at: timestamptz
- source: text | null — bijv. 'direct', 'test'
- status: text — 'active' | 'inactive'

---

## lg_earnings
- id: uuid (PK)
- lg_id: uuid — FK → lead_generators.id
- va_user_id: uuid — FK → vas.id (de VA die de upload deed)
- usage_id: uuid | null — optioneel, kan null zijn
- products: integer — aantal producten in deze upload
- amount: numeric — $0.05 per product
- billing_month: date — ⚠️ TYPE IS DATE, niet text! Vereist format 'YYYY-MM-01'
- created_at: timestamptz

---

## lg_actions
- id: uuid (PK)
- lg_id: uuid — FK → lead_generators.id
- type: text — bijv. 'activate_new_va'
- priority: text — 'high' | 'medium' | 'low'
- title: text
- body: text | null
- va_user_id: uuid | null — FK → vas.id (optioneel)
- metadata: jsonb | null
- completed: boolean — default false
- dismissed: boolean — default false
- created_at: timestamptz
- expires_at: timestamptz | null

---

## lg_pulse_events
- id: uuid (PK)
- lg_id: uuid — FK → lead_generators.id
- type: text — 'signup' | 'upload'
- payload: jsonb — { va_id, va_name, products?, amount? }
- read: boolean — default false
- created_at: timestamptz

---

## lg_payouts
- id: uuid (PK)
- lg_id: uuid — FK → lead_generators.id
- period_start: date
- amount: numeric
- status: text — 'pending' | 'paid'
- (overige kolommen onbekend, tabel is leeg in productie)

---

## vas
- id: uuid (PK)
- name: text
- email: text | null
- login_code: text | null
- status: text
- payment_status: text | null
- joined_at: timestamptz | null
- country: text | null
- phone_number: text | null
- payment_method: text | null
- payment_details: jsonb | null
- preferred_currency: text | null
- onboarding_complete: boolean
- agreed_to_terms: boolean
- (en andere kolommen)

---

## uploads
- id: uuid (PK)
- va_id: uuid — FK → vas.id
- client_id: uuid
- store_name: text
- status: text — 'done' | 'processing' | 'failed' | 'queued'
- products_optimized: integer — aantal succesvol verwerkte producten
- processing_completed_at: timestamptz | null
- uploaded_at: timestamptz
- product_row_count: integer
- (veel meer kolommen, zie boven voor volledige lijst)

---

## KRITIEKE REGELS

1. lead_generators.display_name — NIET name, NIET lg_name
2. lead_generators.joined_at — NIET created_at
3. lg_earnings.billing_month — TYPE DATE, altijd 'YYYY-MM-01' format
4. lead_generators cached columns (total_vas, active_vas, total_earned) kunnen stale zijn
   → Altijd live queries op referral_tracking en lg_earnings gebruiken voor betrouwbare data
5. uploads.va_id — NIET user_id of va_user_id
6. referral_tracking.va_user_id → uploads.va_id (beide zijn vas.id)
