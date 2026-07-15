import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DataTable, type Column } from '../../components/DataTable'
import { CalendarMonth, type CalendarItem } from '../../components/CalendarMonth'
import { Drawer, Field, ConfirmModal, Modal, StatusBadge } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { fmtData, subtrairDias, adicionarDias, hojeISO, proximaSegunda, linkWhatsAppTexto, linkWhatsApp } from '../../lib/format'
import { statusDe } from '../../lib/status'
import { registrarLog } from '../../lib/logs'
import { usePermissoes } from '../../lib/permissoes'
import type { CronogramaItem, CronogramaProfessor, HistoricoAula, LembreteCronograma, Material, Polo, Professor } from '../../lib/types'

const AULA_VAZIA = {
  polo_id: '', numero_aula: 1, data: '', professores_ids: [] as string[], observacoes: '',
  status: 'agendada' as CronogramaItem['status'],
  lembretes: [] as LembreteCronograma[],
  relatorio_lembrete: false, relatorio_lembrete_data: '',
}

// Rótulo/estilo do status de confirmação de presença de um professor.
const STATUS_CONFIRMACAO: Record<CronogramaProfessor['status'], { label: string; badge: string }> = {
  pendente:   { label: '⏳ Pendente',    badge: 'badge--gray' },
  confirmado: { label: '✓ Confirmou',    badge: 'badge--green' },
  recusado:   { label: '✗ Não vai',      badge: 'badge--red' },
}

const OPCOES_LEMBRETE = [1, 2, 3, 5, 7, 10, 14]

// Sugestões rápidas para a data do lembrete de envio do relatório.
// `base` é a data da aula (ou hoje, se ainda não escolhida).
const OPCOES_DATA_RELATORIO: { label: string; calc: (base: string) => string }[] = [
  { label: 'Próxima segunda', calc: (b) => proximaSegunda(b) },
  { label: '2 dias depois', calc: (b) => adicionarDias(b, 2) },
  { label: '3 dias depois', calc: (b) => adicionarDias(b, 3) },
  { label: '1 semana depois', calc: (b) => adicionarDias(b, 7) },
]

export default function Cronograma() {
  const [itens, setItens] = useState<CronogramaItem[]>([])
  const [historico, setHistorico] = useState<HistoricoAula[]>([])
  const [polos, setPolos] = useState<Pick<Polo, 'id' | 'nome'>[]>([])
  const [professores, setProfessores] = useState<Pick<Professor, 'id' | 'nome' | 'contato'>[]>([])
  const [materiais, setMateriais] = useState<Pick<Material, 'numero_aula' | 'titulo' | 'relatorio'>[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const toast = useToast()
  const navigate = useNavigate()
  const { podeEditar } = usePermissoes()
  const somenteLeitura = !podeEditar('cronograma')

  const [visao, setVisao] = useState<'calendario' | 'lista'>('calendario')
  const [filtroPolo, setFiltroPolo] = useState('')
  const [filtroProfessor, setFiltroProfessor] = useState('')

  const [aulaDrawer, setAulaDrawer] = useState(false)
  const [editandoAula, setEditandoAula] = useState<CronogramaItem | null>(null)
  const [aula, setAula] = useState(AULA_VAZIA)
  const [aulaErros, setAulaErros] = useState<Record<string, string>>({})

  const [salvando, setSalvando] = useState(false)
  const [aulaExcluir, setAulaExcluir] = useState<CronogramaItem | null>(null)

  // Modal "enviar relatório no WhatsApp"
  const [enviarAula, setEnviarAula] = useState<CronogramaItem | null>(null)
  const [msgRelatorio, setMsgRelatorio] = useState('')

  // Modal "confirmar presença dos professores" (popup pós-agendamento)
  const [confirmModal, setConfirmModal] = useState<
    { titulo: string; subtitulo: string; profs: CronogramaProfessor[] } | null
  >(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const [itensRes, histRes, polosRes, profRes, matRes] = await Promise.all([
      supabase.from('cronograma')
        .select('*, polos(nome), professores(nome), cronograma_professores(id, cronograma_id, professor_id, professor_nome, token, status, respondido_em, professores(nome, contato))')
        .order('data', { ascending: true }),
      supabase.from('historico_aulas')
        .select('id, polo_id, numero_aula, professor_nome, data_hora, polos(nome)')
        .order('data_hora', { ascending: false }),
      supabase.from('polos').select('id, nome').eq('status', 'ativo').order('nome'),
      supabase.from('professores').select('id, nome, contato').eq('status', 'ativo').order('nome'),
      supabase.from('materiais').select('numero_aula, titulo, relatorio').order('numero_aula'),
    ])
    if (itensRes.error) setErro('Não foi possível carregar o cronograma.')
    else {
      setItens((itensRes.data ?? []) as unknown as CronogramaItem[])
      setHistorico((histRes.data ?? []) as unknown as HistoricoAula[])
    }
    setPolos((polosRes.data ?? []) as Pick<Polo, 'id' | 'nome'>[])
    setProfessores((profRes.data ?? []) as Pick<Professor, 'id' | 'nome' | 'contato'>[])
    setMateriais((matRes.data ?? []) as Pick<Material, 'numero_aula' | 'titulo' | 'relatorio'>[])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const abrirNovaAula = (dataPreenchida?: string) => {
    setEditandoAula(null)
    setAula({ ...AULA_VAZIA, data: dataPreenchida ?? '' })
    setAulaErros({}); setAulaDrawer(true)
  }
  const abrirEdicaoAula = (c: CronogramaItem) => {
    setEditandoAula(c)
    // Compatível com dados antigos (1 lembrete só) e novos (lista de lembretes).
    const lembretes: LembreteCronograma[] = Array.isArray(c.lembretes) && c.lembretes.length
      ? c.lembretes.map((l) => ({ dias_antes: l.dias_antes, texto: l.texto }))
      : c.lembrete_dias_antes != null
        ? [{ dias_antes: c.lembrete_dias_antes, texto: c.lembrete_texto ?? '' }]
        : []
    // Lista de professores responsáveis: fonte da verdade é cronograma_professores.
    // Fallback para dados legados que só tinham professor_id na própria aula.
    const professores_ids = (c.cronograma_professores ?? [])
      .map((cp) => cp.professor_id)
      .filter((id): id is string => !!id)
    if (!professores_ids.length && c.professor_id) professores_ids.push(c.professor_id)
    setAula({
      polo_id: c.polo_id, numero_aula: c.numero_aula, data: c.data,
      professores_ids, observacoes: c.observacoes ?? '', status: c.status,
      lembretes,
      relatorio_lembrete: !!c.relatorio_lembrete_data,
      relatorio_lembrete_data: c.relatorio_lembrete_data ?? '',
    })
    setAulaErros({}); setAulaDrawer(true)
  }

  // Manipulação da lista de lembretes do formulário (botão "+", edição e remoção).
  const adicionarLembrete = () =>
    setAula((f) => ({ ...f, lembretes: [...f.lembretes, { dias_antes: 2, texto: '' }] }))
  const mudarLembrete = (i: number, patch: Partial<LembreteCronograma>) =>
    setAula((f) => ({
      ...f,
      lembretes: f.lembretes.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    }))
  const removerLembrete = (i: number) =>
    setAula((f) => ({ ...f, lembretes: f.lembretes.filter((_, j) => j !== i) }))

  // Lista de professores responsáveis do formulário (sem duplicar).
  const adicionarProfessor = (id: string) => {
    if (!id) return
    setAula((f) => (f.professores_ids.includes(id)
      ? f : { ...f, professores_ids: [...f.professores_ids, id] }))
  }
  const removerProfessor = (id: string) =>
    setAula((f) => ({ ...f, professores_ids: f.professores_ids.filter((x) => x !== id) }))

  // Abre o popup de confirmação de presença com a lista de professores da aula.
  const abrirConfirmacao = (c: CronogramaItem, profs: CronogramaProfessor[]) => {
    if (!profs.length) return
    setConfirmModal({
      titulo: `Aula ${c.numero_aula} · ${c.polos?.nome ?? ''}`,
      subtitulo: fmtData(c.data),
      profs,
    })
  }

  // Mensagem do WhatsApp com o link único de confirmação do professor.
  const msgConfirmacao = (titulo: string, subtitulo: string, prof: CronogramaProfessor) =>
    `Olá, ${prof.professor_nome}! 👋\nVocê é responsável pela ${titulo} em ${subtitulo}.\n\n` +
    `Confirme sua presença neste link:\n${window.location.origin}/confirmar/${prof.token}`

  // Abre o modal de envio do relatório da aula no WhatsApp, com a mensagem
  // pré-preenchida a partir do relatório salvo no material daquela aula.
  const abrirEnvio = (c: CronogramaItem) => {
    const rel = materiais.find((m) => m.numero_aula === c.numero_aula)?.relatorio?.trim()
    const cabecalho = `📋 Relatório da Aula ${c.numero_aula} — ${c.polos?.nome ?? ''}\n${fmtData(c.data)}\n\n`
    setMsgRelatorio(rel ? cabecalho + rel : '')
    setEnviarAula(c)
  }
  const salvarAula = async () => {
    const erros: Record<string, string> = {}
    if (!aula.polo_id) erros.polo_id = 'Selecione o polo.'
    if (!aula.data) erros.data = 'Informe a data da aula.'
    if (aula.lembretes.some((l) => !l.texto.trim())) {
      erros.lembretes = 'Preencha o texto de cada lembrete (ou remova os vazios).'
    }
    if (aula.relatorio_lembrete && !aula.relatorio_lembrete_data) {
      erros.relatorio_lembrete_data = 'Escolha a data do lembrete.'
    }
    setAulaErros(erros)
    if (Object.keys(erros).length) return
    setSalvando(true)
    const lembretes = aula.lembretes
      .filter((l) => l.texto.trim())
      .map((l) => ({ dias_antes: Number(l.dias_antes), texto: l.texto.trim() }))
    const payload = {
      polo_id: aula.polo_id, numero_aula: aula.numero_aula, data: aula.data,
      // professor_id legado = primeiro professor da lista (mantém filtros/colunas antigos).
      professor_id: aula.professores_ids[0] || null,
      observacoes: aula.observacoes.trim() || null, status: aula.status,
      lembretes,
      // Campos antigos zerados: a lista de lembretes é a fonte da verdade agora.
      lembrete_dias_antes: null, lembrete_texto: null,
      relatorio_lembrete_data: aula.relatorio_lembrete ? aula.relatorio_lembrete_data || null : null,
    }
    const { data: salva, error } = editandoAula
      ? await supabase.from('cronograma').update(payload).eq('id', editandoAula.id).select('id').single()
      : await supabase.from('cronograma').insert(payload).select('id').single()
    if (error || !salva) { setSalvando(false); toast.error('Erro ao salvar a aula no cronograma.'); return }
    const aulaId = (salva as { id: string }).id

    // Sincroniza a lista de professores responsáveis (cronograma_professores):
    // insere os novos, remove os retirados, preserva os mantidos (token + status).
    const existentes = editandoAula?.cronograma_professores ?? []
    const idsExistentes = existentes.map((cp) => cp.professor_id).filter(Boolean) as string[]
    const inserir = aula.professores_ids
      .filter((id) => !idsExistentes.includes(id))
      .map((id) => ({
        cronograma_id: aulaId,
        professor_id: id,
        professor_nome: professores.find((p) => p.id === id)?.nome ?? 'Professor',
      }))
    const removerIds = existentes
      .filter((cp) => !cp.professor_id || !aula.professores_ids.includes(cp.professor_id))
      .map((cp) => cp.id)
    if (removerIds.length) {
      await supabase.from('cronograma_professores').delete().in('id', removerIds)
    }
    if (inserir.length) {
      await supabase.from('cronograma_professores').insert(inserir)
    }
    setSalvando(false)

    const nomePolo = polos.find((p) => p.id === aula.polo_id)?.nome ?? ''
    registrarLog({
      acao: editandoAula ? 'editar' : 'criar', entidade: 'cronograma', entidadeId: editandoAula?.id,
      descricao: `${editandoAula ? 'Editou' : 'Agendou'} a Aula ${aula.numero_aula} do polo "${nomePolo}" (${fmtData(aula.data)}).`,
    })
    toast.success(editandoAula ? 'Aula atualizada.' : 'Aula agendada.')
    setAulaDrawer(false)
    carregar()

    // Popup de confirmação de presença: relê os professores da aula (com tokens)
    // e abre o WhatsApp para cada um. Só aparece se houver professores.
    if (aula.professores_ids.length) {
      const { data: profs } = await supabase.from('cronograma_professores')
        .select('id, cronograma_id, professor_id, professor_nome, token, status, respondido_em, professores(nome, contato)')
        .eq('cronograma_id', aulaId)
      abrirConfirmacao(
        { numero_aula: aula.numero_aula, data: aula.data, polos: { nome: nomePolo } } as CronogramaItem,
        (profs ?? []) as unknown as CronogramaProfessor[],
      )
    }
  }
  const excluirAula = async () => {
    if (!aulaExcluir) return
    setSalvando(true)
    const { error } = await supabase.from('cronograma').delete().eq('id', aulaExcluir.id)
    setSalvando(false)
    if (error) { toast.error('Erro ao excluir.'); return }
    registrarLog({
      acao: 'excluir', entidade: 'cronograma', entidadeId: aulaExcluir.id,
      descricao: `Removeu a Aula ${aulaExcluir.numero_aula} do polo "${aulaExcluir.polos?.nome ?? ''}" (${fmtData(aulaExcluir.data)}).`,
    })
    toast.success('Aula removida do cronograma.')
    setAulaExcluir(null); carregar()
  }

  const passaPolo = (poloId: string | null) => !filtroPolo || poloId === filtroPolo

  const passaProfessor = (c: CronogramaItem) =>
    !filtroProfessor
    || c.professor_id === filtroProfessor
    || (c.cronograma_professores ?? []).some((cp) => cp.professor_id === filtroProfessor)

  const aulasFiltradas = itens.filter((c) => passaPolo(c.polo_id) && passaProfessor(c))

  // Itens do calendário: aulas agendadas + aulas realizadas + lembretes (calculados a partir das aulas)
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
    ...aulasFiltradas.flatMap((c) =>
      (c.lembretes ?? []).map((lb, i): CalendarItem => ({
        id: `lembrete-${c.id}-${i}`,
        data: subtrairDias(c.data, lb.dias_antes),
        titulo: `${lb.texto || 'Lembrete'} (Aula ${c.numero_aula})`,
        color: statusDe('lembrete').color,
        icon: statusDe('lembrete').icon,
        onClick: () => abrirEdicaoAula(c),
      }))),
    ...aulasFiltradas
      .filter((c) => c.relatorio_lembrete_data)
      .map((c): CalendarItem => ({
        id: `relatorio-${c.id}`,
        data: c.relatorio_lembrete_data!,
        titulo: `Enviar relatório · Aula ${c.numero_aula} · ${c.polos?.nome ?? ''}`,
        color: statusDe('envio_relatorio').color,
        icon: statusDe('envio_relatorio').icon,
        onClick: () => abrirEnvio(c),
      })),
  ]

  const colunas: Column<CronogramaItem>[] = [
    { key: 'data', header: 'Data', sortable: true, render: (c) => fmtData(c.data) },
    { key: 'polo', header: 'Polo', render: (c) => c.polos?.nome ?? '—' },
    { key: 'numero_aula', header: 'Aula', sortable: true, render: (c) => `Aula ${c.numero_aula}` },
    {
      key: 'professor', header: 'Professores',
      render: (c) => {
        const cps = c.cronograma_professores ?? []
        if (!cps.length) return c.professores?.nome ?? '—'
        const confirmados = cps.filter((x) => x.status === 'confirmado').length
        return (
          <div className="flex flex-col">
            <span>{cps.map((x) => x.professor_nome).join(', ')}</span>
            <span className="text-xs text-[var(--c-text-soft)]">
              {confirmados}/{cps.length} confirmaram
            </span>
          </div>
        )
      },
    },
    { key: 'status', header: 'Status', sortable: true, render: (c) => <StatusBadge status={c.status} /> },
    {
      key: 'lembrete', header: 'Lembretes',
      render: (c) => {
        const ls = c.lembretes ?? []
        if (!ls.length) return '—'
        return (
          <span className="text-xs text-[var(--c-text-soft)]">
            {ls.map((l) => `${l.texto || 'Lembrete'} (${l.dias_antes}d)`).join(' · ')}
          </span>
        )
      },
    },
    {
      key: 'acoes', header: '',
      render: (c) => (
        <div className="flex justify-end gap-1">
          {(c.cronograma_professores ?? []).length > 0 && (
            <button className="btn btn-ghost !px-2 !py-1 text-xs"
                    onClick={() => abrirConfirmacao(c, c.cronograma_professores ?? [])}>
              💬 Confirmar
            </button>
          )}
          {c.relatorio_lembrete_data && (
            <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => abrirEnvio(c)}>
              💬 Relatório
            </button>
          )}
          <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => abrirEdicaoAula(c)}>
            {somenteLeitura ? 'Ver' : 'Editar'}
          </button>
          {!somenteLeitura && (
            <button className="btn btn-ghost !px-2 !py-1 text-xs text-[var(--c-danger)]"
                    onClick={() => setAulaExcluir(c)}>
              Excluir
            </button>
          )}
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
        {!somenteLeitura && (
          <button className="btn btn-primary ml-auto" onClick={() => abrirNovaAula()}>+ Agendar aula</button>
        )}
      </div>

      {visao === 'calendario' ? (
        <>
          {/* Legenda + filtros */}
          <div className="card flex flex-wrap items-end gap-4">
            {filtros}
            <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-[var(--c-text-soft)]">
              <span className="flex items-center gap-1"><span className="badge badge--blue !px-1.5 !py-0">◷</span> Agendada</span>
              <span className="flex items-center gap-1"><span className="badge badge--green !px-1.5 !py-0">✓</span> Realizada</span>
              <span className="flex items-center gap-1"><span className="badge badge--amber !px-1.5 !py-0">📄</span> Lembrete</span>
              <span className="flex items-center gap-1"><span className="badge badge--green !px-1.5 !py-0">💬</span> Enviar relatório</span>
            </div>
          </div>
          {!somenteLeitura && (
            <p className="text-xs text-[var(--c-text-soft)]">
              Clique em qualquer dia do calendário para agendar uma aula nessa data.
            </p>
          )}
          {loading ? (
            <div className="card"><div className="skeleton h-[480px] !rounded-xl" /></div>
          ) : (
            <CalendarMonth items={calendarItems}
                           onDayClick={somenteLeitura ? undefined : (dataISO) => abrirNovaAula(dataISO)} />
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
            action: somenteLeitura ? undefined
              : <button className="btn btn-primary" onClick={() => abrirNovaAula()}>Agendar aula</button>,
          }}
        />
      )}

      {/* Drawer: aula agendada */}
      <Drawer
        open={aulaDrawer}
        title={editandoAula
          ? (somenteLeitura ? 'Aula agendada' : 'Editar aula agendada')
          : 'Agendar aula'}
        onClose={() => setAulaDrawer(false)}
        footer={somenteLeitura ? (
          <button className="btn btn-ghost" onClick={() => setAulaDrawer(false)}>Fechar</button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => setAulaDrawer(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvarAula} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        )}
      >
        <fieldset disabled={somenteLeitura} className="contents">
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
          <Field label="Professores responsáveis">
            {aula.professores_ids.length > 0 ? (
              <ul className="mb-2 flex flex-col gap-1.5">
                {aula.professores_ids.map((id) => {
                  const prof = professores.find((p) => p.id === id)
                  const cp = editandoAula?.cronograma_professores?.find((x) => x.professor_id === id)
                  return (
                    <li key={id}
                        className="flex items-center gap-2 rounded-lg border border-[var(--c-border)] px-3 py-2 text-sm">
                      <span className="flex-1">{prof?.nome ?? 'Professor'}</span>
                      {cp && (
                        <span className={`badge !py-0.5 text-xs ${STATUS_CONFIRMACAO[cp.status].badge}`}>
                          {STATUS_CONFIRMACAO[cp.status].label}
                        </span>
                      )}
                      {!somenteLeitura && (
                        <button type="button"
                                className="btn btn-ghost !px-2 !py-0.5 text-[var(--c-danger)]"
                                onClick={() => removerProfessor(id)}
                                aria-label={`Remover ${prof?.nome ?? 'professor'}`}>
                          ✕
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mb-2 text-xs text-[var(--c-text-soft)]">Nenhum professor definido ainda.</p>
            )}
            {!somenteLeitura && (
              <select value="" aria-label="Adicionar professor"
                      onChange={(e) => adicionarProfessor(e.target.value)}>
                <option value="">＋ Adicionar professor…</option>
                {professores
                  .filter((p) => !aula.professores_ids.includes(p.id))
                  .map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            )}
            <p className="mt-1.5 text-xs text-[var(--c-text-soft)]">
              Ao salvar, abre um popup para enviar o link de confirmação de presença
              para cada professor pelo WhatsApp.
            </p>
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

          <div className="rounded-lg border border-[var(--c-border)] p-3">
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={aula.relatorio_lembrete}
                     onChange={(e) => setAula((f) => ({
                       ...f,
                       relatorio_lembrete: e.target.checked,
                       relatorio_lembrete_data: e.target.checked
                         ? (f.relatorio_lembrete_data || proximaSegunda(f.data || hojeISO()))
                         : f.relatorio_lembrete_data,
                     }))} />
              <span className="text-sm font-semibold">💬 Lembrar de enviar o relatório desta aula</span>
            </label>
            <p className="mb-3 mt-1 text-xs text-[var(--c-text-soft)]">
              Cria um lembrete no calendário na data escolhida, com botão para enviar o
              relatório no WhatsApp. Ex.: aula no sábado, relatório na segunda-feira. O texto
              vem do relatório cadastrado em Materiais para esta aula.
            </p>
            {aula.relatorio_lembrete && (
              <>
                <p className="mb-1.5 text-xs font-medium text-[var(--c-text-soft)]">
                  Sugestões {aula.data ? 'a partir da data da aula' : '(defina a data da aula acima)'}:
                </p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {OPCOES_DATA_RELATORIO.map((opt) => {
                    const valor = opt.calc(aula.data || hojeISO())
                    const ativo = aula.relatorio_lembrete_data === valor
                    return (
                      <button key={opt.label} type="button"
                              title={fmtData(valor)}
                              onClick={() => setAula((f) => ({ ...f, relatorio_lembrete_data: valor }))}
                              className={`badge cursor-pointer !py-1 text-xs transition-opacity hover:opacity-80 ${
                                ativo ? 'badge--green' : 'badge--gray'}`}>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                <Field label="Data do lembrete" required error={aulaErros.relatorio_lembrete_data}>
                  <input type="date" value={aula.relatorio_lembrete_data}
                         aria-invalid={!!aulaErros.relatorio_lembrete_data}
                         onChange={(e) => setAula((f) => ({ ...f, relatorio_lembrete_data: e.target.value }))} />
                </Field>
              </>
            )}
          </div>

          <div className="rounded-lg border border-[var(--c-border)] p-3">
            <p className="mb-2 text-sm font-semibold">📄 Lembretes (opcional)</p>
            <p className="mb-3 text-xs text-[var(--c-text-soft)]">
              Ex.: lembrar 2 dias antes de organizar os materiais. Cada lembrete
              aparece sozinho no calendário na data calculada. Use “+” para adicionar
              quantos quiser.
            </p>

            {aula.lembretes.map((l, i) => (
              <div key={i} className="mb-3 grid grid-cols-[auto_1fr_auto] items-end gap-2">
                <Field label="Dias antes">
                  <select value={l.dias_antes} className="!w-28"
                          onChange={(e) => mudarLembrete(i, { dias_antes: Number(e.target.value) })}>
                    {OPCOES_LEMBRETE.map((n) => (
                      <option key={n} value={n}>{n} dia{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </Field>
                <Field label="O que lembrar">
                  <input value={l.texto} placeholder="Ex.: Organizar materiais"
                         onChange={(e) => mudarLembrete(i, { texto: e.target.value })} />
                </Field>
                <button className="btn btn-ghost !px-3 !py-2 text-[var(--c-danger)]"
                        onClick={() => removerLembrete(i)} aria-label={`Remover lembrete ${i + 1}`}>
                  ✕
                </button>
              </div>
            ))}
            {aulaErros.lembretes && <p className="field-error mb-2">{aulaErros.lembretes}</p>}
            <button className="btn btn-ghost self-start !py-1.5 text-sm" onClick={adicionarLembrete}>
              + Adicionar lembrete
            </button>
          </div>
        </div>
        </fieldset>
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

      {/* Modal: enviar relatório da aula no WhatsApp */}
      <Modal
        open={!!enviarAula}
        title="Enviar relatório no WhatsApp"
        onClose={() => setEnviarAula(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setEnviarAula(null)}>Fechar</button>
            <a
              className={`btn btn-primary ${msgRelatorio.trim() ? '' : 'pointer-events-none opacity-50'}`}
              href={linkWhatsAppTexto(msgRelatorio)}
              target="_blank" rel="noreferrer"
              aria-disabled={!msgRelatorio.trim()}
              onClick={() => setEnviarAula(null)}
            >
              💬 Abrir WhatsApp
            </a>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {enviarAula && (
            <p className="text-sm text-[var(--c-text-soft)]">
              Aula {enviarAula.numero_aula} · {enviarAula.polos?.nome} · aula em {fmtData(enviarAula.data)}
            </p>
          )}
          {!msgRelatorio.trim() && (
            <p className="rounded-lg bg-[var(--c-amber-bg)] px-3 py-2 text-xs text-[var(--c-amber-fg)]">
              Nenhum relatório cadastrado para esta aula em <strong>Materiais</strong>.
              Escreva a mensagem abaixo ou cadastre o relatório padrão para reaproveitar depois.
            </p>
          )}
          <Field label="Mensagem">
            <textarea rows={9} value={msgRelatorio}
                      placeholder="Digite a mensagem que será enviada no grupo das famílias…"
                      onChange={(e) => setMsgRelatorio(e.target.value)} />
          </Field>
          <p className="text-xs text-[var(--c-text-soft)]">
            Ao tocar em “Abrir WhatsApp”, o app abre com a mensagem pronta — escolha o grupo
            das famílias e envie.
          </p>
        </div>
      </Modal>

      {/* Modal: confirmar presença dos professores (link no WhatsApp) */}
      <Modal
        open={!!confirmModal}
        title="Confirmar presença dos professores"
        onClose={() => setConfirmModal(null)}
        footer={<button className="btn btn-primary" onClick={() => setConfirmModal(null)}>Fechar</button>}
      >
        <div className="flex flex-col gap-3">
          {confirmModal && (
            <>
              <p className="text-sm text-[var(--c-text-soft)]">
                {confirmModal.titulo} · {confirmModal.subtitulo}
              </p>
              <p className="rounded-lg bg-[var(--c-blue-bg)] px-3 py-2 text-xs text-[var(--c-blue-fg)]">
                Envie o link de confirmação para cada professor. Ao abrir, ele confirma
                ou recusa a presença — o status aparece aqui e no cronograma.
              </p>
              <ul className="flex flex-col gap-2">
                {confirmModal.profs.map((prof) => {
                  const contato = prof.professores?.contato ?? null
                  const link = `${window.location.origin}/confirmar/${prof.token}`
                  const msg = msgConfirmacao(confirmModal.titulo, confirmModal.subtitulo, prof)
                  return (
                    <li key={prof.id}
                        className="flex flex-col gap-2 rounded-lg border border-[var(--c-border)] p-3">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm font-medium">{prof.professor_nome}</span>
                        <span className={`badge !py-0.5 text-xs ${STATUS_CONFIRMACAO[prof.status].badge}`}>
                          {STATUS_CONFIRMACAO[prof.status].label}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          className={`btn btn-primary !py-1.5 text-sm ${contato ? '' : 'pointer-events-none opacity-50'}`}
                          href={contato ? linkWhatsApp(contato, msg) : undefined}
                          target="_blank" rel="noreferrer"
                          aria-disabled={!contato}
                        >
                          💬 WhatsApp
                        </a>
                        <button className="btn btn-ghost !py-1.5 text-sm"
                                onClick={async () => {
                                  await navigator.clipboard.writeText(link)
                                  toast.success('Link de confirmação copiado.')
                                }}>
                          🔗 Copiar link
                        </button>
                      </div>
                      {!contato && (
                        <p className="text-xs text-[var(--c-amber-fg)]">
                          Sem telefone cadastrado para este professor — use “Copiar link”.
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
