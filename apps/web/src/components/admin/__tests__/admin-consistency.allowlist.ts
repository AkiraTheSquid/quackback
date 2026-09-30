import type { RuleName } from './admin-consistency.rules'

/** Files (or, for registry-pages, registry paths) that do not comply yet. Entries only shrink. */
export const ALLOWLIST: Record<RuleName, string[]> = {
  'page-shell': ['components/admin/settings/labs/labs-settings.tsx'],
  'page-width': [
    'components/admin/automation/workflow-builder/version-history-sheet.tsx',
    'components/admin/automation/workflow-runs-sheet.tsx',
    'components/admin/settings/labs/labs-settings.tsx',
  ],
  'registry-pages': ['/admin/settings/feedback', '/admin/settings/labs', '/admin/settings/support'],
  'create-labels': [],
  'no-dashes': [],
  'tab-icons': [],
  'toggle-rows': [
    'components/admin/automation/workflow-builder/inspector/collect-data-editor.tsx',
    'components/admin/automation/workflow-builder/inspector/csat-editor.tsx',
    'components/admin/automation/workflow-builder/inspector/reply-buttons-editor.tsx',
    // A switch on a provider tile in a card grid, not a setting row.
    'components/admin/settings/auth-shared/oauth-provider-grid.tsx',
    'components/admin/settings/branding/portal-nav-editor.tsx',
    'components/admin/settings/labs/labs-settings.tsx',
    // The Enabled switch sits in the page header actions, not in a setting row.
    'components/admin/settings/security/identity-providers/provider-detail-page.tsx',
    // A switch inside a provider list row, not a setting row.
    'components/admin/settings/security/identity-providers/provider-list.tsx',
    'components/admin/settings/statuses/status-list.tsx',
    'components/admin/settings/tickets/fields-editor.tsx',
  ],
  palette: [
    'components/admin/automation/connectors/connector-mark.tsx',
    'components/admin/automation/workflow-builder/canvas.tsx',
    'components/admin/automation/workflow-builder/inspector/collect-data-editor.tsx',
    'components/admin/automation/workflow-builder/inspector/inspector-panel.tsx',
    'components/admin/automation/workflow-builder/inspector/reply-buttons-editor.tsx',
    'components/admin/automation/workflow-builder/inspector/reply-time-editor.tsx',
    'components/admin/automation/workflow-builder/inspector/rule-group-builder.tsx',
    'components/admin/automation/workflow-builder/inspector/trigger-editor.tsx',
    'components/admin/automation/workflow-builder/json-panel.tsx',
    'components/admin/automation/workflow-builder/outline-rail.tsx',
    'components/admin/automation/workflow-builder/step-list.tsx',
    'components/admin/automation/workflow-builder/step-visuals.tsx',
    'components/admin/automation/workflow-builder/top-bar.tsx',
    'components/admin/automation/workflow-runs-sheet.tsx',
    'components/admin/automation/workflow-template-gallery.tsx',
    'components/admin/automation/workflow-templates.ts',
    'components/admin/settings/imports/import-csv.tsx',
    'components/admin/settings/integrations/integration-ui.tsx',
  ],
}
