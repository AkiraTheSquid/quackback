/**
 * Delta fork: importance ratings on votes.
 *
 * A vote can carry an importance level from 1 to 5. A vote without one
 * (every vote cast before ratings existed, or a plain upvote click) is still
 * counted in the post's vote count, but not in its rating average.
 */

export const IMPORTANCE_MIN = 1
export const IMPORTANCE_MAX = 5

export type ImportanceLevel = 1 | 2 | 3 | 4 | 5

export const IMPORTANCE_LEVELS: ReadonlyArray<{ value: ImportanceLevel; label: string }> = [
  { value: 1, label: 'Not important at all' },
  { value: 2, label: 'Not important' },
  { value: 3, label: 'Somewhat important' },
  { value: 4, label: 'Very important' },
  { value: 5, label: 'Crucial' },
]

/** Public rating summary for a post, plus the viewer's own rating. */
export interface ImportanceSummary {
  /** Number of votes that carry a rating */
  ratingCount: number
  /** Mean rating across rated votes, or null when nobody has rated */
  average: number | null
  /** The viewer's own rating, or null (no vote, or a vote without a rating) */
  mine: ImportanceLevel | null
}

export function importanceLabel(value: number | null | undefined): string | null {
  if (value == null) return null
  return IMPORTANCE_LEVELS.find((l) => l.value === value)?.label ?? null
}

/** Summaries for a page of posts, keyed by post TypeID. */
export type ImportanceSummaryMap = Record<string, ImportanceSummary>

export const EMPTY_IMPORTANCE_SUMMARY: ImportanceSummary = {
  ratingCount: 0,
  average: null,
  mine: null,
}
