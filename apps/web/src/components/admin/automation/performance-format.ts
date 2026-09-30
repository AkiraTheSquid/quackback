/**
 * Shared helpers for the automation performance cards: the date range type,
 * the default window and the rate-to-percent formatters. `pct` takes a 0-1 rate, matching how SLA
 * attainment is computed; a caller whose source data is already 0-100 (e.g.
 * Quinn's involvement/resolution/escalation rates, or a `ratePctOrNull`-shaped
 * domain field) scales it down with `asRate` first.
 */
import { useMemo } from 'react'
import { useIntl } from 'react-intl'
import { last30DaysRange, type DateRange } from '@/lib/client/queries/automation-performance'

export type { DateRange }

/** The rolling 30-day window a card reads when it is not handed one. */
export function useLast30DaysRange(): DateRange {
  return useMemo(() => last30DaysRange(), [])
}

/** What a figure reads when there is nothing to compute it from. */
export function useNoData(): string {
  const intl = useIntl()
  return intl.formatMessage({ id: 'automation.performance.noData', defaultMessage: 'No data' })
}

/** Format a 0-1 rate as a whole-number percent, or null while unset. */
export function pct(rate: number | null | undefined): string | null {
  return rate == null ? null : `${Math.round(rate * 100)}%`
}

/** Scale a 0-100 rate down to the 0-1 range `pct` expects; null/undefined pass through unchanged. */
export function asRate(value: number | null | undefined): number | null | undefined {
  return value == null ? value : value / 100
}
