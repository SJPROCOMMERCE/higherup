'use client'

import { SuccessSection } from '@/components/dashboard/SuccessSection'
import { CopyBlock } from '@/components/dashboard/CopyBlock'

const T = { div: '#F5F5F5', sec: '#999999', black: '#111111', ghost: '#CCCCCC', light: '#E0E0E0' }

function Divider() {
  return <div style={{ margin: '40px 0', borderTop: `1px solid ${T.div}` }} />
}

function P({ children, black }: { children: React.ReactNode; black?: boolean }) {
  return <p style={{ margin: '0 0 16px', fontSize: 15, color: black ? T.black : T.sec, lineHeight: 1.7 }}>{children}</p>
}

const SCHEDULE = [
  { day: 'Monday',      task: 'Check all clients for new products. Download CSV files.',        time: '1h' },
  { day: 'Tue — Wed',   task: 'Upload to HigherUp. Process. Download optimized files.',         time: '2h' },
  { day: 'Thursday',    task: 'Deliver to clients. Send updates. Answer questions.',            time: '1h' },
  { day: 'Friday',      task: 'Send 10 Upwork proposals for new clients.',                     time: '2h' },
]

export default function Scale() {
  return (
    <SuccessSection
      slug="scale"
      title="Scale to 10+ Clients"
      subtitle="You've proven it works. Now build the system."
    >

      {/* WORKFLOW */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: T.black, margin: 0 }}>Your weekly workflow</h2>
        <p style={{ marginTop: 8, fontSize: 15, color: T.sec }}>
          10 clients sounds like a lot. It's not. Here's what a typical week looks like:
        </p>

        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column' }}>
          {SCHEDULE.map(item => (
            <div key={item.day} style={{
              display: 'flex', alignItems: 'flex-start', gap: 16,
              padding: '12px 0', borderBottom: `1px solid ${T.div}`,
            }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: T.black, width: 96, flexShrink: 0 }}>{item.day}</span>
              <span style={{ fontSize: 14, color: T.sec, flex: 1 }}>{item.task}</span>
              <span style={{ fontSize: 13, color: T.ghost, flexShrink: 0 }}>{item.time}</span>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 16, fontSize: 15, color: T.sec }}>
          Total: <span style={{ color: T.black, fontWeight: 500 }}>6 hours per week</span> for 10 clients.
          That's less than one full workday.
        </p>
      </div>

      <Divider />

      {/* CASE STUDIES */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: T.black, margin: '0 0 16px' }}>Use your results as proof</h2>
        <P>
          After working with your first few clients, you have something powerful: real results.
          Ask each client if you can use their store as an example.
        </P>
        <P black>One strong case study is 10x more convincing than a polished profile.</P>

        <CopyBlock
          title="ASKING FOR A CASE STUDY"
          content={`Hey [client name], I've really enjoyed working on your product listings. I'd love to use our work together as a case study to show potential clients what I can do.

I'd just mention the type of work (product listing optimization), the scale (number of products), and the result (improved titles/descriptions). No private details or revenue numbers.

Would that be okay with you?`}
        />
      </div>

      <Divider />

      {/* BEYOND UPWORK */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: T.black, margin: '0 0 16px' }}>Go beyond Upwork</h2>
        <P>
          Upwork is perfect for your first 5 clients. For clients 6 through 10 and beyond,
          use other channels too.
        </P>

        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: T.black, margin: '0 0 8px' }}>Facebook Groups</p>
            <p style={{ fontSize: 14, color: T.sec, lineHeight: 1.7, margin: 0 }}>
              Join groups like "Shopify Entrepreneurs", "Dropshipping Community",
              "E-Commerce Store Owners." Don't spam your service. Instead, answer questions.
              When someone asks "how do I optimize my product listings?" — help them for free.
              Then mention what you do. People hire helpers, not sellers.
            </p>
          </div>

          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: T.black, margin: '0 0 8px' }}>LinkedIn</p>
            <p style={{ fontSize: 14, color: T.sec, lineHeight: 1.7, margin: 0 }}>
              Post one before/after example every week. Tag it with #shopify #ecommerce #seo.
              It takes 5 minutes. Over time, your profile becomes a portfolio that attracts clients.
            </p>
          </div>

          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: T.black, margin: '0 0 8px' }}>Direct Outreach</p>
            <p style={{ fontSize: 14, color: T.sec, lineHeight: 1.7, margin: 0 }}>
              Find Shopify stores with bad listings. Google "powered by Shopify" + your niche.
              Open the store. If the titles are messy or descriptions are missing,
              send them a message with a free sample.
            </p>
          </div>
        </div>

        <CopyBlock
          title="DIRECT OUTREACH SCRIPT"
          content={`Hi there,

I came across your store and noticed your product titles could perform much better on Google Shopping. For example, your product "[example product]" has a generic title that's missing key search terms.

I specialize in optimizing Shopify product listings for search visibility. I've optimized thousands of products across fashion, electronics, and beauty stores.

I already optimized one of your products as an example — here's the before and after: [attach screenshot]

If you'd like, I can do your entire catalog. No upfront cost on the first 5 products so you can see the quality.

Let me know if you're interested!`}
        />
      </div>

      <Divider />

      {/* THE MATH */}
      <div style={{ background: '#FAFAFA', borderRadius: 16, padding: 32, textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 500, color: T.black, margin: '0 0 24px' }}>The math of 10 clients</p>
        <p style={{ fontSize: 15, color: T.sec, margin: '0 0 8px' }}>10 clients × 200 products × $0.80</p>
        <p style={{ fontSize: 32, fontWeight: 600, color: T.black, margin: '0 0 8px' }}>$1,100/month profit</p>
        <p style={{ fontSize: 14, color: T.sec, margin: 0 }}>6 hours of work per week. From home.</p>
      </div>

    </SuccessSection>
  )
}
