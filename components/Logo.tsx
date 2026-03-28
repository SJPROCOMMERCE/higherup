// ─── HigherUp logo image ──────────────────────────────────────────────────────

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** 'dark' = original colours (for light bg), 'light' = inverted white (for dark bg) */
  color?: 'dark' | 'light'
  style?: React.CSSProperties
}

// Heights in px — width is computed automatically from the 1280:543 aspect ratio
const HEIGHTS: Record<NonNullable<LogoProps['size']>, number> = {
  sm: 22,
  md: 28,
  lg: 34,
  xl: 40,
}

export function Logo({ size = 'md', color = 'dark', style }: LogoProps) {
  const h = HEIGHTS[size]
  const w = Math.round(h * (1280 / 543))
  return (
    <img
      src="/logo.png"
      alt="HigherUp"
      width={w}
      height={h}
      style={{
        display: 'block',
        width: w,
        height: h,
        objectFit: 'contain',
        filter: color === 'light' ? 'brightness(0) invert(1)' : 'none',
        ...style,
      }}
    />
  )
}
