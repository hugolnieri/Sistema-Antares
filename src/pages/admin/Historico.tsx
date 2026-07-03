import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DataTable, type Column } from '../../components/DataTable'
import { Field } from '../../components/ui'
import { fmtDataHora } from '../../lib/format'
import type { Aluno, HistoricoAula, Polo } from '../../lib/types'

export default function Historico() {
  const [registros, setRegistros] = useState<HistoricoAula[]>([])
  const [polos, setPolos] = useState<Pick<Polo, 'id' | 'nome'>[]>([])
  const [alunos, setAlunos] = useState<Pick<Aluno, 'id' | 'nome'>[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [searchParams, setSearchParams] = useSearchParams()
  const filtroPolo = searchParams.get('polo') ?? ''
  const [filtroAula, setFiltroAula] = useState('')
  const [filtroData, setFiltroData] = useState('')
  const [filtroAluno, setFiltroAluno] = useState('')
  const [filtroFotos, setFiltroFotos] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const [histRes, polosRes, alunosRes] = await Promise.all([
      supabase.from('historico_aulas')
        .select('id, polo_id, numero_aula, professor_nome, data_hora, criado_por, polos(nome), presencas(aluno_id, presente), fotos_aula(id)')
        .order('data_hora', { ascending: false })
        .limit(500),
      supabase.from('polos').select('id, nome').order('nome'),
      supabase.from('alunos').select('id, nome').order('nome'),
    ])
    if (histRes.error) setErro('Não foi possível carregar o histórico.')
    else setRegistros((histRes.data ?? []) as unknown as HistoricoAula[])
    setPolos((polosRes.data ?? []) as Pick<Polo, 'id' | 'nome'>[])
    setAlunos((alunosRes.data ?? []) as Pick<Aluno, 'id' | 'nome'>[])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const linhas = registros.filter((h) => {
    if (filtroPolo && h.polo_id !== filtroPolo) return false
    if (filtroAula && h.numero_aula !== Number(filtroAula)) return false
    if (filtroData && !h.data_hora.startsWith(filtroData)) return false
    if (filtroAluno && !(h.presencas ?? []).some((p) => p.aluno_id === filtroAluno)) return false
    if (filtroFotos === 'com' && !(h.fotos_aula ?? []).length) return false
    if (filtroFotos === 'sem' && (h.fotos_aula ?? []).length > 0) return false
    return true
  })

  const colunas: Column<HistoricoAula>[] = [
    {
      key: 'data_hora', header: 'Data', sortable: true,
      render: (h) => fmtDataHora(h.data_hora),
    },
    { key: 'polo', header: 'Polo', render: (h) => h.polos?.nome ?? '—' },
    { key: 'numero_aula', header: 'Aula', sortable: true, render: (h) => `Aula ${h.numero_aula}` },
    { key: 'professor_nome', header: 'Professor', sortable: true },
    {
      key: 'presenca', header: 'Presença',
      render: (h) => {
        const pres = h.presencas ?? []
        const presentes = pres.filter((p) => p.presente).length
        return (
          <span className="text-sm">
            <span className="font-semibold text-[var(--c-green-fg)]">{presentes}</span>
            {' / '}{pres.length} presentes
          </span>
        )
      },
    },
    {
      key: 'fotos', header: 'Fotos',
      render: (h) => {
        const n = (h.fotos_aula ?? []).length
        return n
          ? <span className="badge badge--blue"><span aria-hidden="true">📷</span> {n}</span>
          : <span className="text-[var(--c-text-soft)]">—</span>
      },
    },
    {
      key: 'acoes', header: '',
      render: (h) => (
        <Link to={`/admin/historico/${h.id}`} className="btn btn-ghost !px-2 !py-1 text-xs">
          Abrir
        </Link>
      ),
    },
  ]

  return (
    <DataTable
      columns={colunas}
      rows={linhas}
      loading={loading}
      error={erro}
      onRetry={carregar}
      searchValue={(h) => `${h.polos?.nome ?? ''} ${h.professor_nome} aula ${h.numero_aula}`}
      searchPlaceholder="Buscar por polo ou professor…"
      filters={
        <>
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
          <Field label="Data">
            <input type="date" value={filtroData}
                   onChange={(e) => setFiltroData(e.target.value)} />
          </Field>
          <Field label="Aluno">
            <select value={filtroAluno} onChange={(e) => setFiltroAluno(e.target.value)}
                    className="min-w-[170px]">
              <option value="">Todos</option>
              {alunos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </Field>
          <Field label="Fotos">
            <select value={filtroFotos} onChange={(e) => setFiltroFotos(e.target.value)}>
              <option value="">Todas</option>
              <option value="com">Com fotos</option>
              <option value="sem">Sem fotos</option>
            </select>
          </Field>
        </>
      }
      empty={{
        icon: '🕘', title: 'Nenhuma chamada registrada',
        message: 'Quando os professores salvarem chamadas, os registros aparecerão aqui.',
      }}
    />
  )
}
