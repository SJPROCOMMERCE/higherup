import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 15

export type PreCheckResult = {
  can_handle:            boolean
  confidence:            'high' | 'medium' | 'low'
  reason:                string
  adjusted_instruction:  string | null
  output_columns:        string[] | null
}

// Default output columns when no special fields are needed
export const DEFAULT_OUTPUT_COLUMNS = [
  'title', 'description', 'tags', 'seo_title', 'seo_description',
]

const SYSTEM_PROMPT = `You are a pre-check system. A VA submitted special instructions for a product listing optimization batch.

You process a CSV file of product listings and write back an updated CSV. You can read and write any column in the file.

You CAN:
* Modify product titles (length, style, keywords, language, tone)
* Modify product descriptions (length, style, tone, HTML formatting, keywords)
* Modify tags (adding, removing, restructuring)
* Generate SEO titles and meta descriptions
* Generate image alt text
* Change prices (Variant Price, Variant Compare At Price)
* Change SKUs
* Change inventory quantities
* Change vendor names
* Change product types and categories
* Do calculations on prices (percentages, markups, rounding)
* Copy data between columns
* Reformat data (dates, numbers, text casing)
* Change any other data that exists as a column in the CSV

You CANNOT:
* Download, edit, replace, or create images/photos
* Access external websites or URLs
* Modify Shopify store settings directly
* Contact anyone or send emails
* Do anything that requires access outside of the uploaded file

If it is a column in the CSV, you can read it and write it.

The standard output columns are: title, description, tags, seo_title, seo_description.
If the instruction requires writing to additional columns, add them to output_columns.
Known extra column keys: variant_price, variant_compare_at_price, variant_sku, vendor, type.

Respond with ONLY valid JSON, no markdown, no explanation.`

function fallbackResult(): PreCheckResult {
  return {
    can_handle:           true,
    confidence:           'high',
    reason:               'Pre-check skipped (timeout).',
    adjusted_instruction: null,
    output_columns:       null,
  }
}

export async function POST(req: NextRequest) {
  let instructions: string
  try {
    const body = await req.json() as { instructions?: unknown }
    instructions = String(body.instructions ?? '').trim()
  } catch {
    return NextResponse.json(fallbackResult())
  }

  if (instructions.length < 5) {
    return NextResponse.json(fallbackResult())
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const userPrompt = `The VA wrote these instructions: "${instructions}"

Respond with ONLY this JSON, nothing else:
{
  "can_handle": true/false,
  "confidence": "high"/"medium"/"low",
  "reason": "brief explanation",
  "adjusted_instruction": "if can_handle is true, rewrite as a clear directive for the AI optimizer. if false, null",
  "output_columns": ["title","description","tags","seo_title","seo_description"] (add any extra columns the AI must output, e.g. "variant_price", "variant_compare_at_price", "variant_sku", "vendor", "type". Use the standard list if no extras are needed. null if can_handle is false.)
}`

  const apiPromise = anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 350,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: userPrompt }],
  })

  const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
  const response = await Promise.race([apiPromise, timeoutPromise])

  if (!response) {
    console.warn('[pre-check] timeout — treating as high confidence')
    return NextResponse.json(fallbackResult())
  }

  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

  let result: PreCheckResult
  try {
    result = JSON.parse(rawText) as PreCheckResult
  } catch {
    const stripped = rawText.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim()
    try {
      result = JSON.parse(stripped) as PreCheckResult
    } catch {
      console.warn('[pre-check] parse failed, falling back:', rawText.slice(0, 100))
      return NextResponse.json(fallbackResult())
    }
  }

  if (typeof result.can_handle !== 'boolean' || !result.confidence || !result.reason) {
    return NextResponse.json(fallbackResult())
  }

  // Ensure output_columns always has at least the default set when can_handle is true
  if (result.can_handle && (!Array.isArray(result.output_columns) || result.output_columns.length === 0)) {
    result.output_columns = DEFAULT_OUTPUT_COLUMNS
  }

  return NextResponse.json(result)
}
