import { describe, expect, it } from 'vitest'
import { isRedirect } from '@tanstack/react-router'
import { Route } from '../admin/settings.labs'

describe('settings labs route', () => {
  it('sends old links and bookmarks to General', async () => {
    const beforeLoad = Route.options.beforeLoad as () => unknown
    let thrown: unknown
    try {
      await beforeLoad()
    } catch (error) {
      thrown = error
    }
    expect(isRedirect(thrown)).toBe(true)
    expect((thrown as { options: { to: string } }).options.to).toBe('/admin/settings/general')
  })
})
