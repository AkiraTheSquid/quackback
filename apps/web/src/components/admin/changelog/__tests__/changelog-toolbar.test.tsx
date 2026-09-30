// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChangelogFilterButton, sortChangelogEntries } from '../changelog-filters'

afterEach(cleanup)

describe('ChangelogFilterButton', () => {
  it('offers the entry statuses under a Filter control', async () => {
    const onStatusChange = vi.fn()
    render(<ChangelogFilterButton status="all" onStatusChange={onStatusChange} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Filter' }))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Scheduled' }))
    expect(onStatusChange).toHaveBeenCalledWith('scheduled')
  })
})

describe('sortChangelogEntries', () => {
  const entries = [
    { id: 'a', displayDate: null, publishedAt: '2026-03-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'b', displayDate: null, publishedAt: null, createdAt: '2026-05-01T00:00:00Z' },
    { id: 'c', displayDate: '2026-04-01T00:00:00Z', publishedAt: null, createdAt: '2026-02-01T00:00:00Z' },
  ]
  it('puts the latest date first for newest', () => {
    expect(sortChangelogEntries(entries, 'newest').map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })
  it('puts the earliest date first for oldest', () => {
    expect(sortChangelogEntries(entries, 'oldest').map((e) => e.id)).toEqual(['a', 'c', 'b'])
  })
})
