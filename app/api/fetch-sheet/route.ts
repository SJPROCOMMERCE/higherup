import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  if (!url.includes('docs.google.com/spreadsheets')) {
    return NextResponse.json({ error: 'Not a Google Sheets URL' }, { status: 400 })
  }

  // Extract sheet ID
  const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
  if (!idMatch) {
    return NextResponse.json({ error: 'Could not parse sheet ID from URL' }, { status: 400 })
  }
  const sheetId = idMatch[1]

  // Extract gid (tab id) if present
  const gidMatch = url.match(/[#?&]gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : '0'

  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`

  try {
    const resp = await fetch(exportUrl, {
      headers: { 'User-Agent': 'HigherUp/1.0' },
      redirect: 'follow',
    })

    if (!resp.ok) {
      return NextResponse.json(
        { error: 'Could not fetch sheet — make sure it is set to "Anyone with the link can view"' },
        { status: 400 },
      )
    }

    const csv = await resp.text()

    // Sanity check: should look like CSV data
    if (!csv.trim() || csv.includes('<!DOCTYPE')) {
      return NextResponse.json(
        { error: 'Sheet returned no data or is not publicly accessible' },
        { status: 400 },
      )
    }

    return NextResponse.json({ csv, sheetId })
  } catch {
    return NextResponse.json(
      { error: 'Failed to load sheet' },
      { status: 500 },
    )
  }
}
