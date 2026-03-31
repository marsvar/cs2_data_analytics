import { NextRequest, NextResponse } from 'next/server'
import { DivisionServiceError, getDivisionOverview } from '@/lib/division-service'

export async function GET(request: NextRequest) {
  const divisionIdParam = request.nextUrl.searchParams.get('division_id')
  const divisionId = Number(divisionIdParam)

  if (!divisionIdParam || !Number.isInteger(divisionId) || divisionId <= 0) {
    return NextResponse.json(
      { error: 'division_id must be a positive integer' },
      { status: 400 },
    )
  }

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
