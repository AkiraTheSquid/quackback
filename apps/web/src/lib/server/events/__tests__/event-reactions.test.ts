/**
 * The event reactions (SLA clocks, pair-ticket reopen, CSAT confirm,
 * conversation and ticket close summaries) run from one durable
 * `event-reactions` job per event, whichever path produced it:
 *
 * - `emit()` queues the job in the event's own transaction, so it exists the
 *   moment the event commits, before and apart from the event-dispatch drain.
 *   A failing target resolver or a crash after publish cannot lose it.
 * - a native `emit()` producer (here the integration status sync) and a legacy
 *   `dispatch*()` producer both get their reactions from that job, and neither
 *   `processEvent` nor the drain runs them a second time.
 *
 * Real DB (rolled back per test), real producers, outbox, drain and job
 * handler (`event-reactions-queue.ts`). Only the five reaction entry points are mocked, so every call below
 * is recorded with the arguments it received.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { createId, type PrincipalId, type TicketId, type TicketStatusId } from '@quackback/ids'
import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import { events, eq, principal, sql, tickets, ticketStatuses } from '@/lib/server/db'
import type { ClaimedJob } from '@/lib/server/jobs/job-queue'
import { getExecuteRows } from '@/lib/server/utils/execute-rows'
import type { EventActor, EventConversationRef, EventData, EventTicketRef } from '../types'

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))

const reactions = vi.hoisted(() => ({
  recordSlaFromEvent: vi.fn(async (_event: unknown) => {}),
  autoReopenPairTicketFromEvent: vi.fn(async (_event: unknown) => {}),
  confirmResolutionFromCsat: vi.fn(async (_conversationId: unknown, _rating: unknown) => {}),
  summarizeConversationOnClose: vi.fn(async (_conversationId: unknown) => {}),
  summarizeTicketOnClose: vi.fn(async (_ticketId: unknown) => {}),
}))

vi.mock('@/lib/server/domains/sla/sla.event-hooks', () => ({
  recordSlaFromEvent: reactions.recordSlaFromEvent,
}))
vi.mock('@/lib/server/domains/tickets/ticket.event-hooks', () => ({
  autoReopenPairTicketFromEvent: reactions.autoReopenPairTicketFromEvent,
}))
vi.mock('@/lib/server/domains/assistant/assistant.involvement', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/server/domains/assistant/assistant.involvement')
  >()),
  confirmResolutionFromCsat: reactions.confirmResolutionFromCsat,
}))
vi.mock('@/lib/server/domains/assistant/conversation-summary.service', () => ({
  summarizeConversationOnClose: reactions.summarizeConversationOnClose,
}))
vi.mock('@/lib/server/domains/assistant/ticket-summary.service', () => ({
  summarizeTicketOnClose: reactions.summarizeTicketOnClose,
}))

import { EVENT_REACTIONS_QUEUE } from '../event-reactions'
import { runEventReactions } from '../event-reactions-queue'
import { runEventDispatch } from '../event-dispatch-queue'
import * as dispatch from '../dispatch'
import { applySyncedTicketStatus } from '@/lib/server/domains/tickets/ticket-status-sync'

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ owner: events.dispatchOwner }).from(events).limit(0)
    await db.select({ id: tickets.id }).from(tickets).limit(0)
  },
})
afterAll(() => fixture.close())

type ReactionName = keyof typeof reactions
const REACTION_NAMES = Object.keys(reactions) as ReactionName[]

const suffix = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

const eventRowsFor = (entityId: string) =>
  testDb.select().from(events).where(eq(events.entityId, entityId)).orderBy(events.id)

/** The reactions jobs `emit()` queued for one event, as the worker would claim them. */
async function reactionJobsFor(eventId: string): Promise<ClaimedJob[]> {
  const result = await testDb.execute(sql`
    SELECT job_id, dedupe_key, payload, max_attempts, run_at FROM job_queue
    WHERE queue = ${EVENT_REACTIONS_QUEUE} AND payload->>'eventId' = ${eventId}
      AND status = 'pending'
  `)
  return getExecuteRows<{
    job_id: string
    dedupe_key: string | null
    payload: Record<string, unknown>
    max_attempts: number
    run_at: string
  }>(result).map((row) => ({
    id: '1',
    jobId: row.job_id,
    queue: EVENT_REACTIONS_QUEUE,
    dedupeKey: row.dedupe_key,
    payload: row.payload,
    workspaceKey: null,
    attempts: 1,
    maxAttempts: row.max_attempts,
    leaseToken: 'test',
    lockedUntil: new Date(),
    runAt: new Date(row.run_at),
  }))
}

/** One event-dispatch run, as the worker would make it. */
function drain(eventId: string, resolve: () => Promise<[]> = async () => []) {
  const job: ClaimedJob = {
    id: '1',
    jobId: createId('job'),
    queue: 'event-dispatch',
    dedupeKey: `event-dispatch:${eventId}`,
    payload: { eventId },
    workspaceKey: null,
    attempts: 1,
    maxAttempts: 10,
    leaseToken: 'test',
    lockedUntil: new Date(),
    runAt: new Date(),
  }
  return runEventDispatch(job, { resolve })
}

/** Long enough for any fire-and-forget straggler to land before counting. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 100))

const eventsSeenBySla = () =>
  reactions.recordSlaFromEvent.mock.calls.map(([event]) => event as EventData)

/** Each reaction in `expected` ran exactly once with its arguments; every other one never ran. */
function expectReacted(
  expected: Partial<Record<ReactionName, (entityId: string) => unknown[]>>,
  entityId: string
) {
  for (const name of REACTION_NAMES) {
    const args = expected[name]
    if (args) {
      expect(reactions[name], name).toHaveBeenCalledTimes(1)
      expect(reactions[name], name).toHaveBeenCalledWith(...args(entityId))
    } else {
      expect(reactions[name], name).not.toHaveBeenCalled()
    }
  }
}

async function seedTicket() {
  const [open, closed] = await testDb
    .insert(ticketStatuses)
    .values([
      { name: `Open ${suffix()}`, slug: `open_${suffix()}`, category: 'open' },
      { name: `Done ${suffix()}`, slug: `done_${suffix()}`, category: 'closed' },
    ])
    .returning()
  const [service] = await testDb
    .insert(principal)
    .values({ type: 'service', role: 'member', displayName: 'Tracker', createdAt: new Date() })
    .returning()
  const [ticket] = await testDb
    .insert(tickets)
    .values({ type: 'customer', title: `Ticket ${suffix()}`, statusId: open.id as TicketStatusId })
    .returning()
  return {
    ticketId: ticket.id as TicketId,
    closedStatusId: closed.id as TicketStatusId,
    principalId: service.id as PrincipalId,
  }
}

/** Close the ticket through the integration inbound sync, a native `emit()` producer. */
async function closeBySync() {
  const { ticketId, closedStatusId, principalId } = await seedTicket()
  await testDb.transaction((tx) =>
    applySyncedTicketStatus(tx, ticketId, closedStatusId, principalId, {
      integrationType: 'linear',
      externalDisplayId: 'ENG-1',
      externalUrl: null,
      externalStatus: 'Done',
      transition: 'closed',
      deliveryKey: `delivery_${suffix()}`,
    })
  )
  const rows = await eventRowsFor(ticketId)
  const statusRow = rows.find((row) => row.type === 'ticket.status_changed')
  if (!statusRow) throw new Error('status sync wrote no ticket.status_changed event')
  return { ticketId, rows, statusRow }
}

const ticketClosedReactions = {
  recordSlaFromEvent: () => [expect.objectContaining({ type: 'ticket.status_changed' })],
  summarizeTicketOnClose: (ticketId: string) => [ticketId],
}

describe.skipIf(!fixture.available)('event reactions (real DB, rolled back)', () => {
  beforeEach(() => {
    for (const name of REACTION_NAMES) reactions[name].mockReset()
    return fixture.begin()
  })
  afterEach(fixture.rollback)

  it('a ticket closed by integration status sync commits its reactions job with the event', async () => {
    const { ticketId, rows, statusRow } = await closeBySync()

    // Queued in the event's transaction: there before any drain has run.
    expect(statusRow.publishedAt).toBeNull()
    for (const row of rows) {
      const expectedJobs = row.type === 'ticket.status_changed' ? 1 : 0
      expect(await reactionJobsFor(row.eventId), row.type).toHaveLength(expectedJobs)
    }
    const [job] = await reactionJobsFor(statusRow.eventId)
    expect(job.dedupeKey).toBe(`event-reactions:${statusRow.eventId}`)
    expect(job.maxAttempts).toBeGreaterThan(1)

    await runEventReactions(job)

    expectReacted(ticketClosedReactions, ticketId)
    expect(eventsSeenBySla()[0]).toMatchObject({
      type: 'ticket.status_changed',
      data: { ticket: { id: ticketId }, previousStatus: 'open', newStatus: 'closed' },
    })
    // The SLA clock settles at the event's own time, so it must be a real instant.
    expect(Number.isNaN(new Date(eventsSeenBySla()[0].timestamp).getTime())).toBe(false)
  })

  it('a failing target resolver does not hold the reactions back, and publishing does not spend them', async () => {
    const { ticketId, statusRow } = await closeBySync()

    // Outbound delivery fails and retries: the event stays unpublished.
    await expect(
      drain(statusRow.eventId, async () => {
        throw new Error('webhook target lookup down')
      })
    ).rejects.toThrow('webhook target lookup down')
    // Then it publishes. Neither drain run reacts.
    await drain(statusRow.eventId)
    const [published] = await testDb.select().from(events).where(eq(events.id, statusRow.id))
    expect(published.publishedAt).not.toBeNull()
    await settle()
    expectReacted({}, ticketId)

    // A worker that dies after the publish leaves this job pending, so the
    // reactions still run.
    const jobs = await reactionJobsFor(statusRow.eventId)
    expect(jobs).toHaveLength(1)
    await runEventReactions(jobs[0])
    expectReacted(ticketClosedReactions, ticketId)
  })

  it('a failing reaction does not starve the others, and fails the job so it retries', async () => {
    const { ticketId, statusRow } = await closeBySync()
    reactions.recordSlaFromEvent.mockImplementation(() => {
      throw new Error('sla store down')
    })

    const [job] = await reactionJobsFor(statusRow.eventId)
    await expect(runEventReactions(job)).rejects.toThrow('sla store down')

    expect(reactions.recordSlaFromEvent).toHaveBeenCalledTimes(1)
    expect(reactions.summarizeTicketOnClose).toHaveBeenCalledWith(ticketId)
  })

  it('a job whose event row is gone is a no-op', async () => {
    await expect(
      runEventReactions({
        id: '1',
        jobId: createId('job'),
        queue: EVENT_REACTIONS_QUEUE,
        dedupeKey: null,
        payload: { eventId: createId('event') },
        workspaceKey: null,
        attempts: 1,
        maxAttempts: 5,
        leaseToken: 'test',
        lockedUntil: new Date(),
        runAt: new Date(),
      })
    ).resolves.toBeUndefined()
    expectReacted({}, '')
  })

  const actor = (): EventActor => ({
    type: 'user',
    principalId: createId('principal'),
    userId: createId('user'),
    email: 'agent@example.com',
    displayName: 'Agent Smith',
  })
  const convRef = (): EventConversationRef => ({
    id: createId('conversation'),
    status: 'open',
    channel: 'messenger',
    priority: 'medium',
    assignedTeamId: null,
  })
  const ticketRef = (): EventTicketRef => ({
    id: createId('ticket'),
    number: 42,
    type: 'customer',
    priority: 'high',
    assignedPrincipalId: null,
    assignedTeamId: null,
  })
  const slaSaw = (type: EventData['type']) => () => [expect.objectContaining({ type })]

  interface LegacyCase {
    type: EventData['type']
    /** Dispatch through the real legacy path; returns the outbox entity id. */
    run: () => Promise<string>
    /** Every reaction this event must reach, with its arguments. */
    expected: Partial<Record<ReactionName, (entityId: string) => unknown[]>>
  }

  const legacyCases: LegacyCase[] = [
    {
      type: 'ticket.status_changed',
      run: async () => {
        const ticket = ticketRef()
        await dispatch.dispatchTicketStatusChanged(
          actor(),
          ticket,
          'open',
          'closed',
          null,
          null,
          createId('principal'),
          'A ticket'
        )
        return ticket.id
      },
      expected: ticketClosedReactions,
    },
    {
      type: 'conversation.status_changed',
      run: async () => {
        const conversation = convRef()
        await dispatch.dispatchConversationStatusChanged(actor(), conversation, 'open', 'closed')
        return conversation.id
      },
      expected: {
        recordSlaFromEvent: slaSaw('conversation.status_changed'),
        summarizeConversationOnClose: (id) => [id],
      },
    },
    {
      type: 'conversation.csat_submitted',
      run: async () => {
        const conversation = convRef()
        await dispatch.dispatchConversationCsatSubmitted(
          actor(),
          conversation,
          5,
          'great',
          new Date('2026-01-01').toISOString()
        )
        return conversation.id
      },
      expected: { confirmResolutionFromCsat: (id) => [id, 5] },
    },
    {
      type: 'message.created',
      run: async () => {
        const conversation = convRef()
        await dispatch.dispatchMessageCreated(
          actor(),
          {
            id: createId('conversation_message'),
            conversationId: conversation.id,
            senderType: 'visitor',
            authorPrincipalId: createId('principal'),
            authorName: 'Visitor',
            authorEmail: 'visitor@example.com',
            content: 'Hello',
            createdAt: new Date('2026-01-01').toISOString(),
          },
          conversation,
          true
        )
        return conversation.id
      },
      expected: {
        recordSlaFromEvent: slaSaw('message.created'),
        autoReopenPairTicketFromEvent: slaSaw('message.created'),
      },
    },
  ]

  it.each(legacyCases)(
    'a legacy-dispatched $type reacts once, from its reactions job',
    async ({ type, run, expected }) => {
      const entityId = await run()

      // Nothing reacts in-process at dispatch time.
      await settle()
      expectReacted({}, entityId)

      const rows = await eventRowsFor(entityId)
      expect(rows.map((row) => row.type)).toEqual([type])
      const jobs = await reactionJobsFor(rows[0].eventId)
      expect(jobs).toHaveLength(1)
      await runEventReactions(jobs[0])
      expectReacted(expected, entityId)

      // The drain publishes the row and does not react again.
      await drain(rows[0].eventId)
      const [row] = await eventRowsFor(entityId)
      expect(row.publishedAt).not.toBeNull()
      await settle()
      expectReacted(expected, entityId)
    }
  )
})
