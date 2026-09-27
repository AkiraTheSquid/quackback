/**
 * Event reactions: side effects a domain event gets from its own durable
 * `event-reactions` job, off the hook queue and apart from outbound delivery.
 *
 * `emit()` queues the job in the event's transaction for every type a reaction
 * handles, so the job commits with the event on both production paths (native
 * `emit()` producers and the legacy `dispatch*()` bridge). Nothing gates it on
 * the event-dispatch drain: a failing target resolver, a slow retry or a
 * worker crash after the event is published cannot delay or lose a reaction.
 *
 * This module is the table `emit()` reads, kept free of the reactions' own
 * imports. The handler that runs them is `event-reactions-queue.ts`.
 */
import type { EventData } from './types'

export const EVENT_REACTIONS_QUEUE = 'event-reactions'

/** Each reaction and the event types it handles. */
export const EVENT_REACTION_TYPES = {
  // Settle, pause and resume SLA breach clocks (conversation and ticket).
  sla: ['message.created', 'conversation.status_changed', 'ticket.status_changed'],
  // A visitor message on a conversation paired with a customer ticket reopens
  // that ticket.
  'pair-ticket-reopen': ['message.created'],
  // Confirm the assistant's resolution off a positive first CSAT rating.
  'assistant-csat-confirm': ['conversation.csat_submitted'],
  // Summarize a closed conversation for future assistant grounding.
  'conversation-summary': ['conversation.status_changed'],
  // Summarize a closed ticket for future assistant grounding.
  'ticket-summary': ['ticket.status_changed'],
} as const satisfies Record<string, readonly EventData['type'][]>

export type EventReactionName = keyof typeof EVENT_REACTION_TYPES

const REACTED_TYPES = new Set<string>(Object.values(EVENT_REACTION_TYPES).flat())

/** Whether `emit()` must queue a reactions job for an event of this type. */
export function hasEventReactions(type: string): boolean {
  return REACTED_TYPES.has(type)
}
