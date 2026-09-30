import { createFileRoute, redirect } from '@tanstack/react-router'
import { settingsModuleRedirectPath } from '@/components/admin/settings/settings-modules'

/** The module has no page of its own: it opens on the first page the viewer can open. */
export const Route = createFileRoute('/admin/settings/feedback')({
  beforeLoad: ({ context }) => {
    const to = settingsModuleRedirectPath(
      'feedback',
      context.settings?.featureFlags,
      new Set(context.permissions ?? [])
    )
    throw redirect({ to: to as '/admin/settings/boards' })
  },
})
