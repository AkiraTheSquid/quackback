import { createFileRoute, redirect } from '@tanstack/react-router'

/** Retired page: the workspace has one visual theme. Kept so old links land on General. */
export const Route = createFileRoute('/admin/settings/labs')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/settings/general', replace: true })
  },
})
