import { ChatBubbleLeftIcon, LockClosedIcon } from '@heroicons/react/24/solid'
import { Badge } from '@/components/ui/badge'
import { RowIcon, SettingsList, SettingsListRow } from '@/components/admin/settings/settings-list'
import { normalizeBoardAccess, presetForAccess } from '@/lib/shared/schemas/boards'
import { ACCESS_TIER_RANK, type BoardAccess } from '@/lib/shared/db-types'

interface BoardRow {
  id: string
  slug: string
  name: string
  description: string | null
  access: BoardAccess
  postCount: number
}

function usesSegments(access: BoardAccess): boolean {
  return Object.values(access.segments ?? {}).some((ids) => ids.length > 0)
}

const PORTAL_TIERS = {
  view: 'anonymous',
  vote: 'authenticated',
  comment: 'authenticated',
  submit: 'authenticated',
} as const

/** True when any action is stricter than the portal default (anonymous view, signed-in actions). */
function narrowerThanPortal(access: BoardAccess): boolean {
  return (Object.keys(PORTAL_TIERS) as Array<keyof typeof PORTAL_TIERS>).some(
    (action) => ACCESS_TIER_RANK[access[action]] > ACCESS_TIER_RANK[PORTAL_TIERS[action]]
  )
}

/** A badge only for boards narrower than the portal; open boards stay quiet. */
function BoardAccessBadge({ access }: { access: BoardAccess }) {
  const normalized = normalizeBoardAccess(access)
  const preset = presetForAccess(normalized)
  if (preset === 'public') return null
  if (preset === 'custom' && !usesSegments(normalized) && !narrowerThanPortal(normalized)) {
    return null
  }
  return (
    <Badge size="sm" shape="pill" variant="secondary">
      {preset === 'private' ? (
        <>
          <LockClosedIcon />
          Team only
        </>
      ) : usesSegments(normalized) ? (
        'Segments'
      ) : (
        'Restricted'
      )}
    </Badge>
  )
}

function postCountLabel(count: number): string {
  return count === 1 ? '1 post' : `${count} posts`
}

export function BoardsList({ boards }: { boards: BoardRow[] }) {
  return (
    <SettingsList>
      {boards.map((board) => (
        <SettingsListRow
          key={board.id}
          to="/admin/settings/boards/$slug"
          params={{ slug: board.slug }}
          leading={<RowIcon icon={ChatBubbleLeftIcon} />}
          title={board.name}
          badges={<BoardAccessBadge access={board.access} />}
          meta={
            board.description
              ? `${board.description} · ${postCountLabel(board.postCount)}`
              : postCountLabel(board.postCount)
          }
        />
      ))}
    </SettingsList>
  )
}
