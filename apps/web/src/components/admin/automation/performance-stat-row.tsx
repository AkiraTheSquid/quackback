import {
  AnalyticsStatRow,
  type AnalyticsStatProps,
} from '@/components/admin/analytics/analytics-stat-row'
import { useNoData } from './performance-format'

export type PerformanceStat = Omit<AnalyticsStatProps, 'value' | 'muted'> & {
  /** The figure, or null when there is nothing to compute it from. */
  value: string | null
}

/** The analytics stat row, with a missing value set in quiet type as "No data" rather than as a figure. */
export function PerformanceStatRow({ stats }: { stats: PerformanceStat[] }) {
  const noData = useNoData()
  return (
    <AnalyticsStatRow
      stats={stats.map((stat) =>
        stat.value === null
          ? { ...stat, value: noData, muted: true }
          : { ...stat, value: stat.value }
      )}
    />
  )
}
