/**
 * A pause whose reaction runs only after the entity already left the paused
 * state: a backlog longer than the snooze, or the wake's own reaction ran
 * first. Pausing now would leave the clock paused on an entity that is not;
 * dropping the pause would count the paused span against the clock. Instead
 * the span from the pause to the recorded wake is excluded in one write, as a
 * pause and then a resume would have done in order.
 *
 * The wake is read from the durable record: the first status change out of the
 * paused state in the events log, or, for a conversation, the first customer
 * message, which wakes a snooze without a status event. The exclusion is
 * logged as a `paused` and a `resumed` clock event in the same transaction as
 * the stamp write. The pause's start is recorded on the stamp
 * (`excludedPauses`, which a resume appends to as well), so a retry or a
 * replay of the pause never excludes the span twice.
 */
import { db, and, asc, eq, gt, sql, conversationMessages, events, slaEvents } from '@/lib/server/db'
import type { ConversationId, TicketId } from '@quackback/ids'
import {
  commitStamp,
  loadSlaApplied,
  predatesApplication,
  shiftIso,
  type SlaApplied,
  type StampContentGuard,
} from './sla.service'
import {
  commitTicketStamp,
  loadTicketSlaApplied,
  type TicketSlaApplied,
  type TicketStampContentGuard,
} from './ticket-sla.service'

/** When the entity first left `pausedStatus` after `from`, per the events log. */
async function statusLeftAfter(
  entityType: 'conversation' | 'ticket',
  entityId: string,
  pausedStatus: 'snoozed' | 'pending',
  from: Date
): Promise<Date | null> {
  const [row] = await db
    .select({ at: events.occurredAt })
    .from(events)
    .where(
      and(
        eq(events.entityType, entityType),
        eq(events.entityId, entityId),
        eq(events.type, `${entityType}.status_changed`),
        gt(events.occurredAt, from),
        sql`${events.payload} ->> 'previousStatus' = ${pausedStatus}`
      )
    )
    .orderBy(asc(events.occurredAt))
    .limit(1)
  return row?.at ?? null
}

async function firstCustomerMessageAfter(
  conversationId: ConversationId,
  from: Date
): Promise<Date | null> {
  const [row] = await db
    .select({ at: conversationMessages.createdAt })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.conversationId, conversationId),
        eq(conversationMessages.senderType, 'visitor'),
        eq(conversationMessages.isInternal, false),
        gt(conversationMessages.createdAt, from)
      )
    )
    .orderBy(asc(conversationMessages.createdAt))
    .limit(1)
  return row?.at ?? null
}

/** When the snooze that began at `from` ended, or null when no wake is recorded. */
export async function snoozeEndedAt(
  conversationId: ConversationId,
  from: Date
): Promise<Date | null> {
  const [status, message] = await Promise.all([
    statusLeftAfter('conversation', conversationId, 'snoozed', from),
    firstCustomerMessageAfter(conversationId, from),
  ])
  if (status && message) return status < message ? status : message
  return status ?? message
}

/** When the pending span that began at `from` ended, or null when none is recorded. */
export function pendingEndedAt(ticketId: TicketId, from: Date): Promise<Date | null> {
  return statusLeftAfter('ticket', ticketId, 'pending', from)
}

/**
 * Whether the span that began at `from` is already accounted for: excluded
 * by a resume or an earlier run (listed on the stamp), or inside the pause the
 * stamp holds now.
 */
function accountedFor(
  applied: { pausedAt?: string | null; excludedPauses?: string[] },
  from: Date
): boolean {
  if (applied.excludedPauses?.includes(from.toISOString())) return true
  return Boolean(applied.pausedAt) && new Date(applied.pausedAt!).getTime() <= from.getTime()
}

/** Exclude the conversation's snoozed span [from, until] from its unsettled clocks. */
export async function excludeSnoozedSpan(
  conversationId: ConversationId,
  from: Date,
  until: Date
): Promise<void> {
  const applied = await loadSlaApplied(conversationId)
  if (!applied || applied.pauseOnSnooze === false || accountedFor(applied, from)) return
  if (predatesApplication(from, applied, { conversation_id: conversationId })) return

  const shiftMs = Math.max(0, until.getTime() - from.getTime())
  const patch: Partial<SlaApplied> = {
    excludedPauses: [...(applied.excludedPauses ?? []), from.toISOString()],
  }
  const content: Required<StampContentGuard> = { pinnedFields: {}, unsetFields: [] }
  if (applied.firstResponseDueAt && !applied.firstResponseAt) {
    patch.firstResponseDueAt = shiftIso(applied.firstResponseDueAt, shiftMs)
    content.pinnedFields.firstResponseDueAt = applied.firstResponseDueAt
    content.unsetFields.push('firstResponseAt')
  }
  // A cycle opened after the snooze ended never ran during it.
  const cycleRan =
    !applied.nextResponseCycleAt ||
    new Date(applied.nextResponseCycleAt).getTime() < until.getTime()
  if (applied.nextResponseDueAt && !applied.nextResponseAt && cycleRan) {
    patch.nextResponseDueAt = shiftIso(applied.nextResponseDueAt, shiftMs)
    content.pinnedFields.nextResponseDueAt = applied.nextResponseDueAt
    content.unsetFields.push('nextResponseAt')
  }
  if (applied.timeToCloseDueAt && !applied.resolvedAt) {
    patch.timeToCloseDueAt = shiftIso(applied.timeToCloseDueAt, shiftMs)
    content.pinnedFields.timeToCloseDueAt = applied.timeToCloseDueAt
    content.unsetFields.push('resolvedAt')
  }

  await db.transaction(async (tx) => {
    const guard = { appliedAt: applied.appliedAt, pausedAt: applied.pausedAt ?? null }
    if (!(await commitStamp(conversationId, patch, until, guard, content, tx))) return
    await tx.insert(slaEvents).values([
      {
        conversationId,
        policyId: applied.policyId,
        kind: 'paused',
        meta: { at: from.toISOString() },
      },
      {
        conversationId,
        policyId: applied.policyId,
        kind: 'resumed',
        meta: { pausedForSecs: Math.round(shiftMs / 1000), at: until.toISOString() },
      },
    ])
  })
}

/** Exclude the ticket's pending span [from, until] from its unsettled time-to-resolve clock. */
export async function excludePendingSpan(
  ticketId: TicketId,
  from: Date,
  until: Date
): Promise<void> {
  const applied = await loadTicketSlaApplied(ticketId)
  if (!applied || applied.pauseOnPending === false || accountedFor(applied, from)) return
  if (predatesApplication(from, applied, { ticket_id: ticketId })) return

  const shiftMs = Math.max(0, until.getTime() - from.getTime())
  const patch: Partial<TicketSlaApplied> = {
    excludedPauses: [...(applied.excludedPauses ?? []), from.toISOString()],
  }
  const content: TicketStampContentGuard = {}
  if (applied.timeToResolveDueAt && !applied.resolvedAt) {
    patch.timeToResolveDueAt = shiftIso(applied.timeToResolveDueAt, shiftMs)
    content.pinnedFields = { timeToResolveDueAt: applied.timeToResolveDueAt }
    content.unsetFields = ['resolvedAt']
  }

  await db.transaction(async (tx) => {
    const guard = { appliedAt: applied.appliedAt, pausedAt: applied.pausedAt ?? null }
    if (!(await commitTicketStamp(ticketId, patch, until, guard, content, tx))) return
    await tx.insert(slaEvents).values([
      {
        ticketId,
        conversationId: null,
        policyId: applied.policyId,
        kind: 'paused',
        meta: { at: from.toISOString() },
      },
      {
        ticketId,
        conversationId: null,
        policyId: applied.policyId,
        kind: 'resumed',
        meta: { pausedForSecs: Math.round(shiftMs / 1000), at: until.toISOString() },
      },
    ])
  })
}
