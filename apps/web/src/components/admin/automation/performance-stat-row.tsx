import { COLS, type AnalyticsStatProps } from '@/components/admin/analytics/analytics-stat-row'
import { TrendDelta } from '@/components/admin/analytics/analytics-trend'
import { cn } from '@/lib/shared/utils'
import { useNoData } from './performance-format'

export type PerformanceStat = Omit<AnalyticsStatProps, 'value' | 'muted'> & {
  /** The figure, or null when there is nothing to compute it from. */
  value: string | null
}

/** One tile. It spans the row's three tracks as a subgrid, so labels, figures and
 *  captions line up across tiles even when a label or caption wraps. */
function PerformanceStatTile({ label, value, suffix, delta, caption, muted }: AnalyticsStatProps) {
  return (
    <div className="row-span-3 grid grid-rows-subgrid gap-y-0 px-5 py-4">
      <p className="mb-2 text-[13px] leading-5 text-muted-foreground">{label}</p>
      <p
        data-muted={muted ? 'true' : undefined}
        className={cn(
          'flex items-end gap-1 self-end tabular-nums',
          muted
            ? 'text-base leading-none font-medium text-muted-foreground sm:text-lg'
            : 'text-2xl leading-none font-bold tracking-tight sm:text-3xl'
        )}
      >
        {value}
        {suffix && <span className="text-base font-medium text-muted-foreground">{suffix}</span>}
      </p>
      {delta !== undefined ? (
        <TrendDelta value={delta} suffix="vs prev" className="mt-1.5" />
      ) : caption ? (
        <p className="mt-1.5 text-xs leading-4 text-muted-foreground">{caption}</p>
      ) : (
        <div className="mt-1.5 h-4" aria-hidden />
      )}
    </div>
  )
}

/** The analytics stat row, with a missing value set in quiet type as "No data" rather than as a figure. */
export function PerformanceStatRow({ stats }: { stats: PerformanceStat[] }) {
  const noData = useNoData()
  return (
    <div className={cn('grid divide-x divide-border/50', COLS[stats.length] ?? 'grid-cols-3')}>
      {stats.map((stat) => (
        <PerformanceStatTile
          key={stat.label}
          {...stat}
          {...(stat.value === null ? { value: noData, muted: true } : { value: stat.value })}
        />
      ))}
    </div>
  )
}
