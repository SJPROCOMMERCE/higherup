-- =============================================
-- Script Tracking — Track which outreach scripts work best
-- =============================================

-- 1. Admin outreach scripts (scripts YOU use to contact LG prospects)
CREATE TABLE IF NOT EXISTS admin_outreach_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  channel TEXT DEFAULT 'general',
  target_prospect_type TEXT DEFAULT 'any',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  description TEXT,
  times_used INTEGER DEFAULT 0,
  times_replied INTEGER DEFAULT 0,
  times_converted INTEGER DEFAULT 0,
  reply_rate NUMERIC(5,1) DEFAULT 0,
  conversion_rate NUMERIC(5,1) DEFAULT 0,
  created_by TEXT,
  is_default BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_outreach_scripts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_admin_scripts_cat ON admin_outreach_scripts(category);
CREATE INDEX IF NOT EXISTS idx_admin_scripts_channel ON admin_outreach_scripts(channel);
CREATE INDEX IF NOT EXISTS idx_admin_scripts_target ON admin_outreach_scripts(target_prospect_type);

-- 2. Columns on admin_prospect_activities for script tracking
ALTER TABLE admin_prospect_activities ADD COLUMN IF NOT EXISTS script_id UUID REFERENCES admin_outreach_scripts(id);
ALTER TABLE admin_prospect_activities ADD COLUMN IF NOT EXISTS script_title TEXT;
ALTER TABLE admin_prospect_activities ADD COLUMN IF NOT EXISTS script_modified BOOLEAN DEFAULT false;
ALTER TABLE admin_prospect_activities ADD COLUMN IF NOT EXISTS actual_message_sent TEXT;

-- 3. Script performance per combination
CREATE TABLE IF NOT EXISTS admin_script_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES admin_outreach_scripts(id) ON DELETE CASCADE,
  prospect_type TEXT,
  channel TEXT,
  sent_by TEXT,
  outcome TEXT NOT NULL,
  prospect_id UUID REFERENCES admin_prospects(id),
  activity_id UUID REFERENCES admin_prospect_activities(id),
  sent_at TIMESTAMPTZ NOT NULL,
  reply_at TIMESTAMPTZ,
  response_time_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_script_performance ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sp_script ON admin_script_performance(script_id);
CREATE INDEX IF NOT EXISTS idx_sp_type ON admin_script_performance(prospect_type);
CREATE INDEX IF NOT EXISTS idx_sp_channel ON admin_script_performance(channel);
CREATE INDEX IF NOT EXISTS idx_sp_outcome ON admin_script_performance(outcome);

-- 4. Seed default outreach scripts
INSERT INTO admin_outreach_scripts (category, channel, target_prospect_type, title, content, description, created_by, is_default, sort_order) VALUES

-- FIRST CONTACT
('first_contact', 'whatsapp', 'individual', 'First DM — individual VA',
'Hey [name], quick question. If you could earn passive income from your VA network without doing any listing work yourself, would that interest you?',
'Standaard eerste bericht. Leid met een vraag. Noem HigherUp niet.', 'system', true, 1),

('first_contact', 'whatsapp', 'agency_owner', 'First DM — agency owner',
'Hey [name], I came across your agency. Quick question. If your VA team could process 200 Shopify listings in 10 minutes instead of 50 hours, and you could earn from every listing they do, would that be worth a conversation?',
'Voor agency owners. Nadruk op hun TEAM, niet op henzelf.', 'system', true, 2),

('first_contact', 'facebook', 'community_leader', 'First DM — community leader',
'Hey [name], I noticed you run [community name]. I have something that could benefit your members who do listing work. Would you be open to hearing about it? I think it could add real value to your group.',
'Voor community leaders. Nadruk op waarde voor HUN leden.', 'system', true, 3),

('first_contact', 'instagram', 'content_creator', 'First DM — content creator',
'Hey [name], love your content about VA work. Quick question. Have you ever explored earning from your audience without selling a course? I have something your followers who do listing work would find really useful.',
'Voor content creators. Nadruk op monetisatie van hun audience.', 'system', true, 4),

('first_contact', 'linkedin', 'agency_owner', 'First DM — LinkedIn agency',
'Hi [name], I noticed your VA agency on LinkedIn. We built a tool that lets VAs optimize 200 Shopify listings in 10 minutes. Your team could use it and you would earn from every product they process. Would you be open to a quick chat about it?',
'LinkedIn tone. Iets formeler.', 'system', true, 5),

('first_contact', 'general', 'any', 'First DM — universal',
'Hey [name], quick question. If there was a way to earn $0.05 on every Shopify product listing that VAs in your network process, with zero work from your side after setup, would that interest you?',
'Universeel. Werkt voor elk type.', 'system', true, 6),

-- FOLLOW UP
('follow_up', 'general', 'any', 'Follow-up — interest shown',
'Great that you are interested. Here is the short version. HigherUp is an AI tool that optimizes Shopify product listings. VAs upload a CSV and get optimized titles, descriptions, tags, SEO and SKUs back in 10 minutes. You earn $0.05 on every product your network processes. Forever. Here is our pitch: higherup.me/genx-pitch',
'Na interesse. Korte uitleg plus link.', 'system', true, 10),

('follow_up', 'general', 'any', 'Follow-up — no reply 3 days',
'Hey [name], just following up on my message from a few days ago. No pressure at all. Just thought it might be worth a conversation if you have VAs in your network who do listing work.',
'Drie dagen geen reactie. Kort en low pressure.', 'system', true, 11),

('follow_up', 'general', 'any', 'Follow-up — no reply 7 days',
'Hey [name], last message from me on this. The opportunity is still there whenever you want to explore it. Feel free to check out higherup.me/genx-pitch if you are ever curious. All the best.',
'Zeven dagen geen reactie. Laatste bericht. Link achterlaten.', 'system', true, 12),

('follow_up', 'general', 'any', 'Follow-up — wants more info',
'Sure, happy to explain more. You sign up as a Lead Generator for free. You get a personal referral link. Every VA that signs up through your link and lists products on HigherUp earns you $0.05 per product. Automatically. You do not do any listing work yourself. The VAs do the work for their clients and you earn from every product they process. Right now our top LG earns over $1,000 per month. Want me to send you the full pitch?',
'Ze willen meer info. Geef de elevator pitch.', 'system', true, 13),

-- OBJECTION HANDLING
('objection_handling', 'general', 'any', 'Objection — wants fixed fee',
'I totally understand wanting certainty. But let me show you the math. If you bring 70 VAs and they each list 300 products per month, you earn $1,050 per month. A fixed fee would be $400 at most. That is $650 per month you leave on the table. And it grows every month as your network grows. With a fixed fee, month 12 pays the same as month 1. With commission, month 12 pays 5x more. Check the comparison: higherup.me/genx-pitch',
'De #1 bezwaar. Altijd de math laten zien, niet argumenteren.', 'system', true, 20),

('objection_handling', 'general', 'any', 'Objection — thinks scam',
'I get the skepticism. Here is what I can offer: go to higherup.me and look around. We are a real company with a real product. Our VAs use it every day. You can sign up for free and see the dashboard. Your first 10 products are free. No credit card. No risk. If it looks like a scam after you see the platform, fair enough. But I think you will be surprised.',
'Scam bezwaar. Stuur ze naar de site. Laat het product spreken.', 'system', true, 21),

('objection_handling', 'general', 'any', 'Objection — thinks MLM',
'That is a fair concern so let me be very clear. This is single layer. You bring VAs. They list products. You earn $0.05 per product. That is it. The VAs you bring do NOT recruit anyone. There are no levels. No downline. No pyramid. You refer, they work, you earn. We built it this way specifically because we are not MLM and do not want to look like it.',
'MLM bezwaar. Wees direct en specifiek over waarom het NIET MLM is.', 'system', true, 22),

('objection_handling', 'general', 'any', 'Objection — no time',
'I hear you. But here is the thing. Getting started takes about 30 minutes of setup. After that it is 30 minutes per day: send 10 messages, follow up on replies, check your dashboard. That is it. And once your VAs are active, the income is automatic. You earn while you sleep. Literally. The 30 minutes per day builds something that pays you even when you stop.',
'Geen tijd bezwaar. Benadruk hoe weinig tijd het kost.', 'system', true, 23),

-- CLOSING
('closing', 'general', 'any', 'Close — the math',
'Let me just give you the numbers. One active VA listing 300 products per month earns you $15 per month. That does not sound like much. But 10 VAs is $150. 50 VAs is $750. 100 VAs is $1,500. And you are not doing any listing work. You just connected them to the tool. The question is not whether this works. The question is how many VAs can you connect? Ready to start?',
'Sluit met de math. Laat ze zelf het getal berekenen.', 'system', true, 30),

('closing', 'general', 'any', 'Close — zero risk',
'Here is what I suggest. Sign up, it is free. Get your referral link. Send it to 10 VAs in your network. If even 3 of them start listing, you will see real earnings in your dashboard within a week. If it does not work out, you have lost nothing. Zero risk.',
'Sluit met zero risk. Maak de volgende stap klein.', 'system', true, 31),

-- COMMUNITY POST
('community_post', 'facebook', 'any', 'Community post — value (time saving)',
'For VAs who do Shopify product listings. I found a tool that processes 200 products in 10 minutes. Titles, descriptions, tags, SEO, everything. If anyone is interested in learning more, DM me.',
'Waarde post. Geen link. Geen pitch. Laat ze naar jou toe komen.', 'system', true, 40),

('community_post', 'facebook', 'any', 'Community post — value (pricing)',
'Quick tip for VAs who do listing work. Stop charging per hour. Start charging per product. With the right tool you can process 200 listings in 10 minutes. At $0.80 per product that is $160 for 10 minutes of work. DM me if you want to know how.',
'Pricing advies. Positioneert je als expert.', 'system', true, 41)

ON CONFLICT DO NOTHING;
