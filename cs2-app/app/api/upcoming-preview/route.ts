import { NextRequest, NextResponse } from 'next/server'
import { AnalyzeServiceError } from '@/lib/analyze-service'
import type { AnalyzeError } from '@/lib/types'
import { getUpcomingPreview } from '@/lib/upcoming-preview'

export const maxDuration = 90

export async function GET(request: NextRequest) {
  const matchupIdParam = request.nextUrl.searchParams.get('matchup_id')
  const matchupId = Number(matchupIdParam)

  if (!matchupIdParam || !Number.isInteger(matchupId) || matchupId <= 0) {
    return NextResponse.json<AnalyzeError>(
      { error: 'matchup_id must be a positive integer' },
      { status: 400 },
    )
  }

  try {
    const preview = await getUpcomingPreview(matchupId)
    return NextResponse.json(preview, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=900',
      },
    })
  } catch (err) {
    if (err instanceof AnalyzeServiceError) {
      return NextResponse.json<AnalyzeError>(
        { error: err.message, matchup_id: matchupId },
        { status: err.status },
      )
    }

    return NextResponse.json<AnalyzeError>(
      { error: 'Unexpected error during preview analysis', matchup_id: matchupId },
      { status: 500 },
    )
  }
}
