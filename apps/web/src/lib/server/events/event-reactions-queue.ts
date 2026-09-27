/**
 * `event-reactions` job handler: one event's order-dependent reactions (SLA
 * clocks, pair-ticket reopen, CSAT confirm; see `event-reactions.ts`). The
 * queue runs one job at a time, so these apply in event order.
 */
import type { ConversationId } from '@quackback/ids'
import { confirmResolutionFromCsat } from '@/lib/server/domains/assistant/assistant.involvement'
import { recordSlaFromEvent } from '@/lib/server/domains/sla/sla.event-hooks'
import { autoReopenPairTicketFromEvent } from '@/lib/server/domains/tickets/ticket.event-hooks'
import type { ClaimedJob } from '@/lib/server/jobs/job-queue'
import { EVENT_REACTIONS_QUEUE, runReactionJob } from './event-reactions'

export function runEventReactions(job: ClaimedJob): Promise<void> {
  return runReactionJob(EVENT_REACTIONS_QUEUE, job, {
    sla: (event) => recordSlaFromEvent(event),
    'pair-ticket-reopen': (event) => autoReopenPairTicketFromEvent(event),
    'assistant-csat-confirm': (event) => {
      if (event.type !== 'conversation.csat_submitted') return undefined
      return confirmResolutionFromCsat(
        event.data.conversation.id as ConversationId,
        event.data.rating
      )
    },
  })
}
