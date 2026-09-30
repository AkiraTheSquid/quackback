// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAutosaveMutationCache } from '@/lib/client/autosave'
import { IntlProvider } from 'react-intl'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const updateCopilotKnowledge = vi.fn()
const updateAgentKnowledge = vi.fn()
const updateCopilotCapabilities = vi.fn()

const config = {
  version: 3 as const,
  identity: { name: 'Quinn', avatarUrl: null },
  agents: {
    agent: {
      voice: {
        tone: 'balanced' as const,
        responseLength: 'balanced' as const,
        additionalInstructions: '',
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
  getAssistantSettingsFn: vi.fn(async () => ({ config, revision: 4, managedFieldPaths: [] })),
  updateAssistantIdentityFn: vi.fn(),
  updateAssistantVoiceFn: vi.fn(),
  updateAssistantAgentKnowledgeFn: (input: { data: unknown }) => {
    updateAgentKnowledge(input)
    return { config, revision: 5 }
  },
  updateAssistantCopilotKnowledgeFn: (input: { data: unknown }) => {
    updateCopilotKnowledge(input)
    return { config, revision: 5 }
  },
  updateAssistantCopilotCapabilitiesFn: (input: { data: unknown }) => {
    updateCopilotCapabilities(input)
    return { config, revision: 5 }
  },
  updateWidgetAssistantDeploymentFn: vi.fn(),
}))

import { getAssistantSettingsFn } from '@/lib/server/functions/assistant-settings'
import { AgentKnowledgeCard, CopilotKnowledgeCard } from '../assistant-knowledge-card'
import { CopilotDeploymentCard } from '../copilot-deployment-card'

afterEach(() => {
  cleanup()
  updateCopilotKnowledge.mockReset()
  updateAgentKnowledge.mockReset()
  updateCopilotCapabilities.mockReset()
  toastError.mockReset()
  vi.mocked(getAssistantSettingsFn).mockClear()
})

function renderWithProviders(node: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    mutationCache: createAutosaveMutationCache(),
  })
  return render(
    <IntlProvider locale="en" messages={{}} onError={() => {}}>
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
    </IntlProvider>
  )
}

describe('CopilotKnowledgeCard', () => {
  it('lists all seven live sources (toggles are wired into the runtime)', async () => {
    renderWithProviders(<CopilotKnowledgeCard />)
    expect(await screen.findByText('Help center')).toBeInTheDocument()
    expect(screen.getByText('Past conversations')).toBeInTheDocument()
    expect(screen.getByText('Internal notes')).toBeInTheDocument()
    expect(screen.getByText('Tickets')).toBeInTheDocument()
    expect(screen.getByText('Changelog')).toBeInTheDocument()
    expect(screen.getByText('System status')).toBeInTheDocument()
    // The config-only rollout hint is gone now that toggles drive the toolset.
    expect(
      screen.queryByText(/take effect when Quinn’s knowledge tools roll out/)
    ).not.toBeInTheDocument()
    // Status is a live lookup, not an index; indexed sources carry no badge.
    expect(screen.getAllByText('Live lookup')).toHaveLength(1)
    expect(screen.queryByText('Ready')).not.toBeInTheDocument()
  })

  it('is one card without a header, since the tab is already called Knowledge', async () => {
    renderWithProviders(<CopilotKnowledgeCard />)
    await screen.findByText('Tickets')
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('puts a failed toggle back and shows the one autosave toast', async () => {
    updateCopilotKnowledge.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    renderWithProviders(<CopilotKnowledgeCard />)
    await screen.findByText('Tickets')
    fireEvent.click(screen.getByLabelText('Use Tickets'))
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(toastError).toHaveBeenCalledWith("Couldn't save. Try again.")
    await waitFor(() => expect(screen.getByLabelText('Use Tickets')).toBeChecked())
  })

  it('refreshes the settings after a revision conflict so a retry can succeed', async () => {
    updateCopilotKnowledge.mockImplementationOnce(() => {
      throw Object.assign(new Error('changed in another session'), { statusCode: 409 })
    })
    renderWithProviders(<CopilotKnowledgeCard />)
    await screen.findByText('Tickets')
    const loads = vi.mocked(getAssistantSettingsFn).mock.calls.length
    fireEvent.click(screen.getByLabelText('Use Tickets'))
    await waitFor(() =>
      expect(vi.mocked(getAssistantSettingsFn).mock.calls.length).toBeGreaterThan(loads)
    )
    await waitFor(() => expect(screen.getByLabelText('Use Tickets')).toBeChecked())
  })

  it('persists a source toggle against the copilot knowledge map', async () => {
    renderWithProviders(<CopilotKnowledgeCard />)
    await screen.findByText('Tickets')
    fireEvent.click(screen.getByLabelText('Use Tickets'))
    await waitFor(() => expect(updateCopilotKnowledge).toHaveBeenCalledTimes(1))
    expect(updateCopilotKnowledge.mock.calls[0][0].data.knowledge.tickets).toBe(false)
  })
})

describe('AgentKnowledgeCard', () => {
  it('offers only the four agent sources and the public-board caveat', async () => {
    renderWithProviders(<AgentKnowledgeCard />)
    expect(await screen.findByText('Help center')).toBeInTheDocument()
    expect(screen.getByText('Feedback posts')).toBeInTheDocument()
    expect(screen.getByText('Changelog')).toBeInTheDocument()
    expect(screen.getByText('System status')).toBeInTheDocument()
    // Team-only sources are never offered to the Agent (D8).
    expect(screen.queryByText('Past conversations')).not.toBeInTheDocument()
    expect(screen.queryByText('Internal notes')).not.toBeInTheDocument()
    expect(screen.queryByText('Tickets')).not.toBeInTheDocument()
    expect(screen.getByText(/Public feedback boards only/)).toBeInTheDocument()
  })
})

describe('CopilotDeploymentCard', () => {
  it('reads on/off from capabilities', async () => {
    renderWithProviders(<CopilotDeploymentCard available />)
    expect(await screen.findByText('On')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn off Copilot' })).toBeInTheDocument()
  })

  // The error styling used to be chosen by searching the message for the
  // English words "could not", so a translated error rendered as a neutral
  // status line.
  it('announces a failed change as an alert in any locale', async () => {
    updateCopilotCapabilities.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <IntlProvider
        locale="nl"
        messages={{
          'automation.copilot.deployment.error': 'Wijzigen mislukt. Probeer het opnieuw.',
        }}
        onError={() => {}}
      >
        <QueryClientProvider client={queryClient}>
          <CopilotDeploymentCard available />
        </QueryClientProvider>
      </IntlProvider>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Turn off Copilot' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn off Copilot' }))

    // The confirm dialog stays open on failure, so the card behind it is aria-hidden.
    const alert = await screen.findByRole('alert', { hidden: true })
    expect(alert).toHaveTextContent('Wijzigen mislukt. Probeer het opnieuw.')
    expect(alert).toHaveClass('text-destructive')
    expect(alert).toHaveAttribute('aria-live', 'assertive')
  })

  it('shows Unavailable when no AI model is configured', async () => {
    renderWithProviders(<CopilotDeploymentCard available={false} />)
    expect(await screen.findByText('Unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn off Copilot' })).not.toBeInTheDocument()
  })
})
