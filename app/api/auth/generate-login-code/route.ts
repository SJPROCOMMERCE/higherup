import { NextResponse } from 'next/server'
import { generateUniqueLoginCode } from '@/lib/generate-login-code'

export async function POST() {
  try {
    const code = await generateUniqueLoginCode()
    return NextResponse.json({ ok: true, code })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to generate code' },
      { status: 500 },
    )
  }
}
