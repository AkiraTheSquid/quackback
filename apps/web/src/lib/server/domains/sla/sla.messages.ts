/**
 * What a conversation's own messages say about its response clocks.
 *
 * The SLA reaction runs from a queued job per event, and those jobs can run
 * late or out of order (see events/event-reactions.ts). The message rows never
 * reorder, so the clocks read them rather than trusting the order the jobs
 * arrive in.
 *
 * The split is the one recordSlaFromEvent makes on the event: a human reply is
 * a public agent message from anyone but a service principal (the assistant,
 * API keys and workflow blocks never satisfy a response clock), and every
 * other public message opens a next-response cycle: a visitor's, or a service
 * principal's. Internal notes and system notices are neither.
 */
import {
  db,
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  lt,
  or,
  sql,
  conversationMessages,
  principal,
} from '@/lib/server/db'
import type { SQL } from 'drizzle-orm'
import type { ConversationId } from '@quackback/ids'

const humanReply = and(
  eq(conversationMessages.senderType, 'agent'),
  sql`${principal.type} IS DISTINCT FROM 'service'`
)

const cycleOpener = or(
  eq(conversationMessages.senderType, 'visitor'),
  and(eq(conversationMessages.senderType, 'agent'), eq(principal.type, 'service'))
)

async function messageTime(
  conversationId: ConversationId,
  where: (SQL | undefined)[],
  order: 'earliest' | 'latest'
): Promise<Date | null> {
  const [row] = await db
    .select({ createdAt: conversationMessages.createdAt })
    .from(conversationMessages)
    .leftJoin(principal, eq(principal.id, conversationMessages.principalId))
    .where(
      and(
        eq(conversationMessages.conversationId, conversationId),
        eq(conversationMessages.isInternal, false),
        ...where
      )
    )
    .orderBy(
      order === 'earliest'
        ? asc(conversationMessages.createdAt)
        : desc(conversationMessages.createdAt)
    )
    .limit(1)
  return row?.createdAt ?? null
}

/** When the first human reply written after `after` was written, or null when there is none yet. */
export function earliestHumanReplyAfter(
  conversationId: ConversationId,
  after: Date
): Promise<Date | null> {
  return messageTime(
    conversationId,
    [humanReply, gt(conversationMessages.createdAt, after)],
    'earliest'
  )
}

/**
 * When the last message that opens a next-response cycle was written, from
 * `from` up to but not including `before`, or null when there is none.
 */
export function latestCycleOpenerBetween(
  conversationId: ConversationId,
  from: Date,
  before: Date
): Promise<Date | null> {
  return messageTime(
    conversationId,
    [
      cycleOpener,
      gte(conversationMessages.createdAt, from),
      lt(conversationMessages.createdAt, before),
    ],
    'latest'
  )
}
