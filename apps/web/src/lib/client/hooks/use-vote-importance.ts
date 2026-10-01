/**
 * Delta fork: set / clear the viewer's importance rating on a post.
 *
 * Rating casts a vote when the viewer hasn't voted yet, so on success this
 * syncs the same caches the vote buttons read: the per-post vote count and
 * the voted-post sets (portal and widget). Post-detail queries are
 * invalidated so a later visit re-reads the summary from the server.
 */

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setVoteImportanceFn } from '@/lib/server/functions/public-posts'
import { voteCountKeys } from './use-post-vote'
import { votedPostsKeys } from './use-portal-posts-query'
import { widgetQueryKeys } from './use-widget-vote'
import type { ImportanceLevel, ImportanceSummary } from '@/lib/shared/importance'
import type { PostId } from '@quackback/ids'

const EMPTY_SUMMARY: ImportanceSummary = { ratingCount: 0, average: null, mine: null }

interface UseVoteImportanceOptions {
  postId: PostId
  /** Server summary from the post-detail payload (re-seeds when it changes) */
  initial?: ImportanceSummary
  /** Widget surfaces pass Bearer headers; portal relies on cookies */
  getAuthHeaders?: () => Record<string, string>
  /** Called after a successful write */
  onRated?: (result: {
    newlyVoted: boolean
    voteCount: number
    importance: ImportanceSummary
  }) => void
}

export function useVoteImportance({
  postId,
  initial,
  getAuthHeaders,
  onRated,
}: UseVoteImportanceOptions) {
  const queryClient = useQueryClient()
  const [summary, setSummary] = useState<ImportanceSummary>(initial ?? EMPTY_SUMMARY)

  // Re-seed when the server payload changes (refetch after identify, etc.)
  useEffect(() => {
    if (initial) setSummary(initial)
  }, [initial])

  const mutation = useMutation({
    mutationFn: (importance: ImportanceLevel | null) =>
      setVoteImportanceFn({
        data: { postId, importance },
        ...(getAuthHeaders ? { headers: getAuthHeaders() } : {}),
      }),
    onMutate: (importance) => {
      const previous = summary
      setSummary((s) => ({ ...s, mine: importance }))
      return { previous }
    },
    onError: (_err, _importance, context) => {
      if (context?.previous) setSummary(context.previous)
    },
    onSuccess: (result) => {
      setSummary(result.importance)
      queryClient.setQueryData<number>(voteCountKeys.byPost(postId), result.voteCount)
      if (result.voted) {
        const addPost = (old: Set<string> | undefined) => {
          const next = new Set(old || [])
          next.add(postId)
          return next
        }
        queryClient.setQueryData<Set<string>>(votedPostsKeys.byWorkspace(), addPost)
        queryClient.setQueriesData<Set<string>>(
          { queryKey: widgetQueryKeys.votedPosts.all },
          addPost
        )
      }
      queryClient.invalidateQueries({ queryKey: ['portal', 'post', postId] })
      queryClient.invalidateQueries({ queryKey: widgetQueryKeys.postDetail.all })
      onRated?.(result)
    },
  })

  return {
    summary,
    isPending: mutation.isPending,
    setImportance: (importance: ImportanceLevel | null) => mutation.mutate(importance),
  }
}
