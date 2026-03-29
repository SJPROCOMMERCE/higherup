-- ─────────────────────────────────────────────────────────────────────────────
-- CLEAN SLATE — verwijder alles behalve het eerste VA account
-- Gebruik: plak in Supabase SQL Editor en run
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  keep_va_id UUID;
  keep_va_name TEXT;
  keep_va_code TEXT;
BEGIN
  -- Identificeer het eerste VA account
  SELECT id, name INTO keep_va_id, keep_va_name
  FROM vas ORDER BY joined_at ASC LIMIT 1;

  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE 'Keeping VA: % (%)', keep_va_name, keep_va_id;
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  -- 1. Affiliate payouts
  BEGIN DELETE FROM affiliate_payouts; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'affiliate_payouts: skipped (table not found)'; END;

  -- 2. Affiliates
  BEGIN DELETE FROM affiliates; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'affiliates: skipped (table not found)'; END;

  -- 3. Referral codes (behoud alleen van het eerste VA)
  BEGIN DELETE FROM referral_codes WHERE va_id != keep_va_id; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'referral_codes: skipped (table not found)'; END;

  -- 4. Prompt requests
  BEGIN DELETE FROM prompt_requests; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'prompt_requests: skipped (table not found)'; END;

  -- 5. Client prompts (koppeltabel)
  BEGIN DELETE FROM client_prompts; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'client_prompts: skipped (table not found)'; END;

  -- 6. Client profiles
  BEGIN DELETE FROM client_profiles; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'client_profiles: skipped (table not found)'; END;

  -- 7. Upload messages
  BEGIN DELETE FROM upload_messages; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'upload_messages: skipped (table not found)'; END;

  -- 8. Billing line items
  BEGIN DELETE FROM billing_line_items; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'billing_line_items: skipped (table not found)'; END;

  -- 9. Billing
  BEGIN DELETE FROM billing; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'billing: skipped (table not found)'; END;

  -- 10. Uploads
  BEGIN DELETE FROM uploads; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'uploads: skipped (table not found)'; END;

  -- 11. Clients
  BEGIN DELETE FROM clients; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'clients: skipped (table not found)'; END;

  -- 12. Notifications
  BEGIN DELETE FROM notifications; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'notifications: skipped (table not found)'; END;

  -- 13. Activity log
  BEGIN DELETE FROM activity_log; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'activity_log: skipped (table not found)'; END;

  -- 14. Invites
  BEGIN DELETE FROM invites; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'invites: skipped (table not found)'; END;

  -- 15. Profile change requests
  BEGIN DELETE FROM profile_change_requests; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'profile_change_requests: skipped (table not found)'; END;

  -- 16. Alle andere VA's behalve het eerste account
  BEGIN DELETE FROM vas WHERE id != keep_va_id; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'vas: skipped (table not found)'; END;

  -- Reset VA zodat hij fresh is (behoud naam + code)
  UPDATE vas SET
    status            = 'active',
    payment_status    = 'paid',
    onboarding_complete = false,
    agreed_to_terms   = false,
    agreed_at         = NULL,
    full_legal_name   = NULL,
    country           = NULL,
    phone_number      = NULL,
    payment_method    = NULL,
    payment_details   = NULL,
    preferred_currency = NULL,
    wise_paypal_details = NULL
  WHERE id = keep_va_id;

  -- Ophalen login code
  BEGIN
    SELECT code INTO keep_va_code FROM referral_codes WHERE va_id = keep_va_id LIMIT 1;
  EXCEPTION WHEN undefined_table THEN
    keep_va_code := 'n/a';
  END;

  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE 'Done! Clean slate complete.';
  RAISE NOTICE 'Remaining VA : % (%)', keep_va_name, keep_va_id;
  RAISE NOTICE 'Referral code: %', COALESCE(keep_va_code, 'none');
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY — run dit apart om te checken
-- ─────────────────────────────────────────────────────────────────────────────
/*
SELECT 'vas'                as tabel, COUNT(*) as records FROM vas
UNION ALL SELECT 'clients',           COUNT(*) FROM clients
UNION ALL SELECT 'uploads',           COUNT(*) FROM uploads
UNION ALL SELECT 'billing',           COUNT(*) FROM billing
UNION ALL SELECT 'affiliates',        COUNT(*) FROM affiliates
UNION ALL SELECT 'referral_codes',    COUNT(*) FROM referral_codes
UNION ALL SELECT 'notifications',     COUNT(*) FROM notifications
UNION ALL SELECT 'invites',           COUNT(*) FROM invites
UNION ALL SELECT 'activity_log',      COUNT(*) FROM activity_log
UNION ALL SELECT 'prompt_requests',   COUNT(*) FROM prompt_requests
UNION ALL SELECT 'client_prompts',    COUNT(*) FROM client_prompts
ORDER BY tabel;

SELECT id, name, login_code, status, onboarding_complete FROM vas;
SELECT va_id, code FROM referral_codes;
*/
