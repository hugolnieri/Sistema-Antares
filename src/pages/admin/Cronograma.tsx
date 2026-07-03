import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DataTable, type Column } from '../../components/DataTable'
import { Drawer, Field, ConfirmModal, StatusBadge } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { fmtData } from '../../lib/format'
import type { CronogramaItem, Polo, Professor } from '../../lib/types'

const FORM_VAZIO = {
  polo_id: '', numero_aula: 1, data: '', professor_id: '', observacoes: '',
  status: 'agendada' as CronogramaItem['status'],
}

export default function Cronograma() {
  const [itens, setItens] = useState<CronogramaItem[]>([])
  const [polos, setPolos] = useState<Pick<Polo, 'id' | 'nome'>[]>([])
  const [professores, setProfessores] = useState<Pick<Professor, 'id' | 'nome'>[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const toast = useToast()

  const [filtroPolo, setFiltroPolo] = useState('')
  const [filtroProfessor, setFiltroProfessor] = useState('')

  const [drawerAberto, setDrawerAberto] = useState(false)
  const [editando, setEditando] = useState<CronogramaItem | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [formErros, setFormErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [itemExcluir, setItemExcluir] = useState<CronogramaItem | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const [itensRes, polosRes, profRes] = await Promise.all([
      supabase.from('cronograma')
        .select('*, polos(nome), professores(nome)')
        .order('data', { ascending: true }),
      supabase.from('polos').select('id, nome').eq('status', 'ativo').order('nome'),
      supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
    ])
    if (itensRes.error) setErro('Não foi possível carregar o cronograma.')
    else setItens((itensRes.data ?? []) as unknown as CronogramaItem[])
    setPolos((polosRes.data ?? []) as Pick<Polo, 'id' | 'nome'>[])
    setProfessores((profRes.data ?? []) as Pick<Professor, 'id' | 'nome'>[])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const abrirNovo = () => {
    setEditando(null)
    setForm(FORM_VAZIO)
    setFormErros({})
    setDrawerAberto(true)
  }

  const abrirEdicao = (c: CronogramaItem) => {
    setEditando(c)
    setForm({
      polo_id: c.polo_id, numero_aula: c.numero_aula, data: c.data,
      professor_id: c.professor_id ?? '', observacoes: c.observacoes ?? '',
      status: c.status,
    })
    setFormErros({})
    setDrawerAberto(true)
  }

  const salvar = async () => {
    const erros: Record<string, string> = {}
    if (!form.polo_id) erros.polo_id = 'Selecione o polo.'
    if (!form.data) erros.data = 'Informe a data da aula.'
    setFormErros(erros)
    if (Object.keys(erros).length) return

    setSalvando(true)
    const payload = {
      polo_id: form.polo_id,
      numero_aula: form.numero_aula,
      data: form.data,
      professor_id: form.professor_id || null,
      observacoes: form.observacoes.trim() || null,
      status: form.status,
    }
    const { error } = editando
      ? await supabase.from('cronograma').update(payload).eq('id', editando.id)
      : await supabase.from('cronograma').insert(payload)
    setSalvando(false)
    if (error) { toast.error('Erro ao salvar a aula no cronograma.'); return }
    toast.success(editando ? 'Aula atualizada.' : 'Aula agendada.')
    setDrawerAberto(false)
    carregar()
  }

  const excluir = async () => {
    if (!itemExcluir) return
    setSalvando(true)
    const { error } = await supabase.from('cronograma').delete().eq('id', itemExcluir.id)
    setSalvando(false)
    if (error) { toast.error('Erro ao excluir.'); return }
    toast.success('Aula removida do cronograma.')
    setItemExcluir(null)
    carregar()
  }

  const linhas = itens.filter((c) =>
    (!filtroPolo || c.polo_id === filtroPolo) &&
    (!filtroProfessor || c.professor_id === filtroProfessor))

  const colunas: Column<CronogramaItem>[] = [
    { key: 'data', header: 'Data', sortable: true, render: (c) => fmtData(c.data) },
    { key: 'polo', header: 'Polo', render: (c) => c.polos?.nome ?? '—' },
    { key: 'numero_aula', header: 'Aula', sortable: true, render: (c) => `Aula ${c.numero_aula}` },
    { key: 'professor', header: 'Professor', render: (c) => c.professores?.nome ?? '—' },
    { key: 'status', header: 'Status', sortable: true, render: (c) => <StatusBadge status={c.status} /> },
    {
      key: 'acoes', header: '',
      render: (c) => (
        <div className="flex justify-end gap-1">
          <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => abrirEdicao(c)}>
            Editar
          </button>
          <button className="btn btn-ghost !px-2 !py-1 text-xs text-[var(--c-danger)]"
                  onClick={() => setItemExcluir(c)}>
            Excluir
          </button>
        </div>
      ),
    },
  ]

  return (
    <>
      <DataTable
        columns={colunas}
        rows={linhas}
        loading={loading}
        error={erro}
        onRetry={carregar}
        searchValue={(c) => `${c.polos?.nome ?? ''} ${c.professores?.nome ?? ''} aula ${c.numero_aula}`}
        searchPlaceholder="Buscar no cronograma…"
        toolbar={<button className="btn btn-primary" onClick={abrirNovo}>+ Agendar aula</button>}
        filters={
          <>
            <Field label="Polo">
              <select value={filtroPolo} onChange={(e) => setFiltroPolo(e.target.value)}
                      className="min-w-[180px]">
                <option value="">Todos</option>
                {polos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </Field>
            <Field label="Professor">
              <select value={filtroProfessor} onChange={(e) => setFiltroProfessor(e.target.value)}
                      className="min-w-[180px]">
                <option value="">Todos</option>
                {professores.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </Field>
          </>
        }
        empty={{
          icon: '📅', title: 'Nenhuma aula agendada',
          message: 'Agende as aulas dos polos para acompanhar o cronograma geral.',
          action: <button className="btn btn-primary" onClick={abrirNovo}>Agendar aula</button>,
        }}
      />

      <Drawer
        open={drawerAberto}
        title={editando ? 'Editar aula agendada' : 'Agendar aula'}
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
          <Field label="Polo" required error={formErros.polo_id}>
            <select value={form.polo_id} aria-invalid={!!formErros.polo_id}
                    onChange={(e) => setForm((f) => ({ ...f, polo_id: e.target.value }))}>
              <option value="">Selecione…</option>
              {polos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Field>
          <Field label="Aula" required>
            <select value={form.numero_aula}
                    onChange={(e) => setForm((f) => ({ ...f, numero_aula: Number(e.target.value) }))}>
              {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>Aula {n}</option>
              ))}
            </select>
          </Field>
          <Field label="Data" required error={formErros.data}>
            <input type="date" value={form.data} aria-invalid={!!formErros.data}
                   onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />
          </Field>
          <Field label="Professor responsável">
            <select value={form.professor_id}
                    onChange={(e) => setForm((f) => ({ ...f, professor_id: e.target.value }))}>
              <option value="">A definir</option>
              {professores.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as CronogramaItem['status'] }))}>
              <option value="agendada">Agendada</option>
              <option value="concluida">Concluída</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </Field>
          <Field label="Observações">
            <textarea rows={3} value={form.observacoes}
                      onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
          </Field>
        </div>
      </Drawer>

      <ConfirmModal
        open={!!itemExcluir}
        title="Excluir aula do cronograma"
        message={<>Excluir a <strong>Aula {itemExcluir?.numero_aula}</strong> do polo{' '}
          <strong>{itemExcluir?.polos?.nome}</strong> em {fmtData(itemExcluir?.data)}?</>}
        confirmLabel="Excluir"
        loading={salvando}
        onConfirm={excluir}
        onClose={() => setItemExcluir(null)}
      />
    </>
  )
}
