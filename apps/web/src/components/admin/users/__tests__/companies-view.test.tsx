// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CompaniesView } from '../companies-view'
import type { CompanyWithMemberCountDTO } from '@/lib/server/functions/companies'

afterEach(cleanup)

function company(
  id: string,
  name: string,
  over: Partial<CompanyWithMemberCountDTO> = {}
): CompanyWithMemberCountDTO {
  return {
    id,
    name,
    domain: null,
    externalId: null,
    plan: null,
    mrrCents: null,
    size: null,
    website: null,
    industry: null,
    source: 'manual',
    customAttributes: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    memberCount: 1,
    ...over,
  } as CompanyWithMemberCountDTO
}

function renderView(companies: CompanyWithMemberCountDTO[]) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CompaniesView
        companies={companies}
        isLoading={false}
        onSearchChange={() => {}}
        onCompanyAttrsChange={() => {}}
        onSelectCompany={() => {}}
        canManage
      />
    </QueryClientProvider>
  )
}

const ROWS = [
  company('c1', 'Alpha', { mrrCents: 10000, memberCount: 20 }),
  company('c2', 'Bravo', { mrrCents: 50000, memberCount: 9, source: 'api' }),
  company('c3', 'Charlie', { mrrCents: 20000, memberCount: 5 }),
]

function rowNames(): string[] {
  return screen
    .getAllByRole('button')
    .map((b) => b.textContent ?? '')
    .filter((t) => /^(Alpha|Bravo|Charlie)/.test(t))
    .map((t) => t.match(/^(Alpha|Bravo|Charlie)/)![1])
}

describe('<CompaniesView> toolbar', () => {
  it('puts Sort and Filter on the toolbar row before the actions, with no Add filter line', () => {
    renderView(ROWS)
    const toolbar = document.querySelector('[data-slot="admin-list-search"]')!.parentElement!
    const labels = Array.from(toolbar.querySelectorAll('button, a')).map((b) =>
      b.textContent?.trim()
    )
    expect(labels).toEqual(['Sort: Name', 'Filter', 'Export CSV', 'New company'])
    expect(screen.queryByText('Add filter')).toBeNull()
  })

  it('orders the loaded companies from the Sort menu', async () => {
    renderView(ROWS)
    expect(rowNames()).toEqual(['Alpha', 'Bravo', 'Charlie'])
    fireEvent.click(screen.getByRole('button', { name: /Sort: Name/ }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Monthly spend' }))
    expect(rowNames()).toEqual(['Bravo', 'Charlie', 'Alpha'])
    fireEvent.click(screen.getByRole('button', { name: /Sort: Monthly spend/ }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Users' }))
    expect(rowNames()).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })
})

describe('<CompaniesView> table', () => {
  it('uses sentence-case column headers', () => {
    renderView(ROWS)
    for (const header of ['Company', 'Plan', 'Monthly spend', 'Users', 'Source']) {
      const el = screen.getByText(header, { selector: 'span' })
      expect(el.className).not.toMatch(/uppercase/)
    }
  })

  it('shows no source token for the default source and a token for the others', () => {
    renderView(ROWS)
    expect(screen.queryByText(/^manual$/i)).toBeNull()
    expect(screen.getByText(/^api$/i)).toBeInTheDocument()
    expect(within(document.body).getAllByText(/^api$/i)).toHaveLength(1)
  })
})
