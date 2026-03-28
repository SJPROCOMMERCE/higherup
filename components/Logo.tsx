// ─── HigherUp logo — pure typography ────────────────────────────────────────
// No image. No icon. Just the word, clean.

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  color?: 'dark' | 'light' | 'muted'
}

const SIZES: Record<NonNullable<LogoProps['size']>, { fontSize: number; letterSpacing: string }> = {
  sm: { fontSize: 14, letterSpacing: '-0.02em' },   // footer
  md: { fontSize: 18, letterSpacing: '-0.02em' },   // nav
  lg: { fontSize: 28, letterSpacing: '-0.02em' },   // waitlist, onboarding
  xl: { fontSize: 36, letterSpacing: '-0.02em' },   // login
}

const COLORS: Record<NonNullable<LogoProps['color']>, string> = {
  dark:  '#111111',
  light: '#FFFFFF',
  muted: '#DDDDDD',
}

export function Logo({ size = 'md', color = 'dark' }: LogoProps) {
  const { fontSize, letterSpacing } = SIZES[size]
  return (
    <span style={{
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      fontSize,
      fontWeight: 600,
      letterSpacing,
      color: COLORS[color],
      lineHeight: 1,
    }}>
      HigherUp
    </span>
  )
}
