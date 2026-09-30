import type { ElementType } from 'react'
import { ChartBarIcon, UsersIcon, GlobeAltIcon, SparklesIcon } from '@heroicons/react/24/solid'
import { ENTITY_ICONS } from '@/components/admin/entity-icon'

export type Section =
  'overview' | 'visitors' | 'feedback' | 'support' | 'ai' | 'changelog' | 'users'

export interface SectionNavItem {
  key: Section
  label: string
  icon: ElementType
}

export const SECTION_NAV_ITEMS: SectionNavItem[] = [
  { key: 'overview', label: 'Overview', icon: ChartBarIcon },
  { key: 'visitors', label: 'Visitors', icon: GlobeAltIcon },
  { key: 'feedback', label: 'Feedback', icon: ENTITY_ICONS.post },
  { key: 'support', label: 'Support', icon: ENTITY_ICONS.conversation },
  { key: 'ai', label: 'Quinn', icon: SparklesIcon },
  { key: 'changelog', label: 'Changelog', icon: ENTITY_ICONS.changelog },
  { key: 'users', label: 'Users', icon: UsersIcon },
]
