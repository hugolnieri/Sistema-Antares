import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DataTable, type Column } from '../../components/DataTable'
import { Drawer, Field, Modal, ConfirmModal, StatusBadge, EmptyState } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { fmtData, fmtDataHora } from '../../lib/format'
import { baixarModeloAlunos, lerPlanilhaAlunos, type LinhaPlanilhaAlunos } from '../../lib/planilhaAlunos'
import { registrarLog } from '../../lib/logs'
import { usePermissoes } from '../../lib/permissoes'
import type { Aluno, AlunoSugerido, Polo, Responsavel } from '../../lib/types'

const FORM_VAZIO = {
  nome: '', contato: '', polo_id: '', observacoes: '',
  status: 'ativo' as 'ativo' | 'inativo',
}

interface VinculoResp { responsavel_id: string; parentesco: string }
interface PresencaHist {
  id: string
  presente: boolean
  historico_aulas?: { numero_aula: number; ciclo: number; data_hora: string; polos?: { nome: string } | null } | null
}
interface LinhaImportPreview extends LinhaPlanilhaAlunos {
  linha: number
  erro?: string
}

export default function Alunos() {
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [sugestoes, setSugestoes] = useState<AlunoSugerido[]>([])
  const [polos, setPolos] = useState<Pick<Polo, 'id' | 'nome'>[]>([])
  const [responsaveis, setResponsaveis] = useState<Pick<Responsavel, 'id' | 'nome'>[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const toast = useToast()
  const { podeEditar } = usePermissoes()
  const somenteLeitura = !podeEditar('alunos')

  const [searchParams, setSearchParams] = useSearchParams()
  const filtroPolo = searchParams.get('polo') ?? ''

  const [drawerAberto, setDrawerAberto] = useState(false)
  const [editando, setEditando] = useState<Aluno | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [vinculos, setVinculos] = useState<VinculoResp[]>([])
  const [formErros, setFormErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [alunoInativar, setAlunoInativar] = useState<Aluno | null>(null)
  // Exclusão definitiva (com opção de excluir também os responsáveis do aluno)
  const [alunoExcluir, setAlunoExcluir] = useState<Aluno | null>(null)
  const [excluirResp, setExcluirResp] = useState(false)

  // Histórico de presença do aluno
  const [alunoHistorico, setAlunoHistorico] = useState<Aluno | null>(null)
  const [presencasAluno, setPresencasAluno] = useState<PresencaHist[] | null>(null)

  // Importação em massa via planilha
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importAberto, setImportAberto] = useState(false)
  const [importLinhas, setImportLinhas] = useState<LinhaImportPreview[]>([])
  const [importando, setImportando] = useState(false)

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
    registrarLog({
      acao: editando ? 'editar' : 'criar', entidade: 'aluno', entidadeId: alunoId,
      descricao: `${editando ? 'Editou' : 'Cadastrou'} o aluno "${payload.nome}".`,
    })
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
    registrarLog({
      acao: 'status', entidade: 'aluno', entidadeId: alunoInativar.id,
      descricao: `${novoStatus === 'inativo' ? 'Inativou' : 'Reativou'} o aluno "${alunoInativar.nome}".`,
    })
    toast.success(novoStatus === 'inativo' ? 'Aluno inativado.' : 'Aluno reativado.')
    setAlunoInativar(null)
    carregar()
  }

  // Exclusão definitiva. As presenças são preservadas (o histórico mantém o
  // nome do aluno). Opcionalmente exclui também os responsáveis exclusivos.
  const excluir = async () => {
    if (!alunoExcluir) return
    setSalvando(true)
    let respExcluidos = 0
    if (excluirResp) {
      const respIds = (alunoExcluir.aluno_responsaveis ?? []).map((ar) => ar.responsavel_id)
      for (const rid of respIds) {
        const { data: outros } = await supabase
          .from('aluno_responsaveis').select('aluno_id').eq('responsavel_id', rid)
        // Só exclui o responsável se ele não estiver vinculado a outro aluno.
        const soDesteAluno = (outros ?? []).every((o: any) => o.aluno_id === alunoExcluir.id)
        if (soDesteAluno) {
          const { error } = await supabase.from('responsaveis').delete().eq('id', rid)
          if (!error) respExcluidos++
        }
      }
    }
    const { error } = await supabase.from('alunos').delete().eq('id', alunoExcluir.id)
    setSalvando(false)
    if (error) { toast.error('Erro ao excluir o aluno.'); return }
    registrarLog({
      acao: 'excluir', entidade: 'aluno', entidadeId: alunoExcluir.id,
      descricao: `Excluiu o aluno "${alunoExcluir.nome}"` +
        (respExcluidos ? ` e ${respExcluidos} responsável(is) vinculado(s).` : '.'),
    })
    toast.success('Aluno excluído. O histórico de presenças foi preservado.')
    setAlunoExcluir(null)
    setDrawerAberto(false)
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
    registrarLog({
      acao: 'criar', entidade: 'aluno', entidadeId: s.id,
      descricao: `Aprovou a sugestão e cadastrou o aluno "${s.nome}" no polo ${s.polos?.nome ?? ''}.`,
    })
    toast.success(`Aluno "${s.nome}" cadastrado no polo ${s.polos?.nome ?? ''}.`)
    carregar()
  }

  const recusarSugestao = async (s: AlunoSugerido) => {
    setSalvando(true)
    const { error } = await supabase
      .from('alunos_sugeridos').update({ status: 'recusado' }).eq('id', s.id)
    setSalvando(false)
    if (error) { toast.error('Erro ao recusar a sugestão.'); return }
    registrarLog({
      acao: 'recusar', entidade: 'aluno', entidadeId: s.id,
      descricao: `Recusou a sugestão de cadastro do aluno "${s.nome}".`,
    })
    toast.success('Sugestão recusada.')
    carregar()
  }

  const abrirHistorico = async (a: Aluno) => {
    setAlunoHistorico(a)
    setPresencasAluno(null)
    const { data } = await supabase
      .from('presencas')
      .select('id, presente, historico_aulas(numero_aula, ciclo, data_hora, polos(nome))')
      .eq('aluno_id', a.id)
      .order('id', { ascending: false })
      .limit(50)
    setPresencasAluno((data ?? []) as unknown as PresencaHist[])
  }

  const validarLinhaImport = (l: LinhaPlanilhaAlunos): string | undefined => {
    if (!l.nome) return 'Informe o nome do aluno.'
    if (!l.polo) return 'Informe o polo.'
    if (!polos.some((p) => p.nome.trim().toLowerCase() === l.polo.toLowerCase())) {
      return `Polo "${l.polo}" não encontrado.`
    }
    if (l.status && !['ativo', 'inativo'].includes(l.status.toLowerCase())) {
      return 'Status deve ser "Ativo" ou "Inativo".'
    }
    return undefined
  }

  const selecionarArquivoImportacao = async (arquivo: File | null) => {
    if (importInputRef.current) importInputRef.current.value = ''
    if (!arquivo) return
    try {
      const linhas = await lerPlanilhaAlunos(arquivo)
      if (!linhas.length) {
        toast.error('A planilha está vazia ou não segue o modelo esperado.')
        return
      }
      setImportLinhas(linhas.map((l, i) => ({ ...l, linha: i + 2, erro: validarLinhaImport(l) })))
      setImportAberto(true)
    } catch {
      toast.error('Não foi possível ler o arquivo. Confira se é um .xlsx válido.')
    }
  }

  const importLinhasValidas = importLinhas.filter((l) => !l.erro)

  // Importa em lote: cria os responsáveis que ainda não existem (reaproveita
  // por nome+telefone), insere os alunos preservando a ordem das linhas
  // válidas, e então vincula cada aluno ao seu responsável pela mesma ordem.
  const confirmarImportacao = async () => {
    if (!importLinhasValidas.length) return
    setImportando(true)

    const chaveResp = (nome: string, telefone: string) => `${nome.trim().toLowerCase()}|${telefone.trim()}`
    const { data: respExistentes } = await supabase.from('responsaveis').select('id, nome, telefone')
    const mapaResp = new Map<string, string>()
    for (const r of (respExistentes ?? []) as { id: string; nome: string; telefone: string | null }[]) {
      mapaResp.set(chaveResp(r.nome, r.telefone ?? ''), r.id)
    }
    const novosResp = new Map<string, { nome: string; telefone: string }>()
    for (const l of importLinhasValidas) {
      if (!l.respNome) continue
      const chave = chaveResp(l.respNome, l.respTelefone)
      if (!mapaResp.has(chave) && !novosResp.has(chave)) {
        novosResp.set(chave, { nome: l.respNome, telefone: l.respTelefone })
      }
    }
    if (novosResp.size) {
      const { data: criados, error } = await supabase.from('responsaveis')
        .insert([...novosResp.values()].map((r) => ({ nome: r.nome, telefone: r.telefone || null })))
        .select('id, nome, telefone')
      if (error) { setImportando(false); toast.error('Erro ao criar responsáveis da planilha.'); return }
      for (const r of (criados ?? []) as { id: string; nome: string; telefone: string | null }[]) {
        mapaResp.set(chaveResp(r.nome, r.telefone ?? ''), r.id)
      }
    }

    const payloadAlunos = importLinhasValidas.map((l) => ({
      nome: l.nome,
      polo_id: polos.find((p) => p.nome.trim().toLowerCase() === l.polo.toLowerCase())!.id,
      contato: l.contato || null,
      observacoes: l.observacoes || null,
      status: (l.status.toLowerCase() === 'inativo' ? 'inativo' : 'ativo') as 'ativo' | 'inativo',
    }))
    const { data: criadosAlunos, error: erroAlunos } = await supabase
      .from('alunos').insert(payloadAlunos).select('id')
    if (erroAlunos || !criadosAlunos) {
      setImportando(false)
      toast.error('Erro ao importar os alunos.')
      return
    }

    const vinculos = importLinhasValidas
      .map((l, i) => ({ l, alunoId: (criadosAlunos[i] as { id: string }).id }))
      .filter(({ l }) => l.respNome)
      .map(({ l, alunoId }) => ({
        aluno_id: alunoId,
        responsavel_id: mapaResp.get(chaveResp(l.respNome, l.respTelefone))!,
        parentesco: l.parentesco || null,
      }))
    if (vinculos.length) {
      const { error } = await supabase.from('aluno_responsaveis').insert(vinculos)
      if (error) toast.error('Alunos importados, mas houve erro ao vincular alguns responsáveis.')
    }

    setImportando(false)
    setImportAberto(false)
    setImportLinhas([])
    const n = criadosAlunos.length
    registrarLog({
      acao: 'importar', entidade: 'aluno',
      descricao: `Importou ${n} aluno${n === 1 ? '' : 's'} por planilha.`,
    })
    toast.success(`${n} aluno${n === 1 ? '' : 's'} importado${n === 1 ? '' : 's'} com sucesso.`)
    carregar()
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
    {
      key: 'status', header: 'Status', sortable: true,
      render: (a) => somenteLeitura ? <StatusBadge status={a.status} /> : (
        <button
          className="border-0 bg-transparent p-0 cursor-pointer hover:opacity-80"
          title={a.status === 'ativo' ? 'Clique para inativar o aluno' : 'Clique para reativar o aluno'}
          onClick={(e) => { e.stopPropagation(); setAlunoInativar(a) }}
        >
          <StatusBadge status={a.status} />
        </button>
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
                {!somenteLeitura && (
                  <>
                    <button className="btn btn-primary !px-3 !py-1 text-xs"
                            disabled={salvando} onClick={() => aprovarSugestao(s)}>
                      Aprovar cadastro
                    </button>
                    <button className="btn btn-ghost !px-3 !py-1 text-xs text-[var(--c-danger)]"
                            disabled={salvando} onClick={() => recusarSugestao(s)}>
                      Recusar
                    </button>
                  </>
                )}
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
        onRowClick={(a) => abrirEdicao(a)}
        searchValue={(a) => `${a.nome} ${a.polos?.nome ?? ''}`}
        searchPlaceholder="Buscar aluno…"
        toolbar={
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost" onClick={() => baixarModeloAlunos(polos.map((p) => p.nome))}>
              📥 Baixar modelo
            </button>
            {!somenteLeitura && (
              <>
                <input
                  ref={importInputRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={(e) => selecionarArquivoImportacao(e.target.files?.[0] ?? null)}
                />
                <button className="btn btn-ghost" onClick={() => importInputRef.current?.click()}>
                  📤 Importar planilha
                </button>
                <button className="btn btn-primary" onClick={abrirNovo}>+ Novo aluno</button>
              </>
            )}
          </div>
        }
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
          action: somenteLeitura ? undefined
            : <button className="btn btn-primary" onClick={abrirNovo}>Cadastrar aluno</button>,
        }}
      />

      {/* Drawer criar/editar */}
      <Drawer
        open={drawerAberto}
        title={editando
          ? `${somenteLeitura ? 'Aluno' : 'Editar aluno'} — ${editando.nome}`
          : 'Novo aluno'}
        onClose={() => setDrawerAberto(false)}
        footer={somenteLeitura ? (
          <button className="btn btn-ghost" onClick={() => setDrawerAberto(false)}>Fechar</button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => setDrawerAberto(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        )}
      >
        <div className="flex flex-col gap-4">
          {editando && (
            <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--c-border)] p-3">
              <button className="btn btn-ghost !py-1.5 text-sm" onClick={() => abrirHistorico(editando)}>
                🕘 Ver presenças
              </button>
              {!somenteLeitura && (
                <button className="btn btn-ghost !py-1.5 text-sm text-[var(--c-danger)]"
                        onClick={() => { setExcluirResp(false); setAlunoExcluir(editando) }}>
                  🗑️ Excluir aluno
                </button>
              )}
            </div>
          )}
          <fieldset disabled={somenteLeitura} className="contents">
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
          </fieldset>
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
                  <td>
                    Aula {p.historico_aulas?.numero_aula ?? '—'}
                    {p.historico_aulas && ` · Ciclo ${p.historico_aulas.ciclo}`}
                  </td>
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

      {/* Exclusão definitiva do aluno (com opção de excluir os responsáveis) */}
      <Modal
        open={!!alunoExcluir}
        title="Excluir aluno"
        onClose={() => setAlunoExcluir(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setAlunoExcluir(null)} disabled={salvando}>
              Cancelar
            </button>
            <button className="btn btn-danger" onClick={excluir} disabled={salvando}>
              {salvando ? 'Aguarde…' : 'Excluir'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--c-text-soft)]">
            Excluir definitivamente o aluno <strong>{alunoExcluir?.nome}</strong>? O{' '}
            <strong>histórico de presenças é preservado</strong> — o nome continua no
            registro das aulas já realizadas. Esta ação não pode ser desfeita.
          </p>
          {(alunoExcluir?.aluno_responsaveis?.length ?? 0) > 0 && (
            <label className="flex items-start gap-2 rounded-lg border border-[var(--c-border)] p-3 text-sm">
              <input type="checkbox" className="mt-0.5 !w-auto" checked={excluirResp}
                     onChange={(e) => setExcluirResp(e.target.checked)} />
              <span>
                Excluir também os responsáveis deste aluno
                {' '}({(alunoExcluir?.aluno_responsaveis ?? [])
                  .map((ar) => ar.responsaveis?.nome).filter(Boolean).join(', ') || 'sem nome'}).
                {' '}Só serão removidos os que não estiverem vinculados a outro aluno.
              </span>
            </label>
          )}
        </div>
      </Modal>

      {/* Modal de revisão da planilha importada */}
      <Modal
        open={importAberto}
        title="Importar alunos da planilha"
        onClose={() => { setImportAberto(false); setImportLinhas([]) }}
        footer={
          <>
            <button className="btn btn-ghost" disabled={importando}
                    onClick={() => { setImportAberto(false); setImportLinhas([]) }}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={importando || importLinhasValidas.length === 0}
                    onClick={confirmarImportacao}>
              {importando
                ? 'Importando…'
                : `Importar ${importLinhasValidas.length} aluno${importLinhasValidas.length === 1 ? '' : 's'}`}
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-[var(--c-text-soft)]">
          {importLinhasValidas.length} de {importLinhas.length} linha{importLinhas.length === 1 ? '' : 's'} prontas
          para importar.{importLinhas.length > importLinhasValidas.length && ' As linhas com erro serão ignoradas.'}
        </p>
        <div className="max-h-[50vh] overflow-y-auto">
          <table className="data-table">
            <thead>
              <tr><th>Linha</th><th>Aluno</th><th>Polo</th><th>Responsável</th><th>Situação</th></tr>
            </thead>
            <tbody>
              {importLinhas.map((l) => (
                <tr key={l.linha}>
                  <td>{l.linha}</td>
                  <td>{l.nome || '—'}</td>
                  <td>{l.polo || '—'}</td>
                  <td>{l.respNome || '—'}</td>
                  <td>
                    {l.erro
                      ? <span className="badge badge--red">{l.erro}</span>
                      : <span className="badge badge--green">OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </>
  )
}
