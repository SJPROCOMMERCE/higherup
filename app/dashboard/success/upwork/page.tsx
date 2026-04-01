'use client'

import { SuccessSection } from '@/components/dashboard/SuccessSection'
import { CopyBlock } from '@/components/dashboard/CopyBlock'

const T = { div: '#F5F5F5', sec: '#999999', black: '#111111', ghost: '#CCCCCC', light: '#E0E0E0' }

function Divider() {
  return <div style={{ margin: '40px 0', borderTop: `1px solid ${T.div}` }} />
}

function RuleHeader({ n, title }: { n: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 28, fontWeight: 600, color: T.light, lineHeight: 1 }}>{n}</span>
      <h2 style={{ fontSize: 18, fontWeight: 500, color: T.black, margin: 0 }}>{title}</h2>
    </div>
  )
}

function P({ children, black }: { children: React.ReactNode; black?: boolean }) {
  return <p style={{ margin: '0 0 16px', fontSize: 15, color: black ? T.black : T.sec, lineHeight: 1.7 }}>{children}</p>
}

export default function Upwork() {
  return (
    <SuccessSection
      slug="upwork"
      title="Win on Upwork"
      subtitle="Five rules. Follow them and you'll get hired."
    >

      {/* REGEL 1 */}
      <div>
        <RuleHeader n="1" title="Speed wins" />
        <div style={{ marginTop: 16 }}>
          <P>The first 5 proposals get 80% of the client's attention. Proposal number 25 gets ignored.</P>
          <P black>
            Turn on Upwork notifications for your search terms. When a new job posts,
            send your proposal within 30 minutes.
          </P>
          <P>Most freelancers check Upwork once a day. You check it every few hours. That's your edge.</P>
        </div>
      </div>

      <Divider />

      {/* REGEL 2 */}
      <div>
        <RuleHeader n="2" title="Your first sentence decides everything" />
        <div style={{ marginTop: 16 }}>
          <P>
            The client sees only your first two lines. The rest is hidden behind "read more."
            If your opening is generic, they never click.
          </P>
          <P black>Start with their problem. Not with your name. Not with "I am a..."</P>
        </div>

        <div style={{ marginTop: 24, background: '#FAFAFA', borderRadius: 16, padding: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: T.sec, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
            STRONG FIRST LINES
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { niche: 'Fashion stores', line: '"Your product titles are missing key search terms like fabric, fit, and occasion — that\'s costing you Google Shopping traffic."' },
              { niche: 'Electronics stores', line: '"I noticed your listings don\'t include model numbers and specs in the title — those are the exact terms buyers search for."' },
              { niche: 'Beauty stores', line: '"Your product descriptions are identical to the manufacturer\'s — Google penalizes duplicate content and pushes you down in search."' },
              { niche: 'General stores', line: '"I see you have 200+ products without SEO-optimized titles — I can fix all of them and have them back to you within 48 hours."' },
              { niche: 'Google Shopping specific', line: '"Your Google Shopping feed is missing structured titles — that\'s why your products aren\'t showing up for high-intent searches."' },
            ].map(item => (
              <div key={item.niche}>
                <p style={{ fontSize: 11, color: T.ghost, textTransform: 'uppercase', margin: '0 0 4px' }}>{item.niche}</p>
                <p style={{ fontSize: 14, color: T.black, margin: 0 }}>{item.line}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Divider />

      {/* REGEL 3 */}
      <div>
        <RuleHeader n="3" title="Proof beats promises" />
        <div style={{ marginTop: 16 }}>
          <P>"I can optimize your listings" is a promise. Every freelancer says that.</P>
          <P black>"Here's a before/after of a listing I optimized last week" is proof. Almost nobody does that.</P>
          <P>
            Always attach one example to your proposal. Pick any product. Show the original
            messy title and description on the left. Your optimized version on the right.
            That single image does more than 500 words of text.
          </P>
        </div>
      </div>

      <Divider />

      {/* REGEL 4 */}
      <div>
        <RuleHeader n="4" title="Don't price too low" />
        <div style={{ marginTop: 16 }}>
          <P>
            Beginners think: "I'll charge $3/hour to get my first job."
            The problem? Low price = low quality perception. The client trusts you less, not more.
          </P>
          <P>Starting rate:</P>
          <P black>$8–12/hour or $0.50–0.80 per product.</P>
          <P>After 3 five-star reviews:</P>
          <P black>$15–20/hour or $0.80–1.20 per product.</P>
          <P>After 10+ reviews:</P>
          <P black>$20–30/hour or $1.00–2.00 per product.</P>
          <P>
            With HigherUp doing the heavy lifting, your actual hourly rate is much higher than
            what you charge because each job takes minutes instead of hours.
          </P>
        </div>
      </div>

      <Divider />

      {/* REGEL 5 */}
      <div>
        <RuleHeader n="5" title="Reviews are gold" />
        <div style={{ marginTop: 16 }}>
          <P>After every job: ask for a review. Always. Don't be shy about it.</P>
          <P>
            The first 5 reviews are the hardest to get. After that, clients start coming to you
            instead of you going to them. That's the turning point.
          </P>
        </div>

        <CopyBlock
          title="REVIEW REQUEST SCRIPT"
          content={`Hey [client name], thanks for working with me on this! I really enjoyed optimizing your product listings.

If you're happy with the result, would you mind leaving a quick review on Upwork? It really helps me grow as a freelancer.

And if you ever need more listings done in the future, I'm always here. Thanks again!`}
        />
      </div>

      <Divider />

      {/* TROUBLESHOOT */}
      <div style={{ background: '#FAFAFA', borderRadius: 16, padding: 32 }}>
        <p style={{ fontSize: 16, fontWeight: 500, color: T.black, margin: '0 0 16px' }}>Not getting responses?</p>
        <div style={{ fontSize: 15, color: T.sec, lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 12px' }}>If you've sent 30+ proposals without a single reply, something is off. Check these:</p>
          <p style={{ margin: '0 0 12px' }}>
            Is your profile photo professional? Is your profile title specific (not "Virtual Assistant")?
            Did you include a portfolio sample? Does your first sentence mention THEIR store, not you?
            Did you offer a free sample?
          </p>
          <p style={{ margin: 0, color: T.black }}>
            Fix these five things and try again. The market is there. The demand is real.
            It's about how you present yourself.
          </p>
        </div>
      </div>

    </SuccessSection>
  )
}
