import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function clearFolder(
  supabase: any,
  bucket: string,
  folder: string = ''
): Promise<{ deleted: number; errors: string[] }> {
  let deleted = 0
  const errors: string[] = []

  const { data: items, error } = await supabase.storage
    .from(bucket)
    .list(folder || undefined, { limit: 1000 })

  if (error) {
    errors.push(`list ${folder || 'root'}: ${error.message}`)
    return { deleted, errors }
  }

  if (!items || items.length === 0) return { deleted, errors }

  // Separate files (have metadata) from folders (no metadata / null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const files = items.filter((i: any) => i.metadata != null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const folders = items.filter((i: any) => i.metadata == null)

  // Delete files in this folder
  if (files.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paths = files.map((f: any) => (folder ? `${folder}/${f.name}` : f.name))
    const { error: removeError } = await supabase.storage.from(bucket).remove(paths)
    if (removeError) {
      errors.push(`remove in ${folder || 'root'}: ${removeError.message}`)
    } else {
      deleted += paths.length
    }
  }

  // Recurse into sub-folders
  for (const sub of folders) {
    const subPath = folder ? `${folder}/${sub.name}` : sub.name
    const result = await clearFolder(supabase, bucket, subPath)
    deleted += result.deleted
    errors.push(...result.errors)
  }

  return { deleted, errors }
}

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const buckets = ['prompt-requests', 'uploads']
  const summary: Record<string, { deleted: number; errors: string[] }> = {}

  for (const bucket of buckets) {
    // Check if bucket exists
    const { data: list } = await supabase.storage.listBuckets()
    const exists = list?.some(b => b.name === bucket)
    if (!exists) {
      summary[bucket] = { deleted: 0, errors: ['bucket does not exist — skipped'] }
      continue
    }

    const result = await clearFolder(supabase, bucket)
    summary[bucket] = result
  }

  const totalDeleted = Object.values(summary).reduce((s, r) => s + r.deleted, 0)
  const allErrors = Object.entries(summary).flatMap(([b, r]) =>
    r.errors.map(e => `[${b}] ${e}`)
  )

  return NextResponse.json({
    ok: allErrors.length === 0,
    totalDeleted,
    summary,
    errors: allErrors,
  })
}
