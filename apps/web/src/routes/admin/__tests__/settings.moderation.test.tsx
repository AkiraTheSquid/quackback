// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IntlProvider } from 'react-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const invalidate = vi.fn()
vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useRouter: () => ({ invalidate }),
    Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  }
})

const portalConfig = {
  features: { allowAnonymous: true },
  moderationDefault: { requireApproval: 'none', holdImages: false, holdLinks: false },
}
vi.mock('@tanstack/react-query', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return { ...actual, useSuspenseQuery: () => ({ data: portalConfig }) }
})

const mutateAsync = vi.fn()
vi.mock('@/lib/client/mutations/settings', () => ({
  useUpdateModerationDefault: () => ({ mutateAsync }),
}))

vi.mock('@/lib/client/queries/settings', () => ({
  settingsQueries: { portalConfig: () => ({ queryKey: ['portal'] }) },
}))

const { ModerationPage } = await import('@/components/admin/settings/moderation-settings-page')

function renderPage() {
  return render(
    <IntlProvider locale="en" defaultLocale="en">
      <QueryClientProvider client={new QueryClient()}>
        <ModerationPage />
      </QueryClientProvider>
    </IntlProvider>
  )
}

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({})
  invalidate.mockReset()
})
afterEach(cleanup)

describe('Moderation page', () => {
  it('has the standard header, with a breadcrumb and a link to the review queue', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Moderation' })).toBeInTheDocument()
    expect(screen.getByText('Feedback & Roadmaps')).toBeInTheDocument()
    const queue = screen.getByRole('link', { name: /open queue/i })
    expect(queue.getAttribute('href')).toBe('/admin/moderation')
  })

  it('keeps approval and content-review cards as shared setting rows', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Approval' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Content review' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Anonymous access' })).not.toBeInTheDocument()

    expect(screen.getByLabelText('Anonymous posts')).toBeInTheDocument()
    expect(screen.getByLabelText('Signed-in posts')).toBeInTheDocument()
    expect(screen.getByLabelText('Images')).toBeInTheDocument()
    expect(screen.getByLabelText('Links')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-slot="setting-row"]')).toHaveLength(4)
  })

  it('saves a toggle immediately and lets the autosave handler report failures', async () => {
    renderPage()
    fireEvent.click(screen.getByLabelText('Anonymous posts'))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ requireApproval: 'anonymous' }))
  })

  it('reverts the switch when the save fails', async () => {
    mutateAsync.mockRejectedValue(new Error('boom'))
    renderPage()
    const images = screen.getByLabelText('Images')
    fireEvent.click(images)
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    await waitFor(() => expect(images).not.toBeChecked())
  })

  it('has no per-switch spinner', () => {
    renderPage()
    expect(document.querySelector('.animate-spin')).toBeNull()
  })
})
