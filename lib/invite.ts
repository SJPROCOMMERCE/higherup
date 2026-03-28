import crypto from 'crypto'
import { supabase } from '@/lib/supabase'

// ─── Token generation ──────────────────────────────────────────────────────────

export function generateInviteToken(): string {
  return crypto.randomBytes(16).toString('hex') // 32 hex chars
}

// ─── Create invite ────────────────────────────────────────────────────────────

export async function createInvite(
  note?: string,
  invitedBy?: string,
): Promise<{ token: string; link: string; id: string }> {
  const token     = generateInviteToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const { data, error } = await supabase.from('invites').insert({
    token,
    invited_by: invitedBy || 'admin',
    note:       note || null,
    expires_at: expiresAt.toISOString(),
  }).select('id').single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to create invite')

  // link is built client-side using window.location.origin so it always
  // reflects the actual domain the admin is on (higherup.me, localhost, etc.)
  const link = `/join/${token}`
  return { token, link, id: data.id as string }
}

// ─── Validate invite ──────────────────────────────────────────────────────────

export type InviteReason = 'not_found' | 'revoked' | 'already_used' | 'expired'

export type InviteValidation =
  | { valid: true;  invite: Record<string, unknown> }
  | { valid: false; reason: InviteReason }

export async function validateInvite(token: string): Promise<InviteValidation> {
  const { data: invite } = await supabase
    .from('invites')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (!invite)               return { valid: false, reason: 'not_found'      }
  if (invite.revoked)        return { valid: false, reason: 'revoked'        }
  if (invite.used)           return { valid: false, reason: 'already_used'   }
  if (new Date(invite.expires_at as string) < new Date())
                             return { valid: false, reason: 'expired'        }

  return { valid: true, invite: invite as Record<string, unknown> }
}

// ─── Simple in-memory rate limiter ────────────────────────────────────────────

const attempts = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(ip: string): boolean {
  const now   = Date.now()
  const entry = attempts.get(ip)

  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return true
  }

  if (entry.count >= 5) return false
  entry.count++
  return true
}
