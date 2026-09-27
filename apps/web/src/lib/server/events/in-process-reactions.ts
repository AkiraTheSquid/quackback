/**
 * In-process reactions: side effects every domain event gets exactly once, off
 * the hook queue. Two callers, one per production path:
 *
 * - `processEvent` (the legacy `dispatch*()` path) runs them at dispatch time,
 *   then writes the outbox row marked `reactionsRan`.
 * - `runEventDispatch` (the outbox drain) runs them for every other row, i.e.
 *   events a producer wrote natively with `emit()`, once the row is published.
 *
 * Each reaction is fire-and-forget and lazy-imported so a slow or failing one
 * never delays or fails the caller: failures are logged and swallowed. The
 * reaction services are themselves best-effort and idempotent against a repeat
 * of the same event.
 */
import type { ConversationId, TicketId } from '@quackback/ids'
import { logger } from '@/lib/server/logger'
import type { EventData } from './types'

const log = logger.child({ component: 'event-reactions' })

interface InProcessReaction {
  name: string
  run: (event: EventData) => Promise<void> | undefined
}

const REACTIONS: InProcessReaction[] = [
  {
    // Settle, pause and resume SLA breach clocks (conversation and ticket).
    name: 'sla',
    run: (event) =>
      import('@/lib/server/domains/sla/sla.event-hooks').then((m) => m.recordSlaFromEvent(event)),
  },
  {
    // A visitor message on a conversation paired with a customer ticket
    // reopens that ticket.
    name: 'pair-ticket-reopen',
    run: (event) =>
      import('@/lib/server/domains/tickets/ticket.event-hooks').then((m) =>
        m.autoReopenPairTicketFromEvent(event)
      ),
  },
  {
    // Confirm the assistant's resolution off a positive first CSAT rating.
    name: 'assistant-csat-confirm',
    run: (event) => {
      if (event.type !== 'conversation.csat_submitted') return undefined
      const conversationId = event.data.conversation.id as ConversationId
      const { rating } = event.data
      return import('@/lib/server/domains/assistant/assistant.involvement').then((m) =>
        m.confirmResolutionFromCsat(conversationId, rating)
      )
    },
  },
  {
    // Summarize a closed conversation for future assistant grounding.
    name: 'conversation-summary',
    run: (event) => {
      if (event.type !== 'conversation.status_changed' || event.data.newStatus !== 'closed') {
        return undefined
      }
      const conversationId = event.data.conversation.id as ConversationId
      return import('@/lib/server/domains/assistant/conversation-summary.service').then((m) =>
        m.summarizeConversationOnClose(conversationId)
      )
    },
  },
  {
    // Summarize a closed ticket for future assistant grounding. Ticket status
    // is a category ('open' | 'pending' | 'closed').
    name: 'ticket-summary',
    run: (event) => {
      if (event.type !== 'ticket.status_changed' || event.data.newStatus !== 'closed') {
        return undefined
      }
      const ticketId = event.data.ticket.id as TicketId
      return import('@/lib/server/domains/assistant/ticket-summary.service').then((m) =>
        m.summarizeTicketOnClose(ticketId)
      )
    },
  },
]

/** Start every reaction for one event. Returns immediately; never throws. */
export function runInProcessReactions(event: EventData): void {
  for (const reaction of REACTIONS) {
    void Promise.resolve()
      .then(() => reaction.run(event))
      .catch((err) =>
        log.error(
          { err, event_type: event.type, event_id: event.id, reaction: reaction.name },
          'in-process event reaction failed'
        )
      )
  }
}
