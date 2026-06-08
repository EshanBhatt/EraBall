import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const personId = request.nextUrl.searchParams.get('id')
  if (!personId) return new NextResponse('Missing id', { status: 400 })

  const url = `https://cdn.nba.com/headshots/nba/latest/1040x760/${personId}.png`
  const res = await fetch(url, {
    headers: { 'Referer': 'https://www.nba.com/' }
  })

  if (!res.ok) return new NextResponse('Not found', { status: 404 })

  const buffer = await res.arrayBuffer()
  return new NextResponse(buffer, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }
  })
}
