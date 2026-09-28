/**
 * An entity's paused spans, rebuilt from its history: a conversation is paused
 * while snoozed, a ticket while its status is in the pending category.
 *
 * The SLA pause and resume reactions run from queued jobs that can run late,
 * out of order or twice, so they never trust the order their events arrive in.
 * They rebuild the spans from the durable record each time (see
 * sla.pause-reconcile.ts): the entity's status changes in the events log,
 * where a span starts when the status enters the paused state and ends when it
 * leaves it (a move within it, such as between two pending statuses or a
 * snooze extended, is neither), and, for a conversation, its customer
 * messages, each of which wakes a snooze without a status event.
 */
import { db, and, asc, eq, events, conversationMessages } from '@/lib/server/db'
import type { ConversationId, TicketId } from '@quackback/ids'

/** A paused span; `until` is null while the entity is still paused. */
export interface PausedSpan {
  from: Date
  until: Date | null
}

interface Transition {
  at: Date
  kind: 'enter' | 'leave'
}

/** Moves into and out of `pausedStatus`, from the entity's status-change events. */
async function statusTransitions(
  entityType: 'conversation' | 'ticket',
  entityId: string,
  pausedStatus: 'snoozed' | 'pending'
): Promise<Transition[]> {
  const rows = await db
    .select({ at: events.occurredAt, payload: events.payload })
    .from(events)
    .where(
      and(
        eq(events.entityType, entityType),
        eq(events.entityId, entityId),
        eq(events.type, `${entityType}.status_changed`)
      )
    )
    .orderBy(asc(events.occurredAt), asc(events.id))
  return rows.flatMap<Transition>(({ at, payload }) => {
    const { previousStatus, newStatus } = payload as { previousStatus?: string; newStatus?: string }
    if (previousStatus !== pausedStatus && newStatus === pausedStatus)
      return [{ at, kind: 'enter' }]
    if (previousStatus === pausedStatus && newStatus !== pausedStatus)
      return [{ at, kind: 'leave' }]
    return []
  })
}

/** Each customer message wakes a snoozed conversation. */
async function customerMessageWakes(conversationId: ConversationId): Promise<Transition[]> {
  const rows = await db
    .select({ at: conversationMessages.createdAt })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.conversationId, conversationId),
        eq(conversationMessages.senderType, 'visitor'),
        eq(conversationMessages.isInternal, false)
      )
    )
  return rows.map(({ at }) => ({ at, kind: 'leave' }))
}

/**
 * Walk the transitions in time order into spans, and keep the part of each
 * from `since` on. At the same instant a wake is taken before an entry.
 */
function spansFrom(transitions: Transition[], since: Date): PausedSpan[] {
  const ordered = [...transitions].sort(
    (a, b) => a.at.getTime() - b.at.getTime() || (a.kind === 'leave' ? -1 : 1)
  )
  const spans: PausedSpan[] = []
  let open: Date | null = null
  for (const { at, kind } of ordered) {
    if (kind === 'enter' && !open) open = at
    else if (kind === 'leave' && open) {
      spans.push({ from: open, until: at })
      open = null
    }
  }
  if (open) spans.push({ from: open, until: null })
  return spans
    .filter((span) => span.until === null || span.until.getTime() > since.getTime())
    .map((span) => ({
      from: span.from.getTime() < since.getTime() ? since : span.from,
      until: span.until,
    }))
}

/** The conversation's snoozed spans from `since` on. */
export async function snoozedSpans(
  conversationId: ConversationId,
  since: Date
): Promise<PausedSpan[]> {
  const [status, wakes] = await Promise.all([
    statusTransitions('conversation', conversationId, 'snoozed'),
    customerMessageWakes(conversationId),
  ])
  return spansFrom([...status, ...wakes], since)
}

/** The ticket's pending spans from `since` on. */
export async function pendingSpans(ticketId: TicketId, since: Date): Promise<PausedSpan[]> {
  return spansFrom(await statusTransitions('ticket', ticketId, 'pending'), since)
}

/** A span a stamp has already excluded from its deadlines. */
export interface ExcludedSpan {
  from: string
  until: string
}

/**
 * The pause state a stamp carries: `pausedSpans` lists the spans already
 * excluded from its unsettled deadlines, and `pausedAt` starts the span it
 * holds open (see sla.pause-reconcile.ts).
 */
export interface PauseLedger {
  pausedAt?: string | null
  pausedSpans?: ExcludedSpan[]
}

/** Milliseconds of [from, until) inside [start, end). */
export function overlapMs(from: number, until: number, start: number, end: number): number {
  return Math.max(0, Math.min(until, end) - Math.max(from, start))
}

/**
 * A clock's deadline as it stood at `at`, to judge a settle at `at`: the
 * stored deadline, without the part of any excluded span after `at` (a
 * reaction that runs late can find later spans already excluded), plus the
 * span held open, up to `at`. Only paused time from `clockStart` on counts:
 * the SLA's application for first response and time-to-close, the cycle's
 * opener for next response.
 */
export function dueAsOf(
  dueAt: string,
  ledger: PauseLedger,
  clockStart: Date | null,
  at: Date
): Date {
  const start = clockStart ? clockStart.getTime() : Number.NEGATIVE_INFINITY
  let due = new Date(dueAt).getTime()
  for (const span of ledger.pausedSpans ?? []) {
    due -= overlapMs(
      new Date(span.from).getTime(),
      new Date(span.until).getTime(),
      Math.max(start, at.getTime()),
      Number.POSITIVE_INFINITY
    )
  }
  if (ledger.pausedAt) {
    due += overlapMs(new Date(ledger.pausedAt).getTime(), at.getTime(), start, at.getTime())
  }
  return new Date(due)
}

/**
 * The stored deadline for a clock armed now with an unshifted `base` deadline
 * and starting at `clockStart`: every span the stamp has already excluded,
 * from `clockStart` on, is added, as it would have been had the clock been
 * running when that span was excluded.
 */
export function withExcludedSpans(base: Date, ledger: PauseLedger, clockStart: Date): Date {
  let due = base.getTime()
  for (const span of ledger.pausedSpans ?? []) {
    due += overlapMs(
      new Date(span.from).getTime(),
      new Date(span.until).getTime(),
      clockStart.getTime(),
      Number.POSITIVE_INFINITY
    )
  }
  return new Date(due)
}
