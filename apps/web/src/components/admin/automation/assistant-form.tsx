import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { useIntl } from 'react-intl'
import { Button } from '@/components/ui/button'
import { isRevisionConflict } from '@/lib/client/autosave'

export type AssistantSettingsTab = 'basics' | 'guidance' | 'actions'

interface AssistantDirtyState {
  dirtyTabs: ReadonlySet<AssistantSettingsTab>
  hasUnsavedChanges: boolean
  reportDirty: (id: string, tab: AssistantSettingsTab, dirty: boolean) => void
}

const AssistantDirtyStateContext = createContext<AssistantDirtyState | null>(null)

export function AssistantDirtyStateProvider({ children }: { children: ReactNode }) {
  const [dirtyForms, setDirtyForms] = useState<Map<string, AssistantSettingsTab>>(() => new Map())
  const reportDirty = useCallback((id: string, tab: AssistantSettingsTab, dirty: boolean) => {
    setDirtyForms((current) => {
      if (dirty && current.get(id) === tab) return current
      if (!dirty && !current.has(id)) return current

      const next = new Map(current)
      if (dirty) next.set(id, tab)
      else next.delete(id)
      return next
    })
  }, [])

  return (
    <AssistantDirtyStateContext.Provider
      value={{
        dirtyTabs: new Set(dirtyForms.values()),
        hasUnsavedChanges: dirtyForms.size > 0,
        reportDirty,
      }}
    >
      {children}
    </AssistantDirtyStateContext.Provider>
  )
}

export function useAssistantDirtyState(): Omit<AssistantDirtyState, 'reportDirty'> {
  const state = useContext(AssistantDirtyStateContext)
  if (!state)
    throw new Error('useAssistantDirtyState must be used within AssistantDirtyStateProvider')
  return state
}

export function isAssistantFieldManaged(managedPaths: string[], path: string): boolean {
  const fullPath = `assistant.${path}`
  return managedPaths.some(
    (managedPath) => fullPath === managedPath || fullPath.startsWith(`${managedPath}.`)
  )
}

export function useUnsavedChanges(isDirty: boolean, tab?: AssistantSettingsTab) {
  const formId = useId()
  const reportDirty = useContext(AssistantDirtyStateContext)?.reportDirty

  useEffect(() => {
    if (!isDirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (!reportDirty || !tab) return
    reportDirty(formId, tab, isDirty)
    return () => reportDirty(formId, tab, false)
  }, [formId, isDirty, reportDirty, tab])
}

export function ManagedSettingHint() {
  const intl = useIntl()
  return (
    <p className="text-xs text-muted-foreground">
      {intl.formatMessage({
        id: 'automation.agent.managed',
        defaultMessage: 'This setting is managed by your deployment configuration.',
      })}
    </p>
  )
}

/** Shown when a save was rejected because the settings changed in another session. */
export function AssistantConflictNotice({ onReload }: { onReload: () => void | Promise<void> }) {
  const intl = useIntl()
  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p role="alert" className="text-xs text-destructive">
        {intl.formatMessage({
          id: 'automation.agent.save.conflict',
          defaultMessage:
            'These settings changed in another session. Reload the latest settings to keep editing.',
        })}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={() => void onReload()}>
        {intl.formatMessage({
          id: 'automation.agent.save.reload',
          defaultMessage: 'Reload latest settings',
        })}
      </Button>
    </div>
  )
}

// Saves to the shared assistant configuration run one at a time, so each one
// reads the revision the previous one produced.
let saveQueue: Promise<unknown> = Promise.resolve()

function enqueueSave(save: () => Promise<void>): Promise<void> {
  const run = saveQueue.then(save, save)
  saveQueue = run.catch(() => {})
  return run
}

/**
 * Saves a draft as it changes. Text fields pass a debounce delay, tile choices
 * pass 0. A failed save is not retried until the draft changes again (the
 * mutation's autosave meta shows the toast), a revision conflict stops saving
 * until `clearConflict` is called after reloading, and a pending draft is saved
 * when the page is left.
 */
export function useAssistantAutosave({
  dirty,
  valid = true,
  signature,
  delayMs,
  save,
}: {
  dirty: boolean
  valid?: boolean
  /** Identifies the current draft; a failed save is retried only once this changes. */
  signature: string
  delayMs: number
  save: () => Promise<void>
}) {
  const [conflict, setConflict] = useState(false)
  const [settledCount, setSettledCount] = useState(0)
  const saveRef = useRef(save)
  saveRef.current = save
  const inFlight = useRef(false)
  const failedSignature = useRef<string | null>(null)
  const canSave = dirty && valid && !conflict
  const pendingRef = useRef(false)
  pendingRef.current = canSave && !inFlight.current

  const run = useCallback(async (attempted: string) => {
    inFlight.current = true
    try {
      await enqueueSave(() => saveRef.current())
      failedSignature.current = null
    } catch (error) {
      if (isRevisionConflict(error)) setConflict(true)
      else failedSignature.current = attempted
    } finally {
      inFlight.current = false
      setSettledCount((count) => count + 1)
    }
  }, [])

  useEffect(() => {
    if (!canSave || inFlight.current || failedSignature.current === signature) return
    const timer = setTimeout(() => void run(signature), delayMs)
    return () => clearTimeout(timer)
  }, [canSave, signature, delayMs, run, settledCount])

  useEffect(
    () => () => {
      if (pendingRef.current) void enqueueSave(() => saveRef.current()).catch(() => {})
    },
    []
  )

  return { conflict, clearConflict: useCallback(() => setConflict(false), []) }
}
