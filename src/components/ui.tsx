import { type ReactNode, useEffect } from 'react'
import { statusDe } from '../lib/status'

/* ---------- Badge de status (sempre cor + ícone + texto) ---------- */

export function StatusBadge({ status }: { status: string }) {
  const def = statusDe(status)
  return (
    <span className={`badge badge--${def.color}`}>
      <span aria-hidden="true">{def.icon}</span> {def.label}
    </span>
  )
}

/* ---------- Campo de formulário (label acima, erro abaixo) ---------- */

export function Field({
  label, error, children, required,
}: { label: string; error?: string; children: ReactNode; required?: boolean }) {
  return (
    <div className="field">
      <label>
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}

/* ---------- Modal (centro; ações curtas e confirmações) ---------- */

export function Modal({
  open, title, onClose, children, footer,
}: {
  open: boolean; title: string; onClose: () => void
  children: ReactNode; footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="card relative w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn btn-ghost !px-2 !py-1" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- Drawer lateral (formulários de criar/editar) ---------- */

export function Drawer({
  open, title, onClose, children, footer,
}: {
  open: boolean; title: string; onClose: () => void
  children: ReactNode; footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col bg-[var(--c-surface)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--c-border)] p-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn btn-ghost !px-2 !py-1" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-[var(--c-border)] p-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- Confirmação destrutiva ---------- */

export function ConfirmModal({
  open, title, message, confirmLabel = 'Confirmar', danger = true,
  loading, onConfirm, onClose,
}: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string
  danger?: boolean; loading?: boolean; onConfirm: () => void; onClose: () => void
}) {
  return (
    <Modal
      open={open} title={title} onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancelar</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm} disabled={loading}
          >
            {loading ? 'Aguarde…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-[var(--c-text-soft)]">{message}</p>
    </Modal>
  )
}

/* ---------- Empty state ---------- */

export function EmptyState({
  icon = '📭', title, message, action,
}: { icon?: string; title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <div className="text-4xl" aria-hidden="true">{icon}</div>
      <h3 className="font-bold">{title}</h3>
      {message && <p className="max-w-sm text-sm text-[var(--c-text-soft)]">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/* ---------- Card de KPI ---------- */

export function KpiCard({
  label, value, delta, deltaUp,
}: { label: string; value: ReactNode; delta?: string; deltaUp?: boolean }) {
  return (
    <div className="card">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--c-text-soft)]">
        {label}
      </span>
      <strong className="mt-1 block text-3xl font-bold">{value}</strong>
      {delta && (
        <span className={`mt-1 block text-xs font-semibold ${
          deltaUp ? 'text-[var(--c-green-fg)]' : 'text-[var(--c-red-fg)]'
        }`}>
          {deltaUp ? '▲' : '▼'} {delta}
        </span>
      )}
    </div>
  )
}
