/**
 * The pair-ticket reopen runs from the `event-reactions` job, so it can run
 * well after the requester's message: sub-second normally, minutes behind a
 * backlog or a worker outage, and days late when a queue is drained after a
 * rollback. A close the agent made after reading that message has already
 * answered it, so a late reopen must leave it standing. A ticket closed before
 * the message is still reopened, however late the job runs.
 *
 * Real DB (rolled back), real legacy dispatch, real outbox, the real reaction
 * handler and the real reopen. Only realtime and the ticket event bridge are
 * spied (as in ticket-convergence-1a.test.ts), so no fire-and-forget write
 * races the fixture's single connection.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import {
  createId,
  type ConversationId,
  type PrincipalId,
  type TicketId,
  type TicketStatusId,
  type UserId,
} from '@quackback/ids'

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))
vi.mock('@/lib/server/config', () => ({
  config: { s3PublicUrl: undefined, baseUrl: 'http://localhost:3000' },
  getBaseUrl: () => 'http://localhost:3000',
}))
vi.mock('@/lib/server/realtime/conversation-channels', () => ({
  publishTicketEvent: vi.fn(),
  publishConversationEvent: vi.fn(),
  publishConversationMessage: vi.fn(),
  publishAgentConversationEvent: vi.fn(),
  publishConversationUpdate: vi.fn(),
  publishTyping: vi.fn(),
}))
vi.mock('@/lib/server/domains/tickets/ticket.webhooks', () => ({
  emitTicketCreated: vi.fn().mockResolvedValue(undefined),
  emitTicketStatusChanged: vi.fn().mockResolvedValue(undefined),
  emitTicketAssigned: vi.fn().mockResolvedValue(undefined),
  emitTicketReplied: vi.fn().mockResolvedValue(undefined),
  emitTicketNoteAdded: vi.fn().mockResolvedValue(undefined),
  emitTicketExternalStatusChanged: vi.fn().mockResolvedValue(undefined),
}))

import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import {
  conversations,
  events,
  principal,
  settings,
  ticketConversations,
  tickets,
  ticketStatuses,
  user,
  eq,
  sql,
  PERMISSIONS,
  type PermissionKey,
} from '@/lib/server/db'
import { ANONYMOUS_ACTOR, type Actor } from '@/lib/server/policy/types'
import type { ClaimedJob } from '@/lib/server/jobs/job-queue'
import { getExecuteRows } from '@/lib/server/utils/execute-rows'
import * as dispatch from '../dispatch'
import { runEventReactions } from '../event-reactions-queue'
import { EVENT_REACTIONS_QUEUE } from '../event-reactions'
import { setTicketStatus } from '@/lib/server/domains/tickets/ticket.service'

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ id: ticketConversations.ticketId }).from(ticketConversations).limit(0)
  },
})
afterAll(() => fixture.close())

const suffix = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

async function seedPrincipal(): Promise<PrincipalId> {
  const userId = createId('user') as UserId
  const principalId = createId('principal') as PrincipalId
  await testDb.insert(user).values({ id: userId, name: `U-${suffix()}` })
  await testDb
    .insert(principal)
    .values({ id: principalId, userId, role: 'member', type: 'user', createdAt: new Date() })
  return principalId
}

/** A received (open), an awaiting-requester (pending) and a resolved (closed) status. */
async function seedStatuses() {
  await testDb
    .insert(settings)
    .values({ name: 'Test WS', slug: `test_${suffix()}`, createdAt: new Date() })
  await testDb
    .update(ticketStatuses)
    .set({ isDefault: false })
    .where(eq(ticketStatuses.isDefault, true))
  const received = createId('ticket_status') as TicketStatusId
  const awaiting = createId('ticket_status') as TicketStatusId
  const closed = createId('ticket_status') as TicketStatusId
  await testDb.insert(ticketStatuses).values([
    {
      id: received,
      name: 'R-Received',
      slug: `r_received_${suffix()}`,
      category: 'open',
      publicStage: 'received',
      position: -100,
      isDefault: true,
    },
    {
      id: awaiting,
      name: 'R-Awaiting',
      slug: `r_awaiting_${suffix()}`,
      category: 'pending',
      publicStage: 'awaiting_requester',
      position: 102,
    },
    {
      id: closed,
      name: 'R-Done',
      slug: `r_done_${suffix()}`,
      category: 'closed',
      publicStage: 'resolved',
      position: 103,
    },
  ])
  return { received, awaiting, closed }
}

/** A customer ticket awaiting its requester, paired with a messenger conversation. */
async function seedPairedTicket() {
  const statuses = await seedStatuses()
  const requester = await seedPrincipal()
  const agent = await seedPrincipal()
  const [ticket] = await testDb
    .insert(tickets)
    .values({
      title: `T-${suffix()}`,
      statusId: statuses.awaiting,
      type: 'customer',
      requesterPrincipalId: requester,
    })
    .returning()
  const ticketId = ticket.id as TicketId
  const conversationId = createId('conversation') as ConversationId
  await testDb
    .insert(conversations)
    .values({ id: conversationId, visitorPrincipalId: requester, channel: 'messenger' })
  await testDb
    .insert(ticketConversations)
    .values({ ticketId, conversationId, ticketType: 'customer' })
  return { statuses, requester, agent, ticketId, conversationId }
}

async function ticketState(ticketId: TicketId) {
  const [row] = await testDb
    .select({ category: ticketStatuses.category, reopenedCount: tickets.reopenedCount })
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .where(eq(tickets.id, ticketId))
  return row
}

/** The requester writes on the paired conversation, through the legacy dispatch. */
async function requesterWrites(
  conversationId: ConversationId,
  requester: PrincipalId,
  createdAt: Date
) {
  await dispatch.dispatchMessageCreated(
    { type: 'user', principalId: requester },
    {
      id: createId('conversation_message'),
      conversationId,
      senderType: 'visitor',
      authorPrincipalId: requester,
      authorName: 'Requester',
      authorEmail: null,
      content: 'That fixed it, thanks',
      createdAt: createdAt.toISOString(),
    },
    {
      id: conversationId,
      status: 'open',
      channel: 'messenger',
      priority: 'medium',
      assignedTeamId: null,
    },
    false
  )
}

/** The worker reaches the message's reaction job. */
async function runReactionJobFor(conversationId: ConversationId) {
  await runEventReactions(await reactionJobFor(conversationId))
}

async function reactionJobFor(conversationId: ConversationId): Promise<ClaimedJob> {
  const [event] = await testDb.select().from(events).where(eq(events.entityId, conversationId))
  const [row] = getExecuteRows<{
    job_id: string
    payload: Record<string, unknown>
    max_attempts: number
  }>(
    await testDb.execute(sql`
      SELECT job_id, payload, max_attempts FROM job_queue
      WHERE queue = ${EVENT_REACTIONS_QUEUE} AND payload->>'eventId' = ${event.eventId}
    `)
  )
  return {
    id: '1',
    jobId: row.job_id,
    queue: EVENT_REACTIONS_QUEUE,
    dedupeKey: `${EVENT_REACTIONS_QUEUE}:${event.eventId}`,
    payload: row.payload,
    workspaceKey: null,
    attempts: 1,
    maxAttempts: row.max_attempts,
    leaseToken: 'test',
    lockedUntil: new Date(),
    runAt: new Date(),
  }
}

function agentActor(principalId: PrincipalId): Actor {
  return {
    ...ANONYMOUS_ACTOR,
    principalId,
    principalType: 'user',
    permissions: new Set<PermissionKey>([
      PERMISSIONS.TICKET_VIEW_ALL,
      PERMISSIONS.TICKET_SET_STATUS,
    ]),
  }
}

describe.skipIf(!fixture.available)('pair-ticket reopen from a late reaction job', () => {
  beforeEach(fixture.begin)
  afterEach(fixture.rollback)

  it("does not undo a close the agent made after the requester's message", async () => {
    const { statuses, requester, agent, ticketId, conversationId } = await seedPairedTicket()

    // The requester answers ("that fixed it, thanks"). The reopen is only queued.
    await requesterWrites(conversationId, requester, new Date())
    expect((await ticketState(ticketId)).category).toBe('pending')

    // The agent reads the answer and closes the ticket.
    await setTicketStatus(ticketId, statuses.closed, agentActor(agent))
    expect((await ticketState(ticketId)).category).toBe('closed')

    // Then the worker reaches the message's reaction job.
    await runReactionJobFor(conversationId)

    // The close came after the message, so it stands.
    expect(await ticketState(ticketId)).toEqual({ category: 'closed', reopenedCount: 0 })
  })

  it('still reopens a ticket that was closed before the message, however late the job runs', async () => {
    const { statuses, requester, agent, ticketId, conversationId } = await seedPairedTicket()

    // The agent closes the ticket, and the requester writes back a minute later.
    await setTicketStatus(ticketId, statuses.closed, agentActor(agent))
    await requesterWrites(conversationId, requester, new Date(Date.now() + 60_000))

    await runReactionJobFor(conversationId)

    expect(await ticketState(ticketId)).toEqual({ category: 'open', reopenedCount: 1 })
  })

  it('reopens once when two runs of the same reaction overlap', async () => {
    const { statuses, requester, agent, ticketId, conversationId } = await seedPairedTicket()
    await setTicketStatus(ticketId, statuses.closed, agentActor(agent))
    await requesterWrites(conversationId, requester, new Date(Date.now() + 60_000))

    // A run that outlived its lease or its deadline, and the retry after it:
    // both read the closed ticket before either writes.
    const job = await reactionJobFor(conversationId)
    await Promise.all([runEventReactions(job), runEventReactions(job)])

    expect(await ticketState(ticketId)).toEqual({ category: 'open', reopenedCount: 1 })
  })
})
