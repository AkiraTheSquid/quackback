import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  buildSettingsModules,
  settingsModuleLandingPath,
} from '@/components/admin/settings/settings-modules'
import { isProductEnabled } from '@/lib/shared/types/settings'

/** The module has no page of its own: it opens on its first page. */
export const Route = createFileRoute('/admin/settings/feedback')({
  beforeLoad: ({ context }) => {
    const flags = context.settings?.featureFlags
    const module = buildSettingsModules(flags).find((item) => item.id === 'feedback')
    if (!module || !isProductEnabled(flags, 'feedback')) {
      throw redirect({ to: '/admin/settings/general' })
    }
    throw redirect({ to: settingsModuleLandingPath(module) as '/admin/settings/boards' })
  },
})
