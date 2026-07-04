import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DataTable, type Column } from '../../components/DataTable'
import { CalendarMonth, type CalendarItem } from '../../components/CalendarMonth'
import { Drawer, Field, ConfirmModal, StatusBadge } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { fmtData } from '../../lib/format'
import { statusDe } from '../../lib/status'
import type { CronogramaItem, Evento, EventoTipo, HistoricoAula, Polo, Professor } from '../../lib/types'

const AULA_VAZIA = {
  polo_id: '', numero_aula: 1, data: '', professor_id: '', observacoes: '',
  status: 'agendada' as CronogramaItem['status'],
}
const EVENTO_VAZIO = {
  titulo: '', data: '', tipo: 'preparo' as EventoTipo, polo_id: '', descricao: '',
}

export default function Cronograma() {
  const [itens, setItens] = useState<CronogramaItem[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [historico, setHistorico] = useState<HistoricoAula[]>([])
  const [polos, setPolos] = useState<Pick<Polo, 'id' | 'nome'>[]>([])
  const [professores, setProfessores] = useState<Pick<Professor, 'id' | 'nome'>[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const toast = useToast()
  const navigate = useNavigate()

  const [visao, setVisao] = useState<'calendario' | 'lista'>('calendario')
  const [filtroPolo, setFiltroPolo] = useState('')
  const [filtroProfessor, setFiltroProfessor] = useState('')

  // Drawer de aula agendada
  const [aulaDrawer, setAulaDrawer] = useState(false)
  const [editandoAula, setEditandoAula] = useState<CronogramaItem | null>(null)
  const [aula, setAula] = useState(AULA_VAZIA)
  const [aulaErros, setAulaErros] = useState<Record<string, string>>({})

  // Drawer de evento
  const [eventoDrawer, setEventoDrawer] = useState(false)
  const [editandoEvento, setEditandoEvento] = useState<Evento | null>(null)
  const [evento, setEvento] = useState(EVENTO_VAZIO)
  const [eventoErros, setEventoErros] = useState<Record<string, string>>({})

  const [salvando, setSalvando] = useState(false)
  const [aulaExcluir, setAulaExcluir] = useState<CronogramaItem | null>(null)
  const [eventoExcluir, setEventoExcluir] = useState<Evento | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const [itensRes, eventosRes, histRes, polosRes, profRes] = await Promise.all([
      supabase.from('cronograma')
        .select('*, polos(nome), professores(nome)')
        .order('data', { ascending: true }),
      supabase.from('eventos')
        .select('*, polos(nome)')
        .order('data', { ascending: true }),
      supabase.from('historico_aulas')
        .select('id, polo_id, numero_aula, professor_nome, data_hora, polos(nome)')
        .order('data_hora', { ascending: false }),
      supabase.from('polos').select('id, nome').eq('status', 'ativo').order('nome'),
      supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
    ])
    if (itensRes.error || eventosRes.error) setErro('Não foi possível carregar o cronograma.')
    else {
      setItens((itensRes.data ?? []) as unknown as CronogramaItem[])
      setEventos((eventosRes.data ?? []) as unknown as Evento[])
      setHistorico((histRes.data ?? []) as unknown as HistoricoAula[])
    }
    setPolos((polosRes.data ?? []) as Pick<Polo, 'id' | 'nome'>[])
    setProfessores((profRes.data ?? []) as Pick<Professor, 'id' | 'nome'>[])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // ---- Aula agendada ----
  const abrirNovaAula = () => {
    setEditandoAula(null); setAula(AULA_VAZIA); setAulaErros({}); setAulaDrawer(true)
  }
  const abrirEdicaoAula = (c: CronogramaItem) => {
    setEditandoAula(c)
    setAula({
      polo_id: c.polo_id, numero_aula: c.numero_aula, data: c.data,
      professor_id: c.professor_id ?? '', observacoes: c.observacoes ?? '', status: c.status,
    })
    setAulaErros({}); setAulaDrawer(true)
  }
  const salvarAula = async () => {
    const erros: Record<string, string> = {}
    if (!aula.polo_id) erros.polo_id = 'Selecione o polo.'
    if (!aula.data) erros.data = 'Informe a data da aula.'
    setAulaErros(erros)
    if (Object.keys(erros).length) return
    setSalvando(true)
    const payload = {
      polo_id: aula.polo_id, numero_aula: aula.numero_aula, data: aula.data,
      professor_id: aula.professor_id || null,
      observacoes: aula.observacoes.trim() || null, status: aula.status,
    }
    const { error } = editandoAula
      ? await supabase.from('cronograma').update(payload).eq('id', editandoAula.id)
      : await supabase.from('cronograma').insert(payload)
    setSalvando(false)
    if (error) { toast.error('Erro ao salvar a aula no cronograma.'); return }
    toast.success(editandoAula ? 'Aula atualizada.' : 'Aula agendada.')
    setAulaDrawer(false); carregar()
  }
  const excluirAula = async () => {
    if (!aulaExcluir) return
    setSalvando(true)
    const { error } = await supabase.from('cronograma').delete().eq('id', aulaExcluir.id)
    setSalvando(false)
    if (error) { toast.error('Erro ao excluir.'); return }
    toast.success('Aula removida do cronograma.')
    setAulaExcluir(null); carregar()
  }

  // ---- Evento ----
  const abrirNovoEvento = () => {
    setEditandoEvento(null); setEvento(EVENTO_VAZIO); setEventoErros({}); setEventoDrawer(true)
  }
  const abrirEdicaoEvento = (ev: Evento) => {
    setEditandoEvento(ev)
    setEvento({
      titulo: ev.titulo, data: ev.data, tipo: ev.tipo,
      polo_id: ev.polo_id ?? '', descricao: ev.descricao ?? '',
    })
    setEventoErros({}); setEventoDrawer(true)
  }
  const salvarEvento = async () => {
    const erros: Record<string, string> = {}
    if (!evento.titulo.trim()) erros.titulo = 'Informe o título do evento.'
    if (!evento.data) erros.data = 'Informe a data do evento.'
    setEventoErros(erros)
    if (Object.keys(erros).length) return
    setSalvando(true)
    const payload = {
      titulo: evento.titulo.trim(), data: evento.data, tipo: evento.tipo,
      polo_id: evento.polo_id || null, descricao: evento.descricao.trim() || null,
    }
    const { error } = editandoEvento
      ? await supabase.from('eventos').update(payload).eq('id', editandoEvento.id)
      : await supabase.from('eventos').insert(payload)
    setSalvando(false)
    if (error) { toast.error('Erro ao salvar o evento.'); return }
    toast.success(editandoEvento ? 'Evento atualizado.' : 'Evento criado.')
    setEventoDrawer(false); carregar()
  }
  const excluirEvento = async () => {
    if (!eventoExcluir) return
    setSalvando(true)
    const { error } = await supabase.from('eventos').delete().eq('id', eventoExcluir.id)
    setSalvando(false)
    if (error) { toast.error('Erro ao excluir o evento.'); return }
    toast.success('Evento excluído.')
    setEventoExcluir(null); setEventoDrawer(false); carregar()
  }

  // ---- Filtros ----
  const passaPolo = (poloId: string | null) => !filtroPolo || poloId === filtroPolo

  const aulasFiltradas = itens.filter((c) =>
    passaPolo(c.polo_id) && (!filtroProfessor || c.professor_id === filtroProfessor))

  // ---- Itens do calendário: aulas agendadas + realizadas + eventos ----
  const calendarItems: CalendarItem[] = [
    ...aulasFiltradas.map((c): CalendarItem => ({
      id: `aula-${c.id}`,
      data: c.data,
      titulo: `Aula ${c.numero_aula} · ${c.polos?.nome ?? ''}`,
      color: statusDe(c.status).color,
      icon: statusDe(c.status).icon,
      onClick: () => abrirEdicaoAula(c),
    })),
    ...historico
      .filter((h) => passaPolo(h.polo_id))
      .map((h): CalendarItem => ({
        id: `hist-${h.id}`,
        data: h.data_hora,
        titulo: `Aula ${h.numero_aula} realizada · ${h.polos?.nome ?? ''}`,
        color: 'green',
        icon: '✓',
        onClick: () => navigate(`/admin/historico/${h.id}`),
      })),
    ...eventos
      .filter((ev) => !filtroPolo || ev.polo_id === filtroPolo || ev.polo_id === null)
      .map((ev): CalendarItem => ({
        id: `evt-${ev.id}`,
        data: ev.data,
        titulo: ev.titulo,
        color: statusDe(ev.tipo).color,
        icon: statusDe(ev.tipo).icon,
        onClick: () => abrirEdicaoEvento(ev),
      })),
  ]

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
          <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => abrirEdicaoAula(c)}>
            Editar
          </button>
          <button className="btn btn-ghost !px-2 !py-1 text-xs text-[var(--c-danger)]"
                  onClick={() => setAulaExcluir(c)}>
            Excluir
          </button>
        </div>
      ),
    },
  ]

  const filtros = (
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
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-2">
        <button className={`btn !py-1.5 ${visao === 'calendario' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setVisao('calendario')} aria-pressed={visao === 'calendario'}>
          📅 Calendário
        </button>
        <button className={`btn !py-1.5 ${visao === 'lista' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setVisao('lista')} aria-pressed={visao === 'lista'}>
          📋 Lista de aulas
        </button>
        <div className="ml-auto flex gap-2">
          <button className="btn btn-ghost" onClick={abrirNovoEvento}>+ Novo evento</button>
          <button className="btn btn-primary" onClick={abrirNovaAula}>+ Agendar aula</button>
        </div>
      </div>

      {visao === 'calendario' ? (
        <>
          {/* Legenda + filtros */}
          <div className="card flex flex-wrap items-end gap-4">
            {filtros}
            <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-[var(--c-text-soft)]">
              <span className="flex items-center gap-1"><span className="badge badge--blue !px-1.5 !py-0">◷</span> Agendada</span>
              <span className="flex items-center gap-1"><span className="badge badge--green !px-1.5 !py-0">✓</span> Realizada</span>
              <span className="flex items-center gap-1"><span className="badge badge--amber !px-1.5 !py-0">📄</span> Evento</span>
            </div>
          </div>
          {loading ? (
            <div className="card"><div className="skeleton h-[480px] !rounded-xl" /></div>
          ) : (
            <CalendarMonth items={calendarItems} />
          )}
        </>
      ) : (
        <DataTable
          columns={colunas}
          rows={aulasFiltradas}
          loading={loading}
          error={erro}
          onRetry={carregar}
          searchValue={(c) => `${c.polos?.nome ?? ''} ${c.professores?.nome ?? ''} aula ${c.numero_aula}`}
          searchPlaceholder="Buscar no cronograma…"
          filters={filtros}
          empty={{
            icon: '📅', title: 'Nenhuma aula agendada',
            message: 'Agende as aulas dos polos para acompanhar o cronograma geral.',
            action: <button className="btn btn-primary" onClick={abrirNovaAula}>Agendar aula</button>,
          }}
        />
      )}

      {/* Drawer: aula agendada */}
      <Drawer
        open={aulaDrawer}
        title={editandoAula ? 'Editar aula agendada' : 'Agendar aula'}
        onClose={() => setAulaDrawer(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setAulaDrawer(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvarAula} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Polo" required error={aulaErros.polo_id}>
            <select value={aula.polo_id} aria-invalid={!!aulaErros.polo_id}
                    onChange={(e) => setAula((f) => ({ ...f, polo_id: e.target.value }))}>
              <option value="">Selecione…</option>
              {polos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Field>
          <Field label="Aula" required>
            <select value={aula.numero_aula}
                    onChange={(e) => setAula((f) => ({ ...f, numero_aula: Number(e.target.value) }))}>
              {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>Aula {n}</option>
              ))}
            </select>
          </Field>
          <Field label="Data" required error={aulaErros.data}>
            <input type="date" value={aula.data} aria-invalid={!!aulaErros.data}
                   onChange={(e) => setAula((f) => ({ ...f, data: e.target.value }))} />
          </Field>
          <Field label="Professor responsável">
            <select value={aula.professor_id}
                    onChange={(e) => setAula((f) => ({ ...f, professor_id: e.target.value }))}>
              <option value="">A definir</option>
              {professores.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={aula.status}
                    onChange={(e) => setAula((f) => ({ ...f, status: e.target.value as CronogramaItem['status'] }))}>
              <option value="agendada">Agendada</option>
              <option value="concluida">Concluída</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </Field>
          <Field label="Observações">
            <textarea rows={3} value={aula.observacoes}
                      onChange={(e) => setAula((f) => ({ ...f, observacoes: e.target.value }))} />
          </Field>
        </div>
      </Drawer>

      {/* Drawer: evento */}
      <Drawer
        open={eventoDrawer}
        title={editandoEvento ? 'Editar evento' : 'Novo evento'}
        onClose={() => setEventoDrawer(false)}
        footer={
          <>
            {editandoEvento && (
              <button className="btn btn-ghost mr-auto text-[var(--c-danger)]"
                      onClick={() => setEventoExcluir(editandoEvento)}>
                Excluir
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => setEventoDrawer(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvarEvento} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="rounded-lg bg-[var(--c-blue-bg)] p-3 text-xs text-[var(--c-blue-fg)]">
            Use eventos para lembretes que não são aulas — por exemplo,
            <strong> preparar documentos alguns dias antes da aula</strong>, reuniões
            ou entregas. Eles aparecem no calendário junto com as aulas.
          </p>
          <Field label="Título" required error={eventoErros.titulo}>
            <input value={evento.titulo} aria-invalid={!!eventoErros.titulo}
                   placeholder="Ex.: Preparar documentos da Aula 5"
                   onChange={(e) => setEvento((f) => ({ ...f, titulo: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data" required error={eventoErros.data}>
              <input type="date" value={evento.data} aria-invalid={!!eventoErros.data}
                     onChange={(e) => setEvento((f) => ({ ...f, data: e.target.value }))} />
            </Field>
            <Field label="Tipo">
              <select value={evento.tipo}
                      onChange={(e) => setEvento((f) => ({ ...f, tipo: e.target.value as EventoTipo }))}>
                <option value="preparo">Preparação de documentos</option>
                <option value="reuniao">Reunião</option>
                <option value="entrega">Entrega</option>
                <option value="geral">Outro</option>
              </select>
            </Field>
          </div>
          <Field label="Polo (opcional)">
            <select value={evento.polo_id}
                    onChange={(e) => setEvento((f) => ({ ...f, polo_id: e.target.value }))}>
              <option value="">Nenhum / geral</option>
              {polos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Field>
          <Field label="Descrição">
            <textarea rows={3} value={evento.descricao}
                      onChange={(e) => setEvento((f) => ({ ...f, descricao: e.target.value }))} />
          </Field>
        </div>
      </Drawer>

      <ConfirmModal
        open={!!aulaExcluir}
        title="Excluir aula do cronograma"
        message={<>Excluir a <strong>Aula {aulaExcluir?.numero_aula}</strong> do polo{' '}
          <strong>{aulaExcluir?.polos?.nome}</strong> em {fmtData(aulaExcluir?.data)}?</>}
        confirmLabel="Excluir"
        loading={salvando}
        onConfirm={excluirAula}
        onClose={() => setAulaExcluir(null)}
      />
      <ConfirmModal
        open={!!eventoExcluir}
        title="Excluir evento"
        message={<>Excluir o evento <strong>{eventoExcluir?.titulo}</strong>?</>}
        confirmLabel="Excluir"
        loading={salvando}
        onConfirm={excluirEvento}
        onClose={() => setEventoExcluir(null)}
      />
    </div>
  )
}
