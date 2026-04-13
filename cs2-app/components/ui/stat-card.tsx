import { cn } from '@/lib/utils'

export function StatCard({
  label,
  value,
  sub,
  size = 'md',
  align = 'left',
  className,
}: {
  label: string
  value: string
  sub?: string
  size?: 'sm' | 'md'
  align?: 'left' | 'center'
  className?: string
}) {
  return (
    <div
      className={cn(
        'card-2 min-w-0',
        size === 'sm' ? 'px-2 py-2' : 'px-3 py-2.5',
        align === 'center' && 'text-center',
        className,
      )}
    >
      <div className="label-micro text-muted/60 mb-1 truncate">{label}</div>
      <div className={cn('font-display tabular-nums text-text', size === 'sm' ? 'text-sm' : 'text-xl')}>
        {value}
      </div>
      {sub && <div className="label-micro text-muted/50 mt-0.5">{sub}</div>}
    </div>
  )
}
