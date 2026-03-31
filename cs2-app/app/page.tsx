'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

function RadarPreview() {
  const cx = 40; const cy = 40; const r = 26
  const angles = [-90, -18, 54, 126, 198]
  const vals = [0.82, 0.68, 0.56, 0.74, 0.79]

  const pts = (scale: number) =>
    angles
      .map((a) => {
        const rad = (a * Math.PI) / 180
        return `${(cx + r * scale * Math.cos(rad)).toFixed(1)},${(cy + r * scale * Math.sin(rad)).toFixed(1)}`
      })
      .join(' ')

  const dataPts = angles
    .map((a, i) => {
      const rad = (a * Math.PI) / 180
      return `${(cx + r * vals[i] * Math.cos(rad)).toFixed(1)},${(cy + r * vals[i] * Math.sin(rad)).toFixed(1)}`
    })
    .join(' ')

  return (
    <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true">
      {[0.33, 0.66, 1].map((l) => (
        <polygon key={l} points={pts(l)} fill="none" stroke="var(--color-border)" strokeWidth="0.6" />
      ))}
      {angles.map((a, i) => {
        const rad = (a * Math.PI) / 180
        return (
          <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(rad)} y2={cy + r * Math.sin(rad)} stroke="var(--color-border)" strokeWidth="0.5" />
        )
      })}
      <polygon points={dataPts} fill="rgba(37,99,235,0.18)" stroke="rgba(37,99,235,0.75)" strokeWidth="1.5" />
      {angles.map((a, i) => {
        const rad = (a * Math.PI) / 180
        return <circle key={i} cx={cx + r * vals[i] * Math.cos(rad)} cy={cy + r * vals[i] * Math.sin(rad)} r={1.8} fill="rgba(37,99,235,0.9)" />
      })}
    </svg>
  )
}

function ComparisonPreview() {
  const rows = [
    { label: 'DPR', a: 0.8, b: 0.62 },
    { label: 'KAST', a: 0.66, b: 0.78 },
    { label: 'OD%', a: 0.72, b: 0.55 },
  ]
  const width = 48
  return (
    <div className="w-40 space-y-2.5">
      {rows.map(({ label, a, b }) => (
        <div key={label} className="grid grid-cols-[1fr_30px_1fr] items-center gap-1">
          <div className="flex justify-end">
            <div className="h-1.5 rounded-full" style={{ width: `${a * width}px`, background: 'rgba(37,99,235,0.6)' }} />
          </div>
          <span className="text-[7px] font-mono text-muted text-center">{label}</span>
          <div>
            <div className="h-1.5 rounded-full" style={{ width: `${b * width}px`, background: 'rgba(249,115,22,0.6)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function PredictionPreview() {
  return (
    <div className="w-44 space-y-2">
      <div className="flex justify-between text-[9px] font-mono">
        <span className="text-accent">62%</span>
        <span className="text-muted/60 text-[8px]">seierssannsynlighet</span>
        <span className="text-accent2">38%</span>
      </div>
      <div className="relative h-3 bg-surface2 rounded-full overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: '62%', background: 'var(--color-accent)' }} />
        <div className="absolute inset-y-0 left-1/2 w-px bg-border/60" />
      </div>
      <div className="flex justify-between text-[8px] font-mono text-muted/60">
        <span>t0bben 9.2</span>
        <span>Hcon 7.8</span>
      </div>
    </div>
  )
}

const FEATURES = [
  {
    title: 'Spillerprofil',
    desc: 'Radarkart over 5 dimensjoner — sikte, KAST, åpningsdueller, K/D og posisjonering. Leetify-enriched eller BL-only.',
    Preview: RadarPreview,
  },
  {
    title: 'Lagsammenligning',
    desc: 'Side-om-side statistikk for hvert lag: DPR, KAST, OD%, K/D og samlet styrke. Vinnende side lyses opp.',
    Preview: ComparisonPreview,
  },
  {
    title: 'Seiersprediksjon',
    desc: 'Bayesiansk seierssannsynlighet med konfidensadvarsel ved få runder. Nøkkelspillere per lag uthevet.',
    Preview: PredictionPreview,
  },
]

export default function Home() {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function runAnalysis() {
    const id = input.trim()
    if (loading) return

    if (!/^\d+$/.test(id)) {
      setError('Skriv inn et gyldig matchup-id (kun tall).')
      return
    }

    setError(null)
    setLoading(true)
    router.push(`/match/${id}`)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') runAnalysis()
  }

  return (
    <main className="min-h-dvh">
      <section
        className="min-h-dvh py-20 px-6 md:px-10 relative overflow-hidden flex flex-col justify-center"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(42,48,68,0.18) 1px, transparent 1px),' +
            'linear-gradient(to bottom, rgba(42,48,68,0.18) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />

        <div className="max-w-3xl mx-auto w-full">
          <div className="flex items-center justify-between mb-12">
            <span className="font-display text-[11px] tracking-widest uppercase text-accent">
              CS2 Analyse
            </span>
            <div className="flex items-center gap-4">
              <Link href="/division/1138" className="font-mono text-[10px] text-muted uppercase tracking-widest hover:text-text">
                Divisjon 1138
              </Link>
              <span className="font-mono text-[10px] text-muted uppercase tracking-widest hidden sm:block">
                Bedriftsligaen · Vår 2026
              </span>
            </div>
          </div>

          <div className="mb-10">
            <h1 className="font-display font-bold uppercase leading-none tracking-tight mb-5">
              <span className="block text-4xl md:text-6xl text-text">TAKTISK</span>
              <span
                className="block text-5xl md:text-7xl"
                style={{
                  color: 'var(--color-accent)',
                  textShadow: '0 0 48px rgba(37,99,235,0.3), 0 0 12px rgba(37,99,235,0.15)',
                }}
              >
                KAMPANALYSE.
              </span>
            </h1>
            <p className="font-mono text-sm text-muted max-w-md leading-relaxed">
              Bayesiansk spilleranalyse for Bedriftsligaen i CS2.
              <br />
              Kombiner BL API + Leetify for taktisk innsikt og prediksjon.
            </p>
          </div>

          <div className="mb-3">
            <label htmlFor="matchup-input" className="sr-only">Matchup ID</label>
            <div
              className="flex items-center border border-border rounded-lg bg-surface overflow-hidden"
              style={{
                boxShadow: '0 0 0 1px rgba(37,99,235,0.05), 0 4px 24px rgba(0,0,0,0.3)',
                transition: 'border-color 200ms ease, box-shadow 200ms ease',
              }}
            >
              <span className="font-mono text-sm px-4 py-3.5 border-r border-border select-none shrink-0" style={{ color: 'var(--color-accent)' }} aria-hidden="true">
                ›
              </span>

              <span className="font-mono text-sm text-muted/50 px-3 py-3.5 shrink-0 hidden sm:block select-none">
                analyse --matchup
              </span>

              <input
                id="matchup-input"
                type="text"
                inputMode="numeric"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="15846"
                disabled={loading}
                className="flex-1 bg-transparent font-mono text-base text-text px-3 py-3.5 focus:outline-none disabled:opacity-50 placeholder:text-muted/30 min-w-0"
              />

              <button
                type="button"
                onClick={runAnalysis}
                disabled={loading || input.trim() === ''}
                aria-label="Gå til analyse"
                className="px-5 py-3.5 font-mono text-sm border-l border-border shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'rgba(37,99,235,0.08)', color: 'var(--color-accent)' }}
              >
                {loading ? <span className="animate-pulse">…</span> : '→'}
              </button>
            </div>
          </div>

          <div className="h-4">
            {loading && (
              <p className="font-mono text-[11px] text-muted animate-pulse">
                Navigerer til kampanalyse…
              </p>
            )}
            {error && (
              <p className="font-mono text-[11px] text-danger">✗ {error}</p>
            )}
            {!loading && !error && (
              <p className="font-mono text-[11px] text-muted/40">f.eks. 15846 · 15810 · 14922</p>
            )}
          </div>
        </div>
      </section>

      <section className="px-6 md:px-10 pb-20 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-10">
          <div className="h-px flex-1 bg-border/40" />
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted/60">Hva du får</span>
          <div className="h-px flex-1 bg-border/40" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FEATURES.map(({ title, desc, Preview }) => (
            <div key={title} className="bg-surface border border-border/40 rounded-lg p-5 flex flex-col gap-4">
              <div className="flex items-center justify-center h-20">
                <Preview />
              </div>
              <div className="h-px bg-border/30" />
              <div>
                <h3 className="font-display text-[11px] tracking-widest uppercase text-accent mb-2">{title}</h3>
                <p className="font-mono text-[11px] text-muted leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
