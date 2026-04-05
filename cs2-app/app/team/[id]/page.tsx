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
        title="Ugyldig lag-ID"
        detail="Fant ikke laget. Sjekk URL-en og prøv igjen."
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
            <NavBreadcrumb backHref="/" contextLabel="Lagprofil" />
          </div>
          <TeamProfileDisplay profile={profile} />
        </div>
      </section>
    )
  } catch (err) {
    if (err instanceof TeamProfileError) {
      if (err.status === 404) {
        return (
          <ErrorCard
            title="Lag ikke funnet"
            detail={err.message}
          />
        )
      }
    }
    return (
      <ErrorCard
        title="Uventet feil"
        detail="Det oppstod en feil ved lasting av lagprofilen. Prøv igjen om litt."
      />
    )
  }
}
