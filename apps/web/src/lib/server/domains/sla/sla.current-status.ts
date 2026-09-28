/**
 * An entity's status as it stands when an SLA reaction runs. The reactions run
 * from queued jobs that can run late, or be retried after later status
 * changes, so a pause or resume checks the status now rather than trusting the
 * event alone (see recordSlaFromEvent). Null when the entity is gone, which
 * leaves the event to decide: a missing entity has no stamp to move anyway.
 */
import { db, eq, conversations, tickets, ticketStatuses } from '@/lib/server/db'
import type { ConversationId, TicketId } from '@quackback/ids'

/** The conversation's status now. */
export async function currentConversationStatus(
  conversationId: ConversationId
): Promise<string | null> {
  const [row] = await db
    .select({ status: conversations.status })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)
  return row?.status ?? null
}

/** The category ('open' | 'pending' | 'closed') of the ticket's status now. */
export async function currentTicketStatusCategory(ticketId: TicketId): Promise<string | null> {
  const [row] = await db
    .select({ category: ticketStatuses.category })
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .where(eq(tickets.id, ticketId))
    .limit(1)
  return row?.category ?? null
}
