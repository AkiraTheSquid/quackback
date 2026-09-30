// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAutosaveMutationCache } from '@/lib/client/autosave'
import { IntlProvider } from 'react-intl'

const updateVoice = vi.fn()
const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const config = {
  version: 3 as const,
  identity: { name: 'Quinn', avatarUrl: null },
  agents: {
    agent: {
      voice: {
        tone: 'balanced' as const,
        responseLength: 'balanced' as const,
        additionalInstructions: 'Use UK English.',
      },
      knowledge: { helpCenter: true, posts: false, changelog: false, status: false },
    },
    copilot: {
      capabilities: { qa: true },
      knowledge: {
        helpCenter: true,
        posts: true,
        pastConversations: true,
        internalNotes: true,
        tickets: true,
        changelog: true,
        status: true,
      },
    },
  },
}

vi.mock('@/lib/server/functions/assistant-settings', () => ({
  getAssistantSettingsFn: vi.fn(async () => ({ config, revision: 2, managedFieldPaths: [] })),
  updateAssistantIdentityFn: vi.fn(),
  updateAssistantVoiceFn: (input: { data: unknown }) => updateVoice(input),
  updateWidgetAssistantDeploymentFn: vi.fn(),
}))

import { AdditionalInstructionsCard } from '../additional-instructions-card'

afterEach(() => {
  cleanup()
  updateVoice.mockReset()
  toastError.mockReset()
})

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    mutationCache: createAutosaveMutationCache(),
  })
  return render(
    <IntlProvider locale="en" messages={{}} onError={() => {}}>
      <QueryClientProvider client={queryClient}>
        <AdditionalInstructionsCard />
      </QueryClientProvider>
    </IntlProvider>
  )
}

const FIELD = 'Guidelines used in every response'
const slow = { timeout: 3000 }

it('presents writing guidelines with an accessible field label', async () => {
  renderCard()

  expect(await screen.findByRole('heading', { name: 'Writing guidelines' })).toBeInTheDocument()
  expect(
    await screen.findByRole('textbox', { name: 'Guidelines used in every response' })
  ).toHaveValue('Use UK English.')
})

it('saves typed guidelines after a pause, trimmed, keeping the rest of the voice', async () => {
  updateVoice.mockResolvedValue({
    config: {
      ...config,
      agents: {
        ...config.agents,
        agent: {
          ...config.agents.agent,
          voice: { ...config.agents.agent.voice, additionalInstructions: 'Use US English.' },
        },
      },
    },
    revision: 3,
  })
  renderCard()
  const field = await screen.findByRole('textbox', { name: FIELD })
  fireEvent.change(field, { target: { value: '  Use US English.  ' } })
  expect(updateVoice).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument()
  await waitFor(() => expect(updateVoice).toHaveBeenCalledTimes(1), slow)
  expect(updateVoice).toHaveBeenCalledWith({
    data: {
      expectedRevision: 2,
      voice: {
        tone: 'balanced',
        responseLength: 'balanced',
        additionalInstructions: 'Use US English.',
      },
    },
  })
  // The saved text is the trimmed value, so nothing is left to save.
  await new Promise((resolve) => setTimeout(resolve, 1200))
  expect(updateVoice).toHaveBeenCalledTimes(1)
  expect(field).toHaveValue('Use US English.')
})

it('does not save guidelines over the length limit', async () => {
  renderCard()
  const field = await screen.findByRole('textbox', { name: FIELD })
  fireEvent.change(field, { target: { value: 'x'.repeat(2001) } })
  expect(await screen.findByText('Use 2,000 characters or fewer.')).toBeInTheDocument()
  await new Promise((resolve) => setTimeout(resolve, 1200))
  expect(updateVoice).not.toHaveBeenCalled()
})

it('shows one failure toast and keeps the draft', async () => {
  updateVoice.mockRejectedValue(new Error('boom'))
  renderCard()
  const field = await screen.findByRole('textbox', { name: FIELD })
  fireEvent.change(field, { target: { value: 'Something new' } })
  await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1), slow)
  expect(toastError).toHaveBeenCalledWith("Couldn't save. Try again.")
  expect(field).toHaveValue('Something new')
  await new Promise((resolve) => setTimeout(resolve, 1200))
  expect(updateVoice).toHaveBeenCalledTimes(1)
})

it('surfaces a conflict without overwriting and reloads the latest guidelines', async () => {
  updateVoice.mockRejectedValue(
    Object.assign(new Error('changed in another session'), { statusCode: 409 })
  )
  renderCard()
  const field = await screen.findByRole('textbox', { name: FIELD })
  fireEvent.change(field, { target: { value: 'Something new' } })
  const alert = await screen.findByRole('alert', {}, slow)
  expect(alert).toHaveTextContent(/changed in another session/)
  expect(toastError).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Reload latest settings' }))
  await waitFor(() => expect(field).toHaveValue('Use UK English.'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(updateVoice).toHaveBeenCalledTimes(1)
})
