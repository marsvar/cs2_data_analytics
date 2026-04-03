import { NextRequest, NextResponse } from 'next/server'
import { resolveDivisionReference } from '@/lib/divisions'
import { DivisionServiceError, getDivisionOverview } from '@/lib/division-service'

export async function GET(request: NextRequest) {
  const divisionParam = request.nextUrl.searchParams.get('division')
    ?? request.nextUrl.searchParams.get('division_id')
  const resolved = resolveDivisionReference(divisionParam)

  if (!resolved) {
    return NextResponse.json(
      { error: 'division must be a known name/slug or positive integer id' },
      { status: 400 },
    )
  }

  const divisionId = resolved.id

  try {
    const result = await getDivisionOverview(divisionId)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof DivisionServiceError) {
      return NextResponse.json(
        { error: err.message, division_id: divisionId },
        { status: err.status },
      )
    }

    return NextResponse.json(
      { error: 'Unexpected error while fetching division', division_id: divisionId },
      { status: 500 },
    )
  }
}
