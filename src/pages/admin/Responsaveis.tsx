import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DataTable, type Column } from '../../components/DataTable'
import { Drawer, Field, ConfirmModal } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { registrarLog } from '../../lib/logs'
import { usePermissoes } from '../../lib/permissoes'
import type { Responsavel } from '../../lib/types'

const FORM_VAZIO = { nome: '', telefone: '', observacoes: '' }

export default function Responsaveis() {
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const toast = useToast()
  const { podeEditar } = usePermissoes()
  const somenteLeitura = !podeEditar('responsaveis')

  const [drawerAberto, setDrawerAberto] = useState(false)
  const [editando, setEditando] = useState<Responsavel | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [formErros, setFormErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [respExcluir, setRespExcluir] = useState<Responsavel | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const { data, error } = await supabase
      .from('responsaveis')
      .select('*, aluno_responsaveis(aluno_id, parentesco, alunos(nome))')
      .order('nome')
    if (error) setErro('Não foi possível carregar os responsáveis.')
    else setResponsaveis((data ?? []) as unknown as Responsavel[])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const abrirNovo = () => {
    setEditando(null)
    setForm(FORM_VAZIO)
    setFormErros({})
    setDrawerAberto(true)
  }

  const abrirEdicao = (r: Responsavel) => {
    setEditando(r)
    setForm({ nome: r.nome, telefone: r.telefone ?? '', observacoes: r.observacoes ?? '' })
    setFormErros({})
    setDrawerAberto(true)
  }

  const salvar = async () => {
    if (!form.nome.trim()) { setFormErros({ nome: 'Informe o nome do responsável.' }); return }
    setSalvando(true)
    const payload = {
      nome: form.nome.trim(),
      telefone: form.telefone.trim() || null,
      observacoes: form.observacoes.trim() || null,
    }
    const { error } = editando
      ? await supabase.from('responsaveis').update(payload).eq('id', editando.id)
      : await supabase.from('responsaveis').insert(payload)
    setSalvando(false)
    if (error) { toast.error('Erro ao salvar o responsável.'); return }
    registrarLog({
      acao: editando ? 'editar' : 'criar', entidade: 'responsavel', entidadeId: editando?.id,
      descricao: `${editando ? 'Editou' : 'Cadastrou'} o responsável "${payload.nome}".`,
    })
    toast.success(editando ? 'Responsável atualizado.' : 'Responsável cadastrado.')
    setDrawerAberto(false)
    carregar()
  }

  const excluir = async () => {
    if (!respExcluir) return
    setSalvando(true)
    const { error } = await supabase.from('responsaveis').delete().eq('id', respExcluir.id)
    setSalvando(false)
    if (error) { toast.error('Erro ao excluir o responsável.'); return }
    registrarLog({
      acao: 'excluir', entidade: 'responsavel', entidadeId: respExcluir.id,
      descricao: `Excluiu o responsável "${respExcluir.nome}".`,
    })
    toast.success('Responsável excluído.')
    setRespExcluir(null)
    setDrawerAberto(false)
    carregar()
  }

  const colunas: Column<Responsavel>[] = [
    { key: 'nome', header: 'Responsável', sortable: true },
    { key: 'telefone', header: 'Telefone / WhatsApp', render: (r) => r.telefone ?? '—' },
    {
      key: 'alunos', header: 'Alunos vinculados',
      render: (r) => {
        const nomes = (r.aluno_responsaveis ?? [])
          .map((ar) => ar.alunos?.nome).filter(Boolean)
        return nomes.length ? nomes.join(', ') : (
          <span className="badge badge--amber"><span aria-hidden="true">◐</span> Sem aluno</span>
        )
      },
    },
  ]

  return (
    <>
      <DataTable
        columns={colunas}
        rows={responsaveis}
        loading={loading}
        error={erro}
        onRetry={carregar}
        onRowClick={(r) => abrirEdicao(r)}
        searchValue={(r) =>
          `${r.nome} ${r.telefone ?? ''} ` +
          (r.aluno_responsaveis ?? []).map((ar) => ar.alunos?.nome ?? '').join(' ')}
        searchPlaceholder="Buscar por responsável ou nome do aluno…"
        toolbar={somenteLeitura ? undefined
          : <button className="btn btn-primary" onClick={abrirNovo}>+ Novo responsável</button>}
        empty={{
          icon: '👪', title: 'Nenhum responsável cadastrado',
          message: 'Cadastre responsáveis e vincule-os aos alunos na tela de Alunos.',
          action: somenteLeitura ? undefined
            : <button className="btn btn-primary" onClick={abrirNovo}>Cadastrar responsável</button>,
        }}
      />

      <Drawer
        open={drawerAberto}
        title={editando
          ? `${somenteLeitura ? 'Responsável' : 'Editar responsável'} — ${editando.nome}`
          : 'Novo responsável'}
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
        <fieldset disabled={somenteLeitura} className="contents">
        <div className="flex flex-col gap-4">
          {editando && !somenteLeitura && (
            <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--c-border)] p-3">
              <button className="btn btn-ghost !py-1.5 text-sm text-[var(--c-danger)]"
                      onClick={() => setRespExcluir(editando)}>
                🗑️ Excluir responsável
              </button>
            </div>
          )}
          <Field label="Nome" required error={formErros.nome}>
            <input value={form.nome} aria-invalid={!!formErros.nome}
                   onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
          </Field>
          <Field label="Telefone / WhatsApp">
            <input value={form.telefone}
                   onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} />
          </Field>
          <Field label="Observações importantes">
            <textarea rows={3} value={form.observacoes}
                      onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
          </Field>
          <p className="text-xs text-[var(--c-text-soft)]">
            O vínculo com alunos (e o parentesco) é feito na tela de Alunos, ao editar o aluno.
          </p>
        </div>
        </fieldset>
      </Drawer>

      <ConfirmModal
        open={!!respExcluir}
        title="Excluir responsável"
        message={<>Excluir o responsável <strong>{respExcluir?.nome}</strong>?
          Os vínculos com alunos serão removidos. Esta ação não pode ser desfeita.</>}
        confirmLabel="Excluir"
        loading={salvando}
        onConfirm={excluir}
        onClose={() => setRespExcluir(null)}
      />
    </>
  )
}
