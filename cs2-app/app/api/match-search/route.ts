import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_DIVISION } from '@/lib/divisions'
import { MatchSearchServiceError, searchMatchesByName } from '@/lib/match-search-service'
import type { MatchSearchResponse } from '@/lib/types'

type MatchSearchError = {
  error: string
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') ?? ''
  const division = request.nextUrl.searchParams.get('division')
  const limitParam = request.nextUrl.searchParams.get('limit')
  const limit = limitParam ? Number(limitParam) : undefined

  if (query.trim().length < 2) {
    return NextResponse.json<MatchSearchResponse>({
      query: query.trim(),
      division_id: DEFAULT_DIVISION.id,
      division_name: DEFAULT_DIVISION.name,
      matches: [],
      fetched_at: new Date().toISOString(),
    })
  }

  if (limitParam && (!Number.isInteger(limit) || (limit ?? 0) <= 0)) {
    return NextResponse.json<MatchSearchError>(
      { error: 'limit must be a positive integer' },
      { status: 400 },
    )
  }

  try {
    const result = await searchMatchesByName({
      query,
      division,
      limit,
    })
    return NextResponse.json<MatchSearchResponse>(result)
  } catch (err) {
    if (err instanceof MatchSearchServiceError) {
      return NextResponse.json<MatchSearchError>(
        { error: err.message },
        { status: err.status },
      )
    }

    return NextResponse.json<MatchSearchError>(
      { error: 'Unexpected error while searching matches' },
      { status: 500 },
    )
  }
}
