import type { ComponentType } from 'react'
import { SETTINGS_PAGES, type SettingsPagePath } from './settings-pages'
import { SETTINGS_PAGE_ICONS } from './settings-page-icons'
import { PERMISSIONS, type PermissionKey } from '@/lib/shared/permissions'
import { isProductEnabled, type FeatureFlags } from '@/lib/shared/types'

export interface SettingsModulePage {
  label: string
  to: string
  icon: ComponentType<{ className?: string }>
  /** The permission the page's route checks; the nav and module landing offer it only to holders. */
  permission: PermissionKey
}

export interface SettingsModule {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  pages: SettingsModulePage[]
}

/** The permission each module page's route checks when it opens. */
const MODULE_PAGE_PERMISSIONS = {
  '/admin/settings/boards': PERMISSIONS.BOARD_MANAGE,
  '/admin/settings/statuses': PERMISSIONS.STATUS_MANAGE,
  '/admin/settings/tags': PERMISSIONS.TAG_MANAGE,
  '/admin/settings/moderation': PERMISSIONS.SETTINGS_MODERATION,
  '/admin/settings/channels': PERMISSIONS.SETTINGS_MANAGE,
  '/admin/settings/channels/email': PERMISSIONS.CHANNEL_ACCOUNT_MANAGE,
  '/admin/settings/channels/github': PERMISSIONS.CHANNEL_ACCOUNT_MANAGE,
  '/admin/settings/macros': PERMISSIONS.CONVERSATION_MANAGE,
  '/admin/settings/office-hours': PERMISSIONS.OFFICE_HOURS_MANAGE,
  '/admin/settings/sla': PERMISSIONS.SLA_MANAGE,
  '/admin/settings/ticket-types': PERMISSIONS.TICKET_MANAGE_TYPES,
  '/admin/settings/ticket-statuses': PERMISSIONS.TICKET_MANAGE_TYPES,
  '/admin/settings/help-center': PERMISSIONS.HELP_CENTER_MANAGE,
  '/admin/settings/changelog': PERMISSIONS.CHANGELOG_MANAGE,
  '/admin/settings/status': PERMISSIONS.STATUS_PAGE_MANAGE,
} as const satisfies Partial<Record<SettingsPagePath, PermissionKey>>

type ModulePagePath = keyof typeof MODULE_PAGE_PERMISSIONS

/** A module page whose label and icon come from the page registry. */
function modulePage(to: ModulePagePath): SettingsModulePage {
  const { label } = SETTINGS_PAGES[to]
  return {
    label,
    to,
    icon: SETTINGS_PAGE_ICONS[to],
    permission: MODULE_PAGE_PERMISSIONS[to as ModulePagePath],
  }
}

function moduleHead(to: SettingsPagePath) {
  const { label } = SETTINGS_PAGES[to]
  return { label, icon: SETTINGS_PAGE_ICONS[to] }
}

function pathIsUnder(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}

/** Product modules shown under Settings, Modules. A module with several pages expands in the nav. */
export function buildSettingsModules(flags?: Partial<FeatureFlags>): SettingsModule[] {
  const modules: SettingsModule[] = [
    {
      id: 'feedback',
      ...moduleHead('/admin/settings/feedback'),
      pages: [
        modulePage('/admin/settings/boards'),
        modulePage('/admin/settings/statuses'),
        modulePage('/admin/settings/tags'),
        modulePage('/admin/settings/moderation'),
      ],
    },
  ]

  const supportPages: SettingsModulePage[] = []
  if (flags?.supportInbox) {
    supportPages.push(modulePage('/admin/settings/channels'))
  } else if (isProductEnabled(flags, 'support')) {
    supportPages.push(
      modulePage('/admin/settings/channels/email'),
      modulePage('/admin/settings/channels/github')
    )
  }
  if (isProductEnabled(flags, 'support')) {
    supportPages.push(
      modulePage('/admin/settings/macros'),
      modulePage('/admin/settings/office-hours'),
      modulePage('/admin/settings/sla')
    )
  }
  if (flags?.supportTickets) {
    supportPages.push(
      modulePage('/admin/settings/ticket-types'),
      modulePage('/admin/settings/ticket-statuses')
    )
  }
  if (supportPages.length > 0) {
    modules.push({
      id: 'support',
      ...moduleHead('/admin/settings/support'),
      pages: supportPages,
    })
  }

  if (isProductEnabled(flags, 'helpCenter')) {
    modules.push({
      id: 'helpCenter',
      ...moduleHead('/admin/settings/help-center'),
      pages: [modulePage('/admin/settings/help-center')],
    })
  }

  if (isProductEnabled(flags, 'changelog')) {
    modules.push({
      id: 'changelog',
      ...moduleHead('/admin/settings/changelog'),
      pages: [modulePage('/admin/settings/changelog')],
    })
  }

  if (isProductEnabled(flags, 'status')) {
    modules.push({
      id: 'status',
      ...moduleHead('/admin/settings/status'),
      pages: [modulePage('/admin/settings/status')],
    })
  }

  return modules
}

/**
 * The modules as a viewer with these permissions sees them: a page whose route
 * would answer Access denied is left out, and a module left with no pages goes
 * with it.
 */
export function settingsModulesFor(
  modules: SettingsModule[],
  permissions: ReadonlySet<PermissionKey>
): SettingsModule[] {
  return modules
    .map((module) => ({
      ...module,
      pages: module.pages.filter((page) => permissions.has(page.permission)),
    }))
    .filter((module) => module.pages.length > 0)
}

/** The page a module opens on: its first, or undefined when it has none. */
export function settingsModuleLandingPath(module: SettingsModule): string | undefined {
  return module.pages[0]?.to
}

/**
 * Where a module's hub URL goes: the first page of the module the viewer can
 * open, or the settings root when the module is off or has none for them.
 */
export function settingsModuleRedirectPath(
  id: string,
  flags: Partial<FeatureFlags> | undefined,
  permissions: ReadonlySet<PermissionKey>
): string {
  if (!isProductEnabled(flags, id as Parameters<typeof isProductEnabled>[1])) {
    return '/admin/settings'
  }
  const module = settingsModulesFor(buildSettingsModules(flags), permissions).find(
    (item) => item.id === id
  )
  return (module && settingsModuleLandingPath(module)) ?? '/admin/settings'
}

export function settingsModuleForPath(
  pathname: string,
  modules: SettingsModule[]
): SettingsModule | undefined {
  return modules.find((module) => module.pages.some((page) => pathIsUnder(pathname, page.to)))
}
