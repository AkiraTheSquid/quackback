/**
 * Delta fork: importance ratings on votes.
 *
 * Rating a post IS voting on it: setting a rating upserts the viewer's vote
 * (bumping vote_count and auto-subscribing exactly like voteOnPost does on a
 * fresh vote), and clearing the rating keeps the vote. Removing the vote via
 * voteOnPost deletes the row, so the rating goes with it.
 */

import { db, posts, votes, postSubscriptions, boards, principal, sql } from '@/lib/server/db'
import { createId, toUuid, type PostId, type PrincipalId } from '@quackback/ids'
import { getExecuteRows } from '@/lib/server/utils'
import { NotFoundError } from '@/lib/shared/errors'
import type { ImportanceLevel, ImportanceSummary } from '@/lib/shared/importance'

export interface SetImportanceResult {
  voted: boolean
  voteCount: number
  /** True when this call created the vote (it did not exist before) */
  newlyVoted: boolean
  importance: ImportanceSummary
}

/**
 * Rating summary for a post. `principalId` (nullable) selects the viewer's
 * own rating; pass null for a signed-out viewer.
 */
export async function getImportanceSummary(
  postId: PostId,
  principalId: PrincipalId | null
): Promise<ImportanceSummary> {
  const postUuid = toUuid(postId)
  const principalUuid = principalId ? toUuid(principalId) : null

  const result = await db.execute<{
    rating_count: number
    average: number | null
    mine: number | null
  }>(sql`
    SELECT
      COUNT(importance)::int AS rating_count,
      AVG(importance)::float8 AS average,
      MAX(importance) FILTER (WHERE principal_id = ${principalUuid}::uuid) AS mine
    FROM ${votes}
    WHERE post_id = ${postUuid}::uuid
  `)
  const row = getExecuteRows<{ rating_count: number; average: number | null; mine: number | null }>(
    result
  )[0]

  return {
    ratingCount: Number(row?.rating_count ?? 0),
    average: row?.average == null ? null : Number(row.average),
    mine: row?.mine == null ? null : (Number(row.mine) as ImportanceLevel),
  }
}

/**
 * Set (1-5) or clear (null) the viewer's importance rating on a post.
 *
 * Setting a rating without an existing vote casts the vote in the same
 * statement. Clearing only nulls the rating on an existing vote — it never
 * creates or removes a vote.
 */
export async function setVoteImportance(
  postId: PostId,
  principalId: PrincipalId,
  importance: ImportanceLevel | null
): Promise<SetImportanceResult> {
  const postUuid = toUuid(postId)
  const principalUuid = toUuid(principalId)

  type Row = {
    post_exists: boolean
    board_exists: boolean
    has_vote: boolean
    newly_voted: boolean
    vote_count: number
  }

  let row: Row | undefined

  if (importance === null) {
    const result = await db.execute<Row>(sql`
      WITH post_check AS (
        SELECT id, vote_count FROM ${posts}
        WHERE id = ${postUuid}::uuid AND deleted_at IS NULL
      ),
      cleared AS (
        UPDATE ${votes} SET importance = NULL, updated_at = NOW()
        WHERE post_id = ${postUuid}::uuid AND principal_id = ${principalUuid}::uuid
          AND EXISTS (SELECT 1 FROM post_check)
        RETURNING id
      )
      SELECT
        EXISTS(SELECT 1 FROM post_check) AS post_exists,
        true AS board_exists,
        EXISTS(SELECT 1 FROM cleared) AS has_vote,
        false AS newly_voted,
        COALESCE((SELECT vote_count FROM post_check), 0) AS vote_count
    `)
    row = getExecuteRows<Row>(result)[0]
  } else {
    const voteId = toUuid(createId('vote'))
    const subscriptionId = toUuid(createId('post_subscription'))

    // Mirrors voteOnPost's CTE: validate post/board, upsert the vote, bump the
    // count only on a fresh insert, auto-subscribe a fresh non-anonymous voter.
    // `xmax = 0` is true for a row this statement inserted, false for one it
    // updated through ON CONFLICT.
    const result = await db.execute<Row>(sql`
      WITH post_check AS (
        SELECT id, board_id, vote_count FROM ${posts}
        WHERE id = ${postUuid}::uuid AND deleted_at IS NULL
      ),
      board_check AS (
        SELECT 1 FROM ${boards}
        WHERE id = (SELECT board_id FROM post_check)
          AND deleted_at IS NULL
      ),
      upserted AS (
        INSERT INTO ${votes} (id, post_id, principal_id, importance, updated_at)
        SELECT ${voteId}::uuid, ${postUuid}::uuid, ${principalUuid}::uuid, ${importance}::smallint, NOW()
        WHERE EXISTS (SELECT 1 FROM post_check)
          AND EXISTS (SELECT 1 FROM board_check)
        ON CONFLICT (post_id, principal_id)
          DO UPDATE SET importance = EXCLUDED.importance, updated_at = NOW()
        RETURNING (xmax = 0) AS inserted
      ),
      updated_post AS (
        UPDATE ${posts}
        SET vote_count = vote_count + 1
        WHERE id = ${postUuid}::uuid
          AND EXISTS (SELECT 1 FROM upserted WHERE inserted)
        RETURNING vote_count
      ),
      anon_check AS (
        SELECT 1 FROM ${principal} p
        WHERE p.id = ${principalUuid}::uuid AND p.type = 'anonymous'
      ),
      subscribed AS (
        INSERT INTO ${postSubscriptions} (id, post_id, principal_id, reason, notify_comments, notify_status_changes)
        SELECT ${subscriptionId}::uuid, ${postUuid}::uuid, ${principalUuid}::uuid, 'vote', true, true
        WHERE EXISTS (SELECT 1 FROM upserted WHERE inserted)
          AND NOT EXISTS (SELECT 1 FROM anon_check)
        ON CONFLICT (post_id, principal_id) DO NOTHING
        RETURNING 1
      )
      SELECT
        EXISTS(SELECT 1 FROM post_check) AS post_exists,
        EXISTS(SELECT 1 FROM board_check) AS board_exists,
        EXISTS(SELECT 1 FROM upserted) AS has_vote,
        EXISTS(SELECT 1 FROM upserted WHERE inserted) AS newly_voted,
        COALESCE((SELECT vote_count FROM updated_post), (SELECT vote_count FROM post_check), 0) AS vote_count
    `)
    row = getExecuteRows<Row>(result)[0]
  }

  if (!row?.post_exists) {
    throw new NotFoundError('POST_NOT_FOUND', `Post with ID ${postId} not found`)
  }
  if (!row?.board_exists) {
    throw new NotFoundError('BOARD_NOT_FOUND', `Board not found for post ${postId}`)
  }

  // Read after the write commits: CTE siblings share one snapshot, so the
  // summary can't be computed inside the statement above.
  const summary = await getImportanceSummary(postId, principalId)

  return {
    voted: row.has_vote,
    voteCount: Number(row.vote_count ?? 0),
    newlyVoted: row.newly_voted,
    importance: summary,
  }
}
