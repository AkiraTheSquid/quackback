import { createFileRoute, redirect } from '@tanstack/react-router'

// The moderation queue lives in the Feedback area; this path keeps old links working.
export const Route = createFileRoute('/admin/moderation')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/feedback/moderation' })
  },
})
