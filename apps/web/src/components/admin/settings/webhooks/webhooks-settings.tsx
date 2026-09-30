'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { BoltIcon } from '@heroicons/react/24/outline'
import { EmptyState } from '@/components/shared/empty-state'
import { NewButton } from '@/components/shared/new-button'
import { StateBadge, type BadgeState } from '@/components/shared/state-badge'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import {
  RowIcon,
  SettingsList,
  SettingsListRow,
} from '@/components/admin/settings/settings-list'
import { UpgradeModal } from '@/components/admin/upgrade'
import { CreateWebhookDialog } from './create-webhook-dialog'
import { EditWebhookDialog } from './edit-webhook-dialog'
import { DeleteWebhookDialog } from './delete-webhook-dialog'
import type { Webhook } from '@/lib/shared/types'

const EVENT_LABELS: Record<string, string> = {
  'post.created': 'New post',
  'post.status_changed': 'Status changed',
  'comment.created': 'New comment',
  'changelog.published': 'Changelog published',
}

interface WebhooksSettingsProps {
  webhooks: Webhook[]
  entitled: boolean
}

export function WebhooksSettings({ webhooks, entitled }: WebhooksSettingsProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [editWebhook, setEditWebhook] = useState<Webhook | null>(null)
  const [deleteWebhook, setDeleteWebhook] = useState<Webhook | null>(null)

  const requestCreate = () => {
    if (!entitled) {
      setUpgradeOpen(true)
      return
    }
    setCreateDialogOpen(true)
  }

  /** The default (active, no failures) state shows no badge. */
  const getStatusBadge = (webhook: Webhook) => {
    let state: BadgeState | null = null
    let title: string | undefined
    if (webhook.status === 'disabled') {
      if (webhook.failureCount >= 50) {
        state = 'error'
        title = `Auto-disabled after ${webhook.failureCount} failures`
      } else {
        state = 'off'
      }
    } else if (webhook.failureCount >= 25) {
      state = 'error'
      title = `${webhook.failureCount} consecutive failures`
    } else if (webhook.failureCount > 0) {
      state = 'attention'
      title = `${webhook.failureCount} consecutive failures`
    }
    if (!state) return null
    return (
      <span title={title}>
        <StateBadge state={state} />
      </span>
    )
  }

  const newWebhookButton = (
    <NewButton noun="webhook" onClick={requestCreate} disabled={webhooks.length >= 25} />
  )

  return (
    <>
      <SettingsCard
        title="Webhooks"
        description="Receive an HTTP POST when events happen in your workspace."
        action={newWebhookButton}
        contentClassName="p-0 sm:p-0"
      >
        {webhooks.length === 0 ? (
          <EmptyState
            size="compact"
            icon={BoltIcon}
            title="No webhooks yet"
            description="Get notified when posts are created, statuses change or comments arrive."
            action={newWebhookButton}
          />
        ) : (
          <SettingsList>
            {webhooks.map((webhook) => (
              <SettingsListRow
                key={webhook.id}
                leading={<RowIcon icon={BoltIcon} />}
                title={webhook.url}
                badges={getStatusBadge(webhook)}
                meta={
                  webhook.lastError && webhook.failureCount > 0 ? (
                    <span className="text-destructive" title={webhook.lastError}>
                      Error: {webhook.lastError}
                    </span>
                  ) : (
                    <>
                      {webhook.events.map((e) => EVENT_LABELS[e] || e).join(', ')}
                      {webhook.lastTriggeredAt &&
                        ` · Last fired ${formatDistanceToNow(webhook.lastTriggeredAt, { addSuffix: true })}`}
                    </>
                  )
                }
                actions={[
                  { label: 'Edit', onSelect: () => setEditWebhook(webhook) },
                  { label: 'Delete', destructive: true, onSelect: () => setDeleteWebhook(webhook) },
                ]}
              />
            ))}
          </SettingsList>
        )}
      </SettingsCard>

      {/* Dialogs */}
      <CreateWebhookDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onPlanRefusal={() => {
          setCreateDialogOpen(false)
          setUpgradeOpen(true)
        }}
      />
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} entitlement="webhooks" />

      {editWebhook && (
        <EditWebhookDialog
          webhook={editWebhook}
          open={!!editWebhook}
          onOpenChange={(open) => !open && setEditWebhook(null)}
        />
      )}

      {deleteWebhook && (
        <DeleteWebhookDialog
          webhook={deleteWebhook}
          open={!!deleteWebhook}
          onOpenChange={(open) => !open && setDeleteWebhook(null)}
        />
      )}
    </>
  )
}
