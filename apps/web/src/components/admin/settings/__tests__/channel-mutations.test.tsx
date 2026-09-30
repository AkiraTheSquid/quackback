// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const routing = vi.fn().mockResolvedValue({})
const ack = vi.fn().mockResolvedValue({})
const inbox = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/server/functions/settings', () => ({
  updateConversationRoutingFn: (...a: unknown[]) => routing(...a),
  updateEmailAutoAckFn: (...a: unknown[]) => ack(...a),
}))
vi.mock('@/integrations/github/server/functions', () => ({
  setGitHubInboxEnabledFn: (...a: unknown[]) => inbox(...a),
}))

const { useUpdateConversationRouting, useUpdateEmailAutoAck, useSetGitHubInbox } =
  await import('@/lib/client/mutations/channel-settings')

function setup<T>(hook: () => T) {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(hook, { wrapper }) }
}

describe('channel settings mutations', () => {
  it('routing sends the auto-assign strategy and autosaves', async () => {
    const { result, client } = setup(useUpdateConversationRouting)
    await act(() => result.current.mutateAsync(true))
    expect(routing).toHaveBeenCalledWith({
      data: { enabled: true, strategy: 'auto_assign_active' },
    })
    expect(client.getMutationCache().getAll()[0].meta).toEqual({ autosave: true })
  })

  it('auto-acknowledgement autosaves', async () => {
    const { result, client } = setup(useUpdateEmailAutoAck)
    await act(() => result.current.mutateAsync(false))
    expect(ack).toHaveBeenCalledWith({ data: { enabled: false } })
    expect(client.getMutationCache().getAll()[0].meta).toEqual({ autosave: true })
  })

  it('the GitHub inbox switch autosaves', async () => {
    const { result, client } = setup(useSetGitHubInbox)
    await act(() => result.current.mutateAsync(true))
    expect(inbox).toHaveBeenCalledWith({ data: { enabled: true } })
    expect(client.getMutationCache().getAll()[0].meta).toEqual({ autosave: true })
  })
})
