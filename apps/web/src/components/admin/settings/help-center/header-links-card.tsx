import { useState } from 'react'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/solid'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUpdateHelpCenterConfig } from '@/lib/client/mutations/settings'
import { useDebouncedSave } from '@/lib/client/hooks/use-debounced-save'
import type { HelpCenterHeaderLink } from '@/lib/shared/types/settings'

const HEADER_LINKS_MAX = 3

/** Only rows with both a label and a URL are stored; half-typed rows stay local. */
function cleanLinks(links: HelpCenterHeaderLink[]): HelpCenterHeaderLink[] {
  return links
    .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
    .filter((l) => l.label !== '' && l.url !== '')
}

export function HeaderLinksCard({ links: initialLinks }: { links: HelpCenterHeaderLink[] }) {
  const [links, setLinks] = useState<HelpCenterHeaderLink[]>(initialLinks)
  const { mutate } = useUpdateHelpCenterConfig()

  // Typing saves debounced; `useDebouncedSave` flushes on unmount so leaving
  // the page mid-edit never drops a link.
  const { queue, flush } = useDebouncedSave<HelpCenterHeaderLink[]>(
    (next) => mutate({ headerLinks: cleanLinks(next) }),
    800
  )

  function edit(index: number, patch: Partial<HelpCenterHeaderLink>) {
    const next = links.map((l, i) => (i === index ? { ...l, ...patch } : l))
    setLinks(next)
    queue(next)
  }

  function remove(index: number) {
    const next = links.filter((_, i) => i !== index)
    setLinks(next)
    queue(next)
    flush()
  }

  function add() {
    setLinks((prev) => (prev.length >= HEADER_LINKS_MAX ? prev : [...prev, { label: '', url: '' }]))
  }

  return (
    <SettingsCard title="Header links" description="Up to 3 links beside the navigation">
      <div className="space-y-3">
        {links.length === 0 && <p className="text-sm text-muted-foreground">No header links.</p>}
        {links.map((link, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={link.label}
              onChange={(e) => edit(index, { label: e.target.value })}
              onBlur={flush}
              placeholder="Label"
              aria-label={`Link ${index + 1} label`}
              className="max-w-48"
            />
            <Input
              value={link.url}
              onChange={(e) => edit(index, { url: e.target.value })}
              onBlur={flush}
              placeholder="https://example.com or /path"
              aria-label={`Link ${index + 1} URL`}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => remove(index)}
              aria-label={`Remove link ${index + 1}`}
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={add}
          disabled={links.length >= HEADER_LINKS_MAX}
        >
          <PlusIcon className="me-2 h-4 w-4" />
          Add link
        </Button>
      </div>
    </SettingsCard>
  )
}
