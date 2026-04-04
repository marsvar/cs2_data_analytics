import { NextRequest, NextResponse } from 'next/server'
import { buildTeamProfile, TeamProfileError } from '@/lib/team-profile-service'

export const maxDuration = 90

export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get('team_id')
  const teamId = Number(param)

  if (!param || !Number.isInteger(teamId) || teamId <= 0) {
    return NextResponse.json({ error: 'Ugyldig team_id' }, { status: 400 })
  }

  try {
    const profile = await buildTeamProfile(teamId)
    return NextResponse.json(profile)
  } catch (err) {
    if (err instanceof TeamProfileError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[api/team] Unexpected error:', err)
    return NextResponse.json({ error: 'Intern serverfeil' }, { status: 500 })
  }
}
