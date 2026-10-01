'use client'

import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useIntl } from 'react-intl'
import { AutomationNav } from '@/components/admin/automation/automation-nav'
import { PageHeader } from '@/components/shared/page-header'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PERMISSIONS, type PermissionKey } from '@/lib/shared/permissions'

export const Route = createFileRoute('/admin/automation')({
  beforeLoad: ({ context }) => {
    const permissions = (context as { permissions?: PermissionKey[] }).permissions ?? []
    const canOpen = [
      PERMISSIONS.ASSISTANT_MANAGE,
      PERMISSIONS.WORKFLOW_MANAGE,
      PERMISSIONS.ANALYTICS_VIEW,
    ].some((permission) => permissions.includes(permission))
    if (!canOpen) throw new Error('Access denied: requires an AI & Automation permission')
  },
  loader: async ({ context }) => {
    const { ensureBillingCatalogue } = await import('@/lib/client/queries/billing')
    await ensureBillingCatalogue(context.queryClient, context.billingEnabled)
  },
  component: AutomationLayout,
})

function AutomationLayout() {
  const intl = useIntl()
  return (
    <div className="flex h-full bg-background">
      <aside
        data-side-pane=""
        className="hidden w-64 shrink-0 flex-col overflow-hidden border-e border-border/50 bg-card/30 lg:flex xl:w-72"
      >
        <div className="shrink-0 px-4 py-3.5">
          <PageHeader
            as="h2"
            title={intl.formatMessage({
              id: 'automation.nav.label',
              defaultMessage: 'AI & Automation',
            })}
          />
        </div>
        <ScrollArea
          className="min-h-0 flex-1"
          scrollBarClassName="w-1.5 opacity-0 transition-opacity data-[scrolling]:opacity-100"
        >
          <div className="px-5 pb-5">
            <AutomationNav />
          </div>
        </ScrollArea>
      </aside>

      <main className="flex-1 min-w-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-4 pb-4 pt-3.5 sm:px-6 sm:pb-6">
            <Outlet />
          </div>
        </ScrollArea>
      </main>
    </div>
  )
}
