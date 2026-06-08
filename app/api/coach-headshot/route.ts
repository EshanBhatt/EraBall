import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name')
  if (!name) return new NextResponse('Missing name', { status: 400 })

  try {
    const title = encodeURIComponent(name.replace(/ /g, '_'))
    const summaryRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`,
      { headers: { 'User-Agent': 'EraBall/1.0 (NBA draft simulator)' } }
    )

    if (!summaryRes.ok) return new NextResponse('Not found', { status: 404 })

    const data = await summaryRes.json()
    const imageUrl = data?.thumbnail?.source
    if (!imageUrl) return new NextResponse('No image', { status: 404 })

    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) return new NextResponse('Image fetch failed', { status: 404 })

    const buffer = await imgRes.arrayBuffer()
    const contentType = imgRes.headers.get('Content-Type') ?? 'image/jpeg'

    return new NextResponse(buffer, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' }
    })
  } catch {
    return new NextResponse('Error', { status: 500 })
  }
}
