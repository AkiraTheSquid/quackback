import { MutationCache } from '@tanstack/react-query'

/**
 * `meta` for a mutation that saves on change, with no Save button. The save
 * status in the page header tracks these, and a failure shows one toast.
 */
export const AUTOSAVE = { autosave: true } as const

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      autosave?: boolean
      /**
       * The server's error messages for this mutation are written for the
       * person saving (a rule they can act on), so the toast names the reason
       * instead of asking them to try again.
       */
      showServerMessage?: boolean
      /** True for an error the page reports itself (an upgrade prompt, a conflict notice). */
      ownsError?: (error: unknown) => boolean
      /** The page reports revision conflicts itself (see `isRevisionConflict`). */
      onConflict?: boolean
    }
  }
}

function toastMessage(error: unknown, showServerMessage: boolean | undefined): string {
  if (showServerMessage && error instanceof Error && error.message.trim()) {
    return `Couldn't save. ${error.message.trim()}`
  }
  return "Couldn't save. Try again."
}

/**
 * True when a save was rejected because the settings changed in another
 * session (an optimistic-revision mismatch).
 */
export function isRevisionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as { code?: unknown; statusCode?: unknown; message?: unknown }
  return (
    value.code === 'ASSISTANT_CONFIG_REVISION_CONFLICT' ||
    value.statusCode === 409 ||
    (typeof value.message === 'string' &&
      /changed in another session|revision conflict/i.test(value.message))
  )
}

/**
 * The mutation cache for the app's QueryClient: autosave failures are never silent.
 * The toast library loads on first failure so it stays out of the entry chunk.
 */
export function createAutosaveMutationCache() {
  return new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      const meta = mutation.meta
      if (meta?.autosave !== true) return
      if (meta.ownsError?.(error)) return
      if (meta.onConflict === true && isRevisionConflict(error)) return
      const message = toastMessage(error, meta.showServerMessage)
      void import('sonner').then(({ toast }) => toast.error(message))
    },
  })
}
