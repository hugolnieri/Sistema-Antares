import {
  createContext, useCallback, useContext, useRef, useState, type ReactNode,
} from 'react'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem { id: number; kind: ToastKind; message: string }

const ToastContext = createContext<{
  success: (m: string) => void
  error: (m: string) => void
  info: (m: string) => void
}>(null!)

export const useToast = () => useContext(ToastContext)

const STYLES: Record<ToastKind, string> = {
  success: 'border-l-4 border-[var(--c-green-fg)]',
  error: 'border-l-4 border-[var(--c-red-fg)]',
  info: 'border-l-4 border-[var(--c-blue-fg)]',
}
const ICONS: Record<ToastKind, string> = { success: '✓', error: '✕', info: 'ℹ' }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  const api = {
    success: (m: string) => push('success', m),
    error: (m: string) => push('error', m),
    info: (m: string) => push('info', m),
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed right-4 top-4 z-[100] flex w-[min(360px,90vw)] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`card flex items-start gap-2 shadow-lg ${STYLES[t.kind]}`}
               role="status">
            <span aria-hidden="true" className="font-bold">{ICONS[t.kind]}</span>
            <span className="text-sm">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
