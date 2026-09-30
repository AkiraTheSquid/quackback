// @vitest-environment happy-dom
/**
 * NotificationMatrixForm's mount fetch.
 *
 * The portal preferences page's loader now fetches this data itself (folded
 * into the document response, same session/principal lookup the parent
 * layout already pays for) and hands it down as `initialPreferences`. The
 * form must use that seed instead of firing its own request; admin's
 * settings page has no such loader and keeps fetching on mount.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render as baseRender, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAutosaveMutationCache } from '@/lib/client/autosave'

const getNotificationPreferencesFn = vi.hoisted(() => vi.fn())
const updateNotificationPreferencesFn = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())
vi.mock('@/lib/server/functions/user', () => ({
  getNotificationPreferencesFn: (...args: unknown[]) => getNotificationPreferencesFn(...args),
  updateNotificationPreferencesFn: (...args: unknown[]) => updateNotificationPreferencesFn(...args),
}))
vi.mock('sonner', () => ({ toast: { error: toastError } }))

function render(ui: React.ReactElement) {
  const client = new QueryClient({
    mutationCache: createAutosaveMutationCache(),
    defaultOptions: { mutations: { retry: false } },
  })
  return baseRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

import { NotificationMatrixForm } from '../notification-matrix-form'

const preferences = {
  emailStatusChange: true,
  emailNewComment: true,
  emailMuted: false,
  matrix: {},
}

beforeEach(() => {
  getNotificationPreferencesFn.mockReset()
  getNotificationPreferencesFn.mockResolvedValue(preferences)
  updateNotificationPreferencesFn.mockReset()
  toastError.mockReset()
})

afterEach(cleanup)

describe('NotificationMatrixForm', () => {
  it('uses initialPreferences instead of fetching, when the loader already supplied it', async () => {
    render(<NotificationMatrixForm surface="portal" initialPreferences={preferences} />)

    // Renders straight from the seed: the "pause all email" switch is on
    // screen with no loading spinner in between.
    expect(await screen.findByLabelText('Pause all email notifications')).toBeTruthy()
    expect(getNotificationPreferencesFn).not.toHaveBeenCalled()
  })

  it('falls back to its own fetch when no seed is supplied (admin surface)', async () => {
    render(<NotificationMatrixForm surface="admin" />)

    expect(await screen.findByLabelText('Pause all email notifications')).toBeTruthy()
    expect(getNotificationPreferencesFn).toHaveBeenCalledTimes(1)
  })

  it('offers in-app and email only, with line tabs', () => {
    render(<NotificationMatrixForm surface="admin" initialPreferences={preferences} />)

    expect(screen.getByText('In-app')).toBeTruthy()
    expect(screen.getByText('Email')).toBeTruthy()
    expect(screen.queryByText('Push')).toBeNull()
    expect(screen.queryByText('Soon')).toBeNull()
    expect(document.querySelector('[data-slot="tabs"]')?.getAttribute('data-variant')).toBe('line')
  })

  it('reverts a failed toggle and shows the one autosave toast', async () => {
    updateNotificationPreferencesFn.mockRejectedValue(new Error('boom'))
    render(<NotificationMatrixForm surface="admin" initialPreferences={preferences} />)

    const toggle = screen.getByLabelText('Pause all email notifications')
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't save. Try again."))
    expect(toastError).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(
        screen.getByLabelText('Pause all email notifications').getAttribute('aria-checked')
      ).toBe('false')
    )
    expect(screen.queryByText('boom')).toBeNull()
  })

  it('saves a toggled cell with the full matrix', async () => {
    updateNotificationPreferencesFn.mockResolvedValue({ ...preferences, emailMuted: true })
    render(<NotificationMatrixForm surface="admin" initialPreferences={preferences} />)

    fireEvent.click(screen.getByLabelText('Pause all email notifications'))

    await waitFor(() =>
      expect(updateNotificationPreferencesFn).toHaveBeenCalledWith({ data: { emailMuted: true } })
    )
  })
})
