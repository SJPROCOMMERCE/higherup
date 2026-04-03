import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'
import ToolkitClient from './ToolkitClient'

export default async function ToolkitPage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')

  const { data: items } = await supabase
    .from('genx_toolkit')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  return <ToolkitClient items={items || []} />
}
