'use client'

import { SuccessSection } from '@/components/dashboard/SuccessSection'
import { CopyBlock } from '@/components/dashboard/CopyBlock'

const T = { div: '#F5F5F5', sec: '#999999', black: '#111111', ghost: '#CCCCCC', light: '#E0E0E0' }

function Divider() {
  return <div style={{ margin: '40px 0', borderTop: `1px solid ${T.div}` }} />
}

function WayHeader({ n, title }: { n: string; title: string }) {
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

export default function EarnMore() {
  return (
    <SuccessSection
      slug="earn-more"
      title="Earn More Per Client"
      subtitle="Three ways to increase your income without adding more clients."
    >

      {/* MANIER 1 */}
      <div>
        <WayHeader n="1" title="Raise your rate" />
        <div style={{ marginTop: 16 }}>
          <P>
            Your first client pays $0.50 per product. That's fine to get started.
            But don't stay there.
          </P>
          <P black>
            For every new client after that, charge more. $0.65. $0.80. $1.00.
            Don't raise the price on existing clients. Just charge new ones more.
          </P>
          <P>
            The math: 200 products at $0.50 = $100. Same 200 products at $1.00 = $200.
            Double the income. Same work. Same time.
          </P>
          <P>When you're ready to raise rates with an existing client:</P>
        </div>

        <CopyBlock
          title="RATE INCREASE SCRIPT"
          content={`Hey [client name], it's been great working together these past [X] months. I've really enjoyed optimizing your product listings.

I wanted to let you know that I'll be adjusting my rate for ongoing work starting next month. My new rate will be $[new rate] per product (currently $[old rate]).

This reflects the quality I deliver and the tools I use to ensure every listing is fully SEO-optimized.

Of course, I'd love to continue working with you. Let me know if you have any questions!`}
        />
      </div>

      <Divider />

      {/* MANIER 2 */}
      <div>
        <WayHeader n="2" title="Turn one-time jobs into monthly contracts" />
        <div style={{ marginTop: 16 }}>
          <P>
            One-time jobs give you unpredictable income. You finish, get paid, and start hunting again.
          </P>
          <P black>
            Monthly contracts give you stable income. The client pays you every month.
            You do the work. No hunting.
          </P>
          <P>Every store gets new products regularly. That's your opening.</P>
        </div>

        <CopyBlock
          title="MONTHLY CONTRACT SCRIPT"
          content={`Hey [client name], the listing optimization went great. Your titles and descriptions are looking much stronger now.

Quick question — how often do you add new products to your store? Most of my clients get new inventory every month and need their listings optimized regularly.

If that's the case for you, I can handle all your new product listings on a monthly basis for a flat rate. That way you don't have to think about it — just send me the products and I'll have them optimized within 48 hours.

Want me to put together a monthly plan for you?`}
        />

        <div style={{ marginTop: 24, fontSize: 15, color: T.sec, lineHeight: 1.7 }}>
          <p style={{ margin: 0 }}>
            One client paying $100/month = $1,200/year. From a single relationship.
            Five monthly clients = $6,000/year. That's a foundation you can build on.
          </p>
        </div>
      </div>

      <Divider />

      {/* MANIER 3 */}
      <div>
        <WayHeader n="3" title="Upsell extra services" />
        <div style={{ marginTop: 16 }}>
          <P>
            Your client pays you for product listings. But they always need more.
            You just have to notice it and offer it.
          </P>
        </div>

        <div style={{ marginTop: 16, background: '#FAFAFA', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: T.sec, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            UPSELL OPPORTUNITIES
          </p>
          {[
            {
              trigger: '"Your images don\'t have alt text."',
              detail:  'Alt text improves Google image search ranking. Offer to add it for $0.10-0.20 per image.',
            },
            {
              trigger: '"Your meta descriptions are empty."',
              detail:  'Meta descriptions improve click-through rates from search. Offer to write them for $0.15-0.30 per product.',
            },
            {
              trigger: '"Your Google Shopping feed isn\'t set up."',
              detail:  'Many store owners don\'t know how. Offer to set it up for a flat fee of $50-100.',
            },
            {
              trigger: '"Your collection pages have no descriptions."',
              detail:  'Collection descriptions improve SEO. Offer to write them for $5-10 per collection.',
            },
          ].map(item => (
            <div key={item.trigger}>
              <p style={{ fontSize: 14, color: T.black, margin: '0 0 4px' }}>{item.trigger}</p>
              <p style={{ fontSize: 13, color: T.sec, margin: 0 }}>{item.detail}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, fontSize: 15, color: T.sec, lineHeight: 1.7 }}>
          <p style={{ margin: 0 }}>
            Each upsell adds 20-50% to what the client pays you.
            And with HigherUp handling the product listings, you have the time to offer these extras.
          </p>
        </div>
      </div>

    </SuccessSection>
  )
}
