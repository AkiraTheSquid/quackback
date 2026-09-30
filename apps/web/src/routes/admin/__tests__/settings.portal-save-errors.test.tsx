// @vitest-environment happy-dom
/**
 * A failed portal save shows one "Couldn't save" toast, from the shared
 * autosave handler. The page adds no toast of its own, and no success toast.
 */
import { act, type ComponentType, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IntlProvider } from 'react-intl'
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { toast, rootContext, saveFails } = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
  rootContext: {
    settings: { name: 'Acme', featureFlags: { feedback: true, changelog: true } },
    session: null,
  },
  saveFails: { value: true },
}))

vi.mock('sonner', () => ({ toast }))

vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    useRouteContext: ({ select }: { select: (context: typeof rootContext) => unknown }) =>
      select(rootContext),
    useRouter: () => ({ invalidate: vi.fn() }),
    useBlocker: () => undefined,
    ClientOnly: () => null,
    Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  }
})

vi.mock('@/lib/client/mutations/settings', async () => {
  const { AUTOSAVE } = await import('@/lib/client/autosave')
  return {
    useUpdatePortalConfig: () =>
      useMutation({
        meta: AUTOSAVE,
        mutationFn: async () => {
          if (saveFails.value) throw new Error('nope')
        },
      }),
    useSaveBrandingTheme: () => ({ mutateAsync: vi.fn(), isPending: false }),
  }
})

vi.mock('@/lib/client/hooks/use-image-upload', () => ({
  useImageUpload: () => ({ upload: vi.fn() }),
}))

vi.mock('@/components/ui/rich-text-editor', () => ({
  RichTextEditor: ({
    onDocumentChange,
  }: {
    onDocumentChange: (d: { json(): unknown }) => void
  }) => (
    <button
      data-testid="rich-text-editor"
      onClick={() =>
        onDocumentChange({
          json: () => ({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
          }),
        })
      }
    />
  ),
}))

vi.mock('@/components/admin/upgrade', () => ({ UpgradeModal: () => null }))

const { createAutosaveMutationCache } = await import('@/lib/client/autosave')
const { Route } = await import('@/routes/admin/settings.portal')
const PortalPage = (Route as unknown as { options: { component: ComponentType } }).options.component

function renderPage() {
  const queryClient = new QueryClient({
    mutationCache: createAutosaveMutationCache(),
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(['settings', 'branding'], { themeMode: 'user' })
  queryClient.setQueryData(['settings', 'logo'], { url: null })
  queryClient.setQueryData(['settings', 'customCss'], '')
  queryClient.setQueryData(['settings', 'portalConfig'], {})
  return render(
    <IntlProvider locale="en" defaultLocale="en">
      <QueryClientProvider client={queryClient}>
        <PortalPage />
      </QueryClientProvider>
    </IntlProvider>
  )
}

afterEach(() => {
  toast.error.mockClear()
  toast.success.mockClear()
  saveFails.value = true
})

describe('portal save feedback', () => {
  it('shows exactly one error toast when the save fails', async () => {
    renderPage()
    act(() => {
      fireEvent.click(screen.getByTestId('rich-text-editor'))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(toast.error).toHaveBeenCalledWith("Couldn't save. Try again.")
  })

  it('shows no success toast when the save works', async () => {
    saveFails.value = false
    renderPage()
    act(() => {
      fireEvent.click(screen.getByTestId('rich-text-editor'))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })
})
