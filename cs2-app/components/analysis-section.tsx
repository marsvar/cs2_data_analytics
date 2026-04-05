import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function AnalysisSection({
  title,
  description,
  headerRight,
  className,
  titleClassName,
  descriptionClassName,
  headerClassName,
  children,
}: {
  title: string
  description?: string
  headerRight?: ReactNode
  className?: string
  titleClassName?: string
  descriptionClassName?: string
  headerClassName?: string
  children: ReactNode
}) {
  return (
    <section className={cn('rounded-xl border border-border/35 bg-surface2/20 p-3.5', className)}>
      <div className={cn('mb-3 flex items-start justify-between gap-3', headerClassName)}>
        <div className="min-w-0">
          <p className={cn('font-display text-[10px] uppercase tracking-[0.2em] text-accent', titleClassName)}>
            {title}
          </p>
          {description ? (
            <p className={cn('mt-1 font-mono text-[10px] leading-relaxed text-muted/65', descriptionClassName)}>
              {description}
            </p>
          ) : null}
        </div>
        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
      </div>
      {children}
    </section>
  )
}
