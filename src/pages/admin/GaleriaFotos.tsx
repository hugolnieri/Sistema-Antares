import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Field, Modal, EmptyState } from '../../components/ui'
import { fmtData, fmtDataHora, rotuloAula } from '../../lib/format'
import { resolverUrlsFotos, type FotoUrls } from '../../lib/fotos'
import type { Polo } from '../../lib/types'

// Quantas fotos por página. A grade carrega sob demanda em vez de puxar tudo:
// cada foto custa uma URL temporária, e a miniatura só é útil se aparecer.
const POR_PAGINA = 60

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
    periodo: string
    data_hora: string
    professor_nome: string
    polos?: { nome: string } | null
  } | null
}

type FotoComUrl = FotoGaleria & FotoUrls

export default function GaleriaFotos() {
  const [fotos, setFotos] = useState<FotoComUrl[]>([])
  const [polos, setPolos] = useState<Pick<Polo, 'id' | 'nome'>[]>([])
  const [ciclos, setCiclos] = useState<number[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [searchParams, setSearchParams] = useSearchParams()
  const filtroPolo = searchParams.get('polo') ?? ''
  const [filtroAula, setFiltroAula] = useState('')
  const [filtroCiclo, setFiltroCiclo] = useState('')
  const [filtroData, setFiltroData] = useState('')

  const [fotoAberta, setFotoAberta] = useState<FotoComUrl | null>(null)
  const [recarga, setRecarga] = useState(0)

  // Listas dos filtros — carregadas uma vez, independentes da paginação.
  useEffect(() => {
    ;(async () => {
      const [polosRes, ciclosRes] = await Promise.all([
        supabase.from('polos').select('id, nome').order('nome'),
        supabase.from('historico_aulas').select('ciclo').order('ciclo', { ascending: false }).limit(500),
      ])
      setPolos((polosRes.data ?? []) as Pick<Polo, 'id' | 'nome'>[])
      setCiclos(
        Array.from(new Set((ciclosRes.data ?? []).map((h: any) => h.ciclo as number)))
          .sort((a, b) => b - a),
      )
    })()
  }, [])

  // Uma página de fotos. Os filtros vão para o banco (antes eram aplicados em
  // memória sobre as 1000 primeiras), então a paginação é consistente.
  const buscarPagina = useCallback(async (offset: number) => {
    let q = supabase
      .from('fotos_aula')
      .select(
        'id, arquivo_path, url_externa, nome_arquivo, created_at, polo_id, historico_id, historico_aulas!inner(numero_aula, ciclo, periodo, data_hora, professor_nome, polos(nome))',
        { count: 'exact' },
      )
    if (filtroPolo) q = q.eq('polo_id', filtroPolo)
    if (filtroAula) q = q.eq('historico_aulas.numero_aula', Number(filtroAula))
    if (filtroCiclo) q = q.eq('historico_aulas.ciclo', Number(filtroCiclo))
    if (filtroData) {
      const fim = new Date(`${filtroData}T00:00:00`)
      fim.setDate(fim.getDate() + 1)
      q = q
        .gte('historico_aulas.data_hora', `${filtroData}T00:00:00`)
        .lt('historico_aulas.data_hora', fim.toISOString())
    }

    const { data, error, count } = await q
      .order('created_at', { ascending: false })
      .range(offset, offset + POR_PAGINA - 1)
    if (error) throw error

    const base = (data ?? []) as unknown as FotoGaleria[]
    const urls = await resolverUrlsFotos(base)
    return {
      itens: base.map((f) => ({ ...f, ...(urls[f.id] ?? { url: null, thumb: null }) })),
      total: count ?? 0,
    }
  }, [filtroPolo, filtroAula, filtroCiclo, filtroData])

  // Recarrega do zero sempre que um filtro muda.
  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setErro(null)
    buscarPagina(0)
      .then(({ itens, total }) => {
        if (cancelado) return
        setFotos(itens)
        setTotal(total)
      })
      .catch(() => { if (!cancelado) setErro('Não foi possível carregar as fotos.') })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [buscarPagina, recarga])

  const carregarMais = async () => {
    setCarregandoMais(true)
    try {
      const { itens } = await buscarPagina(fotos.length)
      setFotos((atuais) => [...atuais, ...itens])
    } catch {
      setErro('Não foi possível carregar mais fotos.')
    } finally {
      setCarregandoMais(false)
    }
  }

  const legenda = (f: FotoComUrl) => {
    const h = f.historico_aulas
    const partes = [h?.polos?.nome, h ? rotuloAula(h.numero_aula, h.ciclo, h.periodo) : null]
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
          {loading ? '—' : `${total} foto${total === 1 ? '' : 's'}`}
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
                      action={<button className="btn btn-ghost" onClick={() => setRecarga((n) => n + 1)}>Tentar novamente</button>} />
        </div>
      ) : fotos.length === 0 ? (
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
        <>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {fotos.map((f) => (
              <button key={f.id}
                      className="group flex flex-col overflow-hidden rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] text-left transition-shadow hover:shadow-md"
                      onClick={() => setFotoAberta(f)}>
                {f.thumb ? (
                  <img src={f.thumb} alt={f.nome_arquivo} loading="lazy"
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
                      ? rotuloAula(f.historico_aulas.numero_aula, f.historico_aulas.ciclo, f.historico_aulas.periodo)
                      : '—'}
                    {f.historico_aulas?.data_hora ? ` · ${fmtData(f.historico_aulas.data_hora)}` : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>
          {fotos.length < total && (
            <button className="btn btn-ghost self-center" onClick={carregarMais} disabled={carregandoMais}>
              {carregandoMais ? 'Carregando…' : `Carregar mais (${total - fotos.length} restantes)`}
            </button>
          )}
        </>
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
