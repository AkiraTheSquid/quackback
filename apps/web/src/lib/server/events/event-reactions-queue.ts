/**
 * `event-reactions` job handler: run one event's reactions (`event-reactions.ts`).
 *
 * Every reaction that handles the event's type runs, and the handler waits for
 * all of them, so one failure never starves the others. A failure then fails
 * the job, which retries the whole event: the reactions are idempotent against
 * a repeat of the same event, and most already swallow their own errors.
 */
import type { ConversationId, TicketId } from '@quackback/ids'
import { db, events, eq } from '@/lib/server/db'
import { confirmResolutionFromCsat } from '@/lib/server/domains/assistant/assistant.involvement'
import { summarizeConversationOnClose } from '@/lib/server/domains/assistant/conversation-summary.service'
import { summarizeTicketOnClose } from '@/lib/server/domains/assistant/ticket-summary.service'
import { recordSlaFromEvent } from '@/lib/server/domains/sla/sla.event-hooks'
import { autoReopenPairTicketFromEvent } from '@/lib/server/domains/tickets/ticket.event-hooks'
import type { ClaimedJob } from '@/lib/server/jobs/job-queue'
import { logger } from '@/lib/server/logger'
import { EVENT_REACTION_TYPES, type EventReactionName } from './event-reactions'
import { hydrateEvent } from './outbox'
import { toLegacyEvent } from './to-legacy-event'
import type { EventData } from './types'

const log = logger.child({ component: 'event-reactions' })

const RUN: Record<EventReactionName, (event: EventData) => Promise<void> | undefined> = {
  sla: (event) => recordSlaFromEvent(event),
  'pair-ticket-reopen': (event) => autoReopenPairTicketFromEvent(event),
  'assistant-csat-confirm': (event) => {
    if (event.type !== 'conversation.csat_submitted') return undefined
    return confirmResolutionFromCsat(
      event.data.conversation.id as ConversationId,
      event.data.rating
    )
  },
  'conversation-summary': (event) => {
    if (event.type !== 'conversation.status_changed' || event.data.newStatus !== 'closed') {
      return undefined
    }
    return summarizeConversationOnClose(event.data.conversation.id as ConversationId)
  },
  // Ticket status is a category ('open' | 'pending' | 'closed').
  'ticket-summary': (event) => {
    if (event.type !== 'ticket.status_changed' || event.data.newStatus !== 'closed') {
      return undefined
    }
    return summarizeTicketOnClose(event.data.ticket.id as TicketId)
  },
}

const REACTION_NAMES = Object.keys(EVENT_REACTION_TYPES) as EventReactionName[]

export async function runEventReactions(job: ClaimedJob): Promise<void> {
  const eventId = typeof job.payload.eventId === 'string' ? job.payload.eventId : null
  if (!eventId) {
    log.error({ job_id: job.jobId }, 'event-reactions payload has no eventId, skipping')
    return
  }

  const [row] = await db.select().from(events).where(eq(events.eventId, eventId)).limit(1)
  if (!row) {
    log.warn({ event_id: eventId }, 'event-reactions: event row gone, skipping')
    return
  }

  const event = toLegacyEvent(hydrateEvent(row))
  const matching = REACTION_NAMES.filter((name) =>
    (EVENT_REACTION_TYPES[name] as readonly string[]).includes(event.type)
  )
  const results = await Promise.allSettled(
    matching.map((name) => Promise.resolve().then(() => RUN[name](event)))
  )

  const failures = results.flatMap((result, i) =>
    result.status === 'rejected' ? [{ reaction: matching[i], err: result.reason }] : []
  )
  for (const { reaction, err } of failures) {
    log.error({ err, event_type: event.type, event_id: eventId, reaction }, 'event reaction failed')
  }
  if (failures.length > 0) throw failures[0].err
}
