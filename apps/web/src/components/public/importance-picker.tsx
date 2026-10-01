/**
 * Delta fork: "How important is this to you?" — five-level rating that rides
 * on the viewer's vote. Shared by the post lists (variant "row") and the post
 * detail pages (variant "detail"), in both the portal and the widget.
 */

import { useRef, useState } from 'react'
import { useVoteImportance } from '@/lib/client/hooks/use-vote-importance'
import {
  importanceLabel,
  type ImportanceLevel,
  type ImportanceSummary,
} from '@/lib/shared/importance'
import { cn } from '@/lib/shared/utils'
import { ImportanceLine } from '@/components/public/importance-line'
import type { PostId } from '@quackback/ids'

interface ImportancePickerProps {
  postId: PostId
  initial?: ImportanceSummary
  getAuthHeaders?: () => Record<string, string>
  /** Structurally disabled (e.g. merged post) */
  disabled?: boolean
  /** Signed-out viewer: clicking runs this instead of rating */
  onAuthRequired?: () => void
  /** Signed-in viewer the board denies: dimmed, reason as tooltip */
  noAccessReason?: string
  /** Async pre-step (session bootstrap). Return false to cancel. */
  onBeforeRate?: () => Promise<boolean>
  onRated?: (result: { newlyVoted: boolean; voteCount: number }) => void
  /** "row": one line under a list item. "detail": heading, labels, summary. */
  variant?: 'detail' | 'row'
  /** Tighter type for the widget */
  compact?: boolean
  className?: string
}

export function ImportancePicker({
  postId,
  initial,
  getAuthHeaders,
  disabled = false,
  onAuthRequired,
  noAccessReason,
  onBeforeRate,
  onRated,
  variant = 'detail',
  compact = false,
  className,
}: ImportancePickerProps) {
  const { summary, isPending, setImportance } = useVoteImportance({
    postId,
    initial,
    getAuthHeaders,
    onRated,
  })
  const busyRef = useRef(false)
  const [hovered, setHovered] = useState<ImportanceLevel | null>(null)
  const inactive = disabled || !!noAccessReason

  async function choose(level: ImportanceLevel) {
    if (inactive || isPending || busyRef.current) return
    if (onAuthRequired) {
      onAuthRequired()
      return
    }
    if (onBeforeRate) {
      busyRef.current = true
      try {
        if (!(await onBeforeRate())) return
      } finally {
        busyRef.current = false
      }
    }
    // Clicking your current rating clears it (the vote stays).
    setImportance(summary.mine === level ? null : level)
  }

  const avg = summary.average
  const avgText = avg == null ? null : avg.toFixed(1)
  const avgLabel = avg == null ? null : importanceLabel(Math.round(avg))

  if (variant === 'row') {
    return (
      <div
        data-testid="importance-picker"
        className={cn(
          'flex flex-wrap items-center gap-x-2 gap-y-1',
          inactive && 'opacity-60',
          className
        )}
        title={noAccessReason}
      >
        <ImportanceLine
          summary={summary}
          onRate={choose}
          size="md"
          inactive={inactive}
          pending={isPending}
          onPreview={setHovered}
          className={compact ? 'w-40 shrink-0' : 'w-56 max-w-full shrink-0'}
        />
        <span
          data-testid="importance-summary"
          className={cn(
            'min-w-0 truncate tabular-nums',
            compact ? 'text-[10px]' : 'text-xs',
            hovered ? 'font-medium text-post-card-voted' : 'text-muted-foreground'
          )}
        >
          {hovered ? (
            importanceLabel(hovered)
          ) : avgText ? (
            <>
              <span className="font-semibold text-foreground">{avgText}</span>
              {compact
                ? ` avg · ${summary.ratingCount}`
                : ` avg · ${avgLabel} · ${summary.ratingCount} ${summary.ratingCount === 1 ? 'rating' : 'ratings'}`}
            </>
          ) : (
            'Rate importance'
          )}
        </span>
      </div>
    )
  }

  return (
    <div
      data-testid="importance-picker"
      className={cn('space-y-2', inactive && 'opacity-60', className)}
      title={noAccessReason}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn('font-medium text-foreground/80', compact ? 'text-xs' : 'text-sm')}>
          How important is this to you?
        </p>
        {avgText && (
          <div className="shrink-0 text-end leading-tight" data-testid="importance-average">
            <span
              className={cn(
                'font-bold tabular-nums text-post-card-voted',
                compact ? 'text-base' : 'text-xl'
              )}
            >
              {avgText}
            </span>
            <span className="text-[11px] text-muted-foreground"> / 5</span>
            <div className="text-[10px] text-muted-foreground">{avgLabel}</div>
          </div>
        )}
      </div>
      <ImportanceLine
        summary={summary}
        onRate={choose}
        size="lg"
        showLabels
        inactive={inactive}
        pending={isPending}
        onPreview={setHovered}
      />
      <p className="text-[11px] text-muted-foreground/70" data-testid="importance-summary">
        {summary.ratingCount === 0
          ? 'No ratings yet'
          : `${summary.ratingCount} ${summary.ratingCount === 1 ? 'rating' : 'ratings'} · avg ${avgText} · ${avgLabel}`}
        {summary.mine != null && !hovered && ' · yours is filled, click it again to clear'}
      </p>
    </div>
  )
}
