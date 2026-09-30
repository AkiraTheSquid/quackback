/** Autosaving channel switches: routing, email auto-acknowledgement, the GitHub inbox. */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AUTOSAVE } from '@/lib/client/autosave'
import { channelSettingsQueries } from '@/lib/client/queries/channel-settings'
import { githubChannelStatusQuery } from '@/integrations/github/ui/github-channel-status-query'
import { updateConversationRoutingFn, updateEmailAutoAckFn } from '@/lib/server/functions/settings'
import { setGitHubInboxEnabledFn } from '@/integrations/github/server/functions'

export function useUpdateConversationRouting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) =>
      updateConversationRoutingFn({ data: { enabled, strategy: 'auto_assign_active' } }),
    meta: AUTOSAVE,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: channelSettingsQueries.routing().queryKey }),
  })
}

export function useUpdateEmailAutoAck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => updateEmailAutoAckFn({ data: { enabled } }),
    meta: AUTOSAVE,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: channelSettingsQueries.emailAutoAck().queryKey }),
  })
}

export function useSetGitHubInbox() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => setGitHubInboxEnabledFn({ data: { enabled } }),
    meta: AUTOSAVE,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: githubChannelStatusQuery().queryKey }),
  })
}
