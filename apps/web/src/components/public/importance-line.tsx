/**
 * Delta fork: the importance line — five nodes on a track, one per level.
 *
 * The track fills up to the average rating, with a pin at the exact average,
 * so the crowd's answer reads at a glance. The viewer's own rating is the
 * solid node; clicking a node rates, clicking your own node clears it.
 * Presentational only: ImportancePicker owns data, auth and the write.
 */

import { useState } from 'react'
import {
  IMPORTANCE_LEVELS,
  IMPORTANCE_MAX,
  IMPORTANCE_MIN,
  importanceLabel,
  type ImportanceLevel,
  type ImportanceSummary,
} from '@/lib/shared/importance'
import { cn } from '@/lib/shared/utils'

export type ImportanceLineSize = 'sm' | 'md' | 'lg'

const NODE: Record<ImportanceLineSize, { box: string; digit: string }> = {
  sm: { box: 'size-4', digit: 'text-[9px]' },
  md: { box: 'size-5', digit: 'text-[10px]' },
  lg: { box: 'size-7', digit: 'text-xs' },
}

interface ImportanceLineProps {
  summary: ImportanceSummary
  onRate: (level: ImportanceLevel) => void
  size?: ImportanceLineSize
  /** Level names under each node (detail view) */
  showLabels?: boolean
  /** Nodes can't be clicked (dimmed) */
  inactive?: boolean
  pending?: boolean
  /** Hover/focus preview, so a parent can show the hovered level's name */
  onPreview?: (level: ImportanceLevel | null) => void
  className?: string
}

/** Position of a 1-5 value along the track, as a percentage. */
function trackPercent(value: number): number {
  const clamped = Math.min(IMPORTANCE_MAX, Math.max(IMPORTANCE_MIN, value))
  return ((clamped - IMPORTANCE_MIN) / (IMPORTANCE_MAX - IMPORTANCE_MIN)) * 100
}

export function ImportanceLine({
  summary,
  onRate,
  size = 'md',
  showLabels = false,
  inactive = false,
  pending = false,
  onPreview,
  className,
}: ImportanceLineProps) {
  const [hovered, setHovered] = useState<ImportanceLevel | null>(null)
  const node = NODE[size]
  const avg = summary.average
  const avgPct = avg == null ? null : trackPercent(avg)

  function preview(level: ImportanceLevel | null) {
    setHovered(level)
    onPreview?.(level)
  }

  return (
    <div
      role="group"
      aria-label="How important is this to you?"
      data-testid="importance-line"
      className={cn('select-none', className)}
      // Lists wrap rows in links/click handlers: a near-miss click in the gaps
      // between nodes is swallowed rather than opening the post.
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onMouseLeave={() => preview(null)}
    >
      {/* Nodes and labels share one 5-column grid, so each label sits under its
          node; the track runs between the first and last column centres. */}
      <div className="relative grid grid-cols-5 items-center justify-items-center">
        <div className="pointer-events-none absolute inset-x-[10%] top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-border">
          {avgPct != null && (
            <>
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-post-card-voted/50"
                style={{ width: `${avgPct}%` }}
              />
              <div
                data-testid="importance-average-pin"
                title={`Average ${avg!.toFixed(1)} · ${importanceLabel(Math.round(avg!))}`}
                className={cn(
                  'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-post-card-voted ring-2 ring-card',
                  size === 'lg' ? 'h-5 w-1.5' : 'h-3.5 w-1'
                )}
                style={{ left: `${avgPct}%` }}
              />
            </>
          )}
        </div>

        {IMPORTANCE_LEVELS.map(({ value, label }) => {
          const mine = summary.mine === value
          const underAverage = avg != null && value <= Math.round(avg)
          return (
            <button
              key={value}
              type="button"
              aria-pressed={mine}
              aria-label={`${value}: ${label}`}
              title={mine ? `${label} (your rating, click to clear)` : label}
              disabled={inactive || pending}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onRate(value)
              }}
              onMouseEnter={() => preview(value)}
              onFocus={() => preview(value)}
              onBlur={() => preview(null)}
              className={cn(
                'relative z-10 flex shrink-0 items-center justify-center rounded-full border-2',
                'font-semibold tabular-nums leading-none transition-all duration-150',
                node.box,
                node.digit,
                mine
                  ? 'border-post-card-voted bg-post-card-voted text-white shadow-sm'
                  : underAverage
                    ? 'border-post-card-voted/60 bg-card text-post-card-voted'
                    : 'border-border bg-card text-muted-foreground',
                !inactive && !pending && 'cursor-pointer hover:scale-125',
                !inactive && !pending && !mine && 'hover:border-post-card-voted',
                hovered === value && !mine && 'scale-125 border-post-card-voted',
                inactive && 'cursor-not-allowed',
                pending && 'cursor-wait'
              )}
            >
              {value}
            </button>
          )
        })}
      </div>

      {showLabels && (
        <div className="mt-1.5 grid grid-cols-5 text-center text-[10px] leading-tight text-muted-foreground">
          {IMPORTANCE_LEVELS.map(({ value, label }) => (
            <span
              key={value}
              className={cn(
                'px-0.5',
                summary.mine === value && 'font-semibold text-post-card-voted'
              )}
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
