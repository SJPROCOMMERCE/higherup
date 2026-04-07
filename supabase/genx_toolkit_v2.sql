-- ============================================================
-- GENX TOOLKIT V2 MIGRATION
-- Run this in Supabase SQL Editor BEFORE deploying the code.
-- ============================================================

-- 1. Add new columns to genx_toolkit
ALTER TABLE genx_toolkit ADD COLUMN IF NOT EXISTS situation TEXT;
ALTER TABLE genx_toolkit ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'easy';
ALTER TABLE genx_toolkit ADD COLUMN IF NOT EXISTS estimated_response_rate TEXT;
ALTER TABLE genx_toolkit ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

-- 2. lg_custom_scripts — LG's personal/edited scripts
CREATE TABLE IF NOT EXISTS lg_custom_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id UUID NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  channel TEXT DEFAULT 'general',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  notes TEXT,
  is_modified_from UUID,
  times_used INTEGER DEFAULT 0,
  times_replied INTEGER DEFAULT 0,
  times_converted INTEGER DEFAULT 0,
  best_channel TEXT,
  is_pinned BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. lg_contacts — full CRM (replaces lg_outreach)
CREATE TABLE IF NOT EXISTS lg_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id UUID NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  handle TEXT,
  status TEXT NOT NULL DEFAULT 'prospect',
  va_user_id UUID,
  referral_link_used TEXT,
  source TEXT,
  first_contacted_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  last_replied_at TIMESTAMPTZ,
  next_followup_at TIMESTAMPTZ,
  followup_count INTEGER DEFAULT 0,
  notes TEXT,
  last_message_sent TEXT,
  last_objection TEXT,
  tags TEXT[],
  is_starred BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. lg_contact_activities — activity timeline per contact
CREATE TABLE IF NOT EXISTS lg_contact_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES lg_contacts(id) ON DELETE CASCADE,
  lg_id UUID NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  note TEXT,
  script_used UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. lg_weekly_activity — daily planner grid
CREATE TABLE IF NOT EXISTS lg_weekly_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id UUID NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  day_of_week INTEGER NOT NULL,
  dms_sent INTEGER DEFAULT 0,
  posts_made INTEGER DEFAULT 0,
  followups_sent INTEGER DEFAULT 0,
  calls_made INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lg_id, week_start, day_of_week)
);

-- 6. genx_assets — downloadable files/resources
CREATE TABLE IF NOT EXISTS genx_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  asset_type TEXT NOT NULL,
  file_url TEXT,
  file_name TEXT,
  category TEXT DEFAULT 'general',
  earnings_amount NUMERIC(10,2),
  va_count INTEGER,
  download_count INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Enable RLS (service role bypasses — anon blocked)
ALTER TABLE lg_custom_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lg_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lg_contact_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE lg_weekly_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE genx_assets ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SEED: 38 DEFAULT SCRIPTS
-- Clear old scripts first to avoid duplicates on re-run.
-- ============================================================
DELETE FROM genx_toolkit WHERE category = 'script';

INSERT INTO genx_toolkit (category, subcategory, channel, title, content, description, situation, difficulty, estimated_response_rate, sort_order, is_active, is_featured) VALUES

-- ─── FIRST CONTACT (8) ────────────────────────────────────────────────────

('script','first_contact','whatsapp',
'WhatsApp: Cold intro — casual',
'Hey [Name] 👋

Quick question — are you looking for a way to earn extra income from your phone?

I found something called HigherUp. You process product listings for international brands and earn per product. No experience needed, flexible hours.

Took me 5 minutes to sign up. Here''s the link if you want to check it out:

[YOUR LINK]

Let me know if you have questions 🙏',
'Casual first contact via WhatsApp for prospects you found in Facebook groups or mutual contacts.',
'Cold contact — no prior relationship',
'easy','30–40%',10,true,true),

('script','first_contact','instagram',
'Instagram DM: Side income angle',
'Hey! I noticed you''re into [their niche/hustle].

I''ve been doing product listing work for online sellers through a platform called HigherUp — earning per product I process. Super flexible, no boss, work whenever.

I thought it might be your thing. Wanna know more? I can send you the link 🔗',
'Instagram DM for people who post about side hustles, earning money, or freelancing.',
'Cold contact via Instagram',
'easy','25–35%',20,true,false),

('script','first_contact','facebook',
'Facebook Messenger: From group post',
'Hi [Name]! I saw your comment in [Group Name] about looking for online work.

I''m part of a platform called HigherUp where VAs earn by processing product listings. You can work any time, from your phone, and you get paid per product — not per hour.

This is the sign-up link: [YOUR LINK]

Happy to walk you through it if you want 😊',
'For people who post in VA/freelance Facebook groups asking about opportunities.',
'Warm contact — they expressed interest publicly',
'easy','40–55%',30,true,false),

('script','first_contact','linkedin',
'LinkedIn: Professional approach',
'Hi [Name],

I came across your profile and noticed you have experience in [e-commerce/admin/data entry]. I wanted to share something that might be a good fit for your skills.

HigherUp is a platform where VAs earn by optimizing product listings for international sellers. The work is remote, project-based, and pays per product processed.

Would you be open to a quick overview? I can send details.

Best,
[Your Name]',
'Professional LinkedIn outreach for VAs with relevant experience.',
'Cold LinkedIn contact',
'medium','20–30%',40,true,false),

('script','first_contact','telegram',
'Telegram: Direct and concise',
'Hey [Name]

Quick heads up — there''s a platform called HigherUp where Filipino VAs earn by processing product listings for Amazon/Etsy sellers. Pay is per product, fully remote.

Sign up here: [YOUR LINK]

If it sounds interesting, let me know and I''ll explain how it works.',
'Direct Telegram outreach, short and to the point.',
'Cold Telegram contact',
'easy','25–35%',50,true,false),

('script','first_contact','tiktok',
'TikTok/Social comment reply',
'Omg yes! I know exactly how you feel. That''s actually how I found HigherUp — it''s a platform where you earn per product listing you process, for international brands. No fixed hours, work from your phone.

Check my link in bio for the sign-up 👆 or I can DM you directly if you want more info!',
'Reply to TikTok comments or videos where someone expresses interest in online income.',
'Warm contact — they expressed interest',
'easy','35–50%',60,true,false),

('script','first_contact','email',
'Email: Formal introduction',
'Subject: Earn from home — product listing opportunity

Hi [Name],

I hope this finds you well. I''m reaching out because I think you might be a great fit for an opportunity I''ve been involved with.

HigherUp is a platform where Virtual Assistants earn by optimizing product listings for international e-commerce sellers. The work is fully remote, flexible, and pays per product — not by the hour.

No prior experience is required, just attention to detail and a reliable internet connection.

If you''re interested in learning more, you can sign up directly using this link:
[YOUR LINK]

Feel free to reply to this email with any questions.

Best regards,
[Your Name]',
'Formal email outreach for professional contacts or email list subscribers.',
'Cold email',
'medium','15–25%',70,true,false),

('script','first_contact','general',
'General intro — any channel',
'Hey! I wanted to share something that''s been working really well for me.

It''s a platform called HigherUp — you earn money by processing product listings for international brands. Flexible hours, work from your phone, get paid per product.

Here''s the link to sign up: [YOUR LINK]

Let me know if you want me to walk you through it 👍',
'General-purpose first contact script that works on any platform.',
'Any first contact scenario',
'easy','25–40%',80,true,false),

-- ─── FOLLOW-UP (6) ────────────────────────────────────────────────────────

('script','follow_up','general',
'Follow-up: 24 hours — did you see it?',
'Hey [Name]! Just checking if you got my message yesterday about HigherUp.

No pressure — just wanted to make sure it didn''t get lost 😊

[YOUR LINK] — takes about 5 minutes to sign up.',
'24-hour follow-up if no reply to your first message.',
'No response after 24h',
'easy','30–40%',90,true,false),

('script','follow_up','general',
'Follow-up: 3 days — checking in',
'Hey [Name], following up again about HigherUp 👋

I know you''re probably busy — just wanted to leave this here in case you have 5 minutes this weekend.

Honestly it''s been one of the better income sources I''ve found for remote work.

Link: [YOUR LINK]

No worries if it''s not the right time 🙏',
'3-day follow-up with low-pressure tone.',
'No response after 3 days',
'easy','20–30%',100,true,false),

('script','follow_up','general',
'Follow-up: 1 week — last nudge',
'Hey [Name]! Last follow-up from me on this, I promise 😄

Just wanted to make sure you didn''t miss out. HigherUp is still accepting sign-ups and the earning opportunity is real.

[YOUR LINK]

If you''re not interested, totally fine — just let me know and I won''t follow up again!',
'7-day follow-up — polite final nudge before stopping.',
'No response after 7 days',
'easy','15–20%',110,true,false),

('script','follow_up','general',
'Follow-up: 2 weeks — new angle',
'Hey [Name]!

I know I reached out a couple of weeks ago about HigherUp. I''m not here to spam you — just wanted to share that a few people I referred have now made their first $50+.

That said, the decision is totally yours. Here''s the link if you ever want to try:
[YOUR LINK]

Have a great week 👋',
'2-week follow-up with social proof.',
'No response after 2 weeks',
'medium','10–15%',120,true,false),

('script','follow_up','general',
'Follow-up: 1 month — reconnect',
'Hey [Name]! It''s been a while — hope things are going well 😊

I know I messaged you a while back about HigherUp. I''m not sure if your situation has changed, but the platform is still growing and there''s still room to join.

No pressure at all — just thought I''d check in one more time.

[YOUR LINK]',
'30-day reconnect after no previous engagement.',
'Dormant for 1 month',
'medium','10–15%',130,true,false),

('script','follow_up','general',
'Follow-up: After positive reply — no action',
'Hey [Name]! You mentioned you were interested — just wanted to make sure you got the link:

[YOUR LINK]

Literally takes 5 minutes to register. Once you''re in, I''ll help you with the first steps.

Let me know when you''re signed up! 🙌',
'When someone said yes but hasn''t signed up yet.',
'Interested but not converted',
'easy','50–65%',140,true,true),

-- ─── VA ONBOARDING (5) ────────────────────────────────────────────────────

('script','va_onboarding','whatsapp',
'Onboarding: Welcome + first steps',
'Welcome to HigherUp, [Name]! 🎉

So glad you joined. Here''s what to do first:

1. Log in to your dashboard
2. Upload your first CSV file
3. Wait for processing (usually a few minutes)
4. Download the optimized output

Your first upload = your first earnings.

If you get stuck anywhere, message me — I''ll help you get through it.

Let''s go! 💪',
'Message to send immediately after a new VA signs up.',
'New VA just registered',
'easy','85–95%',150,true,true),

('script','va_onboarding','whatsapp',
'Onboarding: Push for first upload',
'Hey [Name]!

Just checking — have you tried your first upload on HigherUp yet?

I know it can feel a bit unfamiliar at first, but once you do the first one it makes total sense. And you won''t earn anything until you upload 😅

Want me to walk you through it quickly? Takes like 10 minutes.',
'For VAs who registered but haven''t uploaded anything yet.',
'Registered, no upload',
'easy','60–75%',160,true,false),

('script','va_onboarding','whatsapp',
'Onboarding: After first earnings',
'[Name]!! You just earned your first money on HigherUp! 🎊

That was your first [X] products. At $0.05 each that''s $[amount].

The more you upload, the more you earn. Some VAs process hundreds of products per week.

Keep going — you''re doing great! 🔥',
'Celebration message after a VA processes their first products.',
'After first earnings logged',
'easy','90–95%',170,true,false),

('script','va_onboarding','whatsapp',
'Onboarding: VA seems stuck',
'Hey [Name], how''s it going on HigherUp?

I noticed you haven''t uploaded in a while. Is there anything confusing or something stopping you?

No judgment at all — I just want to make sure you''re not stuck. A lot of people have a small question that''s easy to answer once you ask it 😊

What''s the hold-up?',
'For VAs who started but went quiet and haven''t been active.',
'VA registered but inactive',
'medium','45–60%',180,true,false),

('script','va_onboarding','whatsapp',
'Onboarding: Milestone celebration — first $100',
'[Name] you hit $100!!! 🔥🔥🔥

That''s a real milestone. You''re officially proving that remote work actually pays.

Keep it going and you can easily do $200, $300 next month.

Proud of you seriously 💪',
'Celebration message when VA hits $100 in total earnings.',
'VA reaches $100 milestone',
'easy','90%+',190,true,false),

-- ─── REENGAGEMENT (4) ─────────────────────────────────────────────────────

('script','reengagement','whatsapp',
'Reengagement: 30 days inactive',
'Hey [Name]! It''s been a while — hope you''re doing well 😊

I noticed you haven''t logged into HigherUp in about a month. Just wanted to check in — is everything okay?

If you''ve been busy, totally understand. But if you want to get back to it, I''m here to help you pick up where you left off.',
'Check-in for VAs who haven''t been active for 30 days.',
'VA inactive for 30 days',
'medium','35–45%',200,true,false),

('script','reengagement','whatsapp',
'Reengagement: 60 days — new angle',
'Hey [Name]! Reaching out because the HigherUp platform has gotten even better recently.

They''ve improved the processing speed and added new product categories — which means more earning opportunities.

I know you signed up a while back. Are you still interested in making this work? I''d love to help you get back into it.',
'Reengagement with platform update angle after 60 days.',
'VA inactive for 60 days',
'medium','20–30%',210,true,false),

('script','reengagement','whatsapp',
'Reengagement: 90 days — final check',
'Hey [Name], I know it''s been a while.

I''m going to be honest — I''m doing a final check with people who signed up but haven''t been active. No hard feelings at all.

If life got busy and it''s just not the right time, I totally get it. But if you want to give it one more shot, I''m here to support you.

What do you think?',
'Final reengagement attempt after 90 days of inactivity.',
'VA inactive for 90 days',
'medium','10–20%',220,true,false),

('script','reengagement','whatsapp',
'Reengagement: Platform update notification',
'Hey [Name]! Quick update —

HigherUp just rolled out some improvements that make it faster and easier to earn. A few of my VAs have seen their output go up noticeably.

If you''ve been thinking about getting back into it, now''s actually a good time. Want a quick walkthrough?',
'Platform update message to reactivate dormant VAs.',
'After a platform update',
'easy','25–35%',230,true,false),

-- ─── OBJECTION HANDLING (6) ───────────────────────────────────────────────

('script','objection','general',
'Objection: "I''m too busy"',
'I totally get that! The good thing about HigherUp is it''s not a 9-to-5 — you can literally do it at 10pm after the kids are asleep, or on a Sunday morning.

Even doing 1 hour a day could earn you $50–100/month. It fits around your schedule, not the other way around.

Would it be worth just trying one upload to see how quick it actually is?',
'When a prospect says they don''t have time.',
'Time objection',
'medium','40–55%',240,true,true),

('script','objection','general',
'Objection: "I''m not tech savvy"',
'You don''t need to be! If you can use Facebook or WhatsApp, you can do this.

The platform is literally: upload a file → wait a few minutes → download the result. That''s it.

I walked a lot of people through it who said the same thing — most of them are earning now. Want me to screen share / video call you through the first upload so you can see how simple it is?',
'When a prospect says they''re not good with technology.',
'Tech confidence objection',
'medium','50–65%',250,true,true),

('script','objection','general',
'Objection: "Will I earn enough?"',
'Honestly, that depends on how much you put in. But here''s the math:

If you process 200 products/week, that''s $10/week = ~$40/month.
If you process 1000 products/week, that''s $50/week = ~$200/month.

Most consistent VAs are in the $100–300/month range. It''s not going to replace a full-time job on its own, but it''s solid side income that stacks up over time.

Is $100/month extra worth 1 hour a day to you?',
'When a prospect questions how much they can realistically earn.',
'Earnings concern objection',
'medium','45–60%',260,true,true),

('script','objection','general',
'Objection: "Is HigherUp legit?"',
'That''s a fair question and I''m glad you asked it.

HigherUp is a real platform that pays for product listing optimization. I''ve referred people who are earning consistently. Payments go out on schedule, no games.

Here''s what I''d suggest: sign up for free, do a couple of uploads, and see the earnings show up in your account. Zero risk — it''s free to join.

Does that make sense?',
'When a prospect is skeptical about whether the platform is legitimate.',
'Legitimacy/trust objection',
'medium','55–70%',270,true,false),

('script','objection','general',
'Objection: "How much time does it take?"',
'One upload = maybe 10–20 minutes of actual effort (most of that is just waiting for processing).

The more you upload, the faster you get. Some VAs do 3–5 uploads a day in under an hour total.

You can do 1 a day, 3 a day — it''s up to you. There''s no minimum.',
'When a prospect asks about time commitment.',
'Time commitment question',
'easy','50–60%',280,true,false),

('script','objection','general',
'Objection: "I''ll think about it"',
'Of course! Take your time.

One thing I''d say — the sign-up is free and takes 5 minutes. You don''t have to commit to anything to try it. If you don''t like it, you just... don''t use it.

Maybe do this: sign up now while we''re talking, and just explore the platform. If you decide it''s not for you, no problem. But at least you''ll know.

[YOUR LINK]',
'When a prospect stalls with "I''ll think about it".',
'Decision delay objection',
'medium','35–45%',290,true,false),

-- ─── COMMUNITY POST (3) ───────────────────────────────────────────────────

('script','community_post','facebook',
'Facebook Group: Looking for online work post',
'🚀 Looking for online work? Here''s what I''ve been doing:

I''ve been earning through HigherUp — a platform where Filipino VAs process product listings for international brands. You earn per product, not per hour. Fully remote, no boss, flexible hours.

No experience needed. If you can use a computer or phone, you can do this.

Drop a "interested" below or message me for the link 👇

#OnlineWork #VAJobsPH #SideHustle #HigherUp',
'Facebook group post for VA/freelance/online work communities.',
'Active in Facebook groups',
'medium','varies',300,true,false),

('script','community_post','whatsapp',
'WhatsApp: Group broadcast',
'Good day everyone! 👋

Just wanted to share something I think some of you might find useful.

I''ve been part of HigherUp — an online platform where you earn by processing product listings for Amazon/e-commerce sellers. Pay is per product, work anytime from home.

If anyone''s interested in learning more or signing up, message me directly and I''ll send you the link.

Thanks 🙏',
'WhatsApp group broadcast for community groups.',
'Sending to WhatsApp groups',
'easy','varies',310,true,false),

('script','community_post','linkedin',
'LinkedIn Post: Sharing opportunity',
'I''ve been helping VAs find flexible remote work through HigherUp — and the results have been really encouraging.

VAs on the platform earn by optimizing product listings for international e-commerce sellers. The model is simple: upload product data → earn per listing processed. No fixed hours, fully remote.

If you know anyone looking for legitimate remote work opportunities in the Philippines, feel free to share this post or tag them below. I''m happy to answer questions.

#RemoteWork #VirtualAssistant #PHFreelancer #HigherUp',
'LinkedIn post to share the opportunity professionally.',
'Posting on LinkedIn',
'medium','varies',320,true,false),

-- ─── COMPETITIVE (3) ──────────────────────────────────────────────────────

('script','competitive','general',
'Competitive: "I already do VA work elsewhere"',
'That''s great! HigherUp is actually really complementary to other VA work.

The tasks are standardized (product listing optimization), so you can batch-process during your free time — even in the gaps between other clients.

A lot of VAs I know stack HigherUp earnings on top of their main VA income. The incremental time is minimal once you get your workflow down.

Would it be worth a quick trial to see if it fits?',
'When a prospect already does other VA work and thinks they''re fully occupied.',
'Already doing other VA work',
'medium','35–50%',330,true,false),

('script','competitive','general',
'Competitive: "I sell on Amazon myself"',
'Oh nice! Then you already know how important good product listings are.

HigherUp is actually on the service provider side — so instead of paying for listing optimization, you''d be the one earning for doing it for other sellers.

It''s a nice way to monetize skills you already have. Want to take a look at how it works from the VA side?',
'When a prospect is an Amazon seller themselves.',
'Prospect is an Amazon seller',
'medium','40–55%',340,true,false),

('script','competitive','general',
'Competitive: "I have another VA income source"',
'That''s totally fine — HigherUp works best as a supplement, not a replacement.

What makes it different is the per-product model. There''s no client management, no communication overhead — you just process listings and earn. It''s purely task-based.

A lot of VAs treat it as background income while they focus on their main work. Would it be worth a 10-minute trial upload just to see how it stacks up?',
'When a prospect already has VA income from another source.',
'Has other income source',
'medium','30–45%',350,true,false),

-- ─── CLOSING (3) ──────────────────────────────────────────────────────────

('script','closing','general',
'Closing: Urgency — limited spots',
'Hey [Name] — I don''t want to pressure you but I do want to be honest with you.

I can only actively support a limited number of new VAs at once (I want to make sure everyone gets proper onboarding help).

If you''ve been on the fence, now is the best time to jump in while I can personally walk you through everything.

[YOUR LINK] — takes 5 min.',
'Create gentle urgency when the prospect has been considering for a while.',
'Decision stalling',
'medium','40–55%',360,true,true),

('script','closing','general',
'Closing: Final decision',
'Hey [Name] — I respect your time so I''ll be direct.

This is my last follow-up on HigherUp. If you want to join, here''s the link: [YOUR LINK]

If you don''t, totally fine — no hard feelings at all. I just don''t want to keep messaging you if it''s not the right fit.

Either way, I hope things go well for you 🙏',
'Final follow-up when prospect has repeatedly stalled.',
'Final follow-up',
'medium','20–35%',370,true,false),

('script','closing','general',
'Closing: Ask for a referral',
'Hey [Name]! Quick one —

Even if HigherUp isn''t the right fit for you personally, do you know anyone who might be interested?

If they sign up using your referral link, you''d earn a small bonus for each one. So even if you don''t want to do the VA work yourself, you could still earn by referring people who do.

Want me to explain how the referral side works?',
'When the prospect themselves isn''t converting but might refer others.',
'Prospect won''t convert but has a network',
'medium','30–45%',380,true,false);
