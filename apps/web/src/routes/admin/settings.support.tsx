import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  buildSettingsModules,
  settingsModuleLandingPath,
} from '@/components/admin/settings/settings-modules'
import { isProductEnabled } from '@/lib/shared/types/settings'

/** The module has no page of its own: it opens on its first page. */
export const Route = createFileRoute('/admin/settings/support')({
  beforeLoad: ({ context }) => {
    const flags = context.settings?.featureFlags
    const module = buildSettingsModules(flags).find((item) => item.id === 'support')
    if (!module || !isProductEnabled(flags, 'support')) {
      throw redirect({ to: '/admin/settings/general' })
    }
    throw redirect({ to: settingsModuleLandingPath(module) as '/admin/settings/boards' })
  },
})
