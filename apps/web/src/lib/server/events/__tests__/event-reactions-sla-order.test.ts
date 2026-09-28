/**
 * The `event-reactions` queue runs one job at a time per worker process, in
 * enqueue order while every job succeeds on its first attempt. Nothing makes
 * that a global order: a failed job is retried behind later ones, two worker
 * processes (a deploy overlap) each run one job at once, a crashed job is
 * re-run once its lease lapses, and a queue drained after a rollback replays
 * old jobs late. So a customer message's reaction can run after the reply
 * that answered it.
 *
 * The SLA reaction therefore reads the conversation's messages rather than the
 * order its jobs arrive in: a customer message whose reply already exists arms
 * its next-response cycle and settles it at that reply in one write, so the
 * breach sweep never sees an answered cycle as overdue.
 *
 * Real DB (rolled back), real legacy dispatch, outbox, job runner, shipped
 * definition and the real SLA recorders. Two seams only perturb timing: a
 * one-off failure of the reaction job's own events read, and a delay in
 * front of the real SLA reaction for the customer's message. The assertions
 * are on the SLA clock the real code leaves behind.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { createId, type ConversationId, type PrincipalId, type UserId } from '@quackback/ids'
import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import {
  conversationMessages,
  conversations,
  events,
  principal,
  slaEvents,
  user,
  eq,
  sql,
} from '@/lib/server/db'
import type { EventData } from '../types'

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))
vi.mock('@/lib/server/config', () => ({
  config: { s3PublicUrl: undefined, baseUrl: 'http://localhost:3000' },
  getBaseUrl: () => 'http://localhost:3000',
}))
// No workspace office hours: the clocks run 24/7.
vi.mock('@/lib/server/domains/settings/settings.office-hours', () => ({
  getOfficeHoursSchedule: vi.fn(async () => ({ enabled: false, timezone: 'UTC', intervals: [] })),
}))

// A transient failure of the reaction job's own events read (a dropped
// connection), before any reaction ran. Armed per test.
const transient = vi.hoisted(() => ({ failEventIds: new Set<string>() }))
vi.mock('../outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../outbox')>()
  return {
    ...actual,
    hydrateEvent: (row: Parameters<typeof actual.hydrateEvent>[0]) => {
      if (transient.failEventIds.delete(row.eventId)) {
        throw new Error('Connection terminated unexpectedly')
      }
      return actual.hydrateEvent(row)
    },
  }
})

// The real SLA reaction, with the order its runs finish in recorded and an
// optional delay in front of the customer's message.
const sla = vi.hoisted(() => ({ finished: [] as string[], delayCustomerMs: 0 }))
vi.mock('@/lib/server/domains/sla/sla.event-hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/domains/sla/sla.event-hooks')>()
  return {
    recordSlaFromEvent: async (event: EventData) => {
      const sender = event.type === 'message.created' ? event.data.message.senderType : null
      if (sender === 'visitor' && sla.delayCustomerMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, sla.delayCustomerMs))
      }
      await actual.recordSlaFromEvent(event)
      if (sender) sla.finished.push(sender)
    },
  }
})

import * as dispatch from '../dispatch'
import { EVENT_REACTIONS_QUEUE } from '../event-reactions'
import { JOB_DEFINITIONS, __setJobDefinitionsForTests } from '@/lib/server/jobs/definitions'
import { drainOnce, runnerConfig, resetJobHandlers } from '@/lib/server/jobs/runner'
import { createSlaPolicy } from '@/lib/server/domains/sla/sla-policy.service'
import {
  applySlaToConversation,
  recordFirstResponse,
  type SlaApplied,
} from '@/lib/server/domains/sla/sla.service'
import { sweepOverdueSlaBreaches } from '@/lib/server/domains/sla/sla.sweep'

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ owner: events.dispatchOwner }).from(events).limit(0)
    await db.select({ id: slaEvents.id }).from(slaEvents).limit(0)
  },
})
afterAll(() => fixture.close())

const MINUTE = 60_000
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

/** A message row plus its `message.created`, as conversation.webhooks dispatches it. */
async function sendMessage(
  conversationId: ConversationId,
  senderType: 'visitor' | 'agent',
  principalId: PrincipalId,
  createdAt: Date
) {
  const [row] = await testDb
    .insert(conversationMessages)
    .values({
      conversationId,
      principalId,
      senderType,
      content: `From the ${senderType}`,
      createdAt,
    })
    .returning()
  await dispatch.dispatchMessageCreated(
    { type: 'user', principalId },
    {
      id: row.id,
      conversationId,
      senderType,
      authorPrincipalId: principalId,
      authorName: senderType,
      authorEmail: null,
      content: row.content,
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

/**
 * A conversation under a 1h first-response / 2h next-response policy whose
 * first response has settled, then a customer message and, an hour later, the
 * agent's reply to it. The reply is inside the 2h target, so the only correct
 * outcome is one met cycle.
 */
async function customerMessageThenReply() {
  const start = Date.now() - 4 * 60 * MINUTE
  const customer = await seedPrincipal()
  const agent = await seedPrincipal()
  const [conversation] = await testDb
    .insert(conversations)
    .values({ visitorPrincipalId: customer, channel: 'messenger' })
    .returning()
  const conversationId = conversation.id as ConversationId
  const policy = await createSlaPolicy({
    name: `NRT ${suffix()}`,
    firstResponseTargetSecs: 3600,
    nextResponseTargetSecs: 2 * 3600,
  })
  await applySlaToConversation(conversationId, policy.id, new Date(start))
  await recordFirstResponse(conversationId, new Date(start + 30 * MINUTE))

  const customerAt = new Date(start + 40 * MINUTE)
  const replyAt = new Date(start + 100 * MINUTE)
  await sendMessage(conversationId, 'visitor', customer, customerAt)
  await sendMessage(conversationId, 'agent', agent, replyAt)

  const ours = (
    await testDb.select().from(events).where(eq(events.entityId, conversationId)).orderBy(events.id)
  ).map((row) => row.eventId)
  expect(ours).toHaveLength(2)
  // Park other suites' leftover rows so this test's customer message is the head.
  await testDb.execute(sql`
    UPDATE job_queue SET run_at = now() + interval '1 day'
    WHERE id IN (
      SELECT id FROM job_queue
      WHERE queue = ${EVENT_REACTIONS_QUEUE} AND status = 'pending'
        AND payload->>'eventId' NOT IN (${ours[0]}, ${ours[1]})
      FOR UPDATE SKIP LOCKED
    )
  `)
  return { conversationId, customerAt, replyAt, customerEventId: ours[0] }
}

/** One cycle, armed from the customer's message and settled met at the reply; the sweep finds nothing. */
async function expectOneMetCycle(conversationId: ConversationId, customerAt: Date, replyAt: Date) {
  // A day later, well past every deadline.
  await sweepOverdueSlaBreaches(new Date(Date.now() + 24 * 60 * MINUTE))
  const kinds = (
    await testDb.select().from(slaEvents).where(eq(slaEvents.conversationId, conversationId))
  )
    .map((event) => event.kind)
    .filter((kind) => kind.startsWith('next_response'))
  expect(kinds).toEqual(['next_response_met'])

  const [row] = await testDb
    .select({ slaApplied: conversations.slaApplied })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
  const stamp = row.slaApplied as SlaApplied
  expect(stamp.nextResponseDueAt).toBe(new Date(customerAt.getTime() + 120 * MINUTE).toISOString())
  expect(stamp.nextResponseAt).toBe(replyAt.toISOString())
}

const drain = () => drainOnce({ ...runnerConfig(), batchSize: 5 })

describe.skipIf(!fixture.available)('SLA reactions that run out of order', () => {
  beforeEach(() => {
    transient.failEventIds.clear()
    sla.finished = []
    sla.delayCustomerMs = 0
    resetJobHandlers()
    __setJobDefinitionsForTests(JOB_DEFINITIONS.filter((def) => def.name === EVENT_REACTIONS_QUEUE))
    return fixture.begin()
  })
  afterEach(async () => {
    __setJobDefinitionsForTests(null)
    resetJobHandlers()
    await fixture.rollback()
  })

  it('a customer message retried behind its reply still gets a met cycle, not a breach', async () => {
    const { conversationId, customerAt, replyAt, customerEventId } =
      await customerMessageThenReply()
    transient.failEventIds.add(customerEventId)

    // The customer message's job is the head; its events read fails, so the
    // runner requeues it behind the reply's job with run_at = now() + backoff.
    expect(await drain()).toMatchObject({ claimed: 1, retrying: 1 })
    await drain()
    // The backoff elapses (now() is frozen inside the fixture's transaction,
    // so move run_at rather than sleeping) and the retry runs.
    await testDb.execute(sql`
      UPDATE job_queue SET run_at = now()
      WHERE queue = ${EVENT_REACTIONS_QUEUE} AND payload->>'eventId' = ${customerEventId}
    `)
    await drain()

    expect(sla.finished).toEqual(['agent', 'visitor'])
    await expectOneMetCycle(conversationId, customerAt, replyAt)
  })

  it('two worker processes draining the same queue still leave a met cycle, not a breach', async () => {
    const { conversationId, customerAt, replyAt } = await customerMessageThenReply()
    sla.delayCustomerMs = 100

    // drainOnce builds a fresh pool per call, as a second process's loop
    // would: the concurrency cap is per pool, not in the database.
    await Promise.all([drain(), drain()])

    expect(sla.finished).toEqual(['agent', 'visitor'])
    await expectOneMetCycle(conversationId, customerAt, replyAt)
  })
})
