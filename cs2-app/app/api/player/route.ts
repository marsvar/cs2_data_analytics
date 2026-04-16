import { NextRequest, NextResponse } from 'next/server'
import { buildPlayerProfile, PlayerProfileError } from '@/lib/player-profile-service'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get('user_id')
  const userId = Number(param)

  if (!param || !Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 })
  }

  try {
    const profile = await buildPlayerProfile(userId)
    return NextResponse.json(profile)
  } catch (err) {
    if (err instanceof PlayerProfileError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[api/player] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
