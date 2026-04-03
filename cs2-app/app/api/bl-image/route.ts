import { NextRequest, NextResponse } from 'next/server'
import { isAllowedBlImageUrl, normalizeBlImageUrl } from '@/lib/bl-image-url'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url')
  const normalizedUrl = normalizeBlImageUrl(rawUrl ?? undefined)

  if (!normalizedUrl || !isAllowedBlImageUrl(normalizedUrl)) {
    return NextResponse.json(
      { error: 'Invalid or unsupported image URL' },
      { status: 400 },
    )
  }

  let upstream: Response
  try {
    upstream = await fetch(normalizedUrl, {
      cache: 'force-cache',
      next: { revalidate: 60 * 60 * 24 },
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch upstream image' },
      { status: 502 },
    )
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream image returned ${upstream.status}` },
      { status: 502 },
    )
  }

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'
  const cacheControl = upstream.headers.get('cache-control')
    ?? 'public, max-age=86400, stale-while-revalidate=604800'
  const etag = upstream.headers.get('etag')
  const lastModified = upstream.headers.get('last-modified')

  const body = await upstream.arrayBuffer()
  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
  })
  if (etag) headers.set('ETag', etag)
  if (lastModified) headers.set('Last-Modified', lastModified)

  return new Response(body, {
    status: 200,
    headers,
  })
}

