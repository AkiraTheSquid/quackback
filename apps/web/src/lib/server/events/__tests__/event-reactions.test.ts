/**
 * The in-process event reactions (SLA clocks, pair-ticket reopen, CSAT
 * confirm, conversation and ticket close summaries) run exactly once per
 * event, whichever path produced it:
 *
 * - a native `emit()` producer (here the integration status sync, which
 *   writes `ticket.status_changed` straight to the outbox) gets them from the
 *   event-dispatch drain;
 * - a legacy `dispatch*()` producer gets them in-process from `processEvent`
 *   at dispatch time, and the drain of the row it wrote must not run them a
 *   second time.
 *
 * Real DB (rolled back per test), real producers, real outbox and drain. Only
 * the five reaction entry points are mocked, so every call below is recorded
 * with the event it received.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { createId, type PrincipalId, type TicketId, type TicketStatusId } from '@quackback/ids'
import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import { events, eq, principal, tickets, ticketStatuses } from '@/lib/server/db'
import type { ClaimedJob } from '@/lib/server/jobs/job-queue'
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

function dispatchJob(eventId: string): ClaimedJob {
  return {
    id: 1n as unknown as ClaimedJob['id'],
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
}

/** Drain every outbox row for one entity, as the event-dispatch worker would. */
async function drainEventsFor(entityId: string): Promise<string[]> {
  const rows = await testDb
    .select()
    .from(events)
    .where(eq(events.entityId, entityId))
    .orderBy(events.id)
  for (const row of rows) {
    // No destinations: this suite is about the reactions, not the fan-out.
    await runEventDispatch(dispatchJob(row.eventId), { resolve: async () => [] })
  }
  return rows.map((row) => row.type)
}

/** Reactions are fire-and-forget; give any straggler time to land before counting. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 100))

const eventsSeenBy = (name: 'recordSlaFromEvent' | 'autoReopenPairTicketFromEvent') =>
  reactions[name].mock.calls.map(([event]) => event as EventData)

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

describe.skipIf(!fixture.available)('in-process event reactions (real DB, rolled back)', () => {
  beforeEach(() => {
    for (const name of REACTION_NAMES) reactions[name].mockReset()
    return fixture.begin()
  })
  afterEach(fixture.rollback)

  it('a ticket closed by integration status sync gets its SLA settle and close summary', async () => {
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
    const drained = await drainEventsFor(ticketId)
    expect(drained).toContain('ticket.status_changed')

    await vi.waitFor(() => expect(reactions.summarizeTicketOnClose).toHaveBeenCalled(), {
      timeout: 10_000,
    })
    await settle()

    expect(reactions.summarizeTicketOnClose).toHaveBeenCalledTimes(1)
    expect(reactions.summarizeTicketOnClose).toHaveBeenCalledWith(ticketId)

    const statusEvents = eventsSeenBy('recordSlaFromEvent').filter(
      (event) => event.type === 'ticket.status_changed'
    )
    expect(statusEvents).toHaveLength(1)
    expect(statusEvents[0]).toMatchObject({
      type: 'ticket.status_changed',
      data: {
        ticket: { id: ticketId },
        previousStatus: 'open',
        newStatus: 'closed',
      },
    })
    // The SLA clock settles at the event's own time, so it must be a real instant.
    expect(Number.isNaN(new Date(statusEvents[0].timestamp).getTime())).toBe(false)

    // Every drained event reached the always-on reactions exactly once.
    const typesSeenBy = (name: 'recordSlaFromEvent' | 'autoReopenPairTicketFromEvent') =>
      eventsSeenBy(name)
        .map((event) => event.type)
        .sort()
    expect(typesSeenBy('recordSlaFromEvent')).toEqual([...drained].sort())
    expect(typesSeenBy('autoReopenPairTicketFromEvent')).toEqual([...drained].sort())
    expect(reactions.confirmResolutionFromCsat).not.toHaveBeenCalled()
    expect(reactions.summarizeConversationOnClose).not.toHaveBeenCalled()
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

  interface LegacyCase {
    type: EventData['type']
    /** Dispatch through the real legacy path; returns the outbox entity id. */
    run: () => Promise<string>
    /** The conditional reactions this event must reach, with their arguments. */
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
      expected: { summarizeTicketOnClose: (id) => [id] },
    },
    {
      type: 'conversation.status_changed',
      run: async () => {
        const conversation = convRef()
        await dispatch.dispatchConversationStatusChanged(actor(), conversation, 'open', 'closed')
        return conversation.id
      },
      expected: { summarizeConversationOnClose: (id) => [id] },
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
      expected: {},
    },
  ]

  it.each(legacyCases)(
    'a legacy-dispatched $type reacts once at dispatch and not again in the drain',
    async ({ type, run, expected }) => {
      const entityId = await run()

      const assertOnce = async () => {
        await vi.waitFor(
          () => {
            expect(reactions.recordSlaFromEvent).toHaveBeenCalled()
            expect(reactions.autoReopenPairTicketFromEvent).toHaveBeenCalled()
            for (const name of Object.keys(expected) as ReactionName[]) {
              expect(reactions[name]).toHaveBeenCalled()
            }
          },
          { timeout: 10_000 }
        )
        await settle()
        expect(eventsSeenBy('recordSlaFromEvent').map((event) => event.type)).toEqual([type])
        expect(eventsSeenBy('autoReopenPairTicketFromEvent').map((event) => event.type)).toEqual([
          type,
        ])
        for (const name of REACTION_NAMES) {
          if (name === 'recordSlaFromEvent' || name === 'autoReopenPairTicketFromEvent') continue
          const args = expected[name]
          if (args) {
            expect(reactions[name], name).toHaveBeenCalledTimes(1)
            expect(reactions[name], name).toHaveBeenCalledWith(...args(entityId))
          } else {
            expect(reactions[name], name).not.toHaveBeenCalled()
          }
        }
      }

      // At dispatch time, before any drain: the legacy timing is unchanged.
      await assertOnce()

      // The drain publishes the row the legacy path wrote and must not react again.
      expect(await drainEventsFor(entityId)).toEqual([type])
      const [row] = await testDb.select().from(events).where(eq(events.entityId, entityId))
      expect(row.publishedAt).not.toBeNull()
      await assertOnce()
    }
  )

  it('a failing reaction neither fails the drain nor starves the other reactions', async () => {
    const { ticketId, closedStatusId, principalId } = await seedTicket()
    reactions.recordSlaFromEvent.mockImplementation(() => {
      throw new Error('sla store down')
    })

    await testDb.transaction((tx) =>
      applySyncedTicketStatus(tx, ticketId, closedStatusId, principalId, {
        integrationType: 'linear',
        externalDisplayId: 'ENG-2',
        externalUrl: null,
        externalStatus: 'Done',
        transition: 'closed',
        deliveryKey: `delivery_${suffix()}`,
      })
    )
    await expect(drainEventsFor(ticketId)).resolves.toContain('ticket.status_changed')

    await vi.waitFor(
      () => expect(reactions.summarizeTicketOnClose).toHaveBeenCalledWith(ticketId),
      {
        timeout: 10_000,
      }
    )
    await settle()
    expect(reactions.recordSlaFromEvent).toHaveBeenCalled()
    const rows = await testDb.select().from(events).where(eq(events.entityId, ticketId))
    expect(rows.every((row) => row.publishedAt !== null)).toBe(true)
  })
})
