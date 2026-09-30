import { describe, expect, it } from 'vitest'
import {
  inScope,
  offends,
  stripComments,
  usedRegistryPaths,
  type FileRuleName,
} from './admin-consistency.rules'

const SETTINGS_FILE = 'components/admin/settings/example.tsx'
const ROUTE_FILE = 'routes/admin/settings.example.tsx'

describe('stripComments', () => {
  it('removes line and block comments but keeps strings that look like comments', () => {
    const src = `const a = 'https://x.test' // New Entry\n/* Add new */ const b = "// keep"\n`
    const out = stripComments(src)
    expect(out).toContain("'https://x.test'")
    expect(out).toContain('"// keep"')
    expect(out).not.toContain('New Entry')
    expect(out).not.toContain('Add new')
  })

  it('keeps line numbers stable', () => {
    expect(stripComments('a\n/* x\ny */\nb').split('\n')).toHaveLength(4)
  })
})

describe('scopes', () => {
  it('limits settings rules to settings and automation files', () => {
    expect(inScope('page-shell', 'routes/admin/settings.tags.tsx')).toBe(true)
    expect(inScope('page-shell', 'routes/admin/automation.agent.tsx')).toBe(true)
    expect(inScope('page-shell', 'components/admin/settings/tags/tags-list.tsx')).toBe(true)
    expect(inScope('page-shell', 'components/admin/automation/skills-list.tsx')).toBe(true)
    expect(inScope('page-shell', 'components/admin/feedback/inbox-container.tsx')).toBe(false)
    expect(inScope('page-shell', 'components/admin/settings/__tests__/x.test.tsx')).toBe(false)
  })

  it('applies copy rules to every admin file', () => {
    expect(inScope('create-labels', 'components/admin/feedback/inbox-container.tsx')).toBe(true)
    expect(inScope('no-dashes', 'routes/admin/index.tsx')).toBe(true)
    expect(inScope('no-dashes', 'components/shared/x.tsx')).toBe(false)
  })

  it('excepts the shell primitives and layout files', () => {
    expect(inScope('page-shell', 'components/admin/settings/settings-page.tsx')).toBe(false)
    expect(inScope('page-shell', 'routes/admin/settings.tsx')).toBe(false)
    expect(inScope('page-shell', 'routes/admin/automation.tsx')).toBe(false)
    expect(inScope('page-width', 'components/admin/settings/settings-page.tsx')).toBe(false)
  })
})

const CASES: Array<{ rule: FileRuleName; file?: string; bad: string; good: string }> = [
  {
    rule: 'page-shell',
    bad: `import { PageHeader } from '@/components/shared/page-header'\nexport const A = () => <PageHeader title="x" />`,
    good: `import { SettingsPage } from '@/components/admin/settings/settings-page'`,
  },
  {
    rule: 'page-shell',
    bad: `export const A = () => <h1 className="x">Title</h1>`,
    good: `export const A = () => <h2>Section</h2>`,
  },
  {
    rule: 'page-width',
    bad: `<div className="max-w-3xl space-y-6">`,
    good: `<div className="max-w-md space-y-6">`,
  },
  { rule: 'page-width', bad: `cn('max-w-5xl')`, good: `cn('max-w-xs')` },
  {
    rule: 'create-labels',
    file: ROUTE_FILE,
    bad: `<Button>Add new board</Button>`,
    good: `<Button>New board</Button>`,
  },
  {
    rule: 'create-labels',
    bad: `const label = 'Create Key'`,
    good: `const label = 'Create key'`,
  },
  { rule: 'create-labels', bad: `<Button>New Entry</Button>`, good: `<Button>New entry</Button>` },
  {
    rule: 'create-labels',
    bad: `// fine in a comment\nconst x = "Add Member"`,
    good: `// Add Member in a comment is ignored\nconst x = "Add member"`,
  },
  { rule: 'no-dashes', bad: `<p>One — two</p>`, good: `<p>One, two</p>` },
  { rule: 'no-dashes', bad: `const s = 'a – b'`, good: `const s = 'a, b'` },
  {
    rule: 'no-dashes',
    bad: `const s = \`a — b\``,
    good: `// a — b in a comment\nconst s = 'a'`,
  },
  {
    rule: 'tab-icons',
    bad: `<TabsTrigger value="a"><CogIcon className="h-4" />General</TabsTrigger>`,
    good: `<TabsTrigger value="a">General</TabsTrigger>`,
  },
  {
    rule: 'tab-icons',
    bad: `<TabsTrigger value="a">\n  <Squares2X2Icon />\n  Boards\n</TabsTrigger>`,
    good: `<TabsTrigger value="a">Boards</TabsTrigger>\n<CogIcon />`,
  },
  {
    rule: 'toggle-rows',
    bad: `<Switch checked={on} onCheckedChange={setOn} />`,
    good: `<SettingRow label="On" control={<Switch checked={on} />} />`,
  },
  {
    rule: 'palette',
    bad: `<span className="text-green-500">`,
    good: `<span className="text-success">`,
  },
  { rule: 'palette', bad: `cn('bg-amber-100 dark:bg-amber-900')`, good: `cn('bg-warning/10')` },
  { rule: 'palette', bad: `'border-rose-300'`, good: `'border-destructive'` },
]

describe('matchers', () => {
  it.each(CASES)('$rule flags an offending source and accepts a compliant one (%#)', (c) => {
    const file = c.file ?? SETTINGS_FILE
    expect(offends(c.rule, file, c.bad)).toBe(true)
    expect(offends(c.rule, file, c.good)).toBe(false)
  })

  it('never flags a file outside the rule scope', () => {
    expect(offends('palette', 'components/admin/feedback/x.tsx', 'text-green-500')).toBe(false)
    expect(offends('toggle-rows', 'components/admin/feedback/x.tsx', '<Switch />')).toBe(false)
  })

  it('does not treat a SettingRows-only file as a setting-row file', () => {
    expect(offends('toggle-rows', SETTINGS_FILE, '<SettingRowsX /><Switch />')).toBe(true)
  })
})

describe('usedRegistryPaths', () => {
  it('finds page="<path>" props', () => {
    const used = usedRegistryPaths([
      { file: 'a.tsx', src: `<SettingsPage page="/admin/settings/tags">` },
      { file: 'b.tsx', src: `<SettingsPage page='/admin/automation/agent' area="automation">` },
      { file: 'c.tsx', src: `// <SettingsPage page="/admin/settings/boards">` },
    ])
    expect([...used].sort()).toEqual(['/admin/automation/agent', '/admin/settings/tags'])
  })
})
