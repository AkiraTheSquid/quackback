// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { IntlProvider } from 'react-intl'

vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: '/admin/automation/copilot' } }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...(rest as React.HTMLAttributes<HTMLAnchorElement>)}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/client/hooks/use-permission', () => ({ usePermission: () => true }))
vi.mock('@/lib/client/hooks/use-root-context', () => ({
  useWorkspaceSettings: () => ({ featureFlags: { supportInbox: true } }),
}))

import { AutomationNav, buildAutomationNavSections } from '../automation-nav'

afterEach(cleanup)

const ALL = { assistant: true, workflows: true, analytics: true }

describe('buildAutomationNavSections', () => {
  it('labels its two sections Agents and Operations', () => {
    const sections = buildAutomationNavSections({ supportInbox: true }, ALL)
    expect(sections.map((s) => s.defaultLabel)).toEqual(['Agents', 'Operations'])
    expect(sections[1]!.items.map((i) => i.to)).toEqual([
      '/admin/automation/workflows',
      '/admin/automation/performance',
    ])
  })
})

describe('AutomationNav', () => {
  it('shows both section labels', () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <AutomationNav />
      </IntlProvider>
    )
    expect(screen.getByText('Agents')).toBeTruthy()
    expect(screen.getByText('Operations')).toBeTruthy()
  })

  it('fills the active row with the muted tone, not the primary tint', () => {
    const { container } = render(
      <IntlProvider locale="en" messages={{}}>
        <AutomationNav />
      </IntlProvider>
    )
    const active = container.querySelector('a[href="/admin/automation/copilot"]')!
    expect(active.className).toContain('bg-muted')
    expect(active.className).not.toContain('bg-primary')
  })
})
