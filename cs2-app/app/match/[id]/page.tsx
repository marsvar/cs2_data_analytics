import Link from 'next/link'
import { AnalysisDisplay } from '@/components/analysis-display'
import { analyzeMatchup, AnalyzeServiceError } from '@/lib/analyze-service'

export const dynamic = 'force-dynamic'

type MatchPageProps = {
  params: Promise<{ id: string }>
}

function ErrorCard({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="max-w-5xl mx-auto px-6 md:px-10 py-12">
      <div className="mb-6">
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-text"
        >
          ← Til søk
        </Link>
      </div>
      <div className="bg-surface border border-danger/40 rounded-lg p-5">
        <h1 className="font-display text-sm tracking-widest uppercase text-danger mb-2">{title}</h1>
        <p className="font-mono text-xs text-muted leading-relaxed">{detail}</p>
      </div>
    </section>
  )
}

export default async function MatchPage({ params }: MatchPageProps) {
  const { id } = await params
  const matchupId = Number(id)

  if (!Number.isInteger(matchupId) || matchupId <= 0) {
    return (
      <ErrorCard
        title="Ugyldig matchup-id"
        detail="URL må være på formen /match/<positivt tall>, for eksempel /match/15846."
      />
    )
  }

  try {
    const result = await analyzeMatchup(matchupId)

    return (
      <section className="max-w-5xl mx-auto px-6 md:px-10 py-10">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-text"
          >
            ← Til søk
          </Link>
        </div>

        <AnalysisDisplay result={result} showCopyReport />
      </section>
    )
  } catch (err) {
    if (err instanceof AnalyzeServiceError) {
      return <ErrorCard title="Kunne ikke hente analyse" detail={err.message} />
    }
    return (
      <ErrorCard
        title="Uventet feil"
        detail="Det oppstod en feil under lasting av analysen. Prøv igjen om litt."
      />
    )
  }
}
