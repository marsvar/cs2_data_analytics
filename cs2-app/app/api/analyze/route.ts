import { NextRequest, NextResponse } from 'next/server'
import { analyzeMatchup, AnalyzeServiceError } from '@/lib/analyze-service'
import type { AnalyzeError } from '@/lib/types'

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
    const result = await analyzeMatchup(matchupId)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AnalyzeServiceError) {
      return NextResponse.json<AnalyzeError>(
        { error: err.message, matchup_id: matchupId },
        { status: err.status },
      )
    }

    return NextResponse.json<AnalyzeError>(
      { error: 'Unexpected error during analysis', matchup_id: matchupId },
      { status: 500 },
    )
  }
}
