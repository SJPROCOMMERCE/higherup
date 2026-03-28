import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import type { Prompt } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { prompt_id, title, description, price, tags, upload_id } = body

    // Load the prompt template
    const { data: promptData } = await supabase
      .from('prompts')
      .select('*')
      .eq('id', prompt_id)
      .single()

    if (!promptData) {
      return Response.json({ error: 'Prompt not found' }, { status: 404 })
    }
    const template = promptData as Prompt

    // MODE A: Manual test (title + description provided)
    if (title && description) {
      return await runManualTest(template, { title, description, price, tags })
    }

    // MODE B: Real data test (upload_id provided)
    if (upload_id) {
      return await runRealDataTest(template, upload_id)
    }

    return Response.json({ error: 'Provide either title+description or upload_id' }, { status: 400 })

  } catch (err) {
    console.error('[prompts/test] error:', err)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}

async function runManualTest(
  template: Prompt,
  input: { title: string; description: string; price?: string; tags?: string }
) {
  const systemParts: string[] = []
  if (template.system_prompt) systemParts.push(template.system_prompt)
  if (template.title_instructions) systemParts.push(`\nTitle Instructions:\n${template.title_instructions}`)
  if (template.description_instructions) systemParts.push(`\nDescription Instructions:\n${template.description_instructions}`)
  if (template.seo_instructions) systemParts.push(`\nSEO Instructions:\n${template.seo_instructions}`)
  if (template.formatting_rules) systemParts.push(`\nFormatting Rules:\n${template.formatting_rules}`)
  if (template.forbidden_words) systemParts.push(`\nForbidden words (do NOT use): ${template.forbidden_words}`)
  if (template.required_keywords) systemParts.push(`\nRequired keywords (include if relevant): ${template.required_keywords}`)
  if (template.max_title_length) systemParts.push(`\nMax title length: ${template.max_title_length} characters`)
  if (template.max_description_length) systemParts.push(`\nMax description length: ${template.max_description_length} characters`)
  systemParts.push('\nCRITICAL: Respond with ONLY valid JSON in this exact format:\n{"optimized_title": "...", "optimized_description": "...", "seo_title": "...", "seo_description": "...", "tags": "..."}')

  const userMessage = `Optimize this product listing:

Title: ${input.title}
Description: ${input.description}${input.price ? `\nPrice: ${input.price}` : ''}${input.tags ? `\nExisting tags: ${input.tags}` : ''}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    system: systemParts.join('\n'),
    messages: [{ role: 'user', content: userMessage }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const tokensIn = response.usage.input_tokens
  const tokensOut = response.usage.output_tokens
  const cost = (tokensIn * 0.000003) + (tokensOut * 0.000015) // claude-sonnet-4-5 pricing

  // Parse JSON response
  let result: Record<string, string> = {}
  try {
    result = JSON.parse(text)
  } catch {
    // If not valid JSON, try to extract with regex
    const titleMatch = text.match(/"optimized_title":\s*"([^"]+)"/)
    const descMatch = text.match(/"optimized_description":\s*"([^"]+)"/)
    result = {
      optimized_title: titleMatch?.[1] ?? input.title,
      optimized_description: descMatch?.[1] ?? input.description,
      seo_title: '',
      seo_description: '',
      tags: '',
    }
  }

  return Response.json({
    mode: 'manual',
    title: result.optimized_title ?? '',
    description: result.optimized_description ?? '',
    seo_title: result.seo_title ?? '',
    seo_description: result.seo_description ?? '',
    tags: result.tags ?? '',
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost,
  })
}

async function runRealDataTest(template: Prompt, uploadId: string) {
  // Load the upload
  const { data: upload } = await supabase.from('uploads').select('*').eq('id', uploadId).single()
  if (!upload) return Response.json({ error: 'Upload not found' }, { status: 404 })

  // Load input file from storage to get product data
  // Actually: query billing_line_items or just use the metadata from the upload
  // Simpler: get the pre_check_result which may have product samples
  // If we can't get real product data, return mock info about the upload

  // For now: use the upload's metadata to construct test products
  // We'll test with whatever data is available from the upload's pre_check_result or just filename/store info
  const products: Array<{ title?: string; description?: string; handle?: string }> = []

  if (upload.pre_check_result && typeof upload.pre_check_result === 'object') {
    const preCheck = upload.pre_check_result as Record<string, unknown>
    // Try to get sample products if stored in pre_check
    if (Array.isArray(preCheck.sample_products)) {
      products.push(...(preCheck.sample_products as Array<{ title?: string; description?: string; handle?: string }>).slice(0, 3))
    }
  }

  // If no product data available, create a synthetic test
  if (products.length === 0) {
    products.push({
      title: `Sample product from ${(upload.store_name as string | null) ?? 'store'}`,
      description: 'A sample product for testing. Please provide actual product data for a real test.',
    })
  }

  // Run the prompt on the first product (keep it simple)
  const firstProduct = products[0]
  const result = await runManualTest(template, {
    title: String(firstProduct.title ?? firstProduct.handle ?? 'Sample product'),
    description: String(firstProduct.description ?? 'No description available'),
  })

  // Parse the response and reformat for real-data mode
  const resultData = await (result as Response).json()
  return Response.json({
    ...resultData,
    mode: 'real',
    upload_id: uploadId,
    store_name: upload.store_name,
    original_title: String(firstProduct.title ?? ''),
    original_description: String(firstProduct.description ?? ''),
  })
}
