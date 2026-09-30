// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LabelsCard } from '../labels-card'

vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: vi.fn() }) }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }) }))
vi.mock('@/lib/client/queries/changelog', () => ({
  changelogCategoryQueries: { segments: () => ({ queryKey: ['segs'] }) },
}))
vi.mock('@/lib/server/functions/changelog-categories', () => ({
  createChangelogCategoryFn: vi.fn(),
  updateChangelogCategoryFn: vi.fn(),
  deleteChangelogCategoryFn: vi.fn(),
  reorderChangelogCategoriesFn: vi.fn(),
}))
vi.mock('@/components/admin/segments/segment-multi-select', () => ({
  SegmentMultiSelect: () => null,
}))

afterEach(cleanup)

describe('LabelsCard', () => {
  it('shows the shared empty state and a New label button in the header', () => {
    render(<LabelsCard initialCategories={[]} />)
    expect(screen.getByText('No labels yet')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /New label/ })).toHaveLength(1)
    expect(screen.queryByText('Add new label')).toBeNull()
  })

  it('opens a Create label dialog', () => {
    render(<LabelsCard initialCategories={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /New label/ }))
    expect(screen.getByRole('button', { name: 'Create label' })).toBeTruthy()
    expect(screen.queryByText('New category')).toBeNull()
  })
})
