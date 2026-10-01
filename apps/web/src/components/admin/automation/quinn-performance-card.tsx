/**
 * Quinn performance headline: involvement,
 * resolution, and escalation rates over the page's period, the
 * confirmed-vs-assumed resolution split, and actions taken via tool calls.
 * Read-only reporting — gated server-side on analytics.view like the rest
 * of the analytics surface.
 */
import { useQuery } from '@tanstack/react-query'
import { useIntl } from 'react-intl'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { Button } from '@/components/ui/button'
import { PerformanceStatRow } from './performance-stat-row'
import { pct, asRate, type DateRange } from './performance-format'
import { quinnPerformanceQuery } from '@/lib/client/queries/assistant-analytics'

export function QuinnPerformanceCard({ range }: { range: DateRange }) {
  const intl = useIntl()
  const performanceQuery = useQuery(quinnPerformanceQuery(range.from, range.to))
  const { data } = performanceQuery

  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'automation.performance.agent.title',
        defaultMessage: 'AI agent',
      })}
      flush
    >
      {performanceQuery.isError ? (
        <div className="flex items-center justify-between gap-3 p-4 sm:p-6">
          <p role="alert" className="text-sm text-destructive">
            {intl.formatMessage({
              id: 'automation.performance.agent.error',
              defaultMessage: 'AI agent performance could not be loaded.',
            })}
          </p>
          <Button variant="outline" size="sm" onClick={() => void performanceQuery.refetch()}>
            {intl.formatMessage({ id: 'automation.agent.retry', defaultMessage: 'Try again' })}
          </Button>
        </div>
      ) : (
        <PerformanceStatRow
          stats={[
            {
              label: intl.formatMessage({
                id: 'automation.performance.agent.involvement',
                defaultMessage: 'Involvement rate',
              }),
              value: pct(asRate(data?.involvementRate)),
              caption: data
                ? intl.formatMessage(
                    {
                      id: 'automation.performance.agent.involvementDetail',
                      defaultMessage: '{involvements} of {conversations} conversations',
                    },
                    { involvements: data.involvements, conversations: data.conversations }
                  )
                : undefined,
            },
            {
              label: intl.formatMessage({
                id: 'automation.performance.agent.resolution',
                defaultMessage: 'Resolution rate',
              }),
              value: pct(asRate(data?.resolutionRate)),
              caption: data
                ? intl.formatMessage(
                    {
                      id: 'automation.performance.agent.resolutionDetail',
                      defaultMessage: '{confirmed} confirmed / {assumed} assumed',
                    },
                    { confirmed: data.resolvedConfirmed, assumed: data.resolvedAssumed }
                  )
                : undefined,
            },
            {
              label: intl.formatMessage({
                id: 'automation.performance.agent.escalation',
                defaultMessage: 'Escalation rate',
              }),
              value: pct(asRate(data?.escalationRate)),
              caption: data
                ? intl.formatMessage(
                    {
                      id: 'automation.performance.agent.escalationDetail',
                      defaultMessage: '{count} handed off',
                    },
                    { count: data.handedOff }
                  )
                : undefined,
            },
            {
              label: intl.formatMessage({
                id: 'automation.performance.agent.actions',
                defaultMessage: 'Actions completed',
              }),
              value: data ? String(data.actionsTaken) : null,
            },
            {
              label: intl.formatMessage({
                id: 'automation.performance.agent.csat',
                defaultMessage: 'Customer satisfaction',
              }),
              value:
                data && data.csat.responseCount > 0
                  ? intl.formatMessage(
                      {
                        id: 'automation.performance.agent.csatValue',
                        defaultMessage: '{avg} / 5',
                      },
                      {
                        avg: intl.formatNumber(data.csat.avgRating, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }),
                      }
                    )
                  : null,
              caption: data
                ? intl.formatMessage(
                    {
                      id: 'automation.performance.agent.csatDetail',
                      defaultMessage: '{count, plural, one {# rating} other {# ratings}}',
                    },
                    { count: data.csat.responseCount }
                  )
                : undefined,
            },
          ]}
        />
      )}
    </SettingsCard>
  )
}
