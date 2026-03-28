import { supabase } from './supabase'
import type { Upload } from './supabase'
import { logActivity } from './activity-log'

// ─── Filename helpers ─────────────────────────────────────────────────────────

export function getOriginalFilename(path: string): string {
  return path.split('/').pop()?.replace(/^\d+_/, '') ?? 'file'
}

export function getOutputFilename(inputPath: string): string {
  const name = getOriginalFilename(inputPath)
  const dotIdx = name.lastIndexOf('.')
  if (dotIdx === -1) return `${name}-optimized`
  return `${name.slice(0, dotIdx)}-optimized${name.slice(dotIdx)}`
}

// ─── Trigger browser download from a URL ─────────────────────────────────────

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ─── Public download functions ────────────────────────────────────────────────

export async function downloadOutput(upload: Upload): Promise<{ locked: boolean }> {
  if (!upload.output_file_path || !upload.input_file_path) return { locked: false }

  // ── Lock check ────────────────────────────────────────────────────────────
  if (upload.output_locked) {
    // Safety net: check if invoice is actually still outstanding in DB
    const { data: unpaidBills } = await supabase
      .from('billing')
      .select('id')
      .eq('va_id', upload.va_id)
      .in('status', ['outstanding', 'overdue'])
      .limit(1)

    if (unpaidBills && unpaidBills.length > 0) {
      // Still locked — block download
      return { locked: true }
    }

    // Safety net: invoice was paid/waived but upload wasn't unlocked → auto-unlock
    await supabase.from('uploads').update({
      output_locked:      false,
      output_unlocked_at: new Date().toISOString(),
    }).eq('id', upload.id)
  }

  const { data } = await supabase.storage
    .from('uploads')
    .createSignedUrl(upload.output_file_path, 3600)
  if (!data?.signedUrl) return { locked: false }
  triggerDownload(data.signedUrl, getOutputFilename(upload.input_file_path))
  // Track the download (fire-and-forget — ignore errors)
  void supabase.rpc('track_download', { upload_uuid: upload.id })
  void logActivity({ action: 'upload_downloaded', upload_id: upload.id, va_id: upload.va_id ?? undefined, source: 'va', details: `Output file downloaded for upload ${upload.id}` })
  return { locked: false }
}

export async function downloadInput(upload: Upload): Promise<void> {
  if (!upload.input_file_path) return
  const { data } = await supabase.storage
    .from('uploads')
    .createSignedUrl(upload.input_file_path, 3600)
  if (!data?.signedUrl) return
  triggerDownload(data.signedUrl, getOriginalFilename(upload.input_file_path))
}
