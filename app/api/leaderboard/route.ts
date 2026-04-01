import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

const FAKE_ENTRIES = [
  { rank: 1,  earned: 2340, clients: 10 },
  { rank: 2,  earned: 2180, clients: 10 },
  { rank: 3,  earned: 1950, clients: 9  },
  { rank: 4,  earned: 1820, clients: 9  },
  { rank: 5,  earned: 1690, clients: 8  },
  { rank: 6,  earned: 1540, clients: 8  },
  { rank: 7,  earned: 1480, clients: 8  },
  { rank: 8,  earned: 1350, clients: 7  },
  { rank: 9,  earned: 1290, clients: 7  },
  { rank: 10, earned: 1180, clients: 7  },
  { rank: 11, earned: 1120, clients: 7  },
  { rank: 12, earned: 1050, clients: 6  },
  { rank: 13, earned: 980,  clients: 6  },
  { rank: 14, earned: 940,  clients: 6  },
  { rank: 15, earned: 890,  clients: 6  },
  { rank: 16, earned: 850,  clients: 6  },
  { rank: 17, earned: 810,  clients: 5  },
  { rank: 18, earned: 780,  clients: 5  },
  { rank: 19, earned: 740,  clients: 5  },
  { rank: 20, earned: 710,  clients: 5  },
  { rank: 21, earned: 680,  clients: 5  },
  { rank: 22, earned: 650,  clients: 5  },
  { rank: 23, earned: 620,  clients: 5  },
  { rank: 24, earned: 590,  clients: 5  },
  { rank: 25, earned: 560,  clients: 4  },
  { rank: 26, earned: 540,  clients: 4  },
  { rank: 27, earned: 520,  clients: 4  },
  { rank: 28, earned: 500,  clients: 4  },
  { rank: 29, earned: 480,  clients: 4  },
  { rank: 30, earned: 460,  clients: 4  },
  { rank: 31, earned: 440,  clients: 4  },
  { rank: 32, earned: 420,  clients: 4  },
  { rank: 33, earned: 400,  clients: 4  },
  { rank: 34, earned: 380,  clients: 4  },
  { rank: 35, earned: 360,  clients: 4  },
  { rank: 36, earned: 340,  clients: 4  },
  { rank: 37, earned: 320,  clients: 4  },
  { rank: 38, earned: 300,  clients: 4  },
  { rank: 39, earned: 280,  clients: 4  },
  { rank: 40, earned: 260,  clients: 4  },
  { rank: 41, earned: 240,  clients: 4  },
  { rank: 42, earned: 220,  clients: 4  },
  { rank: 43, earned: 200,  clients: 4  },
  { rank: 44, earned: 180,  clients: 4  },
  { rank: 45, earned: 160,  clients: 4  },
  { rank: 46, earned: 140,  clients: 4  },
  { rank: 47, earned: 120,  clients: 4  },
  { rank: 48, earned: 100,  clients: 4  },
]

export async function GET(request: NextRequest) {
  const vaId = request.nextUrl.searchParams.get('vaId')

  let myEarned  = 0
  let myClients = 0

  if (vaId) {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: uploads } = await supabase
      .from('uploads')
      .select('product_row_count')
      .eq('va_id', vaId)
      .eq('status', 'done')
      .gte('created_at', thirtyDaysAgo.toISOString())

    const totalProducts = (uploads ?? []).reduce(
      (sum: number, u: { product_row_count: number | null }) => sum + (u.product_row_count ?? 0), 0
    )
    myEarned = Math.round(totalProducts * 0.65)

    const { count } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('va_id', vaId)
      .eq('is_active', true)
    myClients = count ?? 0
  }

  // How many fake entries have more earnings → determines rank
  const higherCount = FAKE_ENTRIES.filter(e => e.earned > myEarned).length
  const myRank = higherCount + 1

  // Build the full combined list (fake + real VA inserted at correct position)
  const allEntries: Array<{ rank: number; earned: number; clients: number; isYou: boolean }> = [
    ...FAKE_ENTRIES.map(e => ({ ...e, isYou: false })),
  ]
  allEntries.splice(myRank - 1, 0, {
    rank: myRank,
    earned: myEarned,
    clients: myClients,
    isYou: true,
  })

  // Re-number ranks after insertion
  allEntries.forEach((e, i) => { e.rank = i + 1 })

  // Display: top 10 always, plus the VA's own row if they're outside top 10
  const displayEntries = [...allEntries.slice(0, 10)]
  if (myRank > 10) {
    const myEntry = allEntries.find(e => e.isYou)
    if (myEntry) displayEntries.push(myEntry)
  }

  const totalOperators = allEntries.length

  return Response.json({ entries: displayEntries, myRank, totalOperators })
}
