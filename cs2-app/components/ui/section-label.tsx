import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const colorMap = {
  accent: 'text-accent',
  success: 'text-success/80',
  warning: 'text-warning/80',
  muted: 'text-muted',
} as const

export function SectionLabel({
  children,
  color = 'accent',
  className,
}: {
  children: ReactNode
  color?: keyof typeof colorMap
  className?: string
}) {
  return (
    <span className={cn('label-display', colorMap[color], className)}>
      {children}
    </span>
  )
}
