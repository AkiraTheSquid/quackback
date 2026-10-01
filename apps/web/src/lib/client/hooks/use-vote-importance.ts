/**
 * Delta fork: set / clear the viewer's importance rating on a post.
 *
 * Rating casts a vote when the viewer hasn't voted yet, so on success this
 * syncs the same caches the vote buttons read: the per-post vote count and
 * the voted-post sets (portal and widget). Post-detail queries are
 * invalidated so a later visit re-reads the summary from the server.
 */

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getImportanceSummariesFn, setVoteImportanceFn } from '@/lib/server/functions/public-posts'
import { voteCountKeys } from './use-post-vote'
import { votedPostsKeys } from './use-portal-posts-query'
import { widgetQueryKeys } from './use-widget-vote'
import {
  EMPTY_IMPORTANCE_SUMMARY,
  type ImportanceLevel,
  type ImportanceSummary,
  type ImportanceSummaryMap,
} from '@/lib/shared/importance'
import type { PostId } from '@quackback/ids'

export const importanceKeys = {
  all: ['importance'] as const,
  batches: ['importance', 'batch'] as const,
  batch: (viewer: string | number, postIds: string[]) =>
    ['importance', 'batch', viewer, postIds.join(',')] as const,
}

interface UseImportanceSummariesOptions {
  postIds: string[]
  /** Changes when the viewer's identity changes (refetches `mine`) */
  viewer: string | number
  getAuthHeaders?: () => Record<string, string>
  enabled?: boolean
}

const BATCH_LIMIT = 100

/**
 * Rating summaries for every post in a list. One request per 100 posts.
 * Keeps the previous map while a longer page set loads so rows don't blank
 * out, but never across a viewer change: the old map's `mine` belongs to the
 * previous viewer.
 */
export function useImportanceSummaries({
  postIds,
  viewer,
  getAuthHeaders,
  enabled = true,
}: UseImportanceSummariesOptions): ImportanceSummaryMap | undefined {
  // Sorted: the map ignores order, so one id set = one cache entry.
  const idsKey = [...new Set(postIds)].sort().join(',')
  const ids = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey])
  const { data } = useQuery({
    queryKey: importanceKeys.batch(viewer, ids),
    queryFn: async () => {
      const headers = getAuthHeaders?.()
      const chunks: string[][] = []
      for (let i = 0; i < ids.length; i += BATCH_LIMIT) chunks.push(ids.slice(i, i + BATCH_LIMIT))
      const maps = await Promise.all(
        chunks.map(
          (chunk) =>
            getImportanceSummariesFn({
              data: { postIds: chunk },
              ...(headers ? { headers } : {}),
            }) as Promise<ImportanceSummaryMap>
        )
      )
      return Object.assign({}, ...maps) as ImportanceSummaryMap
    },
    enabled: enabled && ids.length > 0,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === viewer ? previous : undefined,
    staleTime: 60 * 1000,
  })
  return data
}

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
  const [summary, setSummary] = useState<ImportanceSummary>(initial ?? EMPTY_IMPORTANCE_SUMMARY)

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
      // Patch the list summaries on screen (they belong to this viewer) for an
      // instant update, then invalidate every batch: that cancels a read that
      // started before this write (it would overwrite the patch) and refetches
      // the active lists; lists cached for other viewers are just marked stale.
      queryClient.setQueriesData<ImportanceSummaryMap>(
        { queryKey: importanceKeys.batches, type: 'active' },
        (old) => (old && postId in old ? { ...old, [postId]: result.importance } : old)
      )
      queryClient.invalidateQueries({ queryKey: importanceKeys.batches })
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
