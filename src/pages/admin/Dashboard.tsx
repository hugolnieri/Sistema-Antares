import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { KpiCard, StatusBadge, EmptyState } from '../../components/ui'
import { statusDe } from '../../lib/status'
import { fmtData, fmtDataHora } from '../../lib/format'
import type { CronogramaItem, Evento, HistoricoAula } from '../../lib/types'

interface Kpis {
  polos: number
  alunos: number
  professores: number
  chamadasMes: number
}

export default function Dashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [ultimas, setUltimas] = useState<HistoricoAula[]>([])
  const [aulasHoje, setAulasHoje] = useState<CronogramaItem[]>([])
  const [tarefas, setTarefas] = useState<Evento[]>([])
  const [erro, setErro] = useState('')

  const agora = new Date()
  const hoje = agora.toLocaleDateString('en-CA')
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
      supabase.from('professores').select('id', { count: 'exact', head: true }).eq('ativo', true),
      supabase.from('historico_aulas').select('id', { count: 'exact', head: true })
        .gte('data_hora', inicioMes.toISOString()),
      supabase.from('historico_aulas')
        .select('id, numero_aula, professor_nome, data_hora, polos(nome)')
        .order('data_hora', { ascending: false }).limit(6),
      supabase.from('cronograma')
        .select('*, polos(nome), professores(nome)')
        .eq('data', hoje).order('numero_aula'),
      supabase.from('eventos')
        .select('*, polos(nome)')
        .gte('data', hoje).lte('data', em7).order('data'),
    ]).then(([p, a, pr, ch, ult, hj, ev]) => {
      if (ult.error) { setErro('Não foi possível carregar os dados.'); return }
      setKpis({
        polos: p.count ?? 0, alunos: a.count ?? 0,
        professores: pr.count ?? 0, chamadasMes: ch.count ?? 0,
      })
      setUltimas((ult.data ?? []) as unknown as HistoricoAula[])
      setAulasHoje((hj.data ?? []) as unknown as CronogramaItem[])
      setTarefas((ev.data ?? []) as unknown as Evento[])
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
              <span className="text-3xl font-bold">{tarefas.filter((t) => t.data === hoje).length}</span>
              <p className="text-xs font-semibold text-[var(--c-text-soft)]">Tarefas hoje</p>
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
          {aulasHoje.length === 0 && tarefas.filter((t) => t.data === hoje).length === 0 ? (
            <p className="rounded-lg bg-white/60 p-3 text-sm text-[var(--c-text-soft)]">
              Nenhuma aula ou tarefa marcada para hoje.
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {aulasHoje.map((c) => (
                <Link key={c.id} to="/admin/cronograma"
                      className="flex shrink-0 items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-sm shadow-sm hover:bg-white">
                  <span className={`badge badge--${statusDe(c.status).color} !px-1.5 !py-0`}>
                    {statusDe(c.status).icon}
                  </span>
                  <span className="font-semibold">Aula {c.numero_aula}</span>
                  <span className="text-[var(--c-text-soft)]">{c.polos?.nome ?? ''}</span>
                </Link>
              ))}
              {tarefas.filter((t) => t.data === hoje).map((t) => (
                <Link key={t.id} to="/admin/cronograma"
                      className="flex shrink-0 items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-sm shadow-sm hover:bg-white">
                  <span className={`badge badge--${statusDe(t.tipo).color} !px-1.5 !py-0`}>
                    {statusDe(t.tipo).icon}
                  </span>
                  <span className="font-semibold">{t.titulo}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <KpiCard label="Polos ativos" value={kpis ? kpis.polos : '…'} />
        <KpiCard label="Alunos ativos" value={kpis ? kpis.alunos : '…'} />
        <KpiCard label="Professores" value={kpis ? kpis.professores : '…'} />
        <KpiCard label="Chamadas no mês" value={kpis ? kpis.chamadasMes : '…'} />
      </div>

      {/* Resumo do dia: tarefas de preparação + últimas chamadas */}
      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {/* Tarefas / preparação de documentos */}
        <div className="card !p-0">
          <div className="flex items-center justify-between p-4">
            <h2 className="font-bold">Tarefas da semana</h2>
            <Link to="/admin/cronograma" className="text-sm font-semibold text-[var(--c-primary)] hover:underline">
              Ver cronograma →
            </Link>
          </div>
          <div className="border-t border-[var(--c-border)]">
            {tarefas.length === 0 ? (
              <EmptyState
                icon="🗂️" title="Nenhuma tarefa próxima"
                message="Crie eventos no cronograma (ex.: preparar documentos antes da aula)."
              />
            ) : (
              <ul>
                {tarefas.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 border-b border-[var(--c-border)] p-3">
                    {/* Ícones de documento para tarefas de preparação */}
                    <div className="flex shrink-0 -space-x-2">
                      {t.tipo === 'preparo' ? (
                        <>
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--c-border)] bg-[var(--c-red-bg)] text-sm">📄</span>
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--c-border)] bg-[var(--c-blue-bg)] text-sm">📑</span>
                        </>
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--c-border)] text-sm"
                              style={{ background: `var(--c-${statusDe(t.tipo).color}-bg)` }}>
                          {statusDe(t.tipo).icon}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{t.titulo}</p>
                      <p className="text-xs text-[var(--c-text-soft)]">
                        {fmtData(t.data)}{t.polos?.nome ? ` · ${t.polos.nome}` : ''}
                        {t.descricao ? ` · ${t.descricao}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={t.tipo} />
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
