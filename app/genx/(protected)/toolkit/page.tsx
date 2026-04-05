import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'
import ToolkitClient from './ToolkitClient'

export default async function ToolkitPage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')
  const db = genxDb()

  const { data: items } = await db
    .from('genx_toolkit')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  return <ToolkitClient items={items || []} />
}
