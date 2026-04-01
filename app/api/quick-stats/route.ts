import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const vaId = request.nextUrl.searchParams.get('vaId')
  if (!vaId) return Response.json({ earnings: 0, clients: 0, streak: 0 })

  const now           = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Earnings this month
  const { data: uploads } = await supabase
    .from('uploads')
    .select('product_row_count, created_at')
    .eq('va_id', vaId)
    .eq('status', 'done')
    .gte('created_at', thirtyDaysAgo.toISOString())

  const totalProducts = (uploads ?? []).reduce(
    (sum: number, u: { product_row_count: number | null }) =>
      sum + (u.product_row_count ?? 0),
    0
  )
  const earnings = Math.round(totalProducts * 0.65)

  // Active client count
  const { count: clients } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('va_id', vaId)
    .eq('is_active', true)

  // Streak: consecutive weeks with at least one completed upload
  // Look back up to 12 weeks
  const twelveWeeksAgo = new Date(now)
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84)

  const { data: allUploads } = await supabase
    .from('uploads')
    .select('created_at')
    .eq('va_id', vaId)
    .eq('status', 'done')
    .gte('created_at', twelveWeeksAgo.toISOString())
    .order('created_at', { ascending: false })

  // Determine which week numbers have uploads (week 0 = current week)
  const weeksWithUploads = new Set<number>()
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()) // start of current week (Sunday)
  weekStart.setHours(0, 0, 0, 0)

  for (const u of (allUploads ?? [])) {
    const uploadMs = new Date(u.created_at).getTime()
    const weeksAgo = Math.floor((weekStart.getTime() - uploadMs) / msPerWeek)
    if (weeksAgo >= 0 && weeksAgo < 12) weeksWithUploads.add(weeksAgo)
  }

  let streak = 0
  for (let w = 0; w < 12; w++) {
    if (weeksWithUploads.has(w)) streak++
    else break
  }

  return Response.json({ earnings, clients: clients ?? 0, streak })
}
