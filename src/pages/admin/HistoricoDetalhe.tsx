import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { StatusBadge, EmptyState } from '../../components/ui'
import { fmtDataHora } from '../../lib/format'
import type { HistoricoAula } from '../../lib/types'

interface FotoComUrl { id: string; nome_arquivo: string; url: string | null }

export default function HistoricoDetalhe() {
  const { id } = useParams()
  const [registro, setRegistro] = useState<HistoricoAula | null>(null)
  const [fotos, setFotos] = useState<FotoComUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!id) return
    supabase.from('historico_aulas')
      .select('*, polos(nome), presencas(id, presente, alunos(nome)), fotos_aula(id, nome_arquivo, arquivo_path, url_externa)')
      .eq('id', id)
      .single()
      .then(async ({ data, error }) => {
        if (error || !data) {
          setErro('Registro não encontrado.')
          setLoading(false)
          return
        }
        const hist = data as unknown as HistoricoAula
        setRegistro(hist)
        const comUrl = await Promise.all(
          (hist.fotos_aula ?? []).map(async (f) => {
            if (f.url_externa) return { id: f.id, nome_arquivo: f.nome_arquivo, url: f.url_externa }
            if (!f.arquivo_path) return { id: f.id, nome_arquivo: f.nome_arquivo, url: null }
            const { data: signed } = await supabase.storage
              .from('fotos-aulas').createSignedUrl(f.arquivo_path, 3600)
            return { id: f.id, nome_arquivo: f.nome_arquivo, url: signed?.signedUrl ?? null }
          }),
        )
        setFotos(comUrl)
        setLoading(false)
      })
  }, [id])

  if (loading) {
    return (
      <div className="card flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton w-2/3" />)}
      </div>
    )
  }

  if (erro || !registro) {
    return (
      <div className="card">
        <EmptyState icon="⚠️" title="Registro não encontrado" message={erro}
                    action={<Link to="/admin/historico" className="btn btn-ghost">Voltar ao histórico</Link>} />
      </div>
    )
  }

  const presencas = registro.presencas ?? []
  const presentes = presencas.filter((p) => p.presente)
  const ausentes = presencas.filter((p) => !p.presente)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link to="/admin/historico" className="text-sm font-semibold text-[var(--c-primary)] hover:underline">
          ← Voltar ao histórico
        </Link>
      </div>

      {/* Cabeçalho do registro */}
      <div className="card">
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--c-text-soft)]">Polo</p>
            <p className="font-bold">{registro.polos?.nome ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--c-text-soft)]">Aula</p>
            <p className="font-bold">Aula {registro.numero_aula}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--c-text-soft)]">Professor</p>
            <p className="font-bold">{registro.professor_nome}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--c-text-soft)]">Data e horário</p>
            <p className="font-bold">{fmtDataHora(registro.data_hora)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--c-text-soft)]">Salvo por</p>
            <p className="font-bold">{registro.criado_por}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--c-text-soft)]">Criado em</p>
            <p className="font-bold">{fmtDataHora(registro.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Lista de presença */}
      <div className="card !p-0">
        <div className="flex items-center gap-3 p-4">
          <h2 className="font-bold">Lista de presença</h2>
          <span className="badge badge--green"><span aria-hidden="true">✓</span> {presentes.length} presentes</span>
          <span className="badge badge--red"><span aria-hidden="true">✕</span> {ausentes.length} ausentes</span>
        </div>
        <div className="overflow-x-auto border-t border-[var(--c-border)]">
          {presencas.length === 0 ? (
            <EmptyState icon="🎓" title="Sem alunos neste registro" />
          ) : (
            <table className="data-table">
              <thead><tr><th>Aluno</th><th>Presença</th></tr></thead>
              <tbody>
                {presencas.map((p) => (
                  <tr key={p.id}>
                    <td>{p.alunos?.nome ?? '—'}</td>
                    <td><StatusBadge status={p.presente ? 'presente' : 'ausente'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Observações e relatório */}
      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div className="card">
          <h2 className="mb-2 font-bold">Observações</h2>
          <p className="whitespace-pre-wrap text-sm text-[var(--c-text-soft)]">
            {registro.observacoes || 'Sem observações.'}
          </p>
        </div>
        <div className="card">
          <h2 className="mb-2 font-bold">Relatório da aula</h2>
          <p className="whitespace-pre-wrap text-sm text-[var(--c-text-soft)]">
            {registro.relatorio || 'Sem relatório.'}
          </p>
        </div>
      </div>

      {/* Fotos */}
      <div className="card">
        <h2 className="mb-3 font-bold">Fotos da aula ({fotos.length})</h2>
        {fotos.length === 0 ? (
          <EmptyState icon="📷" title="Nenhuma foto anexada" />
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {fotos.map((f) => (
              <a key={f.id} href={f.url ?? '#'} target="_blank" rel="noreferrer"
                 className="block overflow-hidden rounded-lg border border-[var(--c-border)]">
                {f.url ? (
                  <img src={f.url} alt={f.nome_arquivo}
                       className="h-32 w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-32 items-center justify-center text-xs text-[var(--c-text-soft)]">
                    Indisponível
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
