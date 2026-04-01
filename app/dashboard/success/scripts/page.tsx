'use client'

import { SuccessSection } from '@/components/dashboard/SuccessSection'
import { CopyBlock } from '@/components/dashboard/CopyBlock'

export default function Scripts() {
  return (
    <SuccessSection
      slug="scripts"
      title="Scripts & Templates"
      subtitle="Copy. Paste. Send. All ready to use."
    >

      <div style={{ background: '#FFFBEB', borderRadius: 16, padding: 24, marginBottom: 40 }}>
        <p style={{ fontSize: 14, color: '#92400E', margin: 0 }}>
          Every script below is a starting point. Don't copy-paste it word for word.
        </p>
        <p style={{ marginTop: 8, fontSize: 13, color: '#B45309', margin: '8px 0 0' }}>
          Change the wording. Add your own style. Clients can tell when something sounds robotic.
          The best proposals feel personal — like you wrote it just for them.
        </p>
      </div>

      <CopyBlock
        title="A — UPWORK PROFILE TITLE"
        content="E-Commerce Product Listing Specialist | Shopify · Google Shopping · SEO Optimized Titles & Descriptions"
      />

      <CopyBlock
        title="B — UPWORK PROFILE OVERVIEW"
        content={`Struggling with product listings that don't rank on Google Shopping? I optimize Shopify product titles and descriptions for maximum search visibility.

What I do:
I take your raw product data and turn it into SEO-optimized listings that rank on Google Shopping, Meta, and your own store search.

What you get:
Titles that follow Google Shopping best practices. Descriptions that convert. Proper formatting. All delivered in your original CSV/spreadsheet format, ready to import.

I've optimized thousands of product listings across fashion, electronics, beauty, home goods, and more.

Send me 5 products and I'll optimize them for free so you can see the quality before committing.`}
      />

      <CopyBlock
        title="C — PROPOSAL: STORES WITH MANY PRODUCTS"
        content={`I noticed your store has 200+ products and most of the titles are generic or missing key search terms. That's leaving a lot of Google Shopping traffic on the table.

I specialize in optimizing Shopify product listings for search. I'll take your full product catalog, rewrite every title and description for SEO, and deliver it back as a ready-to-import CSV file.

I've done this for stores with 500+ products — it's exactly what I do every day.

To prove it, I'll optimize 5 of your products for free. No strings attached. If you like what you see, we can do the rest.

Want me to get started on those 5?`}
      />

      <CopyBlock
        title="D — PROPOSAL: STORES WITH BAD SEO"
        content={`I looked at your product listings and noticed the titles don't include the search terms buyers actually use on Google Shopping. For example, your "[product name]" title is missing [specific keyword].

I fix exactly this. I rewrite product titles and descriptions to match what people search for, following Google Shopping's best practices for structured titles.

Here's a quick before/after I did for another store in your niche: [attach example]

I'll do 5 of your products for free so you can see the difference. Interested?`}
      />

      <CopyBlock
        title="E — PROPOSAL: GOOGLE SHOPPING SPECIFIC"
        content={`I see you're selling on Google Shopping but your product titles aren't structured for it. Google Shopping rewards titles that follow a specific format: [Brand] + [Product Type] + [Key Attributes] + [Size/Color].

Right now your titles are generic, which means Google is showing your competitors' products instead of yours for the same search terms.

I can restructure your entire catalog to follow Google Shopping best practices. I'll do 5 products free so you can compare the rankings before and after.

Should I pick 5 products from your store and show you?`}
      />

      <CopyBlock
        title="F — ASKING FOR A REVIEW"
        content={`Hey [client name], thanks for working with me on this! I really enjoyed optimizing your product listings.

If you're happy with the result, would you mind leaving a quick review on Upwork? It really helps me grow as a freelancer.

And if you ever need more listings done in the future, I'm always here. Thanks again!`}
      />

      <CopyBlock
        title="G — RAISING YOUR RATE"
        content={`Hey [client name], it's been great working together these past [X] months. I've really enjoyed optimizing your product listings.

I wanted to let you know that I'll be adjusting my rate for ongoing work starting next month. My new rate will be $[new rate] per product (currently $[old rate]).

This reflects the quality I deliver and the tools I use to ensure every listing is fully SEO-optimized.

Of course, I'd love to continue working with you. Let me know if you have any questions!`}
      />

      <CopyBlock
        title="H — ONE-TIME TO MONTHLY CONTRACT"
        content={`Hey [client name], the listing optimization went great. Your titles and descriptions are looking much stronger now.

Quick question — how often do you add new products to your store? Most of my clients get new inventory every month and need their listings optimized regularly.

If that's the case for you, I can handle all your new product listings on a monthly basis for a flat rate. That way you don't have to think about it — just send me the products and I'll have them optimized within 48 hours.

Want me to put together a monthly plan for you?`}
      />

      <CopyBlock
        title="I — DIRECT OUTREACH TO STORES"
        content={`Hi there,

I came across your store and noticed your product titles could perform much better on Google Shopping. For example, your product "[example product]" has a generic title that's missing key search terms.

I specialize in optimizing Shopify product listings for search visibility. I've optimized thousands of products across fashion, electronics, and beauty stores.

I already optimized one of your products as an example — here's the before and after: [attach screenshot]

If you'd like, I can do your entire catalog. No upfront cost on the first 5 products so you can see the quality.

Let me know if you're interested!`}
      />

      <CopyBlock
        title="J — NEW CLIENT ONBOARDING MESSAGE"
        content={`Hey [client name], great to be working with you! Here's how we'll get started:

1. Send me your product data as a CSV or spreadsheet export from Shopify (Products → Export)
2. Let me know if you have any specific preferences for titles or descriptions
3. I'll optimize everything and send it back within 48 hours, ready to import

A few quick questions:
- Do you sell on Google Shopping, Meta, or just your own store?
- Any specific keywords or brand terms you want included in every title?
- Any words or phrases you want to avoid?

Once I have your file and these answers, I'll get started right away!`}
      />

      <CopyBlock
        title="K — CASE STUDY REQUEST"
        content={`Hey [client name], I've really enjoyed working on your product listings. I'd love to use our work together as a case study to show potential clients what I can do.

I'd just mention the type of work (product listing optimization), the scale (number of products), and the result (improved titles/descriptions). No private details or revenue numbers.

Would that be okay with you?`}
      />

    </SuccessSection>
  )
}
