// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HeaderLinksCard } from '../header-links-card'

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }))

vi.mock('@/lib/client/mutations/settings', () => ({
  useUpdateHelpCenterConfig: () => ({ mutate, isPending: false }),
}))

beforeEach(() => {
  vi.useFakeTimers()
  mutate.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('HeaderLinksCard', () => {
  it('shows a muted empty line and no Save links button', () => {
    render(<HeaderLinksCard links={[]} />)
    expect(screen.getByText('No header links.')).toBeTruthy()
    expect(screen.queryByText('Save links')).toBeNull()
  })

  it('does not save when a blank row is added', () => {
    render(<HeaderLinksCard links={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Add link/ }))
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByLabelText('Link 1 label')).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('autosaves the cleaned links after typing, dropping incomplete rows', () => {
    render(<HeaderLinksCard links={[{ label: 'Docs', url: '/docs' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /Add link/ }))
    fireEvent.change(screen.getByLabelText('Link 1 label'), { target: { value: ' Blog ' } })
    expect(mutate).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(900)
    })
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith({ headerLinks: [{ label: 'Blog', url: '/docs' }] })
  })

  it('saves right away when a link is removed', () => {
    render(
      <HeaderLinksCard
        links={[
          { label: 'Docs', url: '/docs' },
          { label: 'Blog', url: '/blog' },
        ]}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove link 1' }))
    expect(mutate).toHaveBeenCalledWith({ headerLinks: [{ label: 'Blog', url: '/blog' }] })
  })
})
