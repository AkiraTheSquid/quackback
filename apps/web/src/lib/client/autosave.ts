import { MutationCache } from '@tanstack/react-query'

/**
 * `meta` for a mutation that saves on change, with no Save button. The save
 * status in the page header tracks these, and a failure shows one toast.
 */
export const AUTOSAVE = { autosave: true } as const

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { autosave?: boolean }
  }
}

/**
 * The mutation cache for the app's QueryClient: autosave failures are never silent.
 * The toast library loads on first failure so it stays out of the entry chunk.
 */
export function createAutosaveMutationCache() {
  return new MutationCache({
    onError: (_error, _variables, _context, mutation) => {
      if (mutation.meta?.autosave === true) {
        void import('sonner').then(({ toast }) => toast.error("Couldn't save. Try again."))
      }
    },
  })
}
