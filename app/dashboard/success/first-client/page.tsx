'use client'

import { SuccessSection } from '@/components/dashboard/SuccessSection'
import { CopyBlock } from '@/components/dashboard/CopyBlock'

const T = { div: '#F5F5F5', sec: '#999999', black: '#111111', ghost: '#CCCCCC', light: '#E0E0E0' }

function Divider() {
  return <div style={{ margin: '48px 0', borderTop: `1px solid ${T.div}` }} />
}

function StepHeader({ n, title, time }: { n: string; title: string; time?: string }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28, fontWeight: 600, color: T.light, lineHeight: 1 }}>{n}</span>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: T.black, margin: 0 }}>{title}</h2>
      </div>
      {time && <p style={{ marginTop: 4, fontSize: 12, color: T.ghost }}>{time}</p>}
    </div>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  return <div style={{ marginTop: 24, fontSize: 15, color: T.sec, lineHeight: 1.7 }}>{children}</div>
}

function P({ children, black }: { children: React.ReactNode; black?: boolean }) {
  return <p style={{ margin: '0 0 16px', color: black ? T.black : T.sec }}>{children}</p>
}

export default function FirstClient() {
  return (
    <SuccessSection
      slug="first-client"
      title="Get Your First Client"
      subtitle="Three steps. That's all it takes to get started."
    >

      {/* STAP 1 */}
      <div>
        <StepHeader n="1" title="Set up your Upwork profile" time="Takes about 30 minutes" />

        <Body>
          <P>Your profile title is the first thing clients see. Use this:</P>
        </Body>

        <CopyBlock
          title="PROFILE TITLE"
          content="E-Commerce Product Listing Specialist | Shopify · Google Shopping · SEO Optimized Titles & Descriptions"
        />

        <Body>
          <P>
            Your overview should answer one question: why should a store owner hire you?
            Don't talk about yourself. Talk about their problem.
          </P>
        </Body>

        <CopyBlock
          title="PROFILE OVERVIEW"
          content={`Struggling with product listings that don't rank on Google Shopping? I optimize Shopify product titles and descriptions for maximum search visibility.

What I do:
I take your raw product data and turn it into SEO-optimized listings that rank on Google Shopping, Meta, and your own store search.

What you get:
Titles that follow Google Shopping best practices. Descriptions that convert. Proper formatting. All delivered in your original CSV/spreadsheet format, ready to import.

I've optimized thousands of product listings across fashion, electronics, beauty, home goods, and more.

Send me 5 products and I'll optimize them for free so you can see the quality before committing.`}
        />

        <Body>
          <P>Add these skills to your profile:</P>
          <P black>
            Shopify, Product Listing, SEO, Google Shopping, Product Description Writing,
            E-Commerce, Data Entry, CSV Management, Catalog Management, Product Data
          </P>
          <P>
            For your portfolio: add one before/after example of a product listing. Take any product,
            show the original messy title and description, then the optimized version. That single
            example is more convincing than any amount of text.
          </P>
          <P>Profile photo: professional, well-lit, friendly. No filters. No sunglasses. No group photos.</P>
        </Body>
      </div>

      <Divider />

      {/* STAP 2 */}
      <div>
        <StepHeader n="2" title="Find your first job post" time="Takes 10 minutes per day" />

        <Body>
          <P>Go to Upwork. Search for these exact terms. One by one. Every day.</P>
        </Body>

        <div style={{ marginTop: 16, background: '#FAFAFA', borderRadius: 16, padding: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: T.sec, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, margin: '0 0 16px' }}>
            SEARCH TERMS
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'product listing shopify',
              'shopify product upload',
              'product description ecommerce',
              'google shopping feed',
              'product catalog management',
              'shopify store manager',
              'product data entry shopify',
              'ecommerce seo product',
            ].map(term => (
              <p key={term} style={{ fontSize: 14, color: T.black, fontFamily: 'monospace', margin: 0 }}>{term}</p>
            ))}
          </div>
        </div>

        <Body>
          <P>Use these filters to find the best opportunities:</P>
          <P black>Posted: Last 24 hours. Payment: Verified. Proposals: Less than 5.</P>
          <P>
            Why less than 5 proposals? Because the client hasn't seen many options yet.
            Your proposal gets real attention instead of being buried under 30 others.
          </P>
          <P>
            Send at least <span style={{ color: T.black, fontWeight: 500 }}>5 proposals per day</span>.
            10 is better. It's a numbers game. The more you send, the faster you land your first client.
          </P>
        </Body>
      </div>

      <Divider />

      {/* STAP 3 */}
      <div>
        <StepHeader n="3" title="Send your first proposal" time="Takes 5 minutes per proposal" />

        <Body>
          <P>
            Your proposal needs three things: show you understand their problem,
            prove you can solve it, and make it risk-free.
          </P>
          <P>
            The first sentence is everything. The client sees only the first two lines.
            Everything else is hidden behind "read more." If your first line is boring,
            they never read the rest.
          </P>
          <P black>
            Never start with "Dear Sir" or "I am writing to express my interest."
            Start with their problem.
          </P>
        </Body>

        <CopyBlock
          title="PROPOSAL TEMPLATE — GENERAL"
          content={`I looked at your store and noticed your product listings could rank much higher on Google Shopping with optimized titles and descriptions.

I specialize in exactly this. I take raw product data and create SEO-optimized titles and descriptions that follow Google Shopping best practices.

Here's what I'll do:
Take your product CSV or spreadsheet, optimize every title and description for search visibility, and deliver it back ready to import into Shopify.

To show you the quality, I'll optimize 5 of your products for free. No commitment. If you like the result, we can discuss doing the rest.

Want me to start with those 5 products?`}
        />

        <Body>
          <P>
            The free sample is your weapon. Nobody else offers it.
            It removes all risk for the client. They get to see your work before paying anything.
            And once they see the quality, most of them hire you for the full catalog.
          </P>
        </Body>
      </div>

      <Divider />

      {/* HOE LANG */}
      <div style={{ background: '#FAFAFA', borderRadius: 16, padding: 32, textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 500, color: T.black, margin: 0 }}>How long until your first client?</p>
        <p style={{ marginTop: 12, fontSize: 15, color: T.sec, lineHeight: 1.7 }}>
          If you send 5+ proposals every day, expect your first client within 1 to 2 weeks.
          Most people give up after 3 days. Don't. The ones who keep going are the ones who make it.
        </p>
      </div>

    </SuccessSection>
  )
}
