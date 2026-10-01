/**
 * Delta fork: "How important is this to you?" — five-level rating that rides
 * on the viewer's vote. Shared by the portal post page and the widget.
 */

import { useRef } from 'react'
import { useVoteImportance } from '@/lib/client/hooks/use-vote-importance'
import {
  IMPORTANCE_LEVELS,
  importanceLabel,
  type ImportanceLevel,
  type ImportanceSummary,
} from '@/lib/shared/importance'
import { cn } from '@/lib/shared/utils'
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
  /** Tighter type for the widget */
  compact?: boolean
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
  compact = false,
}: ImportancePickerProps) {
  const { summary, isPending, setImportance } = useVoteImportance({
    postId,
    initial,
    getAuthHeaders,
    onRated,
  })
  const busyRef = useRef(false)
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

  const averageText =
    summary.average == null
      ? null
      : `avg ${summary.average.toFixed(1)} · ${importanceLabel(Math.round(summary.average))}`

  return (
    <div
      data-testid="importance-picker"
      className={cn('space-y-1.5', inactive && 'opacity-60')}
      title={noAccessReason}
    >
      <p className={cn('font-medium text-foreground/80', compact ? 'text-xs' : 'text-sm')}>
        How important is this to you?
      </p>
      <div role="group" aria-label="Importance" className="grid grid-cols-5 gap-1">
        {IMPORTANCE_LEVELS.map(({ value, label }) => {
          const selected = summary.mine === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              aria-label={`${value}: ${label}`}
              disabled={isPending || inactive}
              onClick={() => choose(value)}
              className={cn(
                'flex flex-col items-center justify-start gap-0.5 rounded-md border px-1 py-1.5',
                'leading-tight text-center transition-colors duration-150',
                compact ? 'text-[10px]' : 'text-[11px]',
                selected
                  ? 'border-post-card-voted/60 bg-post-card-voted/15 text-post-card-voted'
                  : 'border-border/50 bg-muted/40 text-muted-foreground',
                !selected &&
                  !inactive &&
                  'hover:border-border hover:bg-muted/60 hover:text-foreground/80',
                inactive ? 'cursor-not-allowed' : 'cursor-pointer',
                isPending && 'cursor-wait'
              )}
            >
              <span className={cn('font-semibold tabular-nums', compact ? 'text-xs' : 'text-sm')}>
                {value}
              </span>
              <span>{label}</span>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground/70" data-testid="importance-summary">
        {summary.ratingCount === 0
          ? 'No ratings yet'
          : `${summary.ratingCount} ${summary.ratingCount === 1 ? 'rating' : 'ratings'} · ${averageText}`}
      </p>
    </div>
  )
}
