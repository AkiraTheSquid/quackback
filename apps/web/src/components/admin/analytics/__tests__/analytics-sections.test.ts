import { describe, it, expect } from 'vitest'
import { SECTION_NAV_ITEMS } from '../analytics-sections'
import { ENTITY_ICONS } from '@/components/admin/entity-icon'

function item(key: string) {
  const found = SECTION_NAV_ITEMS.find((i) => i.key === key)
  if (!found) throw new Error(`missing section ${key}`)
  return found
}

describe('SECTION_NAV_ITEMS', () => {
  it('uses the rail icon for each product section', () => {
    expect(item('feedback').icon).toBe(ENTITY_ICONS.post)
    expect(item('support').icon).toBe(ENTITY_ICONS.conversation)
    expect(item('changelog').icon).toBe(ENTITY_ICONS.changelog)
  })

  it('names the assistant section Quinn', () => {
    expect(item('ai').label).toBe('Quinn')
  })
})
