import { buildPlayerProfile, PlayerProfileError } from '@/lib/player-profile-service'
import { PlayerProfileDisplay } from '@/components/player-profile-display'
import { ErrorCard } from '@/components/ui/error-card'
import { NavBreadcrumb } from '@/components/ui/nav-breadcrumb'

export const dynamic = 'force-dynamic'

type PlayerPageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ team_id?: string }>
}

export default async function PlayerPage({ params, searchParams }: PlayerPageProps) {
  const [{ id }, { team_id }] = await Promise.all([params, searchParams])
  const userId = Number(id)
  const teamId = team_id ? Number(team_id) : undefined
  const hintTeamId = teamId && Number.isInteger(teamId) && teamId > 0 ? teamId : undefined

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
    const profile = await buildPlayerProfile(userId, hintTeamId)

    return (
      <section className="atlas-shell min-h-dvh">
        <div className="atlas-topline" />
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
          <div className="fx-rise">
            <NavBreadcrumb backHref="/" backLabel="← Back to search" contextLabel="Player Profile" />
          </div>
          <PlayerProfileDisplay profile={profile} />
        </div>
      </section>
    )
  } catch (err) {
    if (err instanceof PlayerProfileError && err.status === 404) {
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
