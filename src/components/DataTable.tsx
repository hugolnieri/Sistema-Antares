import { useMemo, useState, type ReactNode } from 'react'
import { EmptyState } from './ui'

export interface Column<T> {
  key: string
  header: string
  sortable?: boolean
  render?: (row: T) => ReactNode
  sortValue?: (row: T) => string | number
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  searchValue?: (row: T) => string
  searchPlaceholder?: string
  toolbar?: ReactNode
  filters?: ReactNode
  empty?: { icon?: string; title: string; message?: string; action?: ReactNode }
  pageSize?: number
  onRowClick?: (row: T) => void
}

export function DataTable<T extends { id: string }>({
  columns, rows, loading, error, onRetry,
  searchValue, searchPlaceholder = 'Buscar…',
  toolbar, filters, empty, pageSize = 20, onRowClick,
}: Props<T>) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    let out = rows
    if (search.trim() && searchValue) {
      const q = search.trim().toLowerCase()
      out = out.filter((r) => searchValue(r).toLowerCase().includes(q))
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key)
      const val = col?.sortValue ?? ((r: T) => String((r as any)[sort.key] ?? ''))
      out = [...out].sort((a, b) => {
        const va = val(a); const vb = val(b)
        return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir
      })
    }
    return out
  }, [rows, search, sort, columns, searchValue])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize)
  const inicio = filtered.length === 0 ? 0 : safePage * pageSize + 1
  const fim = Math.min((safePage + 1) * pageSize, filtered.length)

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))

  return (
    <div className="card !p-0">
      {(searchValue || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          {searchValue ? (
            <input
              type="search"
              className="w-full max-w-xs rounded-lg border border-[var(--c-border)] px-3 py-2 text-sm"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            />
          ) : <span />}
          {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
        </div>
      )}
      {filters && (
        <div className="flex flex-wrap items-end gap-3 border-t border-[var(--c-border)] p-4">
          {filters}
        </div>
      )}

      <div className="overflow-x-auto border-t border-[var(--c-border)]">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={c.sortable ? 'sortable' : ''}
                  aria-sort={sort?.key === c.key
                    ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                  onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                >
                  {c.header}
                  {sort?.key === c.key && (sort.dir === 1 ? ' ▲' : ' ▼')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key}><div className="skeleton w-3/4" /></td>
                ))}
              </tr>
            ))}
            {!loading && error && (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState
                    icon="⚠️" title="Erro ao carregar" message={error}
                    action={onRetry && (
                      <button className="btn btn-ghost" onClick={onRetry}>Tentar novamente</button>
                    )}
                  />
                </td>
              </tr>
            )}
            {!loading && !error && pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length}>
                  {search ? (
                    <EmptyState
                      icon="🔍" title="Nenhum resultado"
                      message="Nenhum registro corresponde à busca."
                      action={
                        <button className="btn btn-ghost" onClick={() => setSearch('')}>
                          Limpar busca
                        </button>
                      }
                    />
                  ) : (
                    <EmptyState
                      icon={empty?.icon ?? '📭'}
                      title={empty?.title ?? 'Nenhum registro'}
                      message={empty?.message}
                      action={empty?.action}
                    />
                  )}
                </td>
              </tr>
            )}
            {!loading && !error && pageRows.map((row) => (
              <tr
                key={row.id}
                className={onRowClick ? 'is-clickable' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'button' : undefined}
                onKeyDown={onRowClick ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row) }
                } : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key}>
                    {c.render ? c.render(row) : String((row as any)[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between p-4 text-sm text-[var(--c-text-soft)]">
        <span>{inicio}–{fim} de {filtered.length}</span>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost !px-3 !py-1" disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}>‹</button>
          <span>Página {safePage + 1} de {totalPages}</span>
          <button className="btn btn-ghost !px-3 !py-1" disabled={safePage >= totalPages - 1}
                  onClick={() => setPage(safePage + 1)}>›</button>
        </div>
      </div>
    </div>
  )
}
