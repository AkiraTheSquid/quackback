/**
 * Delta fork: portal post-page wrapper for the importance picker. Mirrors
 * AuthVoteButton's auth/authz handling, since rating casts a vote.
 */

import { useSuspenseQuery } from '@tanstack/react-query'
import { useIntl } from 'react-intl'
import { useAuthPopover } from '@/components/auth/auth-popover-context'
import { useEnsureAnonSession } from '@/lib/client/hooks/use-ensure-anon-session'
import { portalDetailQueries } from '@/lib/client/queries/portal-detail'
import { ImportancePicker } from '@/components/public/importance-picker'
import type { ImportanceSummary } from '@/lib/shared/importance'
import type { PostId } from '@quackback/ids'

interface ImportanceSectionProps {
  postId: PostId
  initial?: ImportanceSummary
  disabled?: boolean
}

export function ImportanceSection({ postId, initial, disabled = false }: ImportanceSectionProps) {
  const intl = useIntl()
  const { openAuthPopover } = useAuthPopover()
  const ensureAnonSession = useEnsureAnonSession()
  const { data: sidebarData } = useSuspenseQuery(portalDetailQueries.voteSidebarData(postId))
  const canVote = sidebarData?.canVote ?? false
  const isAuthenticated = sidebarData?.isMember ?? false

  const denied = !disabled && !canVote
  const needsAuth = denied && !isAuthenticated
  const noAccessReason =
    denied && isAuthenticated
      ? intl.formatMessage({
          id: 'portal.vote.noAccess',
          defaultMessage: "You don't have access to vote on this board",
        })
      : undefined

  return (
    <div className="bg-card border border-border/40 rounded-lg px-4 py-3 sm:px-6 mt-4">
      <ImportancePicker
        postId={postId}
        initial={initial}
        disabled={disabled}
        noAccessReason={noAccessReason}
        onAuthRequired={needsAuth ? () => openAuthPopover({ mode: 'login' }) : undefined}
        onBeforeRate={canVote ? ensureAnonSession : undefined}
      />
    </div>
  )
}
