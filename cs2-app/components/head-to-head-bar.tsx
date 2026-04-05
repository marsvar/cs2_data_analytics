type HeadToHeadBarProps = {
  homeShare: number
  awayShare: number
  className?: string
  heightClassName?: string
  homeLabel?: string
  awayLabel?: string
  centerLabel?: string
  showFooter?: boolean
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export function HeadToHeadBar({
  homeShare,
  awayShare,
  className = '',
  heightClassName = 'h-2.5',
  homeLabel,
  awayLabel,
  centerLabel,
  showFooter = true,
}: HeadToHeadBarProps) {
  const safeHome = clamp(homeShare)
  const safeAway = clamp(awayShare)
  const total = safeHome + safeAway
  const normalizedHome = total > 0 ? (safeHome / total) * 100 : 50
  const normalizedAway = total > 0 ? (safeAway / total) * 100 : 50

  return (
    <div className={className}>
      <div
        className={`relative overflow-hidden rounded-full border border-border/40 bg-surface/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${heightClassName}`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-l-full"
          style={{
            width: `${normalizedHome}%`,
            backgroundColor: 'var(--color-accent)',
            opacity: 0.85,
          }}
        />
        <div
          className="absolute inset-y-0 right-0 rounded-r-full"
          style={{
            width: `${normalizedAway}%`,
            backgroundColor: 'var(--color-accent2)',
            opacity: 0.82,
          }}
        />
        <div
          className="absolute inset-0 opacity-100"
          style={{
            background:
              'linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 30%, rgba(255,255,255,0.02) 70%, rgba(255,255,255,0.06) 100%)',
          }}
        />
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-bg/70" />
      </div>

      {showFooter && (homeLabel || awayLabel || centerLabel) && (
        <div className="mt-1.5 flex items-center justify-between gap-3 font-mono text-[10px]">
          <span className="min-w-0 truncate text-accent">{homeLabel ?? ''}</span>
          <span className="shrink-0 text-muted/55">{centerLabel ?? ''}</span>
          <span className="min-w-0 truncate text-right text-accent2">{awayLabel ?? ''}</span>
        </div>
      )}
    </div>
  )
}
