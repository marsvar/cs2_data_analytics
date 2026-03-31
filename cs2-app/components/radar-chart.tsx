import type { PlayerAnalysis } from '@/lib/types'

const CX = 60
const CY = 60
const MAX_R = 44

const AXES = [
  { label: 'DPR',   angle: -90 },
  { label: 'KAST',  angle: -90 + 72 },
  { label: 'OD%',   angle: -90 + 144 },
  { label: 'K/D',   angle: -90 + 216 },
  { label: 'SIKTE', angle: -90 + 288 },
]

function polar(angleDeg: number, r: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)]
}

function toPoints(values: number[]): string {
  return values
    .map((v, i) => {
      const clamped = Math.max(0, Math.min(1, v))
      const [x, y] = polar(AXES[i].angle, MAX_R * clamped)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

function gridPoints(level: number): string {
  return AXES.map(({ angle }) => {
    const [x, y] = polar(angle, MAX_R * level)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
}

export function RadarChart({
  player,
  size = 128,
}: {
  player: PlayerAnalysis
  size?: number
}) {
  const aimNorm = player.leetify ? player.leetify.aim / 100 : player.hs

  const values = [
    Math.min(player.dpr / 120, 1),
    player.kast,
    player.od_rate,
    Math.min(player.kd / 2, 1),
    aimNorm,
  ]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Radarprofil for ${player.name}: DPR ${player.dpr.toFixed(0)}, KAST ${Math.round(player.kast * 100)}%, OD ${Math.round(player.od_rate * 100)}%, K/D ${player.kd.toFixed(2)}`}
    >
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1.0].map((level) => (
        <polygon
          key={level}
          points={gridPoints(level)}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={level === 1.0 ? 0.75 : 0.5}
          opacity={level === 1.0 ? 1 : 0.6}
        />
      ))}

      {/* Axis spokes */}
      {AXES.map(({ angle }, i) => {
        const [x, y] = polar(angle, MAX_R)
        return (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            stroke="var(--color-border)"
            strokeWidth="0.5"
          />
        )
      })}

      {/* Data fill */}
      <polygon
        points={toPoints(values)}
        fill="var(--color-accent)"
        fillOpacity={0.18}
        stroke="var(--color-accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {/* Data point dots */}
      {values.map((v, i) => {
        const clamped = Math.max(0, Math.min(1, v))
        const [x, y] = polar(AXES[i].angle, MAX_R * clamped)
        return (
          <circle key={i} cx={x} cy={y} r={2} fill="var(--color-accent)" />
        )
      })}

      {/* Axis labels */}
      {AXES.map(({ angle, label }, i) => {
        const [x, y] = polar(angle, MAX_R + 11)
        return (
          <text
            key={i}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="7.5"
            fill="var(--color-muted)"
            fontFamily="var(--font-mono)"
          >
            {label}
          </text>
        )
      })}
    </svg>
  )
}
