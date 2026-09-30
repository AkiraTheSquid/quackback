// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { WorkspaceDangerCard } from '../workspace-danger-card'

vi.mock('@/lib/server/functions/workspace-wipe', () => ({
  wipeCloudWorkspaceFn: vi.fn(),
}))

describe('WorkspaceDangerCard', () => {
  afterEach(cleanup)

  it('renders nothing when there is no irreversible action to offer', () => {
    const { container } = render(<WorkspaceDangerCard cloudEnabled={false} />)
    expect(container.textContent).toBe('')
  })

  it('holds only an outline Delete workspace action, never an export', () => {
    render(<WorkspaceDangerCard cloudEnabled />)
    expect(screen.getByRole('heading', { name: 'Danger zone' })).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Delete workspace' })
    expect(button.classList.contains('text-destructive')).toBe(true)
    expect(button.classList.contains('bg-destructive')).toBe(false)
    expect(button.classList.contains('bg-primary')).toBe(false)
    expect(screen.queryByText(/export/i)).toBeNull()
  })
})
