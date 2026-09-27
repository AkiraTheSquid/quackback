/**
 * Event reactions: side effects a domain event gets from durable jobs, off the
 * hook queue and apart from outbound delivery.
 *
 * `emit()` queues one job per reaction queue the event's type needs, in the
 * event's transaction, so the jobs commit with the event on both production
 * paths (native `emit()` producers and the legacy `dispatch*()` bridge).
 * Nothing gates them on the event-dispatch drain: a failing target resolver,
 * a slow retry or a worker crash after the event is published cannot delay or
 * lose a reaction.
 *
 * Two queues, split by what the reactions need:
 *
 * - `event-reactions` holds the reactions that read state the previous event
 *   left (the SLA recorders above all: a visitor message re-arms the clock the
 *   agent's reply settles). It runs one job at a time in enqueue order, so they
 *   apply in event order. Its handler is `event-reactions-queue.ts`.
 * - `event-summaries` holds the close summaries: slow AI calls that do not
 *   depend on order, kept off the serial queue so a slow provider cannot hold
 *   up an SLA clock. Its handler is `event-summaries-queue.ts`.
 *
 * This module is the table `emit()` reads, kept free of the reactions' own
 * imports, plus the job runner both handlers share.
 */
import { db, events, eq } from '@/lib/server/db'
import type { ClaimedJob } from '@/lib/server/jobs/job-queue'
import { logger } from '@/lib/server/logger'
import { hydrateEvent } from './outbox'
import { toLegacyEvent } from './to-legacy-event'
import type { EventData } from './types'

const log = logger.child({ component: 'event-reactions' })

export const EVENT_REACTIONS_QUEUE = 'event-reactions'
export const EVENT_SUMMARIES_QUEUE = 'event-summaries'

/** Each queue's reactions, and the event types each reaction handles. */
export const EVENT_REACTIONS = {
  [EVENT_REACTIONS_QUEUE]: {
    // Settle, pause and resume SLA breach clocks (conversation and ticket).
    sla: ['message.created', 'conversation.status_changed', 'ticket.status_changed'],
    // A visitor message on a conversation paired with a customer ticket
    // reopens that ticket.
    'pair-ticket-reopen': ['message.created'],
    // Confirm the assistant's resolution off a positive first CSAT rating.
    'assistant-csat-confirm': ['conversation.csat_submitted'],
  },
  [EVENT_SUMMARIES_QUEUE]: {
    // Summarize a closed conversation for future assistant grounding.
    'conversation-summary': ['conversation.status_changed'],
    // Summarize a closed ticket for future assistant grounding.
    'ticket-summary': ['ticket.status_changed'],
  },
} as const satisfies Record<string, Record<string, readonly EventData['type'][]>>

export type ReactionQueue = keyof typeof EVENT_REACTIONS
export type ReactionName<Q extends ReactionQueue> = keyof (typeof EVENT_REACTIONS)[Q] & string
export type ReactionRun = (event: EventData) => Promise<void> | undefined

const QUEUES = Object.keys(EVENT_REACTIONS) as ReactionQueue[]

/** The reactions on `queue` that handle an event of `type`. */
function reactionsFor<Q extends ReactionQueue>(queue: Q, type: string): ReactionName<Q>[] {
  const table = EVENT_REACTIONS[queue] as Record<ReactionName<Q>, readonly string[]>
  return (Object.keys(table) as ReactionName<Q>[]).filter((name) => table[name].includes(type))
}

/** The reaction queues `emit()` must queue a job on for an event of this type. */
export function reactionQueuesFor(type: string): ReactionQueue[] {
  return QUEUES.filter((queue) => reactionsFor(queue, type).length > 0)
}

/**
 * Run one reaction job: every reaction on its queue that handles the event,
 * waiting for all of them so one failure never starves the others. A failure
 * then fails the job, which retries the event's reactions on that queue: they
 * are idempotent against a repeat of the same event, and most already swallow
 * their own errors.
 */
export async function runReactionJob<Q extends ReactionQueue>(
  queue: Q,
  job: ClaimedJob,
  runs: Record<ReactionName<Q>, ReactionRun>
): Promise<void> {
  const eventId = typeof job.payload.eventId === 'string' ? job.payload.eventId : null
  if (!eventId) {
    log.error({ job_id: job.jobId, queue }, 'reaction job payload has no eventId, skipping')
    return
  }

  const [row] = await db.select().from(events).where(eq(events.eventId, eventId)).limit(1)
  if (!row) {
    log.warn({ event_id: eventId, queue }, 'reaction job: event row gone, skipping')
    return
  }

  const event = toLegacyEvent(hydrateEvent(row))
  const matching = reactionsFor(queue, event.type)
  const results = await Promise.allSettled(
    matching.map((name) => Promise.resolve().then(() => runs[name](event)))
  )

  const failures = results.flatMap((result, i) =>
    result.status === 'rejected' ? [{ reaction: matching[i], err: result.reason }] : []
  )
  for (const { reaction, err } of failures) {
    log.error({ err, event_type: event.type, event_id: eventId, reaction }, 'event reaction failed')
  }
  if (failures.length > 0) throw failures[0].err
}
