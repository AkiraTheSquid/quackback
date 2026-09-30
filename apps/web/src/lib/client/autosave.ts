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
 * The mutation cache for the app's QueryClient: autosave failures are never silent.
 * The toast library loads on first failure so it stays out of the entry chunk.
 */
export function createAutosaveMutationCache() {
  return new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      const meta = mutation.meta
      if (meta?.autosave !== true) return
      if (meta.ownsError?.(error)) return
      const message = toastMessage(error, meta.showServerMessage)
      void import('sonner').then(({ toast }) => toast.error(message))
    },
  })
}
