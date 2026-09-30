import { useState, useTransition } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { settingsQueries } from '@/lib/client/queries/settings'
import { useUpdateModerationDefault } from '@/lib/client/mutations/settings'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/16/solid'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { SettingsPage } from '@/components/admin/settings/settings-page'
import { SettingRow, SettingRows } from '@/components/admin/settings/setting-row'
import { Switch } from '@/components/ui/switch'
import {
  requireApprovalToToggles,
  togglesToRequireApproval,
  type ApprovalToggles,
} from '@/lib/shared/moderation-policy'

export function ModerationPage() {
  const router = useRouter()
  const updateModerationDefault = useUpdateModerationDefault()
  const portalConfigQuery = useSuspenseQuery(settingsQueries.portalConfig())
  const [isPending, startTransition] = useTransition()

  // Moderation toggles
  const [moderationToggles, setModerationToggles] = useState<ApprovalToggles>(() =>
    requireApprovalToToggles(portalConfigQuery.data.moderationDefault?.requireApproval ?? 'none')
  )
  const [holdImages, setHoldImages] = useState(
    portalConfigQuery.data.moderationDefault?.holdImages === true
  )
  const [holdLinks, setHoldLinks] = useState(
    portalConfigQuery.data.moderationDefault?.holdLinks === true
  )

  // Each switch saves on change. A failed save reverts it; the autosave
  // handler shows the one toast.
  async function updateModeration(key: keyof ApprovalToggles, checked: boolean) {
    const prev = moderationToggles
    const next = { ...moderationToggles, [key]: checked }
    setModerationToggles(next)
    try {
      await updateModerationDefault.mutateAsync({
        requireApproval: togglesToRequireApproval(next),
      })
      startTransition(() => router.invalidate())
    } catch {
      setModerationToggles(prev)
    }
  }

  async function updateContentHold(key: 'holdImages' | 'holdLinks', checked: boolean) {
    const setFlag = key === 'holdImages' ? setHoldImages : setHoldLinks
    setFlag(checked)
    try {
      await updateModerationDefault.mutateAsync({
        requireApproval: togglesToRequireApproval(moderationToggles),
        [key]: checked,
      })
      startTransition(() => router.invalidate())
    } catch {
      setFlag(!checked)
    }
  }

  const disabled = isPending

  return (
    <SettingsPage
      page="/admin/settings/moderation"
      crumbs={[{ label: 'Feedback & Roadmaps' }]}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/moderation">
            <ArrowTopRightOnSquareIcon className="size-4" />
            Open queue
          </Link>
        </Button>
      }
    >
      <SettingsCard
        title="Approval"
        description="Posts from these groups wait for review before they publish."
      >
        <SettingRows>
          <SettingRow
            label="Anonymous posts"
            htmlFor="moderate-anonymous"
            disabled={disabled}
            control={
              <Switch
                id="moderate-anonymous"
                checked={moderationToggles.anonymous}
                onCheckedChange={(checked) => updateModeration('anonymous', checked)}
                disabled={disabled}
              />
            }
          />
          <SettingRow
            label="Signed-in posts"
            htmlFor="moderate-authenticated"
            disabled={disabled}
            control={
              <Switch
                id="moderate-authenticated"
                checked={moderationToggles.authenticated}
                onCheckedChange={(checked) => updateModeration('authenticated', checked)}
                disabled={disabled}
              />
            }
          />
        </SettingRows>
      </SettingsCard>

      <SettingsCard
        title="Content review"
        description="Hold posts and comments for review when they contain:"
      >
        <SettingRows>
          <SettingRow
            label="Images"
            htmlFor="moderate-images"
            disabled={disabled}
            control={
              <Switch
                id="moderate-images"
                checked={holdImages}
                onCheckedChange={(checked) => updateContentHold('holdImages', checked)}
                disabled={disabled}
              />
            }
          />
          <SettingRow
            label="Links"
            htmlFor="moderate-links"
            disabled={disabled}
            control={
              <Switch
                id="moderate-links"
                checked={holdLinks}
                onCheckedChange={(checked) => updateContentHold('holdLinks', checked)}
                disabled={disabled}
              />
            }
          />
        </SettingRows>
      </SettingsCard>
    </SettingsPage>
  )
}
