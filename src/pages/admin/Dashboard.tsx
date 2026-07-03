import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { KpiCard, StatusBadge, EmptyState } from '../../components/ui'
import { fmtDataHora } from '../../lib/format'
import type { HistoricoAula } from '../../lib/types'

interface Kpis {
  polos: number
  alunos: number
  professores: number
  chamadasMes: number
}

export default function Dashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [ultimas, setUltimas] = useState<HistoricoAula[]>([])
  const [erro, setErro] = useState('')

  useEffect(() => {
    const inicioMes = new Date()
    inicioMes.setDate(1)
    inicioMes.setHours(0, 0, 0, 0)

    Promise.all([
      supabase.from('polos').select('id', { count: 'exact', head: true }).eq('status', 'ativo'),
      supabase.from('alunos').select('id', { count: 'exact', head: true }).eq('status', 'ativo'),
      supabase.from('professores').select('id', { count: 'exact', head: true }).eq('ativo', true),
      supabase.from('historico_aulas').select('id', { count: 'exact', head: true })
        .gte('data_hora', inicioMes.toISOString()),
      supabase.from('historico_aulas')
        .select('id, numero_aula, professor_nome, data_hora, polos(nome)')
        .order('data_hora', { ascending: false }).limit(6),
    ]).then(([p, a, pr, ch, ult]) => {
      if (ult.error) { setErro('Não foi possível carregar os dados.'); return }
      setKpis({
        polos: p.count ?? 0,
        alunos: a.count ?? 0,
        professores: pr.count ?? 0,
        chamadasMes: ch.count ?? 0,
      })
      setUltimas((ult.data ?? []) as unknown as HistoricoAula[])
    })
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6" style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      }}>
        <KpiCard label="Polos ativos" value={kpis ? kpis.polos : '…'} />
        <KpiCard label="Alunos ativos" value={kpis ? kpis.alunos : '…'} />
        <KpiCard label="Professores" value={kpis ? kpis.professores : '…'} />
        <KpiCard label="Chamadas no mês" value={kpis ? kpis.chamadasMes : '…'} />
      </div>

      <div className="card !p-0">
        <div className="flex items-center justify-between p-4">
          <h2 className="font-bold">Últimas chamadas registradas</h2>
          <Link to="/admin/historico" className="text-sm font-semibold text-[var(--c-primary)] hover:underline">
            Ver histórico completo →
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
                <tr><th>Polo</th><th>Aula</th><th>Professor</th><th>Data</th><th></th></tr>
              </thead>
              <tbody>
                {ultimas.map((h) => (
                  <tr key={h.id}>
                    <td>{h.polos?.nome ?? '—'}</td>
                    <td><StatusBadge status="concluida" /> <span className="ml-1">Aula {h.numero_aula}</span></td>
                    <td>{h.professor_nome}</td>
                    <td>{fmtDataHora(h.data_hora)}</td>
                    <td>
                      <Link to={`/admin/historico/${h.id}`}
                            className="text-sm font-semibold text-[var(--c-primary)] hover:underline">
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
