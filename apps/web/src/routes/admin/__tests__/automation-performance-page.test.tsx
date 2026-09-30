// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IntlProvider } from 'react-intl'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useLoaderData: () => ({
      range: { from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T00:00:00.000Z' },
    }),
  }),
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}))

vi.mock('@/lib/server/functions/assistant-analytics', () => ({
  getQuinnPerformanceFn: vi.fn(async () => ({})),
}))
vi.mock('@/lib/server/functions/assistant-tools-analytics', () => ({
  getQuinnToolMetricsFn: vi.fn(async () => []),
}))
vi.mock('@/lib/server/functions/assistant-copilot-analytics', () => ({
  getCopilotUsageMetricsFn: vi.fn(async () => ({})),
}))
vi.mock('@/lib/server/functions/support-reporting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/functions/support-reporting')>()),
  supportReportingFn: vi.fn(async () => ({})),
}))

const { Route } = await import('../automation.performance')
const Page = (Route as unknown as { options: { component: () => ReactNode } }).options.component

afterEach(cleanup)

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <IntlProvider locale="en" messages={{}} onError={() => {}}>
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    </IntlProvider>
  )
}

describe('automation performance page', () => {
  it('is titled like its nav entry, with the period named once in the header', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Performance' })).toBeInTheDocument()
    expect(screen.getAllByText('Last 30 days')).toHaveLength(1)
  })

  it('sets the fixed period as plain muted text, not as a control', () => {
    renderPage()
    const period = screen.getByText('Last 30 days')
    expect(period).toHaveClass('text-muted-foreground')
    expect(period.className).not.toMatch(/border|bg-card|rounded|px-3/)
  })

  it('has the four sections in order', async () => {
    renderPage()
    const titles = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent)
    expect(titles).toEqual(['AI agent', 'Actions', 'Copilot usage', 'SLAs and workflows'])
  })
})
