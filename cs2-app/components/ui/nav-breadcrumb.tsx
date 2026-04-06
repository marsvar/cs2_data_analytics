import Link from 'next/link'

export function NavBreadcrumb({
  backHref,
  backLabel = '← Til søk',
  contextLabel,
}: {
  backHref: string
  backLabel?: string
  contextLabel?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-5">
      <Link
        href={backHref}
        className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-text transition-colors"
      >
        {backLabel}
      </Link>
      {contextLabel && (
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted/70">
          {contextLabel}
        </span>
      )}
    </div>
  )
}
