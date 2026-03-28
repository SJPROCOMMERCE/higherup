import { validateInvite, type InviteReason } from '@/lib/invite'
import { OnboardingForm } from './OnboardingForm'

// ─── Error states ─────────────────────────────────────────────────────────────

function InvalidInvite({ reason }: { reason: InviteReason }) {
  const messages: Record<InviteReason, string> = {
    not_found:    'This invite link is not valid.',
    revoked:      'This invite has been revoked.',
    already_used: 'This invite has already been used.',
    expired:      'This invite has expired. Ask your manager for a new one.',
  }
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#FFFFFF', fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', color: '#111111', marginBottom: 40 }}>
          HigherUp
        </div>
        <div style={{ fontSize: 16, fontWeight: 300, color: '#111111' }}>
          {messages[reason]}
        </div>
      </div>
    </div>
  )
}

// ─── Page (server component) ──────────────────────────────────────────────────

export default async function JoinTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result    = await validateInvite(token)

  if (!result.valid) {
    return <InvalidInvite reason={result.reason} />
  }

  return (
    <OnboardingForm
      token={token}
      inviteId={result.invite.id as string}
    />
  )
}
