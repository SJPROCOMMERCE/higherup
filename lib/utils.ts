export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function getMonthStart(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export function formatMonthLabel(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function getMarketFlag(market: string | null): string {
  if (!market) return '🌍'
  const flags: Record<string, string> = {
    Germany: '🇩🇪',
    'United States': '🇺🇸',
    Netherlands: '🇳🇱',
    'United Kingdom': '🇬🇧',
    France: '🇫🇷',
    Spain: '🇪🇸',
    Philippines: '🇵🇭',
    Australia: '🇦🇺',
    Canada: '🇨🇦',
    Belgium: '🇧🇪',
    Italy: '🇮🇹',
    Sweden: '🇸🇪',
  }
  return flags[market] ?? '🌍'
}
