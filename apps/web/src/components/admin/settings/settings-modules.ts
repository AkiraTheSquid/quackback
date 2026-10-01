import type { ComponentType } from 'react'
import { SETTINGS_PAGES, type SettingsPagePath } from './settings-pages'
import { SETTINGS_PAGE_ICONS } from './settings-page-icons'
import { isProductEnabled, type FeatureFlags } from '@/lib/shared/types'

export interface SettingsModulePage {
  label: string
  to: string
  icon: ComponentType<{ className?: string }>
  description?: string
}

export interface SettingsModule {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  description: string
  /** Landing page when the module has several child pages (Channels-style card). */
  hubTo?: string
  pages: SettingsModulePage[]
}

/** A module page whose label and icon come from the page registry. */
function modulePage(to: SettingsPagePath, description?: string): SettingsModulePage {
  const { label } = SETTINGS_PAGES[to]
  return { label, to, icon: SETTINGS_PAGE_ICONS[to], description }
}

function moduleHead(to: SettingsPagePath) {
  const { label } = SETTINGS_PAGES[to]
  return { label, icon: SETTINGS_PAGE_ICONS[to] }
}

function pathIsUnder(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}

/** Product modules shown under Settings → Modules. Several pages land on a hub card. */
export function buildSettingsModules(flags?: Partial<FeatureFlags>): SettingsModule[] {
  const modules: SettingsModule[] = [
    {
      id: 'feedback',
      ...moduleHead('/admin/settings/feedback'),
      description: 'Boards, statuses, tags, and moderation.',
      hubTo: '/admin/settings/feedback',
      pages: [
        modulePage('/admin/settings/boards', 'Where posts live'),
        modulePage('/admin/settings/statuses', 'The feedback pipeline'),
        modulePage('/admin/settings/tags', 'Labels for posts'),
        modulePage('/admin/settings/moderation', 'Approval and spam'),
      ],
    },
  ]

  const supportPages: SettingsModulePage[] = []
  if (flags?.supportInbox) {
    supportPages.push(modulePage('/admin/settings/channels', 'Where conversations happen'))
  } else if (isProductEnabled(flags, 'support')) {
    supportPages.push(
      modulePage('/admin/settings/channels/email', 'Inbound and outbound email'),
      modulePage('/admin/settings/channels/github', 'Issues as conversations')
    )
  }
  if (isProductEnabled(flags, 'support')) {
    supportPages.push(
      modulePage('/admin/settings/macros', 'Saved replies'),
      modulePage('/admin/settings/office-hours', 'When the team is available'),
      modulePage('/admin/settings/sla', 'Response and resolution targets')
    )
  }
  if (flags?.supportTickets) {
    supportPages.push(
      modulePage('/admin/settings/ticket-types', 'Fields a ticket captures'),
      modulePage('/admin/settings/ticket-statuses', 'The ticket pipeline')
    )
  }
  if (supportPages.length > 0) {
    modules.push({
      id: 'support',
      ...moduleHead('/admin/settings/support'),
      description: 'Channels, macros, hours, and tickets.',
      hubTo: '/admin/settings/support',
      pages: supportPages,
    })
  }

  if (isProductEnabled(flags, 'helpCenter')) {
    modules.push({
      id: 'helpCenter',
      ...moduleHead('/admin/settings/help-center'),
      description: 'Articles and categories.',
      pages: [modulePage('/admin/settings/help-center')],
    })
  }

  if (isProductEnabled(flags, 'changelog')) {
    modules.push({
      id: 'changelog',
      ...moduleHead('/admin/settings/changelog'),
      description: 'Release notes.',
      pages: [modulePage('/admin/settings/changelog')],
    })
  }

  if (isProductEnabled(flags, 'status')) {
    modules.push({
      id: 'status',
      ...moduleHead('/admin/settings/status'),
      description: 'Status page.',
      pages: [modulePage('/admin/settings/status')],
    })
  }

  return modules
}

export function settingsModuleLandingPath(module: SettingsModule): string {
  return module.hubTo ?? module.pages[0]!.to
}

export function settingsModuleActivePaths(module: SettingsModule): string[] {
  return module.hubTo
    ? [module.hubTo, ...module.pages.map((page) => page.to)]
    : module.pages.map((page) => page.to)
}

export function settingsModuleForPath(
  pathname: string,
  modules: SettingsModule[]
): SettingsModule | undefined {
  return modules.find(
    (module) =>
      (module.hubTo && pathIsUnder(pathname, module.hubTo)) ||
      module.pages.some((page) => pathIsUnder(pathname, page.to))
  )
}
