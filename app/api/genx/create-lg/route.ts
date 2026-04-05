import { NextRequest, NextResponse } from 'next/server'
import { genxDb } from '@/lib/genx-db'

export async function POST(req: NextRequest) {
  const { display_name, email } = await req.json()

  if (!display_name || typeof display_name !== 'string' || display_name.trim().length < 2) {
    return NextResponse.json({ error: 'Display name required (min 2 chars)' }, { status: 400 })
  }

  const db = genxDb()
  const name = display_name.trim()

  // Check if email already registered as LG
  if (email) {
    const { data: existing } = await db
      .from('lead_generators')
      .select('id, referral_code, login_code, status')
      .eq('email', email.trim().toLowerCase())
      .single()
    if (existing) {
      // Already an LG — ensure active and return their codes
      if (existing.status !== 'active') {
        await db.from('lead_generators').update({ status: 'active' }).eq('id', existing.id)
      }
      return NextResponse.json({
        success: true,
        login_code: existing.login_code,
        referral_code: existing.referral_code,
        redirect: '/genx/login',
        message: 'already_exists',
      })
    }
  }

  // Generate unique referral_code (8 char lowercase alphanumeric)
  let referralCode = ''
  for (let attempt = 0; attempt < 10; attempt++) {
    referralCode = Array.from({ length: 8 }, () =>
      'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
    ).join('')
    const { data: taken } = await db.from('lead_generators').select('id').eq('referral_code', referralCode).single()
    if (!taken) break
  }

  // Generate unique login_code (6 char uppercase alphanumeric)
  let loginCode = ''
  for (let attempt = 0; attempt < 10; attempt++) {
    loginCode = Array.from({ length: 6 }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
    ).join('')
    const { data: taken } = await db.from('lead_generators').select('id').eq('login_code', loginCode).single()
    if (!taken) break
  }

  const { data: newLG, error } = await db
    .from('lead_generators')
    .insert({
      display_name: name,
      email:        email ? email.trim().toLowerCase() : null,
      login_code:   loginCode,
      referral_code: referralCode,
      status:       'active',
      source:       'become-lg',
      joined_at:    new Date().toISOString(),
    })
    .select('id, login_code, referral_code')
    .single()

  if (error) {
    console.error('[genx] create-lg error:', error)
    return NextResponse.json({ error: 'Failed to create account', details: error.message }, { status: 500 })
  }

  console.log('[genx] new LG created:', newLG.id, 'code:', referralCode)
  return NextResponse.json({
    success: true,
    login_code: newLG.login_code,
    referral_code: newLG.referral_code,
    redirect: '/genx/login',
  })
}
