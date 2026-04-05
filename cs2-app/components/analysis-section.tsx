import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { SectionLabel } from '@/components/ui/section-label'

export function AnalysisSection({
  title,
  description,
  headerRight,
  variant = 'default',
  className,
  titleClassName,
  descriptionClassName,
  headerClassName,
  children,
}: {
  title: string
  description?: string
  headerRight?: ReactNode
  variant?: 'default' | 'nested'
  className?: string
  titleClassName?: string
  descriptionClassName?: string
  headerClassName?: string
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        variant === 'default' ? 'card-1' : 'card-2',
        variant === 'default' ? 'p-5' : 'p-3.5',
        className,
      )}
    >
      <div className={cn('mb-3 flex items-start justify-between gap-3 pb-3 border-b border-border/20', headerClassName)}>
        <div className="min-w-0">
          <SectionLabel className={titleClassName}>{title}</SectionLabel>
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
