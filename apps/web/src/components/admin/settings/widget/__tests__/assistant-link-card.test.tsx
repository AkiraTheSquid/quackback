// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { IntlProvider } from 'react-intl'

vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  }
})

const { AssistantLinkCard } = await import('../widget-settings-page')

function renderCard(assistant?: { enabled?: boolean; name?: string }) {
  return render(
    <IntlProvider locale="en" defaultLocale="en">
      <AssistantLinkCard assistant={assistant} />
    </IntlProvider>
  )
}

describe('AssistantLinkCard', () => {
  afterEach(cleanup)

  it('is a row named Quinn that links to AI & Automation', () => {
    renderCard({ enabled: true })
    const row = document.querySelector('[data-slot="settings-list-row"]') as HTMLElement
    expect(row.getAttribute('href')).toBe('/admin/automation/agent')
    expect(row).toHaveTextContent('Quinn')
    expect(screen.queryByText('Assistant')).toBeNull()
    expect(screen.queryByText(/assistant off/i)).toBeNull()
  })

  it('keeps the name Quinn and marks it Off when it is turned off', () => {
    renderCard({ enabled: false, name: 'Helper' })
    const row = document.querySelector('[data-slot="settings-list-row"]') as HTMLElement
    expect(row).toHaveTextContent('Quinn')
    expect(row).toHaveTextContent('Off')
    expect(row).toHaveTextContent('Turn it on in AI & Automation')
  })

  it('describes the live state when it is on', () => {
    renderCard({ enabled: true })
    const row = document.querySelector('[data-slot="settings-list-row"]') as HTMLElement
    expect(row).toHaveTextContent('Configure in AI & Automation')
    expect(row).not.toHaveTextContent('Off')
  })
})
