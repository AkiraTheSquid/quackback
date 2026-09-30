/**
 * The rules behind the admin consistency guard. Paths are relative to
 * `apps/web/src`. Kept apart from the test so the allowlist generator script
 * runs the same matchers.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export const RULE_NAMES = [
  'page-shell',
  'page-width',
  'registry-pages',
  'create-labels',
  'no-dashes',
  'tab-icons',
  'toggle-rows',
  'palette',
] as const
export type RuleName = (typeof RULE_NAMES)[number]

/** Rules whose allowlist holds source files (registry-pages lists registry paths). */
export type FileRuleName = Exclude<RuleName, 'registry-pages'>

/** Blanks out comments, keeping strings, template text and line numbers intact. */
export function stripComments(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      out += src.slice(i, stop).replace(/[^\n]/g, ' ')
      i = stop
    } else if (c === "'" || c === '"') {
      let j = i + 1
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      out += src.slice(i, j + 1)
      i = j + 1
    } else if (c === '`') {
      let j = i + 1
      while (j < src.length && src[j] !== '`') j += src[j] === '\\' ? 2 : 1
      out += src.slice(i, j + 1)
      i = j + 1
    } else {
      out += c
      i++
    }
  }
  return out
}

/** String literals and JSX text of comment-free source. */
function textSegments(code: string): string[] {
  const segments: string[] = []
  for (const m of code.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) {
    segments.push(m[0])
  }
  for (const m of code.matchAll(/>([^<>{}]+)</g)) segments.push(m[1]!)
  return segments
}

const SKIP = /(^|\/)__tests__\/|\.test\.tsx?$|\.d\.ts$/

const isAdminFile = (file: string) =>
  /^(routes|components)\/admin\//.test(file) && /\.tsx?$/.test(file) && !SKIP.test(file)

const isSettingsOrAutomationFile = (file: string) =>
  isAdminFile(file) &&
  (/^routes\/admin\/(settings|automation)[._/]/.test(file) ||
    /^routes\/admin\/(settings|automation)\.tsx$/.test(file) ||
    /^components\/admin\/(settings|automation)\//.test(file))

const SHELL_PRIMITIVES = new Set([
  'components/admin/settings/settings-page.tsx',
  'routes/admin/settings.tsx',
  'routes/admin/automation.tsx',
])

/** Whether `file` is one the rule looks at. */
export function inScope(rule: FileRuleName, file: string): boolean {
  switch (rule) {
    case 'create-labels':
    case 'no-dashes':
      return isAdminFile(file)
    case 'page-shell':
      return isSettingsOrAutomationFile(file) && !SHELL_PRIMITIVES.has(file)
    case 'page-width':
      return (
        isSettingsOrAutomationFile(file) && file !== 'components/admin/settings/settings-page.tsx'
      )
    default:
      return isSettingsOrAutomationFile(file)
  }
}

const PALETTE =
  /\b(?:text|bg|border|ring|fill|stroke)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/

const TAB_TRIGGER = /<TabsTrigger\b[\s\S]*?<\/TabsTrigger>/g

const MATCHERS: Record<FileRuleName, (code: string) => boolean> = {
  'page-shell': (code) =>
    /import\s[^;]*\bPageHeader\b[^;]*from\s/.test(code) || /<h1[\s>]/.test(code),
  'page-width': (code) => /\bmax-w-(?:2xl|3xl|4xl|5xl|6xl|7xl)\b/.test(code),
  'create-labels': (code) =>
    textSegments(code).some(
      (text) => /\bAdd new\b/.test(text) || /\b(?:New|Add|Create) [A-Z][a-z]+/.test(text)
    ),
  'no-dashes': (code) => textSegments(code).some((text) => /[\u2013\u2014]/.test(text)),
  'tab-icons': (code) =>
    (code.match(TAB_TRIGGER) ?? []).some((trigger) => /<[A-Z]\w*Icon\b/.test(trigger)),
  'toggle-rows': (code) => /<Switch\b/.test(code) && !/\bSettingRow\b/.test(code),
  palette: (code) => PALETTE.test(code),
}

/** Whether a source file breaks the rule (false for files outside its scope). */
export function offends(rule: FileRuleName, file: string, src: string): boolean {
  return inScope(rule, file) && MATCHERS[rule](stripComments(src))
}

/** The registry paths some file passes as `page="<path>"`. */
export function usedRegistryPaths(files: Array<{ file: string; src: string }>): Set<string> {
  const used = new Set<string>()
  for (const { src } of files) {
    for (const m of stripComments(src).matchAll(/\bpage=(?:"([^"]+)"|'([^']+)')/g)) {
      used.add((m[1] ?? m[2])!)
    }
  }
  return used
}

export const SRC_ROOT = join(import.meta.dirname, '..', '..', '..')

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
}

/** Every admin source file, path relative to `src`, with its contents. */
export function readAdminFiles(): Array<{ file: string; src: string }> {
  const paths: string[] = []
  walk(join(SRC_ROOT, 'routes', 'admin'), paths)
  walk(join(SRC_ROOT, 'components', 'admin'), paths)
  return paths
    .map((path) => relative(SRC_ROOT, path).split('\\').join('/'))
    .filter(isAdminFile)
    .sort()
    .map((file) => ({ file, src: readFileSync(join(SRC_ROOT, file), 'utf8') }))
}

/** Today's offenders per rule, for the test and the allowlist generator. */
export function scanAdminFiles(registryPaths: readonly string[]): Record<RuleName, string[]> {
  const files = readAdminFiles()
  const result = {} as Record<RuleName, string[]>
  for (const rule of RULE_NAMES) {
    if (rule === 'registry-pages') continue
    result[rule] = files.filter(({ file, src }) => offends(rule, file, src)).map(({ file }) => file)
  }
  const used = usedRegistryPaths(files)
  result['registry-pages'] = registryPaths.filter((path) => !used.has(path)).sort()
  return result
}
