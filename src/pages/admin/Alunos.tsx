import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DataTable, type Column } from '../../components/DataTable'
import { Drawer, Field, Modal, ConfirmModal, StatusBadge, EmptyState } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { fmtData, fmtDataHora } from '../../lib/format'
import type { Aluno, AlunoSugerido, Polo, Responsavel } from '../../lib/types'

const FORM_VAZIO = {
  nome: '', contato: '', polo_id: '', observacoes: '',
  status: 'ativo' as 'ativo' | 'inativo',
}

interface VinculoResp { responsavel_id: string; parentesco: string }
interface PresencaHist {
  id: string
  presente: boolean
  historico_aulas?: { numero_aula: number; data_hora: string; polos?: { nome: string } | null } | null
}

export default function Alunos() {
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [sugestoes, setSugestoes] = useState<AlunoSugerido[]>([])
  const [polos, setPolos] = useState<Pick<Polo, 'id' | 'nome'>[]>([])
  const [responsaveis, setResponsaveis] = useState<Pick<Responsavel, 'id' | 'nome'>[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const toast = useToast()

  const [searchParams, setSearchParams] = useSearchParams()
  const filtroPolo = searchParams.get('polo') ?? ''

  const [drawerAberto, setDrawerAberto] = useState(false)
  const [editando, setEditando] = useState<Aluno | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [vinculos, setVinculos] = useState<VinculoResp[]>([])
  const [formErros, setFormErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [alunoInativar, setAlunoInativar] = useState<Aluno | null>(null)

  // Histórico de presença do aluno
  const [alunoHistorico, setAlunoHistorico] = useState<Aluno | null>(null)
  const [presencasAluno, setPresencasAluno] = useState<PresencaHist[] | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const [alunosRes, polosRes, respRes, sugRes] = await Promise.all([
      supabase.from('alunos')
        .select('*, polos(nome), aluno_responsaveis(responsavel_id, parentesco, responsaveis(id, nome, telefone))')
        .order('nome'),
      supabase.from('polos').select('id, nome').order('nome'),
      supabase.from('responsaveis').select('id, nome').order('nome'),
      supabase.from('alunos_sugeridos')
        .select('*, polos(nome)')
        .eq('status', 'pendente')
        .order('created_at', { ascending: false }),
    ])
    if (alunosRes.error) setErro('Não foi possível carregar os alunos.')
    else setAlunos((alunosRes.data ?? []) as unknown as Aluno[])
    setPolos((polosRes.data ?? []) as Pick<Polo, 'id' | 'nome'>[])
    setResponsaveis((respRes.data ?? []) as Pick<Responsavel, 'id' | 'nome'>[])
    setSugestoes((sugRes.data ?? []) as unknown as AlunoSugerido[])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const abrirNovo = () => {
    setEditando(null)
    setForm({ ...FORM_VAZIO, polo_id: filtroPolo })
    setVinculos([])
    setFormErros({})
    setDrawerAberto(true)
  }

  const abrirEdicao = (a: Aluno) => {
    setEditando(a)
    setForm({
      nome: a.nome, contato: a.contato ?? '', polo_id: a.polo_id ?? '',
      observacoes: a.observacoes ?? '', status: a.status,
    })
    setVinculos((a.aluno_responsaveis ?? []).map((ar) => ({
      responsavel_id: ar.responsavel_id, parentesco: ar.parentesco ?? '',
    })))
    setFormErros({})
    setDrawerAberto(true)
  }

  const salvar = async () => {
    const erros: Record<string, string> = {}
    if (!form.nome.trim()) erros.nome = 'Informe o nome do aluno.'
    if (!form.polo_id) erros.polo_id = 'Selecione o polo do aluno.'
    setFormErros(erros)
    if (Object.keys(erros).length) return

    setSalvando(true)
    const payload = {
      nome: form.nome.trim(),
      contato: form.contato.trim() || null,
      polo_id: form.polo_id,
      observacoes: form.observacoes.trim() || null,
      status: form.status,
    }
    let alunoId = editando?.id
    if (editando) {
      const { error } = await supabase.from('alunos').update(payload).eq('id', editando.id)
      if (error) { setSalvando(false); toast.error('Erro ao salvar o aluno.'); return }
    } else {
      const { data, error } = await supabase.from('alunos').insert(payload).select('id').single()
      if (error || !data) { setSalvando(false); toast.error('Erro ao salvar o aluno.'); return }
      alunoId = data.id
    }
    // Sincroniza responsáveis
    await supabase.from('aluno_responsaveis').delete().eq('aluno_id', alunoId!)
    const validos = vinculos.filter((v) => v.responsavel_id)
    if (validos.length) {
      const { error } = await supabase.from('aluno_responsaveis').insert(
        validos.map((v) => ({
          aluno_id: alunoId!, responsavel_id: v.responsavel_id,
          parentesco: v.parentesco.trim() || null,
        })),
      )
      if (error) {
        setSalvando(false)
        toast.error('Aluno salvo, mas houve erro ao vincular responsáveis.')
        carregar()
        return
      }
    }
    setSalvando(false)
    toast.success(editando ? 'Aluno atualizado.' : 'Aluno cadastrado.')
    setDrawerAberto(false)
    carregar()
  }

  const alternarStatus = async () => {
    if (!alunoInativar) return
    setSalvando(true)
    const novoStatus = alunoInativar.status === 'ativo' ? 'inativo' : 'ativo'
    const { error } = await supabase
      .from('alunos').update({ status: novoStatus }).eq('id', alunoInativar.id)
    setSalvando(false)
    if (error) { toast.error('Erro ao alterar o status.'); return }
    toast.success(novoStatus === 'inativo' ? 'Aluno inativado.' : 'Aluno reativado.')
    setAlunoInativar(null)
    carregar()
  }

  // Sugestões vindas da chamada do professor: aprovar cria o aluno no polo.
  const aprovarSugestao = async (s: AlunoSugerido) => {
    setSalvando(true)
    const { error } = await supabase.from('alunos').insert({
      nome: s.nome,
      polo_id: s.polo_id,
      status: 'ativo',
      observacoes: 'Cadastro sugerido pelo professor na chamada.',
    })
    if (error) { setSalvando(false); toast.error('Erro ao aprovar o cadastro.'); return }
    await supabase.from('alunos_sugeridos').update({ status: 'aprovado' }).eq('id', s.id)
    setSalvando(false)
    toast.success(`Aluno "${s.nome}" cadastrado no polo ${s.polos?.nome ?? ''}.`)
    carregar()
  }

  const recusarSugestao = async (s: AlunoSugerido) => {
    setSalvando(true)
    const { error } = await supabase
      .from('alunos_sugeridos').update({ status: 'recusado' }).eq('id', s.id)
    setSalvando(false)
    if (error) { toast.error('Erro ao recusar a sugestão.'); return }
    toast.success('Sugestão recusada.')
    carregar()
  }

  const abrirHistorico = async (a: Aluno) => {
    setAlunoHistorico(a)
    setPresencasAluno(null)
    const { data } = await supabase
      .from('presencas')
      .select('id, presente, historico_aulas(numero_aula, data_hora, polos(nome))')
      .eq('aluno_id', a.id)
      .order('id', { ascending: false })
      .limit(50)
    setPresencasAluno((data ?? []) as unknown as PresencaHist[])
  }

  const linhas = filtroPolo ? alunos.filter((a) => a.polo_id === filtroPolo) : alunos

  const colunas: Column<Aluno>[] = [
    { key: 'nome', header: 'Aluno', sortable: true },
    { key: 'polo', header: 'Polo', render: (a) => a.polos?.nome ?? '—' },
    {
      key: 'responsaveis', header: 'Responsáveis',
      render: (a) => {
        const nomes = (a.aluno_responsaveis ?? [])
          .map((ar) => ar.responsaveis?.nome).filter(Boolean)
        return nomes.length ? nomes.join(', ') : '—'
      },
    },
    { key: 'status', header: 'Status', sortable: true, render: (a) => <StatusBadge status={a.status} /> },
    {
      key: 'acoes', header: '',
      render: (a) => (
        <div className="flex justify-end gap-1">
          <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => abrirEdicao(a)}>
            Editar
          </button>
          <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => abrirHistorico(a)}>
            Presenças
          </button>
          <button className="btn btn-ghost !px-2 !py-1 text-xs text-[var(--c-danger)]"
                  onClick={() => setAlunoInativar(a)}>
            {a.status === 'ativo' ? 'Inativar' : 'Reativar'}
          </button>
        </div>
      ),
    },
  ]

  return (
    <>
      {sugestoes.length > 0 && (
        <div className="card mb-6 border-l-4 !border-l-[var(--c-amber-fg)]">
          <h2 className="font-bold">
            📥 Sugestões de cadastro dos professores ({sugestoes.length})
          </h2>
          <p className="mt-1 text-sm text-[var(--c-text-soft)]">
            Alunos citados na chamada que ainda não têm cadastro. Aprovar cria o
            aluno no polo indicado.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {sugestoes.map((s) => (
              <li key={s.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--c-border)] p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.nome}</p>
                  <p className="text-xs text-[var(--c-text-soft)]">
                    Polo {s.polos?.nome ?? '—'} · citado em {fmtData(s.created_at)}
                  </p>
                </div>
                <StatusBadge status="pendente" />
                <button className="btn btn-primary !px-3 !py-1 text-xs"
                        disabled={salvando} onClick={() => aprovarSugestao(s)}>
                  Aprovar cadastro
                </button>
                <button className="btn btn-ghost !px-3 !py-1 text-xs text-[var(--c-danger)]"
                        disabled={salvando} onClick={() => recusarSugestao(s)}>
                  Recusar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DataTable
        columns={colunas}
        rows={linhas}
        loading={loading}
        error={erro}
        onRetry={carregar}
        searchValue={(a) => `${a.nome} ${a.polos?.nome ?? ''}`}
        searchPlaceholder="Buscar aluno…"
        toolbar={<button className="btn btn-primary" onClick={abrirNovo}>+ Novo aluno</button>}
        filters={
          <Field label="Filtrar por polo">
            <select
              value={filtroPolo}
              onChange={(e) =>
                setSearchParams(e.target.value ? { polo: e.target.value } : {})}
              className="min-w-[220px]"
            >
              <option value="">Todos os polos</option>
              {polos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Field>
        }
        empty={{
          icon: '🎓', title: 'Nenhum aluno cadastrado',
          message: 'Cadastre alunos e vincule cada um ao seu polo.',
          action: <button className="btn btn-primary" onClick={abrirNovo}>Cadastrar aluno</button>,
        }}
      />

      {/* Drawer criar/editar */}
      <Drawer
        open={drawerAberto}
        title={editando ? `Editar aluno — ${editando.nome}` : 'Novo aluno'}
        onClose={() => setDrawerAberto(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setDrawerAberto(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Nome" required error={formErros.nome}>
            <input value={form.nome} aria-invalid={!!formErros.nome}
                   onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
          </Field>
          <Field label="Polo" required error={formErros.polo_id}>
            <select value={form.polo_id} aria-invalid={!!formErros.polo_id}
                    onChange={(e) => setForm((f) => ({ ...f, polo_id: e.target.value }))}>
              <option value="">Selecione o polo…</option>
              {polos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Field>
          <Field label="Contato (se houver)">
            <input value={form.contato}
                   onChange={(e) => setForm((f) => ({ ...f, contato: e.target.value }))} />
          </Field>
          <Field label="Status">
            <select value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'ativo' | 'inativo' }))}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </Field>

          <Field label="Responsáveis vinculados">
            <div className="flex flex-col gap-3 rounded-lg border border-[var(--c-border)] p-3">
              {vinculos.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={v.responsavel_id}
                    onChange={(e) => setVinculos((vs) =>
                      vs.map((x, j) => j === i ? { ...x, responsavel_id: e.target.value } : x))}
                    className="flex-1"
                  >
                    <option value="">Selecione…</option>
                    {responsaveis.map((r) => (
                      <option key={r.id} value={r.id}>{r.nome}</option>
                    ))}
                  </select>
                  <input
                    placeholder="Parentesco"
                    value={v.parentesco}
                    onChange={(e) => setVinculos((vs) =>
                      vs.map((x, j) => j === i ? { ...x, parentesco: e.target.value } : x))}
                    className="!w-32"
                  />
                  <button className="btn btn-ghost !px-2 !py-1 text-xs text-[var(--c-danger)]"
                          onClick={() => setVinculos((vs) => vs.filter((_, j) => j !== i))}
                          aria-label="Remover responsável">
                    ✕
                  </button>
                </div>
              ))}
              <button
                className="btn btn-ghost !py-1 text-xs"
                onClick={() => setVinculos((vs) => [...vs, { responsavel_id: '', parentesco: '' }])}
              >
                + Adicionar responsável
              </button>
              <p className="text-xs text-[var(--c-text-soft)]">
                O responsável precisa estar cadastrado em Responsáveis.
              </p>
            </div>
          </Field>

          <Field label="Observações">
            <textarea rows={3} value={form.observacoes}
                      onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
          </Field>
        </div>
      </Drawer>

      {/* Modal histórico de presença */}
      <Modal
        open={!!alunoHistorico}
        title={`Presenças — ${alunoHistorico?.nome ?? ''}`}
        onClose={() => setAlunoHistorico(null)}
      >
        {presencasAluno === null ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton" />)}
          </div>
        ) : presencasAluno.length === 0 ? (
          <EmptyState icon="🕘" title="Nenhuma presença registrada"
                      message="Este aluno ainda não apareceu em nenhuma chamada." />
        ) : (
          <table className="data-table">
            <thead><tr><th>Aula</th><th>Polo</th><th>Data</th><th>Presença</th></tr></thead>
            <tbody>
              {presencasAluno.map((p) => (
                <tr key={p.id}>
                  <td>Aula {p.historico_aulas?.numero_aula ?? '—'}</td>
                  <td>{p.historico_aulas?.polos?.nome ?? '—'}</td>
                  <td>{fmtDataHora(p.historico_aulas?.data_hora)}</td>
                  <td><StatusBadge status={p.presente ? 'presente' : 'ausente'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      <ConfirmModal
        open={!!alunoInativar}
        title={alunoInativar?.status === 'ativo' ? 'Inativar aluno' : 'Reativar aluno'}
        message={<>Deseja {alunoInativar?.status === 'ativo' ? 'inativar' : 'reativar'} o aluno{' '}
          <strong>{alunoInativar?.nome}</strong>? Alunos inativos não aparecem na chamada do professor.</>}
        confirmLabel={alunoInativar?.status === 'ativo' ? 'Inativar' : 'Reativar'}
        danger={alunoInativar?.status === 'ativo'}
        loading={salvando}
        onConfirm={alternarStatus}
        onClose={() => setAlunoInativar(null)}
      />
    </>
  )
}
