// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TeamsTab } from '../teams-tab'

vi.mock('@/lib/server/functions/teams', () => ({
  deleteTeamFn: vi.fn(),
  listTeamsAdminFn: vi.fn(),
}))
vi.mock('@/lib/client/hooks/use-root-context', () => ({
  useWorkspaceSettings: () => ({ featureFlags: { supportInbox: false } }),
}))
vi.mock('@/components/admin/settings/teams/team-dialog', () => ({ TeamDialog: () => null }))

function team(over: Record<string, unknown>) {
  return {
    id: 'team_1',
    name: 'Support',
    icon: null,
    color: null,
    description: null,
    isDefault: false,
    memberCount: 2,
    assignmentMethod: 'manual',
    ...over,
  }
}

function renderTab(teams: unknown[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['settings', 'teams'], teams)
  return render(
    <QueryClientProvider client={client}>
      <TeamsTab />
    </QueryClientProvider>
  )
}

describe('TeamsTab', () => {
  afterEach(cleanup)

  it('shows the shared empty state with a New team button', () => {
    renderTab([])
    expect(screen.getByText('No teams yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'New team' }).length).toBeGreaterThan(0)
  })

  it('lists teams as rows with an actions menu and no Default badge', () => {
    renderTab([team({ isDefault: true }), team({ id: 'team_2', name: 'Sales' })])
    expect(document.querySelectorAll('[data-slot="settings-list-row"]')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Actions for Support' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actions for Sales' })).toBeInTheDocument()
    expect(screen.queryByText('Default')).toBeNull()
  })
})
