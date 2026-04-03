import { NextRequest, NextResponse } from 'next/server'
import { getCompetitionDivisions } from '@/lib/bl-api'

const BL_TOKEN = process.env.BL_TOKEN ?? ''
const DEFAULT_COMPETITION_ID = 1220 // "Bedriftsligaen i CS2 — Vår 2026"

export async function GET(request: NextRequest) {
  const competitionParam = request.nextUrl.searchParams.get('competition_id')
  const competitionId = competitionParam ? Number(competitionParam) : DEFAULT_COMPETITION_ID

  if (!Number.isInteger(competitionId) || competitionId <= 0) {
    return NextResponse.json(
      { error: 'competition_id must be a positive integer' },
      { status: 400 },
    )
  }

  if (!BL_TOKEN) {
    return NextResponse.json(
      { error: 'BL_TOKEN is not configured' },
      { status: 500 },
    )
  }

  const allDivisions = await getCompetitionDivisions(competitionId, BL_TOKEN)

  // Competition 1220 (Vår 2026) returns 70 entries: main league, qualifier groups, and
  // older-season stubs all mixed together. The main Vår 2026 league divisions have IDs
  // starting at 1136. Filter to those; exclude the "Veni v Oceaneering" stub (1160).
  const divisions =
    competitionId === 1220
      ? allDivisions.filter((d) => d.id >= 1136 && d.id !== 1160).sort((a, b) => a.id - b.id)
      : allDivisions

  return NextResponse.json(
    { competition_id: competitionId, divisions },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      },
    },
  )
}
