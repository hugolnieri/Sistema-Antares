import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DataTable, type Column } from '../../components/DataTable'
import { StatusBadge } from '../../components/ui'
import type { Polo, Professor } from '../../lib/types'

export default function Mapeamento() {
  const [professores, setProfessores] = useState<Professor[]>([])
  const [polos, setPolos] = useState<Pick<Polo, 'id' | 'nome'>[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const [profRes, polosRes] = await Promise.all([
      supabase.from('professores')
        .select('*, professor_polos(polo_id, polos(nome))')
        .eq('ativo', true).order('nome'),
      supabase.from('polos').select('id, nome').eq('status', 'ativo').order('nome'),
    ])
    if (profRes.error || polosRes.error) setErro('Não foi possível carregar o mapeamento.')
    else {
      setProfessores((profRes.data ?? []) as unknown as Professor[])
      setPolos((polosRes.data ?? []) as Pick<Polo, 'id' | 'nome'>[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const polosComProfessor = new Set(
    professores.flatMap((p) => (p.professor_polos ?? []).map((pp) => pp.polo_id)),
  )
  const polosSemProfessor = polos.filter((p) => !polosComProfessor.has(p.id))

  const colunas: Column<Professor>[] = [
    { key: 'nome', header: 'Professor', sortable: true },
    { key: 'contato', header: 'Contato', render: (p) => p.contato ?? '—' },
    {
      key: 'polos', header: 'Polos vinculados',
      render: (p) => {
        const nomes = (p.professor_polos ?? []).map((pp) => pp.polos?.nome).filter(Boolean)
        if (!nomes.length) {
          return <span className="badge badge--amber"><span aria-hidden="true">◐</span> Sem polo</span>
        }
        return (
          <span className="text-sm">
            {nomes.join(', ')}
            {nomes.length > 1 && (
              <span className="badge badge--blue ml-2">
                <span aria-hidden="true">◆</span> {nomes.length} polos
              </span>
            )}
          </span>
        )
      },
      sortValue: (p) => (p.professor_polos ?? []).length,
      sortable: true,
    },
    { key: 'status', header: 'Status', sortable: true, render: (p) => <StatusBadge status={p.status} /> },
    {
      key: 'acoes', header: '',
      render: () => (
        <Link to="/admin/professores" className="btn btn-ghost !px-2 !py-1 text-xs">
          Gerenciar
        </Link>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {!loading && polosSemProfessor.length > 0 && (
        <div className="card border-l-4 !border-l-[var(--c-amber-fg)]">
          <p className="text-sm font-semibold">
            ⚠️ {polosSemProfessor.length === 1
              ? '1 polo ainda não possui professor vinculado:'
              : `${polosSemProfessor.length} polos ainda não possuem professor vinculado:`}
          </p>
          <p className="mt-1 text-sm text-[var(--c-text-soft)]">
            {polosSemProfessor.map((p) => p.nome).join(', ')}
          </p>
        </div>
      )}

      <DataTable
        columns={colunas}
        rows={professores}
        loading={loading}
        error={erro}
        onRetry={carregar}
        searchValue={(p) => `${p.nome} ${(p.professor_polos ?? []).map((pp) => pp.polos?.nome).join(' ')}`}
        searchPlaceholder="Buscar professor ou polo…"
        empty={{
          icon: '🗺️', title: 'Nenhum professor ativo',
          message: 'Cadastre professores para visualizar o mapeamento.',
          action: <Link to="/admin/professores" className="btn btn-primary">Ir para Professores</Link>,
        }}
      />
    </div>
  )
}
