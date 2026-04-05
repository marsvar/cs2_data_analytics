import Link from 'next/link'

export function ErrorCard({
  title,
  detail,
  backHref = '/',
  backLabel = '← Til søk',
}: {
  title: string
  detail: string
  backHref?: string
  backLabel?: string
}) {
  return (
    <section className="atlas-shell min-h-dvh">
      <div className="atlas-topline" />
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-12">
        <Link
          href={backHref}
          className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-text transition-colors"
        >
          {backLabel}
        </Link>
        <div className="mt-5 card-1 p-5">
          <h1 className="font-display text-sm tracking-widest uppercase text-danger mb-2">{title}</h1>
          <p className="font-mono text-xs text-muted leading-relaxed">{detail}</p>
        </div>
      </div>
    </section>
  )
}
