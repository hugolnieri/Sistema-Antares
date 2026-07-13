import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { KpiCard, StatusBadge, EmptyState } from '../../components/ui'
import { statusDe } from '../../lib/status'
import { fmtData, fmtDataHora, subtrairDias } from '../../lib/format'
import { useToast } from '../../components/Toast'
import type { CronogramaItem, HistoricoAula, SolicitacaoContato } from '../../lib/types'

interface Kpis {
  polos: number
  alunos: number
  professores: number
  chamadasMes: number
}

interface Lembrete {
  id: string
  data: string
  texto: string
  numeroAula: number
  poloNome: string
}

export default function Dashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [ultimas, setUltimas] = useState<HistoricoAula[]>([])
  const [aulasHoje, setAulasHoje] = useState<CronogramaItem[]>([])
  const [lembretes, setLembretes] = useState<Lembrete[]>([])
  const [pedidos, setPedidos] = useState<SolicitacaoContato[]>([])
  const [erro, setErro] = useState('')
  const toast = useToast()

  const agora = new Date()
  const hoje = agora.toLocaleDateString('en-CA')
  const em30 = new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-CA')
  const em7 = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA')
  const saudacao = agora.getHours() < 12 ? 'Bom dia' : agora.getHours() < 18 ? 'Boa tarde' : 'Boa noite'
  const dataExtenso = agora.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  })

  useEffect(() => {
    const inicioMes = new Date()
    inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)

    Promise.all([
      supabase.from('polos').select('id', { count: 'exact', head: true }).eq('status', 'ativo'),
      supabase.from('alunos').select('id', { count: 'exact', head: true }).eq('status', 'ativo'),
      supabase.from('professores').select('id', { count: 'exact', head: true }).eq('status', 'ativo'),
      supabase.from('historico_aulas').select('id', { count: 'exact', head: true })
        .gte('data_hora', inicioMes.toISOString()),
      supabase.from('historico_aulas')
        .select('id, numero_aula, professor_nome, data_hora, polos(nome)')
        .order('data_hora', { ascending: false }).limit(6),
      // Aulas dos próximos 30 dias — usadas para "hoje" e para calcular os lembretes
      supabase.from('cronograma')
        .select('*, polos(nome), professores(nome)')
        .gte('data', hoje).lte('data', em30).order('data'),
      supabase.from('solicitacoes_contato')
        .select('*, polos(nome)')
        .eq('status', 'pendente').order('created_at', { ascending: false }),
    ]).then(([p, a, pr, ch, ult, prox, sol]) => {
      if (ult.error) { setErro('Não foi possível carregar os dados.'); return }
      setPedidos((sol.data ?? []) as unknown as SolicitacaoContato[])
      setKpis({
        polos: p.count ?? 0, alunos: a.count ?? 0,
        professores: pr.count ?? 0, chamadasMes: ch.count ?? 0,
      })
      setUltimas((ult.data ?? []) as unknown as HistoricoAula[])

      const proximasAulas = (prox.data ?? []) as unknown as CronogramaItem[]
      setAulasHoje(proximasAulas.filter((c) => c.data === hoje))

      // Lembretes: data do lembrete = data da aula - dias de antecedência.
      // Mostra os que vencem dentro dos próximos 7 dias (incluindo atrasados).
      const proximosLembretes = proximasAulas
        .flatMap((c) =>
          (c.lembretes ?? []).map((lb, i): Lembrete => ({
            id: `${c.id}-${i}`,
            data: subtrairDias(c.data, lb.dias_antes),
            texto: lb.texto || 'Lembrete',
            numeroAula: c.numero_aula,
            poloNome: c.polos?.nome ?? '',
          })))
        .filter((l) => l.data <= em7)
        .sort((a, b) => a.data.localeCompare(b.data))
      setLembretes(proximosLembretes)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const lembretesHoje = lembretes.filter((l) => l.data === hoje)

  const atenderPedido = async (id: string) => {
    setPedidos((ps) => ps.filter((p) => p.id !== id)) // otimista
    const { error } = await supabase
      .from('solicitacoes_contato').update({ status: 'atendida' }).eq('id', id)
    if (error) toast.error('Erro ao marcar como atendida.')
    else toast.success('Pedido de contato marcado como atendido.')
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Hero com degradê + agenda do dia */}
      <div className="gradient-hero rounded-2xl border border-[var(--c-border)] p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{saudacao}! 👋</h1>
            <p className="mt-1 text-sm capitalize text-[var(--c-text-soft)]">{dataExtenso}</p>
          </div>
          <div className="flex gap-6">
            <div>
              <span className="text-3xl font-bold">{aulasHoje.length}</span>
              <p className="text-xs font-semibold text-[var(--c-text-soft)]">Aulas hoje</p>
            </div>
            <div>
              <span className="text-3xl font-bold">{lembretesHoje.length}</span>
              <p className="text-xs font-semibold text-[var(--c-text-soft)]">Lembretes hoje</p>
            </div>
            <div>
              <span className="text-3xl font-bold">{kpis?.chamadasMes ?? '…'}</span>
              <p className="text-xs font-semibold text-[var(--c-text-soft)]">Chamadas no mês</p>
            </div>
          </div>
        </div>

        {/* Faixa de agenda de hoje */}
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--c-text-soft)]">
            Sua agenda de hoje
          </p>
          {aulasHoje.length === 0 && lembretesHoje.length === 0 ? (
            <p className="rounded-lg bg-[var(--c-surface)]/70 p-3 text-sm text-[var(--c-text-soft)]">
              Nenhuma aula ou lembrete marcado para hoje.
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {aulasHoje.map((c) => (
                <Link key={c.id} to="/admin/cronograma"
                      className="flex shrink-0 items-center gap-2 rounded-full border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-1.5 text-sm shadow-sm hover:opacity-90">
                  <span className={`badge badge--${statusDe(c.status).color} !px-1.5 !py-0`}>
                    {statusDe(c.status).icon}
                  </span>
                  <span className="font-semibold">Aula {c.numero_aula}</span>
                  <span className="text-[var(--c-text-soft)]">{c.polos?.nome ?? ''}</span>
                </Link>
              ))}
              {lembretesHoje.map((l) => (
                <Link key={l.id} to="/admin/cronograma"
                      className="flex shrink-0 items-center gap-2 rounded-full border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-1.5 text-sm shadow-sm hover:opacity-90">
                  <span className={`badge badge--${statusDe('lembrete').color} !px-1.5 !py-0`}>
                    {statusDe('lembrete').icon}
                  </span>
                  <span className="font-semibold">{l.texto}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pedidos de contato dos professores (pendências acionáveis) */}
      {pedidos.length > 0 && (
        <div className="card !p-0 border-l-4 !border-l-[var(--c-primary)]">
          <div className="flex items-center gap-2 p-4">
            <h2 className="font-bold">📇 Pedidos de contato dos professores</h2>
            <span className="badge badge--amber">{pedidos.length} pendente{pedidos.length === 1 ? '' : 's'}</span>
          </div>
          <ul className="border-t border-[var(--c-border)]">
            {pedidos.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.aluno_nome}</p>
                  <p className="text-xs text-[var(--c-text-soft)]">
                    Polo {s.polos?.nome ?? '—'} · pedido em {fmtData(s.created_at)}
                  </p>
                  {s.motivo && (
                    <p className="mt-1 text-sm">{s.motivo}</p>
                  )}
                </div>
                <Link to="/admin/alunos" className="btn btn-ghost !px-3 !py-1 text-xs">
                  Ver alunos
                </Link>
                <button className="btn btn-primary !px-3 !py-1 text-xs" onClick={() => atenderPedido(s.id)}>
                  Marcar como atendida
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <KpiCard label="Polos ativos" value={kpis ? kpis.polos : '…'} />
        <KpiCard label="Alunos ativos" value={kpis ? kpis.alunos : '…'} />
        <KpiCard label="Professores" value={kpis ? kpis.professores : '…'} />
        <KpiCard label="Chamadas no mês" value={kpis ? kpis.chamadasMes : '…'} />
      </div>

      {/* Resumo do dia: lembretes das aulas + últimas chamadas */}
      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {/* Lembretes das aulas (ex.: organizar materiais dias antes) */}
        <div className="card !p-0">
          <div className="flex items-center justify-between p-4">
            <h2 className="font-bold">Lembretes da semana</h2>
            <Link to="/admin/cronograma" className="text-sm font-semibold text-[var(--c-primary)] hover:underline">
              Ver cronograma →
            </Link>
          </div>
          <div className="border-t border-[var(--c-border)]">
            {lembretes.length === 0 ? (
              <EmptyState
                icon="🗂️" title="Nenhum lembrete próximo"
                message="Adicione um lembrete ao agendar uma aula no cronograma (ex.: organizar materiais dias antes)."
              />
            ) : (
              <ul>
                {lembretes.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 border-b border-[var(--c-border)] p-3">
                    <div className="flex shrink-0 -space-x-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--c-border)] bg-[var(--c-amber-bg)] text-sm">📄</span>
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--c-border)] bg-[var(--c-blue-bg)] text-sm">📑</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{l.texto}</p>
                      <p className="text-xs text-[var(--c-text-soft)]">
                        {fmtData(l.data)} · Aula {l.numeroAula}{l.poloNome ? ` · ${l.poloNome}` : ''}
                      </p>
                    </div>
                    <StatusBadge status="lembrete" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Últimas chamadas */}
        <div className="card !p-0">
          <div className="flex items-center justify-between p-4">
            <h2 className="font-bold">Últimas chamadas</h2>
            <Link to="/admin/historico" className="text-sm font-semibold text-[var(--c-primary)] hover:underline">
              Ver histórico →
            </Link>
          </div>
          <div className="overflow-x-auto border-t border-[var(--c-border)]">
            {erro ? (
              <EmptyState icon="⚠️" title="Erro ao carregar" message={erro} />
            ) : ultimas.length === 0 ? (
              <EmptyState
                icon="🕘" title="Nenhuma chamada ainda"
                message="As chamadas salvas pelos professores aparecerão aqui."
              />
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Polo</th><th>Aula</th><th>Professor</th><th>Data</th></tr>
                </thead>
                <tbody>
                  {ultimas.map((h) => (
                    <tr key={h.id} className="cursor-pointer">
                      <td>{h.polos?.nome ?? '—'}</td>
                      <td>
                        <Link to={`/admin/historico/${h.id}`} className="flex items-center gap-1">
                          <StatusBadge status="concluida" />
                          <span className="ml-1">Aula {h.numero_aula}</span>
                        </Link>
                      </td>
                      <td className="max-w-[160px] truncate">{h.professor_nome}</td>
                      <td>{fmtDataHora(h.data_hora)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
