import { SettingsPage } from '@/components/admin/settings/settings-page'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { ImportCsv } from './import-csv'
import { ImportHistoryList } from './import-history-list'
import { ExportWorkspaceAction } from './export-workspace-action'
import { ExportHistoryList } from './export-history-list'

export function ImportsHubPage() {
  return (
    <SettingsPage page="/admin/settings/imports" width="wide">
      <SettingsCard title="Import" description="Upload a CSV of posts.">
        <ImportCsv />
      </SettingsCard>

      <SettingsCard
        title="Export workspace data"
        description="Everything as one ZIP. Download links expire after 7 days."
        action={<ExportWorkspaceAction />}
      >
        <ExportHistoryList />
      </SettingsCard>

      <SettingsCard title="Import history" description="Recent import runs and their results.">
        <ImportHistoryList />
      </SettingsCard>
    </SettingsPage>
  )
}
