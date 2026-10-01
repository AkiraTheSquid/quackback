import { Link, useRouterState } from '@tanstack/react-router'
import { useIntl } from 'react-intl'
import {
  BoltIcon,
  BookOpenIcon,
  ChartBarIcon,
  LinkIcon,
  SparklesIcon,
  UserGroupIcon,
} from '@heroicons/react/24/solid'
import { MENU_ICON, MENU_LABEL, MENU_ROW } from '@/components/ui/menu'
import { usePermission } from '@/lib/client/hooks/use-permission'
import { PERMISSIONS } from '@/lib/shared/permissions'
import { cn } from '@/lib/shared/utils'
import type { FeatureFlags } from '@/lib/shared/types/settings'
import {
  AUTOMATION_PAGES,
  type AutomationPagePath,
} from '@/components/admin/settings/settings-pages'
import { useWorkspaceSettings } from '@/lib/client/hooks/use-root-context'

interface NavItem {
  labelId: string
  defaultLabel: string
  to: string
  icon: typeof SparklesIcon
}

/** A nav row labelled through the page registry. */
function automationItem(to: AutomationPagePath, icon: NavItem['icon']): NavItem {
  const { id, defaultMessage } = AUTOMATION_PAGES[to]
  return { labelId: id, defaultLabel: defaultMessage, to, icon }
}

/**
 * A titled cluster of nav rows. The Agents group holds the two peer agents
 * plus their shared catalog (Connectors, Skills); Operations holds the
 * standalone tools (Workflows, Performance).
 */
interface NavSection {
  labelId: string
  defaultLabel: string
  items: NavItem[]
}

interface AutomationNavPermissions {
  assistant: boolean
  workflows: boolean
  analytics: boolean
}

export function buildAutomationNavSections(
  flags:
    | {
        supportInbox?: boolean
      }
    | undefined,
  permissions: AutomationNavPermissions
): NavSection[] {
  const agents: NavItem[] = permissions.assistant
    ? [
        automationItem('/admin/automation/agent', SparklesIcon),
        automationItem('/admin/automation/copilot', UserGroupIcon),
        automationItem('/admin/automation/connectors', LinkIcon),
        automationItem('/admin/automation/skills', BookOpenIcon),
      ]
    : []

  const tools: NavItem[] = [
    permissions.workflows && flags?.supportInbox
      ? automationItem('/admin/automation/workflows', BoltIcon)
      : null,
    permissions.analytics ? automationItem('/admin/automation/performance', ChartBarIcon) : null,
  ].filter((item): item is NavItem => item !== null)

  const sections: NavSection[] = []
  if (agents.length > 0) {
    sections.push({
      labelId: 'automation.nav.group.agents',
      defaultLabel: 'Agents',
      items: agents,
    })
  }
  if (tools.length > 0) {
    sections.push({
      labelId: 'automation.nav.group.operations',
      defaultLabel: 'Operations',
      items: tools,
    })
  }
  return sections
}

export function AutomationNav() {
  const intl = useIntl()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const settings = useWorkspaceSettings()
  const flags = settings?.featureFlags as FeatureFlags | undefined
  const permissions: AutomationNavPermissions = {
    assistant: usePermission(PERMISSIONS.ASSISTANT_MANAGE),
    workflows: usePermission(PERMISSIONS.WORKFLOW_MANAGE),
    analytics: usePermission(PERMISSIONS.ANALYTICS_VIEW),
  }
  const sections = buildAutomationNavSections(flags, permissions)

  return (
    <nav
      aria-label={intl.formatMessage({
        id: 'automation.nav.label',
        defaultMessage: 'AI & Automation',
      })}
      className="space-y-4"
    >
      {sections.map((section) => (
        <div key={section.labelId} className="space-y-1">
          <p className={cn(MENU_LABEL, 'pb-1')}>
            {intl.formatMessage({ id: section.labelId, defaultMessage: section.defaultLabel })}
          </p>
          {section.items.map((item) => {
            const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`)
            const Icon = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  MENU_ROW,
                  isActive
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <Icon className={MENU_ICON} />
                <span className="min-w-0 flex-1 truncate">
                  {intl.formatMessage({ id: item.labelId, defaultMessage: item.defaultLabel })}
                </span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
