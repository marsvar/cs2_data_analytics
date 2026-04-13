import { buildTeamProfile, TeamProfileError } from '@/lib/team-profile-service'
import { TeamProfileDisplay } from '@/components/team-profile-display'
import { ErrorCard } from '@/components/ui/error-card'
import { NavBreadcrumb } from '@/components/ui/nav-breadcrumb'

export const dynamic = 'force-dynamic'

type TeamPageProps = {
  params: Promise<{ id: string }>
}

export default async function TeamPage({ params }: TeamPageProps) {
  const { id } = await params
  const teamId = Number(id)

  if (!Number.isInteger(teamId) || teamId <= 0) {
    return (
      <ErrorCard
        title="Invalid team ID"
        detail="Team not found. Check the URL and try again."
        backLabel="← Back to search"
      />
    )
  }

  try {
    const profile = await buildTeamProfile(teamId)

    return (
      <section className="atlas-shell min-h-dvh">
        <div className="atlas-topline" />
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
          <div className="fx-rise">
            <NavBreadcrumb backHref="/" backLabel="← Back to search" contextLabel="Team Profile" />
          </div>
          <TeamProfileDisplay profile={profile} />
        </div>
      </section>
    )
  } catch (err) {
    if (err instanceof TeamProfileError && err.status === 404) {
      return (
        <ErrorCard
          title="Team not found"
          detail={err.message}
          backLabel="← Back to search"
        />
      )
    }

    return (
      <ErrorCard
        title="Unexpected error"
        detail="An error occurred while loading the team profile. Please try again."
        backLabel="← Back to search"
      />
    )
  }
}
