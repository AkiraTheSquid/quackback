import {
  AnalyticsStatRow,
  type AnalyticsStatProps,
} from '@/components/admin/analytics/analytics-stat-row'
import { NO_DATA } from './performance-format'

/** The analytics stat row, with a "No data" value set in quiet type rather than as a figure. */
export function PerformanceStatRow({ stats }: { stats: AnalyticsStatProps[] }) {
  return (
    <AnalyticsStatRow stats={stats.map((stat) => ({ ...stat, muted: stat.value === NO_DATA }))} />
  )
}
