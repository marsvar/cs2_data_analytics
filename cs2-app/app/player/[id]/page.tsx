import Link from 'next/link'
import { getPlayerPageData, PlayerServiceError } from '@/lib/player-service'
import { PlayerProfileError } from '@/lib/player-profile-service'
import { PlayerProfileDisplay } from '@/components/player-profile-display'
import { ErrorCard } from '@/components/ui/error-card'
import { NavBreadcrumb } from '@/components/ui/nav-breadcrumb'

export const dynamic = 'force-dynamic'

type PlayerPageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ team_id?: string }>
}

function dateLabel(value?: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

export default async function PlayerPage({ params, searchParams }: PlayerPageProps) {
  const { id } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const userId = Number(id)
  const teamId = resolvedSearchParams?.team_id ? Number(resolvedSearchParams.team_id) : undefined
  const resolvedTeamId = Number.isInteger(teamId) && (teamId ?? 0) > 0 ? teamId : undefined

  if (!Number.isInteger(userId) || userId <= 0) {
    return (
      <ErrorCard
        title="Invalid player ID"
        detail="Player not found. Check the URL and try again."
        backLabel="← Back to search"
      />
    )
  }

  try {
    const pageData = await getPlayerPageData(userId, { teamId: resolvedTeamId })
    if (!pageData) {
      return (
        <ErrorCard
          title="Player not found"
          detail="Player not found. Check the URL and try again."
          backLabel="← Back to search"
        />
      )
    }

    const { profile, context } = pageData

    return (
      <section className="atlas-shell min-h-dvh">
        <div className="atlas-topline" />
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
          <div className="fx-rise">
            <NavBreadcrumb backHref="/" backLabel="← Back to search" contextLabel="Player Profile" />
          </div>

          {context && (
            <div className="mb-6 card-1 px-4 py-3 fx-rise fx-rise-d1">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted/60 mb-1">
                    Latest Analyzed Match Context
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Link
                      href={`/team/${context.team.id}`}
                      className="font-mono text-text hover:text-accent hover:underline underline-offset-2 transition-colors"
                    >
                      {context.team.name}
                    </Link>
                    <span className="font-mono text-muted/50">vs</span>
                    <Link
                      href={`/team/${context.opponent.id}`}
                      className="font-mono text-text hover:text-accent2 hover:underline underline-offset-2 transition-colors"
                    >
                      {context.opponent.name}
                    </Link>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-muted/60">
                    {context.match_status === 'played'
                      ? dateLabel(context.match_finished_time ?? context.match_start_time)
                      : dateLabel(context.match_start_time)}
                  </span>
                  <Link
                    href={`/match/${context.matchup_id}`}
                    className="font-mono text-[10px] uppercase tracking-widest text-accent hover:text-text transition-colors"
                  >
                    Open Match →
                  </Link>
                </div>
              </div>
            </div>
          )}

          <PlayerProfileDisplay profile={profile} />
        </div>
      </section>
    )
  } catch (err) {
    if ((err instanceof PlayerProfileError || err instanceof PlayerServiceError) && err.status === 404) {
      return (
        <ErrorCard
          title="Player not found"
          detail={err.message}
          backLabel="← Back to search"
        />
      )
    }

    return (
      <ErrorCard
        title="Unexpected error"
        detail="An error occurred while loading the player profile. Please try again."
        backLabel="← Back to search"
      />
    )
  }
}
