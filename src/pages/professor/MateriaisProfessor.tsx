import { EmptyState } from '../../components/ui'
import { usePolo } from './PoloLayout'

export default function MateriaisProfessor() {
  const { dados } = usePolo()

  if (dados.materiais.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon="📚" title="Nenhum material disponível"
          message="O administrativo ainda não cadastrou os PDFs das aulas."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {dados.materiais.map((m) => (
        <div key={m.numero_aula} className="card flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--c-blue-bg)] font-bold text-[var(--c-blue-fg)]">
            {m.numero_aula}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{m.titulo}</p>
            {m.descricao && (
              <p className="truncate text-sm text-[var(--c-text-soft)]">{m.descricao}</p>
            )}
          </div>
          {m.url ? (
            <a href={m.url} target="_blank" rel="noreferrer" className="btn btn-primary">
              Abrir PDF
            </a>
          ) : (
            <span className="text-sm text-[var(--c-text-soft)]">Sem arquivo</span>
          )}
        </div>
      ))}
    </div>
  )
}
