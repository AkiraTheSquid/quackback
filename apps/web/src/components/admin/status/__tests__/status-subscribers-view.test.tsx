// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined }),
  useInfiniteQuery: () => ({
    data: { pages: [{ items: [] }] },
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
  }),
}))
vi.mock('@/lib/client/queries/status', () => ({
  statusSubscriberQueries: { counts: () => ({}), list: () => ({}) },
}))
vi.mock('@/lib/client/mutations/status', () => ({
  useAddStatusSubscriber: () => ({ mutate: vi.fn(), isPending: false }),
  useImportStatusSubscribers: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/lib/server/functions/status', () => ({ exportStatusSubscribersAdminFn: vi.fn() }))
vi.mock('@/lib/client/hooks/use-infinite-scroll', () => ({ useInfiniteScroll: () => vi.fn() }))

const { StatusSubscribersView } = await import('../status-subscribers-view')

afterEach(cleanup)

describe('StatusSubscribersView', () => {
  it('labels the bulk add action Add subscribers', () => {
    render(<StatusSubscribersView />)
    expect(screen.getByRole('button', { name: 'Add subscribers' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New subscriber' })).toBeNull()
  })
})
