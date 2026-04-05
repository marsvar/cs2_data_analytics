import { buildPlayerProfile, PlayerProfileError } from '@/lib/player-profile-service'
import { PlayerProfileDisplay } from '@/components/player-profile-display'
import { ErrorCard } from '@/components/ui/error-card'
import { NavBreadcrumb } from '@/components/ui/nav-breadcrumb'

export const dynamic = 'force-dynamic'

type PlayerPageProps = {
  params: Promise<{ id: string }>
}

export default async function PlayerPage({ params }: PlayerPageProps) {
  const { id } = await params
  const userId = Number(id)

  if (!Number.isInteger(userId) || userId <= 0) {
    return (
      <ErrorCard
        title="Ugyldig spiller-ID"
        detail="Fant ikke spilleren. Sjekk URL-en og prøv igjen."
      />
    )
  }

  try {
    const profile = await buildPlayerProfile(userId)

    return (
      <section className="atlas-shell min-h-dvh">
        <div className="atlas-topline" />
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
          <div className="fx-rise">
            <NavBreadcrumb backHref="/" contextLabel="Spillerprofil" />
          </div>
          <PlayerProfileDisplay profile={profile} />
        </div>
      </section>
    )
  } catch (err) {
    if (err instanceof PlayerProfileError) {
      if (err.status === 404) {
        return (
          <ErrorCard
            title="Spiller ikke funnet"
            detail={err.message}
          />
        )
      }
    }
    return (
      <ErrorCard
        title="Uventet feil"
        detail="Det oppstod en feil ved lasting av spillerprofilen. Prøv igjen om litt."
      />
    )
  }
}
