// @vitest-environment happy-dom
/**
 * The performance cards share one period (set by the page header), show the
 * headline figures in the analytics stat row, and swap a grid of zeros for an
 * empty state when a section had no activity.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IntlProvider } from 'react-intl'

const hoisted = vi.hoisted(() => ({
  quinn: vi.fn(),
  tools: vi.fn(),
  copilot: vi.fn(),
  support: vi.fn(),
}))

vi.mock('@/lib/server/functions/assistant-analytics', () => ({
  getQuinnPerformanceFn: hoisted.quinn,
}))
vi.mock('@/lib/server/functions/assistant-tools-analytics', () => ({
  getQuinnToolMetricsFn: hoisted.tools,
}))
vi.mock('@/lib/server/functions/assistant-copilot-analytics', () => ({
  getCopilotUsageMetricsFn: hoisted.copilot,
}))
vi.mock('@/lib/server/functions/support-reporting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/functions/support-reporting')>()),
  supportReportingFn: hoisted.support,
}))

import { QuinnPerformanceCard } from '../quinn-performance-card'
import { QuinnToolsCard } from '../quinn-tools-card'
import { CopilotUsageCard } from '../copilot-usage-card'
import { SupportPerformanceCard } from '../support-performance-card'

afterEach(cleanup)

const RANGE = { from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T00:00:00.000Z' }

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <IntlProvider locale="en" messages={{}} onError={() => {}}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </IntlProvider>
  )
}

const QUIET_QUINN = {
  involvements: 0,
  conversations: 0,
  involvementRate: 0,
  resolvedConfirmed: 0,
  resolvedAssumed: 0,
  resolutionRate: 0,
  handedOff: 0,
  escalationRate: 0,
  actionsTaken: 0,
  csat: { avgRating: 0, responseCount: 0 },
  dailyTrend: [{ date: '2026-01-02', involvements: 0, resolved: 0 }],
}

const QUIET_COPILOT = {
  totalQuestions: 0,
  totalTransforms: 0,
  transformsByKind: [],
  totalSummaries: 0,
  actionsProposed: 0,
  actionsApproved: 0,
  actionsRejected: 0,
  actionsExpired: 0,
  approvalRate: null,
  answersInserted: 0,
  transformsInserted: 0,
  summariesInserted: 0,
  totalInserted: 0,
  insertedReplies: 0,
  insertedNotes: 0,
  insertRate: null,
  feedbackUp: 0,
  feedbackDown: 0,
  feedbackDownWithReason: 0,
  perTeammate: [],
  topCitedSources: [],
}

const QUIET_SUPPORT = {
  sla: {
    firstResponse: { met: 0, breached: 0, rate: null },
    nextResponse: { met: 0, breached: 0, rate: null },
    resolution: { met: 0, breached: 0, rate: null },
    timeToResolve: { met: 0, breached: 0, rate: null },
  },
  slaByPolicy: [],
  slaHeatmap: [],
  slaTimeAfterMiss: {
    firstResponse: { count: 0, avgOverdueSecs: null },
    nextResponse: { count: 0, avgOverdueSecs: null },
    resolution: { count: 0, avgOverdueSecs: null },
    timeToResolve: { count: 0, avgOverdueSecs: null },
  },
  workflows: [],
}

describe('AI agent card', () => {
  it('is titled AI agent, drops the period sentence, and shows No data for an unrated CSAT', async () => {
    hoisted.quinn.mockResolvedValue(QUIET_QUINN)
    renderWithClient(<QuinnPerformanceCard range={RANGE} />)
    expect(await screen.findByText('AI agent')).toBeInTheDocument()
    expect(screen.queryByText(/last 30 days/i)).toBeNull()
    expect(await screen.findByText('Customer satisfaction')).toBeInTheDocument()
    expect(screen.getByText('No data')).toBeInTheDocument()
  })

  it('draws no trend chart under the tiles', async () => {
    hoisted.quinn.mockResolvedValue(QUIET_QUINN)
    const { container } = renderWithClient(<QuinnPerformanceCard range={RANGE} />)
    await screen.findAllByText('0%')
    expect(container.querySelector('[data-slot="chart"]')).toBeNull()
    expect(screen.queryByText('No data for this period')).toBeNull()
  })
})

describe('Actions card', () => {
  it('shows an empty state instead of zero tiles when nothing ran', async () => {
    hoisted.tools.mockResolvedValue([])
    renderWithClient(<QuinnToolsCard range={RANGE} />)
    expect(await screen.findByText('No actions in this period')).toBeInTheDocument()
    expect(screen.queryByText('Attempted')).toBeNull()
  })
})

describe('Copilot usage card', () => {
  it('shows an empty state instead of a grid of zeros when Copilot was not used', async () => {
    hoisted.copilot.mockResolvedValue(QUIET_COPILOT)
    renderWithClient(<CopilotUsageCard showActionsFunnel range={RANGE} />)
    expect(await screen.findByText('No Copilot activity in this period')).toBeInTheDocument()
    expect(screen.queryByText('Questions asked')).toBeNull()
  })

  it('keeps the usage figures once there is activity', async () => {
    hoisted.copilot.mockResolvedValue({ ...QUIET_COPILOT, totalQuestions: 3 })
    renderWithClient(<CopilotUsageCard showActionsFunnel range={RANGE} />)
    expect(await screen.findByText('Questions asked')).toBeInTheDocument()
    expect(screen.queryByText('No Copilot activity in this period')).toBeNull()
  })
})

describe('SLAs and workflows card', () => {
  it('is titled SLAs and workflows and reads No data for an untracked clock', async () => {
    hoisted.support.mockResolvedValue(QUIET_SUPPORT)
    renderWithClient(<SupportPerformanceCard range={RANGE} />)
    expect(await screen.findByText('SLAs and workflows')).toBeInTheDocument()
    expect(screen.queryByText('Performance')).toBeNull()
    expect(screen.queryByText(/last 30 days/i)).toBeNull()
    const empty = await screen.findAllByText('No data')
    expect(empty).toHaveLength(4)
    for (const value of empty) expect(value).toHaveAttribute('data-muted', 'true')
  })
})
