import type { ComponentType } from 'react'
import { defineMessages } from 'react-intl'
import {
  ArrowDownTrayIcon,
  BeakerIcon,
  BellIcon,
  BookOpenIcon,
  BuildingOfficeIcon,
  ChatBubbleLeftIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  CreditCardIcon,
  DocumentDuplicateIcon,
  EnvelopeIcon,
  GlobeAltIcon,
  MegaphoneIcon,
  PuzzlePieceIcon,
  QueueListIcon,
  ShieldCheckIcon,
  SignalIcon,
  Squares2X2Icon,
  TagIcon,
  TicketIcon,
  UserGroupIcon,
  UsersIcon,
} from '@heroicons/react/24/solid'
import { GitHubIcon } from '@/components/icons/integration-icons'

interface SettingsPageEntry {
  label: string
  icon: ComponentType<{ className?: string }>
}

/**
 * The single registry of settings page labels. The settings nav, the module
 * lists and every page title read from here, so a nav label and the title of
 * the page it opens cannot differ. Keys are the page paths.
 */
export const SETTINGS_PAGES = {
  // Modules
  '/admin/settings/feedback': { label: 'Feedback & Roadmaps', icon: ChatBubbleLeftIcon },
  '/admin/settings/support': { label: 'Support', icon: ChatBubbleLeftRightIcon },
  // Feedback & Roadmaps
  '/admin/settings/boards': { label: 'Boards', icon: Squares2X2Icon },
  '/admin/settings/statuses': { label: 'Statuses', icon: Cog6ToothIcon },
  '/admin/settings/tags': { label: 'Tags', icon: TagIcon },
  '/admin/settings/moderation': { label: 'Moderation', icon: ShieldCheckIcon },
  // Support
  '/admin/settings/channels': { label: 'Channels', icon: ChatBubbleLeftRightIcon },
  '/admin/settings/channels/messenger': { label: 'Messenger', icon: ChatBubbleLeftRightIcon },
  '/admin/settings/channels/email': { label: 'Email', icon: EnvelopeIcon },
  '/admin/settings/channels/github': { label: 'GitHub', icon: GitHubIcon },
  '/admin/settings/macros': { label: 'Macros', icon: DocumentDuplicateIcon },
  '/admin/settings/office-hours': { label: 'Office hours', icon: ClockIcon },
  '/admin/settings/sla': { label: 'SLA policies', icon: ShieldCheckIcon },
  '/admin/settings/ticket-types': { label: 'Ticket types', icon: TicketIcon },
  '/admin/settings/ticket-statuses': { label: 'Ticket statuses', icon: QueueListIcon },
  // Other product modules
  '/admin/settings/help-center': { label: 'Help Center', icon: BookOpenIcon },
  '/admin/settings/changelog': { label: 'Changelog', icon: MegaphoneIcon },
  '/admin/settings/status': { label: 'Status', icon: SignalIcon },
  // Workspace
  '/admin/settings/general': { label: 'General', icon: Cog6ToothIcon },
  '/admin/settings/domains': { label: 'Domains', icon: GlobeAltIcon },
  '/admin/settings/notifications': { label: 'Notifications', icon: BellIcon },
  '/admin/settings/portal': { label: 'Portal', icon: GlobeAltIcon },
  '/admin/settings/widget': { label: 'Widget', icon: ChatBubbleLeftRightIcon },
  '/admin/settings/widget/install': { label: 'Install', icon: CodeBracketIcon },
  '/admin/settings/members': { label: 'Members & Teams', icon: UsersIcon },
  '/admin/settings/security/authentication': { label: 'Access & Security', icon: ShieldCheckIcon },
  '/admin/settings/developers': { label: 'Developers', icon: CommandLineIcon },
  '/admin/settings/labs': { label: 'Labs', icon: BeakerIcon },
  '/admin/settings/integrations': { label: 'Integrations', icon: PuzzlePieceIcon },
  '/admin/settings/billing': { label: 'Plan & billing', icon: CreditCardIcon },
  // Data
  '/admin/settings/people': { label: 'Users', icon: UserGroupIcon },
  '/admin/settings/companies': { label: 'Companies', icon: BuildingOfficeIcon },
  '/admin/settings/conversation-data': { label: 'Conversations', icon: ChatBubbleLeftIcon },
  '/admin/settings/imports': { label: 'Imports & exports', icon: ArrowDownTrayIcon },
} as const satisfies Record<string, SettingsPageEntry>

export type SettingsPagePath = keyof typeof SETTINGS_PAGES

const automationMessages = defineMessages({
  agent: { id: 'automation.nav.agent', defaultMessage: 'Agent' },
  copilot: { id: 'automation.nav.copilot', defaultMessage: 'Copilot' },
  connectors: { id: 'automation.nav.connectors', defaultMessage: 'Connectors' },
  skills: { id: 'automation.nav.skills', defaultMessage: 'Skills' },
  workflows: { id: 'automation.nav.workflows', defaultMessage: 'Workflows' },
  performance: { id: 'automation.nav.performance', defaultMessage: 'Performance' },
})

/** The automation pages, labelled through the same messages the automation nav renders. */
export const AUTOMATION_PAGES = {
  '/admin/automation/agent': automationMessages.agent,
  '/admin/automation/copilot': automationMessages.copilot,
  '/admin/automation/connectors': automationMessages.connectors,
  '/admin/automation/skills': automationMessages.skills,
  '/admin/automation/workflows': automationMessages.workflows,
  '/admin/automation/performance': automationMessages.performance,
} as const

export type AutomationPagePath = keyof typeof AUTOMATION_PAGES

export function settingsPageLabel(path: SettingsPagePath): string {
  const page = SETTINGS_PAGES[path]
  if (!page) throw new Error(`No settings page registered for ${path}`)
  return page.label
}

export function settingsPageIcon(path: SettingsPagePath): SettingsPageEntry['icon'] {
  return SETTINGS_PAGES[path].icon
}
