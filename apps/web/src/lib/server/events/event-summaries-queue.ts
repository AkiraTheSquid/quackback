/**
 * `event-summaries` job handler: the conversation and ticket close summaries
 * (see `event-reactions.ts`). Slow AI calls that do not depend on order, so
 * they run concurrently, off the serial `event-reactions` queue.
 */
import type { ConversationId, TicketId } from '@quackback/ids'
import { summarizeConversationOnClose } from '@/lib/server/domains/assistant/conversation-summary.service'
import { summarizeTicketOnClose } from '@/lib/server/domains/assistant/ticket-summary.service'
import type { ClaimedJob } from '@/lib/server/jobs/job-queue'
import { EVENT_SUMMARIES_QUEUE, runReactionJob } from './event-reactions'

export function runEventSummaries(job: ClaimedJob): Promise<void> {
  return runReactionJob(EVENT_SUMMARIES_QUEUE, job, {
    'conversation-summary': (event, signal) => {
      if (event.type !== 'conversation.status_changed' || event.data.newStatus !== 'closed') {
        return undefined
      }
      return summarizeConversationOnClose(event.data.conversation.id as ConversationId, {
        signal,
      })
    },
    // Ticket status is a category ('open' | 'pending' | 'closed').
    'ticket-summary': (event, signal) => {
      if (event.type !== 'ticket.status_changed' || event.data.newStatus !== 'closed') {
        return undefined
      }
      return summarizeTicketOnClose(event.data.ticket.id as TicketId, { signal })
    },
  })
}
