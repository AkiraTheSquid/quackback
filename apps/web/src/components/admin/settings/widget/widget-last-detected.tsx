import { TimeAgo } from '@/components/ui/time-ago'

/** Relative “Last detected …” line for the widget install ping. */
export function WidgetLastDetected({ at, inline }: { at?: string | null; inline?: boolean }) {
  if (!at) return null
  const parsed = new Date(at)
  if (Number.isNaN(parsed.getTime())) return null
  const content = (
    <>
      Last detected <TimeAgo date={at} />
    </>
  )
  if (inline) return <span title={parsed.toLocaleString()}>{content}</span>
  return (
    <p className="text-xs text-muted-foreground" title={parsed.toLocaleString()}>
      {content}
    </p>
  )
}
