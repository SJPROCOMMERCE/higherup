-- =============================================
-- Reactivation Pipeline
-- Track and manage re-engagement of lost prospects
-- =============================================

-- 1. Extra columns on admin_prospects for reactivation tracking
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS times_reactivated INTEGER DEFAULT 0;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS last_reactivated_at TIMESTAMPTZ;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS last_reactivated_by TEXT;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS reactivation_note TEXT;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS revisit_reason TEXT;

-- 2. Reactivation cycles — each planned touchpoint for a lost prospect
CREATE TABLE IF NOT EXISTS admin_reactivation_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES admin_prospects(id) ON DELETE CASCADE,
  loss_history_id UUID REFERENCES admin_prospect_loss_history(id),

  -- Planning
  scheduled_at TIMESTAMPTZ NOT NULL,
  reason_for_revisit TEXT NOT NULL,
  script_to_use TEXT,
  custom_message TEXT,

  -- Execution
  status TEXT DEFAULT 'scheduled',
  executed_at TIMESTAMPTZ,
  executed_by TEXT,

  -- Result
  result_note TEXT,
  new_pipeline_status TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_reactivation_cycles ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_react_prospect ON admin_reactivation_cycles(prospect_id);
CREATE INDEX IF NOT EXISTS idx_react_scheduled ON admin_reactivation_cycles(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_react_status ON admin_reactivation_cycles(status);

-- 3. Reactivation templates — pre-written messages per loss reason
CREATE TABLE IF NOT EXISTS admin_reactivation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loss_reason TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  description TEXT,
  best_channel TEXT,
  expected_reply_rate TEXT,
  days_after_loss INTEGER NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_reactivation_templates ENABLE ROW LEVEL SECURITY;

-- 4. Seed templates
INSERT INTO admin_reactivation_templates (loss_reason, title, content, description, best_channel, expected_reply_rate, days_after_loss, sort_order) VALUES

('wants_fixed_fee', 'Reactivation — fixed fee prospect (30d)',
'Hey [name], we spoke about a month ago about GENX. I know you preferred a fixed fee at the time. Since then we have had [X] new Lead Generators join and our top performer earned $[Y] last month on pure commission. Just wanted to share that in case it changes the picture for you. No pressure at all.',
'Na 30 dagen. Deel concrete resultaten.', 'whatsapp', '~15%', 30, 1),

('wants_fixed_fee', 'Reactivation — fixed fee prospect (60d)',
'Hey [name], quick update from HigherUp. We now have [X] active Lead Generators. One of them brought in 70 VAs and earned $1,050 last month. I remember you wanted a fixed fee which I totally understand. But I thought you should know what the top performers are actually making. Would love to chat again if you are open to it.',
'Na 60 dagen. Sterkere social proof.', 'whatsapp', '~20%', 60, 2),

('thinks_scam', 'Reactivation — scam concern (60d)',
'Hey [name], I know you had some concerns about HigherUp when we last spoke. Since then we have grown to [X] active Lead Generators and [Y] Virtual Assistants using the platform daily. Here is a link to our live platform: higherup.me. Just wanted you to see it is real and growing. No hard feelings if you are still not interested.',
'Na 60 dagen. Bewijs dat het echt is.', 'whatsapp', '~10%', 60, 1),

('thinks_mlm', 'Reactivation — MLM concern (60d)',
'Hey [name], I wanted to follow up from our conversation a while back. I understand the MLM concern completely. Just to be clear: GENX is single layer. You refer VAs and earn from their listings. The VAs do not recruit anyone. There are no levels and no downline. We now have [X] LGs and none of them recruit other LGs. Happy to explain more if you want.',
'Na 60 dagen. Herhaal het verschil.', 'whatsapp', '~12%', 60, 1),

('no_time', 'Reactivation — no time (30d)',
'Hey [name], just a quick check in. I know timing was not great when we last spoke. Things may have changed. If you ever have 30 minutes a day to spare, that is genuinely all it takes to get started as a Lead Generator. The scripts and tools are all ready for you. Let me know if you want to revisit this.',
'Na 30 dagen. Kort en low pressure.', 'whatsapp', '~18%', 30, 1),

('no_reply_5plus', 'Reactivation — never replied (60d)',
'Hey [name], I reached out a while back about an opportunity with HigherUp. No worries if it was not the right time. Just wanted to share that we have grown quite a bit since then. If you are ever curious about earning passive income from your VA network, the door is always open. Here is a quick overview: higherup.me/genx-pitch',
'Na 60 dagen. Ander kanaal als mogelijk.', 'instagram', '~5%', 60, 1),

('no_reply_initial', 'Reactivation — never replied to first message (30d)',
'Hey [name], I sent you a message a while ago about a tool that helps VAs list Shopify products 10x faster. Not sure if you saw it. Would it be useful for your work or your network?',
'Na 30 dagen. Simpele herhaling. Ander kanaal.', 'facebook', '~8%', 30, 1),

('bad_timing', 'Reactivation — bad timing (14d)',
'Hey [name], just checking in. You mentioned the timing was not great when we last spoke. Has anything changed? Happy to pick up where we left off whenever you are ready.',
'Na 14 dagen. Heel kort.', 'whatsapp', '~25%', 14, 1),

('too_complicated', 'Reactivation — too complicated (30d)',
'Hey [name], since we last spoke we have simplified the onboarding a lot. You literally sign up, get a link, share it, and earn $0.05 on every product your network lists. That is it. Takes 2 minutes to set up. Want me to show you how simple it is now?',
'Na 30 dagen. Benadruk simplificatie.', 'whatsapp', '~15%', 30, 1),

('uses_competitor', 'Reactivation — uses competitor (90d)',
'Hey [name], I know you were using [competitor] when we last spoke. Just curious, how is that going? We have added a lot of new features to HigherUp since then. If you ever want to compare, I am happy to show you what has changed.',
'Na 90 dagen. Nieuwsgierigheid wekken.', 'whatsapp', '~10%', 90, 1)

ON CONFLICT DO NOTHING;
