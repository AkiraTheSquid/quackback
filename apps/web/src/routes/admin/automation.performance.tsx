import { createFileRoute } from '@tanstack/react-router'
import { useIntl } from 'react-intl'
import { SettingsPage } from '@/components/admin/settings/settings-page'
import { CopilotUsageCard } from '@/components/admin/automation/copilot-usage-card'
import { QuinnPerformanceCard } from '@/components/admin/automation/quinn-performance-card'
import { QuinnToolsCard } from '@/components/admin/automation/quinn-tools-card'
import { SupportPerformanceCard } from '@/components/admin/automation/support-performance-card'
import { PERMISSIONS, type PermissionKey } from '@/lib/shared/permissions'

export const Route = createFileRoute('/admin/automation/performance')({
  beforeLoad: ({ context }) => {
    const permissions = (context as { permissions?: PermissionKey[] }).permissions ?? []
    if (!permissions.includes(PERMISSIONS.ANALYTICS_VIEW)) {
      throw new Error('Access denied: requires analytics.view')
    }
  },
  // The cards read the last 30 days, the period the header names. The window
  // is part of each card's query key: the loader fixes it once, warms the
  // cards with it, and hands it to them, so the server-rendered page carries
  // their data.
  loader: async ({ context }) => {
    // Imported here rather than at the top: route loaders ship in the entry
    // chunk every page loads.
    const { last30DaysRange, warmAutomationPerformance } =
      await import('@/lib/client/queries/automation-performance')
    const range = last30DaysRange()
    await warmAutomationPerformance(context.queryClient, range)
    return { range }
  },
  component: AutomationPerformancePage,
})

function AutomationPerformancePage() {
  const intl = useIntl()
  const { range } = Route.useLoaderData()

  return (
    <SettingsPage
      page="/admin/automation/performance"
      area="automation"
      actions={
        <span className="inline-flex h-8 items-center text-[13px] text-muted-foreground">
          {intl.formatMessage({
            id: 'automation.performance.period',
            defaultMessage: 'Last 30 days',
          })}
        </span>
      }
    >
      <QuinnPerformanceCard range={range} />
      <QuinnToolsCard range={range} />
      <CopilotUsageCard showActionsFunnel range={range} />
      <SupportPerformanceCard range={range} />
    </SettingsPage>
  )
}
