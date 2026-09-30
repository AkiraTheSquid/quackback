import type { ComponentType } from 'react'
import { SETTINGS_PAGES, type SettingsPagePath } from './settings-pages'
import { SETTINGS_PAGE_ICONS } from './settings-page-icons'
import { isProductEnabled, type FeatureFlags } from '@/lib/shared/types'

export interface SettingsModulePage {
  label: string
  to: string
  icon: ComponentType<{ className?: string }>
}

export interface SettingsModule {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  pages: SettingsModulePage[]
}

/** A module page whose label and icon come from the page registry. */
function modulePage(to: SettingsPagePath): SettingsModulePage {
  const { label } = SETTINGS_PAGES[to]
  return { label, to, icon: SETTINGS_PAGE_ICONS[to] }
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

/** The page a module opens on: its first. */
export function settingsModuleLandingPath(module: SettingsModule): string {
  return module.pages[0]!.to
}

export function settingsModuleForPath(
  pathname: string,
  modules: SettingsModule[]
): SettingsModule | undefined {
  return modules.find((module) => module.pages.some((page) => pathIsUnder(pathname, page.to)))
}
