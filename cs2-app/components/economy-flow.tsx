'use client'

type EconomyFlowProps = {
  notes: string[]
}

export function EconomyFlow({ notes }: EconomyFlowProps) {
  if (notes.length === 0) {
    return (
      <p className="font-mono text-xs text-muted/60 italic">
        Økonomidata ikke tilgjengelig (BL API eksponerer ikke runde-økonomi direkte).
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Disclaimer */}
      <div className="flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-warning/60">
          <path d="M7 1.5L12.5 11H1.5L7 1.5Z" stroke="currentColor" strokeWidth="1" fill="none"/>
          <path d="M7 5.5V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <circle cx="7" cy="9.5" r="0.6" fill="currentColor"/>
        </svg>
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted/50">
          Proxy — avledet fra åpningsdueldata, ikke direkte økonomi
        </span>
      </div>

      {/* Flow lanes — pure SVG */}
      <svg
        viewBox="0 0 320 56"
        className="w-full max-w-sm"
        aria-hidden="true"
      >
        {/* Connector lines */}
        <line x1="90" y1="10" x2="130" y2="10" stroke="var(--color-border)" strokeWidth="1" strokeDasharray="3 2"/>
        <line x1="90" y1="28" x2="130" y2="28" stroke="var(--color-border)" strokeWidth="1" strokeDasharray="3 2"/>
        <line x1="90" y1="46" x2="130" y2="46" stroke="var(--color-border)" strokeWidth="1" strokeDasharray="3 2"/>

        {/* Input labels */}
        <text x="0" y="13" fill="var(--color-muted)" fontFamily="'Fira Code', monospace" fontSize="8" opacity="0.7">OD-RATE</text>
        <text x="0" y="31" fill="var(--color-muted)" fontFamily="'Fira Code', monospace" fontSize="8" opacity="0.7">KAST</text>
        <text x="0" y="49" fill="var(--color-muted)" fontFamily="'Fira Code', monospace" fontSize="8" opacity="0.7">FIRST-K</text>

        {/* Center box */}
        <rect x="130" y="2" width="60" height="52" rx="4" fill="var(--color-surface2)" stroke="var(--color-border)" strokeWidth="0.8"/>
        <text x="160" y="23" fill="var(--color-accent)" fontFamily="'Fira Code', monospace" fontSize="7" textAnchor="middle">ØKO</text>
        <text x="160" y="34" fill="var(--color-accent)" fontFamily="'Fira Code', monospace" fontSize="7" textAnchor="middle">PROXY</text>

        {/* Output arrow */}
        <line x1="190" y1="28" x2="220" y2="28" stroke="var(--color-accent)" strokeWidth="1"/>
        <polygon points="220,25 226,28 220,31" fill="var(--color-accent)"/>
        <text x="230" y="31" fill="var(--color-text)" fontFamily="'Fira Code', monospace" fontSize="8" opacity="0.8">INNSIKT</text>
      </svg>

      {/* Notes list */}
      <ul className="space-y-1.5">
        {notes.map((note, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1 shrink-0 w-1 h-1 rounded-full bg-accent/60" />
            <span className="font-mono text-[11px] text-text/80 leading-relaxed">{note}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
