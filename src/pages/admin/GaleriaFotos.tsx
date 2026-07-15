import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Field, Modal, EmptyState } from '../../components/ui'
import { fmtData, fmtDataHora } from '../../lib/format'
import { resolverUrlsFotos } from '../../lib/fotos'
import type { Polo } from '../../lib/types'

interface FotoGaleria {
  id: string
  arquivo_path: string | null
  url_externa: string | null
  nome_arquivo: string
  created_at: string
  polo_id: string
  historico_id: string
  historico_aulas?: {
    numero_aula: number
    ciclo: number
    data_hora: string
    professor_nome: string
    polos?: { nome: string } | null
  } | null
}

type FotoComUrl = FotoGaleria & { url: string | null }

export default function GaleriaFotos() {
  const [fotos, setFotos] = useState<FotoComUrl[]>([])
  const [polos, setPolos] = useState<Pick<Polo, 'id' | 'nome'>[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [searchParams, setSearchParams] = useSearchParams()
  const filtroPolo = searchParams.get('polo') ?? ''
  const [filtroAula, setFiltroAula] = useState('')
  const [filtroCiclo, setFiltroCiclo] = useState('')
  const [filtroData, setFiltroData] = useState('')

  const [fotoAberta, setFotoAberta] = useState<FotoComUrl | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const [fotosRes, polosRes] = await Promise.all([
      supabase.from('fotos_aula')
        .select('id, arquivo_path, url_externa, nome_arquivo, created_at, polo_id, historico_id, historico_aulas(numero_aula, ciclo, data_hora, professor_nome, polos(nome))')
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase.from('polos').select('id, nome').order('nome'),
    ])
    if (fotosRes.error) {
      setErro('Não foi possível carregar as fotos.')
      setLoading(false)
      return
    }
    setPolos((polosRes.data ?? []) as Pick<Polo, 'id' | 'nome'>[])
    const base = (fotosRes.data ?? []) as unknown as FotoGaleria[]
    // Resolve a URL de cada foto: demo (url_externa), SharePoint (sp:) ou bucket.
    const urls = await resolverUrlsFotos(base)
    setFotos(base.map((f) => ({ ...f, url: urls[f.id] ?? null })))
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Ciclos existentes (para o filtro), do maior para o menor.
  const ciclos = Array.from(
    new Set(fotos.map((f) => f.historico_aulas?.ciclo).filter((c): c is number => c != null)),
  ).sort((a, b) => b - a)

  const filtradas = fotos.filter((f) => {
    const h = f.historico_aulas
    if (filtroPolo && f.polo_id !== filtroPolo) return false
    if (filtroAula && h?.numero_aula !== Number(filtroAula)) return false
    if (filtroCiclo && h?.ciclo !== Number(filtroCiclo)) return false
    if (filtroData && !(h?.data_hora ?? '').startsWith(filtroData)) return false
    return true
  })

  const legenda = (f: FotoComUrl) => {
    const h = f.historico_aulas
    const partes = [h?.polos?.nome, h ? `Aula ${h.numero_aula} · Ciclo ${h.ciclo}` : null]
    return partes.filter(Boolean).join(' · ')
  }

  const limparFiltros = () => {
    setSearchParams({})
    setFiltroAula(''); setFiltroCiclo(''); setFiltroData('')
  }
  const temFiltro = !!(filtroPolo || filtroAula || filtroCiclo || filtroData)

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="card flex flex-wrap items-end gap-3">
        <Field label="Polo">
          <select value={filtroPolo}
                  onChange={(e) => setSearchParams(e.target.value ? { polo: e.target.value } : {})}
                  className="min-w-[170px]">
            <option value="">Todos</option>
            {polos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Field>
        <Field label="Aula">
          <select value={filtroAula} onChange={(e) => setFiltroAula(e.target.value)}>
            <option value="">Todas</option>
            {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>Aula {n}</option>
            ))}
          </select>
        </Field>
        {ciclos.length > 1 && (
          <Field label="Ciclo">
            <select value={filtroCiclo} onChange={(e) => setFiltroCiclo(e.target.value)}>
              <option value="">Todos</option>
              {ciclos.map((c) => <option key={c} value={c}>Ciclo {c}</option>)}
            </select>
          </Field>
        )}
        <Field label="Data">
          <input type="date" value={filtroData} onChange={(e) => setFiltroData(e.target.value)} />
        </Field>
        {temFiltro && (
          <button className="btn btn-ghost !py-2" onClick={limparFiltros}>Limpar filtros</button>
        )}
        <span className="ml-auto text-sm text-[var(--c-text-soft)]">
          {loading ? '—' : `${filtradas.length} foto${filtradas.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Grade de fotos */}
      {loading ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton !h-40 !rounded-xl" />
          ))}
        </div>
      ) : erro ? (
        <div className="card">
          <EmptyState icon="⚠️" title="Erro ao carregar" message={erro}
                      action={<button className="btn btn-ghost" onClick={carregar}>Tentar novamente</button>} />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="📷"
            title={temFiltro ? 'Nenhuma foto para este filtro' : 'Nenhuma foto ainda'}
            message={temFiltro
              ? 'Ajuste os filtros para ver mais fotos.'
              : 'As fotos enviadas pelos professores nas chamadas aparecerão aqui.'}
            action={temFiltro
              ? <button className="btn btn-ghost" onClick={limparFiltros}>Limpar filtros</button>
              : undefined}
          />
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {filtradas.map((f) => (
            <button key={f.id}
                    className="group flex flex-col overflow-hidden rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] text-left transition-shadow hover:shadow-md"
                    onClick={() => setFotoAberta(f)}>
              {f.url ? (
                <img src={f.url} alt={f.nome_arquivo} loading="lazy"
                     className="h-40 w-full object-cover transition-transform group-hover:scale-[1.03]" />
              ) : (
                <div className="flex h-40 w-full items-center justify-center text-xs text-[var(--c-text-soft)]">
                  Indisponível
                </div>
              )}
              <div className="flex flex-col gap-0.5 p-2">
                <span className="truncate text-xs font-semibold">
                  {f.historico_aulas?.polos?.nome ?? '—'}
                </span>
                <span className="text-[11px] text-[var(--c-text-soft)]">
                  {f.historico_aulas
                    ? `Aula ${f.historico_aulas.numero_aula} · Ciclo ${f.historico_aulas.ciclo}`
                    : '—'}
                  {f.historico_aulas?.data_hora ? ` · ${fmtData(f.historico_aulas.data_hora)}` : ''}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <Modal
        open={!!fotoAberta}
        title={fotoAberta ? legenda(fotoAberta) : 'Foto'}
        onClose={() => setFotoAberta(null)}
        footer={
          <>
            {fotoAberta?.historico_id && (
              <Link className="btn btn-ghost" to={`/admin/historico/${fotoAberta.historico_id}`}>
                Ver registro da aula
              </Link>
            )}
            {fotoAberta?.url && (
              <a className="btn btn-ghost" href={fotoAberta.url} target="_blank" rel="noreferrer">
                Abrir em nova aba
              </a>
            )}
            <button className="btn btn-primary" onClick={() => setFotoAberta(null)}>Fechar</button>
          </>
        }
      >
        {fotoAberta && (
          <div className="flex flex-col gap-3">
            {fotoAberta.url ? (
              <img src={fotoAberta.url} alt={fotoAberta.nome_arquivo}
                   className="max-h-[60vh] w-full rounded-lg object-contain" />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-[var(--c-text-soft)]">
                Imagem indisponível
              </div>
            )}
            <div className="text-sm text-[var(--c-text-soft)]">
              {fotoAberta.historico_aulas?.professor_nome && (
                <p>Professor(es): {fotoAberta.historico_aulas.professor_nome}</p>
              )}
              {fotoAberta.historico_aulas?.data_hora && (
                <p>Aula em {fmtDataHora(fotoAberta.historico_aulas.data_hora)}</p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
