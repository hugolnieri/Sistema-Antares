import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DataTable, type Column } from '../../components/DataTable'
import { Field } from '../../components/ui'
import { fmtDataHora } from '../../lib/format'
import type { LogEntry } from '../../lib/types'

// Rótulo + cor de cada tipo de ação registrada.
const ACAO: Record<string, { label: string; badge: string }> = {
  criar:    { label: 'Cadastro',  badge: 'badge--green' },
  editar:   { label: 'Edição',    badge: 'badge--blue' },
  excluir:  { label: 'Exclusão',  badge: 'badge--red' },
  status:   { label: 'Status',    badge: 'badge--amber' },
  senha:    { label: 'Senha',     badge: 'badge--amber' },
  importar: { label: 'Importação', badge: 'badge--blue' },
  login:    { label: 'Login',     badge: 'badge--gray' },
  chamada:  { label: 'Chamada',   badge: 'badge--green' },
  fotos:    { label: 'Fotos',     badge: 'badge--blue' },
  sugestao: { label: 'Sugestão',  badge: 'badge--amber' },
  contato:  { label: 'Contato',   badge: 'badge--amber' },
  recusar:  { label: 'Recusa',    badge: 'badge--red' },
}
const acaoDe = (a: string) => ACAO[a] ?? { label: a, badge: 'badge--gray' }

const ENTIDADES = ['polo', 'professor', 'aluno', 'responsavel', 'material', 'cronograma', 'chamada', 'sessao']
const ENTIDADE_LABEL: Record<string, string> = {
  polo: 'Polo', professor: 'Professor', aluno: 'Aluno', responsavel: 'Responsável',
  material: 'Material', cronograma: 'Cronograma', chamada: 'Chamada', sessao: 'Sessão',
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEntidade, setFiltroEntidade] = useState('')
  const [filtroAcao, setFiltroAcao] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const { data, error } = await supabase
      .from('logs').select('*')
      .order('created_at', { ascending: false })
      .limit(1000)
    if (error) setErro('Não foi possível carregar os registros.')
    else setLogs((data ?? []) as unknown as LogEntry[])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const linhas = logs.filter((l) => {
    if (filtroTipo && l.ator_tipo !== filtroTipo) return false
    if (filtroEntidade && l.entidade !== filtroEntidade) return false
    if (filtroAcao && l.acao !== filtroAcao) return false
    return true
  })

  const colunas: Column<LogEntry>[] = [
    {
      key: 'created_at', header: 'Data e hora', sortable: true,
      sortValue: (l) => l.created_at,
      render: (l) => fmtDataHora(l.created_at),
    },
    {
      key: 'ator', header: 'Quem',
      render: (l) => (
        <div className="flex flex-col">
          <span className="font-medium">{l.ator}</span>
          <span className={`badge !px-1.5 !py-0 text-[11px] ${
            l.ator_tipo === 'admin' ? 'badge--blue'
              : l.ator_tipo === 'professor' ? 'badge--green' : 'badge--gray'}`}>
            {l.ator_tipo === 'admin' ? 'Administrativo'
              : l.ator_tipo === 'professor' ? 'Professor' : 'Sistema'}
          </span>
        </div>
      ),
    },
    {
      key: 'acao', header: 'Ação',
      render: (l) => {
        const a = acaoDe(l.acao)
        return <span className={`badge ${a.badge}`}>{a.label}</span>
      },
    },
    {
      key: 'entidade', header: 'Item',
      render: (l) => ENTIDADE_LABEL[l.entidade] ?? l.entidade,
    },
    { key: 'descricao', header: 'Descrição', render: (l) => l.descricao },
  ]

  return (
    <DataTable
      columns={colunas}
      rows={linhas}
      loading={loading}
      error={erro}
      onRetry={carregar}
      searchValue={(l) => `${l.ator} ${l.descricao} ${l.acao} ${l.entidade}`}
      searchPlaceholder="Buscar nos registros…"
      pageSize={30}
      filters={
        <>
          <Field label="Quem">
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}
                    className="min-w-[160px]">
              <option value="">Todos</option>
              <option value="admin">Administrativo</option>
              <option value="professor">Professor</option>
              <option value="sistema">Sistema</option>
            </select>
          </Field>
          <Field label="Ação">
            <select value={filtroAcao} onChange={(e) => setFiltroAcao(e.target.value)}
                    className="min-w-[150px]">
              <option value="">Todas</option>
              {Object.entries(ACAO).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Item">
            <select value={filtroEntidade} onChange={(e) => setFiltroEntidade(e.target.value)}
                    className="min-w-[150px]">
              <option value="">Todos</option>
              {ENTIDADES.map((e) => (
                <option key={e} value={e}>{ENTIDADE_LABEL[e]}</option>
              ))}
            </select>
          </Field>
        </>
      }
      empty={{
        icon: '📋', title: 'Nenhum registro ainda',
        message: 'As ações feitas no sistema (cadastros, exclusões, chamadas, logins) aparecerão aqui.',
      }}
    />
  )
}
