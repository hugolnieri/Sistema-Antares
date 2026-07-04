import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DataTable, type Column } from '../../components/DataTable'
import { Drawer, Field, ConfirmModal, StatusBadge } from '../../components/ui'
import { useToast } from '../../components/Toast'
import type { Polo, Professor } from '../../lib/types'

const FORM_VAZIO = {
  nome: '', contato: '', pix: '', observacoes: '',
  status: 'disponivel' as 'disponivel' | 'ocupado',
  polosIds: [] as string[],
}

export default function Professores() {
  const [professores, setProfessores] = useState<Professor[]>([])
  const [polos, setPolos] = useState<Pick<Polo, 'id' | 'nome'>[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const toast = useToast()

  const [drawerAberto, setDrawerAberto] = useState(false)
  const [editando, setEditando] = useState<Professor | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [formErros, setFormErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [profInativar, setProfInativar] = useState<Professor | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const [profRes, polosRes] = await Promise.all([
      supabase.from('professores')
        .select('*, professor_polos(polo_id, polos(nome))')
        .order('nome'),
      supabase.from('polos').select('id, nome').eq('status', 'ativo').order('nome'),
    ])
    if (profRes.error) setErro('Não foi possível carregar os professores.')
    else setProfessores((profRes.data ?? []) as unknown as Professor[])
    setPolos((polosRes.data ?? []) as Pick<Polo, 'id' | 'nome'>[])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const abrirNovo = () => {
    setEditando(null)
    setForm(FORM_VAZIO)
    setFormErros({})
    setDrawerAberto(true)
  }

  const abrirEdicao = (p: Professor) => {
    setEditando(p)
    setForm({
      nome: p.nome, contato: p.contato ?? '', pix: p.pix ?? '',
      observacoes: p.observacoes ?? '', status: p.status,
      polosIds: (p.professor_polos ?? []).map((pp) => pp.polo_id),
    })
    setFormErros({})
    setDrawerAberto(true)
  }

  const salvar = async () => {
    if (!form.nome.trim()) { setFormErros({ nome: 'Informe o nome do professor.' }); return }
    setSalvando(true)
    const payload = {
      nome: form.nome.trim(),
      contato: form.contato.trim() || null,
      pix: form.pix.trim() || null,
      observacoes: form.observacoes.trim() || null,
      status: form.status,
    }
    let profId = editando?.id
    if (editando) {
      const { error } = await supabase.from('professores').update(payload).eq('id', editando.id)
      if (error) { setSalvando(false); toast.error('Erro ao salvar o professor.'); return }
    } else {
      const { data, error } = await supabase
        .from('professores').insert(payload).select('id').single()
      if (error || !data) { setSalvando(false); toast.error('Erro ao salvar o professor.'); return }
      profId = data.id
    }
    // Sincroniza vínculos com polos
    await supabase.from('professor_polos').delete().eq('professor_id', profId!)
    if (form.polosIds.length) {
      const { error } = await supabase.from('professor_polos').insert(
        form.polosIds.map((poloId) => ({ professor_id: profId!, polo_id: poloId })),
      )
      if (error) { setSalvando(false); toast.error('Professor salvo, mas houve erro ao vincular polos.'); carregar(); return }
    }
    setSalvando(false)
    toast.success(editando ? 'Professor atualizado.' : 'Professor cadastrado.')
    setDrawerAberto(false)
    carregar()
  }

  const alternarAtivo = async () => {
    if (!profInativar) return
    setSalvando(true)
    const { error } = await supabase
      .from('professores').update({ ativo: !profInativar.ativo }).eq('id', profInativar.id)
    setSalvando(false)
    if (error) { toast.error('Erro ao alterar o status.'); return }
    toast.success(profInativar.ativo ? 'Professor inativado.' : 'Professor reativado.')
    setProfInativar(null)
    carregar()
  }

  const copiarPix = async (p: Professor) => {
    if (!p.pix) return
    try {
      await navigator.clipboard.writeText(p.pix)
      toast.success(`PIX de ${p.nome} copiado.`)
    } catch {
      toast.error('Não foi possível copiar. Copie manualmente: ' + p.pix)
    }
  }

  const togglePolo = (id: string) =>
    setForm((f) => ({
      ...f,
      polosIds: f.polosIds.includes(id)
        ? f.polosIds.filter((x) => x !== id)
        : [...f.polosIds, id],
    }))

  const colunas: Column<Professor>[] = [
    {
      key: 'nome', header: 'Professor', sortable: true,
      render: (p) => (
        <span className={p.ativo ? '' : 'text-[var(--c-text-soft)] line-through'}>{p.nome}</span>
      ),
    },
    { key: 'contato', header: 'Contato', render: (p) => p.contato ?? '—' },
    {
      key: 'pix', header: 'Chave PIX',
      render: (p) => p.pix ? (
        <div className="flex items-center gap-2">
          <code className="max-w-[180px] truncate rounded bg-[var(--c-gray-bg)] px-2 py-0.5 text-xs"
                title={p.pix}>
            {p.pix}
          </code>
          <button className="btn btn-ghost !px-2 !py-0.5 text-xs"
                  onClick={() => copiarPix(p)} aria-label={`Copiar PIX de ${p.nome}`}>
            📋 Copiar
          </button>
        </div>
      ) : <span className="text-[var(--c-text-soft)]">—</span>,
    },
    {
      key: 'polos', header: 'Polos vinculados',
      render: (p) => {
        const nomes = (p.professor_polos ?? []).map((pp) => pp.polos?.nome).filter(Boolean)
        return nomes.length
          ? <span className="text-sm">{nomes.join(', ')}</span>
          : <span className="badge badge--amber"><span aria-hidden="true">◐</span> Sem polo</span>
      },
    },
    {
      key: 'status', header: 'Status', sortable: true,
      render: (p) => p.ativo
        ? <StatusBadge status={p.status} />
        : <StatusBadge status="inativo" />,
    },
    {
      key: 'acoes', header: '',
      render: (p) => (
        <div className="flex justify-end gap-1">
          <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => abrirEdicao(p)}>
            Editar
          </button>
          <button className="btn btn-ghost !px-2 !py-1 text-xs text-[var(--c-danger)]"
                  onClick={() => setProfInativar(p)}>
            {p.ativo ? 'Inativar' : 'Reativar'}
          </button>
        </div>
      ),
    },
  ]

  const polosComProfessor = new Set(
    professores.filter((p) => p.ativo).flatMap((p) => (p.professor_polos ?? []).map((pp) => pp.polo_id)),
  )
  const polosSemProfessor = polos.filter((p) => !polosComProfessor.has(p.id))

  return (
    <>
      {!loading && polosSemProfessor.length > 0 && (
        <div className="card mb-4 border-l-4 !border-l-[var(--c-amber-fg)]">
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
        searchValue={(p) => `${p.nome} ${p.contato ?? ''}`}
        searchPlaceholder="Buscar professor…"
        toolbar={<button className="btn btn-primary" onClick={abrirNovo}>+ Novo professor</button>}
        empty={{
          icon: '🧑‍🏫', title: 'Nenhum professor cadastrado',
          message: 'Cadastre professores e vincule-os aos polos onde atuam.',
          action: <button className="btn btn-primary" onClick={abrirNovo}>Cadastrar professor</button>,
        }}
      />

      <Drawer
        open={drawerAberto}
        title={editando ? `Editar professor — ${editando.nome}` : 'Novo professor'}
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
          <Field label="Contato (telefone / WhatsApp)">
            <input value={form.contato}
                   onChange={(e) => setForm((f) => ({ ...f, contato: e.target.value }))} />
          </Field>
          <Field label="PIX">
            <input value={form.pix}
                   onChange={(e) => setForm((f) => ({ ...f, pix: e.target.value }))} />
          </Field>
          <Field label="Status">
            <select value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'disponivel' | 'ocupado' }))}>
              <option value="disponivel">Disponível</option>
              <option value="ocupado">Ocupado</option>
            </select>
          </Field>
          <Field label="Polos em que atua">
            <div className="flex flex-col gap-2 rounded-lg border border-[var(--c-border)] p-3">
              {polos.length === 0 && (
                <p className="text-sm text-[var(--c-text-soft)]">Nenhum polo ativo cadastrado.</p>
              )}
              {polos.map((polo) => (
                <label key={polo.id} className="flex items-center gap-2 text-sm font-normal">
                  <input
                    type="checkbox"
                    checked={form.polosIds.includes(polo.id)}
                    onChange={() => togglePolo(polo.id)}
                    className="!w-auto"
                  />
                  {polo.nome}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Observações">
            <textarea rows={3} value={form.observacoes}
                      onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
          </Field>
        </div>
      </Drawer>

      <ConfirmModal
        open={!!profInativar}
        title={profInativar?.ativo ? 'Inativar professor' : 'Reativar professor'}
        message={<>Deseja {profInativar?.ativo ? 'inativar' : 'reativar'} o professor{' '}
          <strong>{profInativar?.nome}</strong>?</>}
        confirmLabel={profInativar?.ativo ? 'Inativar' : 'Reativar'}
        danger={!!profInativar?.ativo}
        loading={salvando}
        onConfirm={alternarAtivo}
        onClose={() => setProfInativar(null)}
      />
    </>
  )
}
