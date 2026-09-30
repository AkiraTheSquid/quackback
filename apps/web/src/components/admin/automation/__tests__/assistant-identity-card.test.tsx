// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAutosaveMutationCache } from '@/lib/client/autosave'
import { IntlProvider } from 'react-intl'

const updateIdentity = vi.fn()
const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))
const config = {
  version: 2 as const,
  identity: { name: 'Quinn', avatarUrl: null },
  voice: {
    tone: 'balanced' as const,
    responseLength: 'balanced' as const,
    additionalInstructions: '',
  },
}

vi.mock('@/lib/server/functions/assistant-settings', () => ({
  getAssistantSettingsFn: vi.fn(async () => ({ config, revision: 3, managedFieldPaths: [] })),
  updateAssistantIdentityFn: (input: { data: unknown }) => updateIdentity(input),
  updateAssistantVoiceFn: vi.fn(),
  updateWidgetAssistantDeploymentFn: vi.fn(),
}))

vi.mock('@/lib/server/functions/uploads', () => ({
  getAssistantAvatarUploadUrlFn: vi.fn(),
}))

import { getAssistantSettingsFn } from '@/lib/server/functions/assistant-settings'
import { AssistantIdentityCard } from '../assistant-identity-card'

afterEach(() => {
  cleanup()
  updateIdentity.mockReset()
  toastError.mockReset()
})

const slow = { timeout: 3000 }

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    mutationCache: createAutosaveMutationCache(),
  })
  return render(
    <IntlProvider locale="en" messages={{}} onError={() => {}}>
      <QueryClientProvider client={queryClient}>
        <AssistantIdentityCard />
      </QueryClientProvider>
    </IntlProvider>
  )
}

describe('AssistantIdentityCard', () => {
  it('loads the V2 identity with an upload flow instead of a URL input', async () => {
    renderCard()
    expect(await screen.findByDisplayValue('Quinn')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Upload image/ })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Avatar URL/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Avatar URL/i })).not.toBeInTheDocument()
    // No image set yet, so there is nothing to remove.
    expect(screen.queryByRole('button', { name: /Remove image/ })).not.toBeInTheDocument()
  })

  it('has no Save button and saves a renamed agent after a pause with its revision', async () => {
    updateIdentity.mockResolvedValue({
      config: { ...config, identity: { ...config.identity, name: 'Mallard' } },
      revision: 4,
    })
    renderCard()
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: ' Mallard ' } })
    expect(updateIdentity).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument()
    await waitFor(
      () =>
        expect(updateIdentity).toHaveBeenCalledWith({
          data: {
            expectedRevision: 3,
            identity: { name: 'Mallard', avatarUrl: null },
          },
        }),
      slow
    )
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(updateIdentity).toHaveBeenCalledTimes(1)
  })

  it('does not save an empty name and explains why', async () => {
    renderCard()
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: '   ' } })
    expect(await screen.findByText('Enter a name for your AI agent.')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(updateIdentity).not.toHaveBeenCalled()
  })

  it('shows one failure toast and keeps the typed name', async () => {
    updateIdentity.mockRejectedValue(new Error('boom'))
    renderCard()
    const name = await screen.findByLabelText('Name')
    fireEvent.change(name, { target: { value: 'Mallard' } })
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1), slow)
    expect(toastError).toHaveBeenCalledWith("Couldn't save. Try again.")
    expect(name).toHaveValue('Mallard')
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(updateIdentity).toHaveBeenCalledTimes(1)
  })

  it('surfaces a conflict without overwriting and reloads the latest identity', async () => {
    updateIdentity.mockRejectedValue(
      Object.assign(new Error('changed in another session'), { statusCode: 409 })
    )
    renderCard()
    const name = await screen.findByLabelText('Name')
    fireEvent.change(name, { target: { value: 'Mallard' } })
    const alert = await screen.findByRole('alert', {}, slow)
    expect(alert).toHaveTextContent(/changed in another session/)
    expect(toastError).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Reload latest settings' }))
    await waitFor(() => expect(name).toHaveValue('Quinn'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(updateIdentity).toHaveBeenCalledTimes(1)
  })

  it('shows Remove image only with an image, and removing it saves at once', async () => {
    const withImage = { ...config, identity: { name: 'Quinn', avatarUrl: 'https://cdn.test/q.png' } }
    vi.mocked(getAssistantSettingsFn).mockResolvedValue({
      config: withImage,
      revision: 3,
      managedFieldPaths: [],
    } as never)
    updateIdentity.mockResolvedValue({ config, revision: 4 })
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: /Remove image/ }))
    await waitFor(() =>
      expect(updateIdentity).toHaveBeenCalledWith({
        data: { expectedRevision: 3, identity: { name: 'Quinn', avatarUrl: null } },
      })
    )
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Remove image/ })).not.toBeInTheDocument()
    )
  })
})
