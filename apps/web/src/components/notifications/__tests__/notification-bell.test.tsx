// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('@/lib/client/hooks/use-notifications-queries', () => ({
  useUnreadCount: () => ({ data: 0 }),
}))
vi.mock('../notification-dropdown', () => ({ NotificationDropdown: () => null }))

import { NotificationBell } from '../notification-bell'

afterEach(cleanup)

describe('NotificationBell', () => {
  it('draws a solid icon, like every other rail item', () => {
    render(
      <TooltipProvider>
        <NotificationBell />
      </TooltipProvider>
    )
    const svg = screen.getByRole('button', { name: 'Notifications' }).querySelector('svg')!
    expect(svg.getAttribute('fill')).toBe('currentColor')
  })
})
