import { useEffect, useRef, useState } from 'react'
import { poloApi } from '../../lib/poloApi'
import { linkWhatsApp, normalizarBusca } from '../../lib/format'
import { AULAS_POR_CICLO } from '../../lib/types'
import type { AlunoChamada, Periodo } from '../../lib/types'
import { Field, EmptyState, Modal } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { usePolo } from './PoloLayout'

const MAX_FOTO_BYTES = 5 * 1024 * 1024
const MAX_FOTOS = 10

// Todo polo dá a mesma aula duas vezes no dia, para duas turmas.
const PERIODOS: { valor: Periodo; rotulo: string; icone: string }[] = [
  { valor: 'manha', rotulo: 'Manhã', icone: '🌅' },
  { valor: 'tarde', rotulo: 'Tarde', icone: '🌇' },
]

export default function Chamada() {
  const { token, dados, recarregar } = usePolo()
  const toast = useToast()

  const hoje = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD no fuso local
  // Turno da chamada: '' enquanto o professor não escolheu. A aula só fica
  // selecionável depois, porque "concluída" depende do turno.
  const [periodo, setPeriodo] = useState<Periodo | ''>('')
  const [numeroAula, setNumeroAula] = useState(0)
  // Quando != null, a chamada já existe no servidor: cada presença marcada é
  // salva na hora (sem botão de "salvar"), e data/professor/relatório ficam
  // travados (já foram gravados na criação da chamada).
  const [historicoId, setHistoricoId] = useState<string | null>(null)
  const [carregandoResumo, setCarregandoResumo] = useState(false)
  const [dataAula, setDataAula] = useState(hoje)
  // Padrão: 2 campos de professor (só o 1º é obrigatório)
  const [professores, setProfessores] = useState<string[]>(['', ''])
  const [presencas, setPresencas] = useState<Record<string, boolean>>({})
  const [relatorio, setRelatorio] = useState('')
  // O relatório é escrito DURANTE a aula, então continua editável mesmo depois
  // que a chamada existe (ao contrário de data e professores). Salva sozinho
  // ~1s depois da última tecla e no blur; a ref guarda o último texto já
  // gravado para não repetir requisição à toa.
  const [salvandoRelatorio, setSalvandoRelatorio] = useState(false)
  const [relatorioSalvo, setRelatorioSalvo] = useState(false)
  const relatorioTimer = useRef<number | null>(null)
  const relatorioGravado = useRef('')
  const [fotos, setFotos] = useState<File[]>([])
  // Na chamada da TARDE: quem já marcou presença no turno da manhã desta
  // mesma aula. Esses alunos saem da lista principal e vão para um bloco
  // recolhido no fim — ainda dá para marcar (aluno que vem nos dois turnos).
  const [presentesManha, setPresentesManha] = useState<Set<string>>(new Set())
  const [manhaAberta, setManhaAberta] = useState(false)
  // A lista começa recolhida: numa turma grande, rolar dezenas de nomes atrás
  // de um aluno é onde o professor se perde. Buscar pelo nome abre a lista
  // sozinho e mostra só quem interessa.
  const [busca, setBusca] = useState('')
  const [listaAberta, setListaAberta] = useState(false)
  // Sugestões de aluno enviadas nesta sessão (só para exibir "✓ enviado").
  // O envio é imediato (poloApi.sugerirAluno), funciona antes e depois da chamada.
  const [sugeridos, setSugeridos] = useState<string[]>([])
  const [novoExtra, setNovoExtra] = useState('')
  const [enviandoSugestao, setEnviandoSugestao] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})
  // Criando a chamada (1º toggle) trava todos os botões pra evitar criar
  // duas vezes se o professor clicar em mais de um aluno rapidamente.
  const [criandoChamada, setCriandoChamada] = useState(false)
  // Aluno cuja presença está em voo (chamada já existe) — só aquele botão trava.
  const [pendentes, setPendentes] = useState<Set<string>>(new Set())
  const [enviandoFotos, setEnviandoFotos] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Aluno selecionado para consulta de responsáveis (abre o popup de motivo).
  const [consultaAluno, setConsultaAluno] = useState<{ id: string; nome: string } | null>(null)
  const [motivoConsulta, setMotivoConsulta] = useState('')
  const [enviandoConsulta, setEnviandoConsulta] = useState(false)

  const chamadaIniciada = historicoId !== null
  const rotuloTurno = PERIODOS.find((p) => p.valor === periodo)?.rotulo ?? ''

  // Mensagem automática para o WhatsApp DO COLÉGIO ANTARES (número definido
  // em Configurações no admin; o contato do polo é apenas informativo) —
  // pede o nome e telefone do responsável pelo aluno, já com o motivo.
  const mensagemConsultaResponsavel = (nomeAluno: string, motivo: string) =>
    `Olá! Sou professor(a) no polo ${dados.polo.nome}. Preciso do nome e ` +
    `telefone do responsável pelo aluno(a) *${nomeAluno}* para contato.\n` +
    `Motivo: ${motivo}\n` +
    `Pode me ajudar?`

  const abrirConsultaResponsaveis = (alunoId: string, alunoNome: string) => {
    setMotivoConsulta('')
    setConsultaAluno({ id: alunoId, nome: alunoNome })
  }

  // Confirma o popup. O pedido SEMPRE vira pendência no painel do admin — é
  // esse o caminho garantido. O WhatsApp é um atalho a mais, e só existe se o
  // administrativo tiver cadastrado o número central em Configurações.
  const confirmarConsultaResponsaveis = async () => {
    if (!consultaAluno) return
    const motivo = motivoConsulta.trim()
    if (!motivo) {
      toast.error('Informe o motivo da consulta.')
      return
    }
    setEnviandoConsulta(true)
    try {
      await poloApi.solicitarContato(token, consultaAluno.id, consultaAluno.nome, motivo)
    } catch {
      // Sem registro no painel o pedido se perde, então o professor precisa saber.
      setEnviandoConsulta(false)
      toast.error('Não foi possível enviar o pedido. Tente de novo.')
      return
    }
    setEnviandoConsulta(false)
    if (dados.contatoAntares) {
      window.open(
        linkWhatsApp(dados.contatoAntares, mensagemConsultaResponsavel(consultaAluno.nome, motivo)),
        '_blank',
      )
    }
    toast.info(`Pedido de contato de ${consultaAluno.nome} enviado ao administrativo.`)
    setConsultaAluno(null)
  }

  const mudarProfessor = (i: number, valor: string) =>
    setProfessores((ps) => ps.map((p, j) => (j === i ? valor : p)))

  const professoresPreenchidos = professores.map((p) => p.trim()).filter(Boolean)

  const cancelarSalvarRelatorio = () => {
    if (relatorioTimer.current !== null) {
      window.clearTimeout(relatorioTimer.current)
      relatorioTimer.current = null
    }
  }

  // Grava o relatório se ele mudou desde a última gravação. Antes de a chamada
  // existir não há o que salvar: o texto vai junto na criação (1º toggle).
  const salvarRelatorio = async (texto: string) => {
    cancelarSalvarRelatorio()
    const limpo = texto.trim()
    if (!historicoId || limpo === relatorioGravado.current) return
    setSalvandoRelatorio(true)
    try {
      await poloApi.atualizarRelatorio(token, historicoId, limpo)
      relatorioGravado.current = limpo
      setRelatorioSalvo(true)
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao salvar o relatório.')
    } finally {
      setSalvandoRelatorio(false)
    }
  }

  const mudarRelatorio = (texto: string) => {
    setRelatorio(texto)
    setRelatorioSalvo(false)
    if (!historicoId) return
    cancelarSalvarRelatorio()
    relatorioTimer.current = window.setTimeout(() => salvarRelatorio(texto), 1000)
  }

  // O cleanup de desmontagem roda uma vez só e enxergaria valores velhos —
  // estas refs mantêm o que ele precisa atualizado.
  const relatorioAtual = useRef('')
  const historicoIdAtual = useRef<string | null>(null)
  useEffect(() => { relatorioAtual.current = relatorio }, [relatorio])
  useEffect(() => { historicoIdAtual.current = historicoId }, [historicoId])

  // Sair da tela com digitação ainda pendente não pode perder o texto: dispara
  // a gravação na saída, sem esperar a resposta.
  useEffect(() => () => {
    if (relatorioTimer.current === null) return
    window.clearTimeout(relatorioTimer.current)
    const texto = relatorioAtual.current.trim()
    const id = historicoIdAtual.current
    if (id && texto !== relatorioGravado.current) {
      poloApi.atualizarRelatorio(token, id, texto).catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const limparFormulario = () => {
    setHistoricoId(null)
    setDataAula(hoje)
    setProfessores(['', ''])
    setPresencas({})
    setRelatorio('')
    cancelarSalvarRelatorio()
    relatorioGravado.current = ''
    setRelatorioSalvo(false)
    setFotos([])
    setSugeridos([])
    setNovoExtra('')
    setErros({})
    setPresentesManha(new Set())
    setManhaAberta(false)
  }

  // Envia a sugestão de cadastro de um aluno na hora (antes ou depois de a
  // chamada existir). Não trava mais depois que a chamada é iniciada.
  const enviarSugestao = async () => {
    const nome = novoExtra.trim()
    if (!nome || enviandoSugestao) return
    setEnviandoSugestao(true)
    try {
      await poloApi.sugerirAluno(token, nome, historicoId ?? undefined)
      setSugeridos((xs) => [...xs, nome])
      setNovoExtra('')
      toast.success('Sugestão enviada ao administrativo.')
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao enviar a sugestão.')
    } finally {
      setEnviandoSugestao(false)
    }
  }

  // Trocar de turno zera a seleção: a mesma Aula N é outra chamada em cada
  // período, então nada do formulário anterior se aproveita.
  const escolherPeriodo = (p: Periodo) => {
    if (p === periodo) return
    setPeriodo(p)
    setNumeroAula(0)
    limparFormulario()
  }

  // Abre a aula no turno escolhido. Se já existir uma chamada em andamento
  // (pendente de fotos), busca os dados salvos e re-hidrata a tela — inclusive
  // depois de recarregar a página sem querer.
  const abrirChamada = async (n: number, p: Periodo) => {
    setPeriodo(p)
    setNumeroAula(n)
    setErros({})
    setFotos([])
    setNovoExtra('')
    setManhaAberta(false)

    // Na tarde, quem já veio de manhã vai para o bloco recolhido. Falha aqui
    // não impede a chamada — só deixa a lista sem a separação.
    if (p === 'tarde') {
      poloApi.presencasManha(token, n)
        .then((r) => setPresentesManha(new Set(r.alunoIds)))
        .catch(() => setPresentesManha(new Set()))
    } else {
      setPresentesManha(new Set())
    }

    const existente = dados.chamadas.find((c) => c.numeroAula === n && c.periodo === p)

    if (!existente) {
      setHistoricoId(null)
      setDataAula(hoje)
      setProfessores(['', ''])
      setPresencas({})
      setRelatorio('')
      relatorioGravado.current = ''
      setRelatorioSalvo(false)
      setSugeridos([])
      return
    }

    setHistoricoId(existente.historicoId)
    setCarregandoResumo(true)
    try {
      const c = await poloApi.obterChamada(token, existente.historicoId)
      setDataAula(c.dataAula)
      setProfessores(c.professoresNomes.length ? c.professoresNomes : ['', ''])
      setRelatorio(c.relatorio ?? '')
      relatorioGravado.current = (c.relatorio ?? '').trim()
      setRelatorioSalvo(false)
      setSugeridos([])
      const marcados: Record<string, boolean> = {}
      for (const pr of c.presencas) if (pr.presente) marcados[pr.alunoId] = true
      setPresencas(marcados)
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao carregar a chamada.')
      setNumeroAula(0)
      limparFormulario()
    } finally {
      setCarregandoResumo(false)
    }
  }

  const escolherAula = (n: number) => {
    if (!periodo) return
    if (n === 0) {
      setNumeroAula(0)
      limparFormulario()
      return
    }
    abrirChamada(n, periodo)
  }

  // Reabre sozinho a aula em andamento (pendente de fotos) ao carregar/recarregar
  // a página — sem isso, a presença já salva no servidor só reaparecia depois
  // que o professor selecionasse a aula de novo no dropdown. Só age quando há
  // exatamente uma pendência nos dois turnos somados (senão não dá pra adivinhar).
  useEffect(() => {
    if (numeroAula !== 0) return
    const emAberto = dados.chamadas.filter((c) => !c.temFotos)
    if (emAberto.length === 1) abrirChamada(emAberto[0].numeroAula, emAberto[0].periodo)
  }, [dados.chamadas]) // eslint-disable-line react-hooks/exhaustive-deps

  const adicionarFotos = (lista: FileList | null) => {
    if (!lista) return
    const novas: File[] = []
    for (const f of Array.from(lista)) {
      if (!f.type.startsWith('image/')) {
        toast.error(`"${f.name}" não é uma imagem e foi ignorada.`)
        continue
      }
      if (f.size > MAX_FOTO_BYTES) {
        toast.error(`"${f.name}" passa de 5 MB e foi ignorada.`)
        continue
      }
      novas.push(f)
    }
    setFotos((atual) => {
      const total = [...atual, ...novas]
      if (total.length > MAX_FOTOS) {
        toast.error(`Máximo de ${MAX_FOTOS} fotos por chamada.`)
        return total.slice(0, MAX_FOTOS)
      }
      return total
    })
    if (fileInput.current) fileInput.current.value = ''
  }

  // Confirmar/desmarcar presença salva na hora — não existe mais botão de
  // "salvar chamada". No primeiro toggle de uma aula nova, a chamada é criada
  // no servidor; nos seguintes, só aquela presença é atualizada.
  const alternarPresenca = async (alunoId: string) => {
    if (!periodo) return
    const novoValor = !presencas[alunoId]
    const presencasAntes = presencas
    const presencasDepois = { ...presencas }
    if (novoValor) presencasDepois[alunoId] = true
    else delete presencasDepois[alunoId]
    setPresencas(presencasDepois)

    if (!historicoId) {
      if (professoresPreenchidos.length === 0) {
        setPresencas(presencasAntes)
        setErros({ professor: 'Informe o professor antes de marcar presença.' })
        toast.error('Informe o professor antes de marcar presença.')
        return
      }
      setErros({})
      setCriandoChamada(true)
      try {
        const lista = dados.alunos.map((a) => ({
          alunoId: a.id,
          presente: presencasDepois[a.id] ?? false,
        }))
        const r = await poloApi.salvarChamada(token, {
          numeroAula,
          periodo,
          professoresNomes: professoresPreenchidos,
          dataAula,
          relatorio: relatorio.trim() || undefined,
          presencas: lista,
        }, [])
        setHistoricoId(r.historicoId)
        // O relatório foi junto na criação — marca como gravado para o
        // auto-save não repetir o mesmo texto na primeira digitação.
        relatorioGravado.current = relatorio.trim()
        recarregar() // atualiza a lista de chamadas (a aula vira "pendente de fotos")
        toast.success('Chamada iniciada — a presença é salva automaticamente.')
      } catch (e: any) {
        setPresencas(presencasAntes)
        toast.error(e.message ?? 'Erro ao salvar a chamada.')
      } finally {
        setCriandoChamada(false)
      }
      return
    }

    setPendentes((p) => new Set(p).add(alunoId))
    try {
      await poloApi.atualizarPresenca(token, historicoId, alunoId, novoValor)
    } catch (e: any) {
      setPresencas(presencasAntes)
      toast.error(e.message ?? 'Erro ao salvar a presença.')
    } finally {
      setPendentes((p) => { const n = new Set(p); n.delete(alunoId); return n })
    }
  }

  // Envia as fotos e conclui a aula.
  const enviarFotos = async () => {
    if (!historicoId || fotos.length === 0) return
    setEnviandoFotos(true)
    try {
      const r = await poloApi.adicionarFotos(token, historicoId, fotos)
      const enviadas = fotos.length - (r.fotosErro?.length ?? 0)
      recarregar()
      if (enviadas === 0) {
        toast.error('Nenhuma foto foi enviada. Tente novamente.')
        return
      }
      if (r.cicloConcluido) {
        toast.success('🎉 Ciclo concluído! As aulas 1-18 estão liberadas de novo nos dois turnos.')
      } else {
        toast.success('Aula concluída! Fotos enviadas.')
      }
      setNumeroAula(0)
      limparFormulario()
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao enviar as fotos.')
    } finally {
      setEnviandoFotos(false)
    }
  }

  const presentesCount = dados.alunos.filter((a) => presencas[a.id]).length
  const camposTravados = chamadaIniciada // data/professor/relatório/extras não mudam mais

  // Quantas aulas já foram concluídas (com foto) em cada turno do ciclo atual.
  const concluidasNoTurno = (p: Periodo) =>
    dados.chamadas.filter((c) => c.periodo === p && c.temFotos).length

  // Na tarde, separa quem já veio de manhã do resto da turma.
  const separarManha = periodo === 'tarde' && presentesManha.size > 0
  const alunosDaManha = separarManha
    ? dados.alunos.filter((a) => presentesManha.has(a.id))
    : []
  const alunosPrincipais = separarManha
    ? dados.alunos.filter((a) => !presentesManha.has(a.id))
    : dados.alunos

  // Durante a busca a divisão manhã/tarde some: o professor quer achar UM nome,
  // não navegar por blocos. A comparação ignora acento e maiúsculas.
  const buscaAtiva = busca.trim().length > 0
  const termoBusca = normalizarBusca(busca)
  const alunosEncontrados = buscaAtiva
    ? dados.alunos.filter((a) => normalizarBusca(a.nome).includes(termoBusca))
    : []
  // Quem já está marcado — vira resumo enquanto a lista fica recolhida.
  const presentesLista = dados.alunos.filter((a) => presencas[a.id])

  const linhaAluno = (a: AlunoChamada, vindoDaManha = false) => {
    const marcado = presencas[a.id]
    const travado = criandoChamada || pendentes.has(a.id)
    return (
      <li key={a.id} className="flex flex-col gap-2.5 border-b border-[var(--c-border)] p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {a.nome}
              {vindoDaManha && (
                <span className="badge badge--amber ml-2 align-middle !text-xs">🌅 veio de manhã</span>
              )}
            </p>
            {a.observacoes && (
              <p className="mt-0.5 text-xs text-[var(--c-amber-fg)]">⚠️ {a.observacoes}</p>
            )}
          </div>
          {/* Sempre disponível: o pedido vira pendência no painel do admin,
              haja ou não WhatsApp central cadastrado. */}
          <button
            onClick={() => abrirConsultaResponsaveis(a.id, a.nome)}
            aria-label={`Consultar responsável de ${a.nome}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--c-border)] px-3 py-1 text-xs font-semibold text-[var(--c-primary)] transition-colors hover:bg-[var(--c-primary-soft)]"
          >
            💬 Consultar responsável
          </button>
        </div>
        <button
          className={`btn w-full !py-2.5 ${marcado
            ? '!bg-[var(--c-green-fg)] !text-white'
            : 'btn-ghost'}`}
          onClick={() => alternarPresenca(a.id)}
          disabled={travado}
          aria-pressed={marcado === true}
        >
          {travado ? 'Salvando…' : marcado ? '✓ Presente' : 'Confirmar presença'}
        </button>
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Passo 0: escolher turno e aula (o resto do formulário só aparece depois) */}
      <div className="card flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold">
            Turno <span className="text-red-600">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PERIODOS.map((p) => (
              <button
                key={p.valor}
                className={`btn !py-3 !text-base ${periodo === p.valor ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => escolherPeriodo(p.valor)}
                aria-pressed={periodo === p.valor}
              >
                {p.icone} {p.rotulo}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--c-text-soft)]">
            Cada aula é dada duas vezes no dia — uma chamada para cada turma.
          </p>
        </div>

        <Field label="Aula" required>
          <select value={numeroAula} className="!py-3 !text-lg" disabled={!periodo}
                  onChange={(e) => escolherAula(Number(e.target.value))}>
            <option value={0}>{periodo ? 'Selecione…' : 'Escolha o turno primeiro'}</option>
            {Array.from({ length: AULAS_POR_CICLO }, (_, i) => i + 1).map((n) => {
              const c = dados.chamadas.find((ch) => ch.numeroAula === n && ch.periodo === periodo)
              const concluida = c?.temFotos ?? false
              const pendente = !!c && !c.temFotos
              return (
                <option key={n} value={n} disabled={concluida}>
                  Aula {n}
                  {concluida ? ' (concluída)' : pendente ? ' (pendente de fotos)' : ''}
                </option>
              )
            })}
          </select>
        </Field>

        <p className="text-xs text-[var(--c-text-soft)]">
          Ciclo atual: {dados.polo.ciclo} · 🌅 Manhã {concluidasNoTurno('manha')}/{AULAS_POR_CICLO}
          {' · '}🌇 Tarde {concluidasNoTurno('tarde')}/{AULAS_POR_CICLO} concluídas
        </p>
      </div>

      {numeroAula === 0 || !periodo ? (
        <div className="card">
          <EmptyState
            icon="📋"
            title={periodo ? 'Selecione a aula' : 'Selecione o turno'}
            message={periodo
              ? `Escolha a aula do turno da ${rotuloTurno.toLowerCase()} para começar a marcar presença.`
              : 'Escolha se esta chamada é da turma da manhã ou da tarde.'}
          />
        </div>
      ) : carregandoResumo ? (
        <div className="card flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton" />)}
        </div>
      ) : (
        <>
          {chamadaIniciada && (
            <p className="rounded-lg bg-[var(--c-blue-bg)] p-3 text-xs text-[var(--c-blue-fg)]">
              ✓ Aula {numeroAula} · {rotuloTurno} iniciada — cada presença confirmada é salva
              na hora. Pode fechar o link e voltar depois: nada se perde. Data e professor
              já foram gravados e não mudam mais; o relatório você ajusta até enviar as fotos.
            </p>
          )}

          <div className="card flex flex-col gap-4">
            <Field label="Data da aula" required>
              <input type="date" value={dataAula} disabled={camposTravados}
                     className="!py-3 !text-base"
                     onChange={(e) => setDataAula(e.target.value)} />
            </Field>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold">
                Professores <span className="text-red-600">*</span>
              </label>
              {professores.map((nome, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={nome}
                    disabled={camposTravados}
                    aria-invalid={i === 0 && !!erros.professor}
                    className="min-w-0 flex-1 rounded-lg border border-[var(--c-border)] px-3 py-3 text-lg"
                    style={i === 0 && erros.professor ? { borderColor: 'var(--c-danger)' } : undefined}
                    placeholder={i === 0 ? 'Professor principal (obrigatório)' : 'Professor (opcional)'}
                    onChange={(e) => mudarProfessor(i, e.target.value)}
                  />
                  {professores.length > 1 && !camposTravados && (
                    <button
                      className="btn btn-ghost !px-3 !py-2 text-[var(--c-danger)]"
                      onClick={() => setProfessores((ps) => ps.filter((_, j) => j !== i))}
                      aria-label={`Remover professor ${i + 1}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {erros.professor && <p className="field-error">{erros.professor}</p>}
              {!camposTravados && (
                <button
                  className="btn btn-ghost self-start !py-2 text-sm"
                  onClick={() => setProfessores((ps) => [...ps, ''])}
                >
                  + Adicionar professor
                </button>
              )}
            </div>
          </div>

          {/* Lista de alunos. Na tarde, quem já veio de manhã fica num bloco
              recolhido no fim — ainda marcável, para quem vem nos dois turnos. */}
          <div className="card !p-0">
            <div className="flex items-center justify-between p-4 pb-3">
              <h2 className="font-bold">Alunos ({dados.alunos.length})</h2>
              <span className="text-sm text-[var(--c-text-soft)]">
                {presentesCount} presente{presentesCount === 1 ? '' : 's'}
              </span>
            </div>
            {dados.alunos.length === 0 ? (
              <EmptyState
                icon="🎓" title="Nenhum aluno neste polo"
                message="Peça ao administrativo para cadastrar os alunos deste polo."
              />
            ) : (
              <>
                <div className="px-4 pb-4">
                  <div className="relative">
                    <span aria-hidden="true"
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text-soft)]">
                      🔍
                    </span>
                    <input
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Buscar aluno pelo nome…"
                      aria-label="Buscar aluno pelo nome"
                      className="w-full rounded-lg border border-[var(--c-border)] py-2.5 pl-9 pr-10 text-base"
                    />
                    {buscaAtiva && (
                      <button
                        onClick={() => setBusca('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--c-text-soft)] transition-colors hover:bg-[var(--c-primary-soft)]"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Buscando: uma lista só, com todos os que casam. */}
                {buscaAtiva ? (
                  alunosEncontrados.length === 0 ? (
                    <p className="border-t border-[var(--c-border)] p-4 text-sm text-[var(--c-text-soft)]">
                      Nenhum aluno encontrado com “{busca.trim()}”. Se ele não estiver na lista
                      do polo, use “Aluno não está na lista?” logo abaixo para sugerir o cadastro.
                    </p>
                  ) : (
                    <ul className="border-t border-[var(--c-border)]">
                      {alunosEncontrados.map((a) =>
                        linhaAluno(a, separarManha && presentesManha.has(a.id)),
                      )}
                    </ul>
                  )
                ) : !listaAberta ? (
                  /* Recolhida: só o resumo de quem já foi marcado. */
                  <div className="flex flex-col gap-3 border-t border-[var(--c-border)] p-4">
                    {presentesLista.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-[var(--c-text-soft)]">
                          Presença confirmada
                        </span>
                        <ul className="flex flex-wrap gap-1.5">
                          {presentesLista.slice(0, 8).map((a) => (
                            <li key={a.id} className="badge badge--green !text-xs">✓ {a.nome}</li>
                          ))}
                          {presentesLista.length > 8 && (
                            <li className="badge !text-xs">
                              +{presentesLista.length - 8} outro
                              {presentesLista.length - 8 === 1 ? '' : 's'}
                            </li>
                          )}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--c-text-soft)]">
                        Ninguém marcado ainda. Busque pelo nome acima ou abra a lista completa.
                      </p>
                    )}
                    <button className="btn btn-ghost w-full !py-2.5"
                            onClick={() => setListaAberta(true)}>
                      Ver todos os {dados.alunos.length} alunos ▼
                    </button>
                  </div>
                ) : (
                  <>
                    {alunosPrincipais.length === 0 ? (
                      <p className="border-t border-[var(--c-border)] p-4 text-sm text-[var(--c-text-soft)]">
                        Todos os alunos do polo já vieram no turno da manhã — abra o bloco abaixo
                        se algum deles voltou à tarde.
                      </p>
                    ) : (
                      <ul className="border-t border-[var(--c-border)]">
                        {alunosPrincipais.map((a) => linhaAluno(a))}
                      </ul>
                    )}

                    {separarManha && (
                      <div className="border-t border-[var(--c-border)]">
                        <button
                          className="flex w-full items-center justify-between gap-2 p-4 text-left"
                          onClick={() => setManhaAberta((v) => !v)}
                          aria-expanded={manhaAberta}
                        >
                          <span className="min-w-0">
                            <span className="font-bold">
                              🌅 Já vieram na aula da manhã ({alunosDaManha.length})
                            </span>
                            <span className="mt-0.5 block text-xs text-[var(--c-text-soft)]">
                              Toque para abrir e marcar presença se algum deles voltou à tarde.
                            </span>
                          </span>
                          <span aria-hidden="true" className="shrink-0 text-lg">
                            {manhaAberta ? '▲' : '▼'}
                          </span>
                        </button>
                        {manhaAberta && (
                          <ul className="border-t border-[var(--c-border)]">
                            {alunosDaManha.map((a) => linhaAluno(a, true))}
                          </ul>
                        )}
                      </div>
                    )}

                    <div className="border-t border-[var(--c-border)] p-4">
                      <button className="btn btn-ghost w-full !py-2.5"
                              onClick={() => setListaAberta(false)}>
                        Recolher lista ▲
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Alunos que não estão na lista (sugestão de cadastro) — disponível
              a qualquer momento, inclusive depois de a chamada ser iniciada. */}
          <div className="card flex flex-col gap-3">
            <h2 className="font-bold">Aluno não está na lista?</h2>
            <p className="text-xs text-[var(--c-text-soft)]">
              Escreva o nome e sugira. Isso <strong>não cria o cadastro</strong> —
              vai como sugestão para o administrativo aprovar. Pode sugerir a qualquer momento.
            </p>
            <div className="flex gap-2">
              <input
                value={novoExtra}
                placeholder="Nome do aluno"
                disabled={enviandoSugestao}
                className="min-w-0 flex-1 rounded-lg border border-[var(--c-border)] px-3 py-2"
                onChange={(e) => setNovoExtra(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); enviarSugestao() }
                }}
              />
              <button
                className="btn btn-ghost"
                disabled={!novoExtra.trim() || enviandoSugestao}
                onClick={enviarSugestao}
              >
                {enviandoSugestao ? 'Enviando…' : '+ Sugerir'}
              </button>
            </div>
            {sugeridos.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {sugeridos.map((nome, i) => (
                  <li key={i} className="badge badge--green !text-sm">
                    <span aria-hidden="true">✓</span> {nome} · enviado
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Relatório/observações da aula. Ao contrário de data e professores,
              continua editável enquanto a aula não é concluída — o professor
              escreve durante a aula. Salva sozinho ao parar de digitar. */}
          <div className="card flex flex-col gap-2">
            <Field label="Relatório da aula">
              <textarea rows={4} value={relatorio}
                        placeholder="Como foi a aula? O que foi trabalhado? Observações sobre os alunos…"
                        onChange={(e) => mudarRelatorio(e.target.value)}
                        onBlur={(e) => salvarRelatorio(e.target.value)} />
            </Field>
            <p className="text-xs text-[var(--c-text-soft)]">
              {!chamadaIniciada
                ? 'Pode escrever agora ou a qualquer momento durante a aula.'
                : salvandoRelatorio
                  ? 'Salvando…'
                  : relatorioSalvo
                    ? '✓ Salvo automaticamente.'
                    : 'Escreva a qualquer momento até enviar as fotos — salva sozinho.'}
            </p>
          </div>

          {/* Fotos — só existe depois que a chamada foi criada (1º toggle) */}
          {chamadaIniciada && (
            <div className="card flex flex-col gap-3">
              <h2 className="font-bold">📷 Fotos da Aula {numeroAula} · {rotuloTurno}</h2>
              <p className="text-xs text-[var(--c-text-soft)]">
                A aula é <strong>concluída</strong> quando você envia as fotos.
              </p>
              <input
                ref={fileInput}
                type="file" accept="image/*" multiple capture="environment"
                className="hidden" id="fotos-input"
                onChange={(e) => adicionarFotos(e.target.files)}
              />
              <label htmlFor="fotos-input" className="btn btn-ghost btn-lg cursor-pointer">
                📷 Adicionar fotos
              </label>
              <p className="text-xs text-[var(--c-text-soft)]">
                Apenas imagens, até 5 MB cada, máximo de {MAX_FOTOS} fotos.
              </p>
              {fotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {fotos.map((f, i) => (
                    <div key={i} className="relative">
                      <img src={URL.createObjectURL(f)} alt={f.name}
                           className="h-20 w-full rounded-lg object-cover" />
                      <button
                        className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--c-danger)] text-xs text-white"
                        onClick={() => setFotos((fs) => fs.filter((_, j) => j !== i))}
                        aria-label={`Remover ${f.name}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button className="btn btn-primary btn-lg w-full !py-4 !text-lg"
                      onClick={enviarFotos} disabled={enviandoFotos || fotos.length === 0}>
                {enviandoFotos
                  ? 'Enviando…'
                  : fotos.length === 0
                    ? '📷 Adicione uma foto para concluir'
                    : `Enviar ${fotos.length} foto${fotos.length === 1 ? '' : 's'} e concluir aula`}
              </button>
            </div>
          )}
        </>
      )}

      <Modal
        open={consultaAluno !== null}
        title="Consultar responsável"
        onClose={() => setConsultaAluno(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConsultaAluno(null)} disabled={enviandoConsulta}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={confirmarConsultaResponsaveis} disabled={enviandoConsulta}>
              {enviandoConsulta
                ? 'Enviando…'
                : dados.contatoAntares ? '💬 Enviar e abrir WhatsApp' : 'Enviar pedido'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--c-text-soft)]">
            O pedido do contato do responsável por <strong>{consultaAluno?.nome}</strong> fica
            registrado no painel do administrativo, com o motivo que você escrever abaixo.
            {dados.contatoAntares
              ? ' O WhatsApp do administrativo também abre com a mensagem pronta.'
              : ''}
          </p>
          <Field label="Motivo da consulta" required>
            <textarea
              rows={3} value={motivoConsulta} autoFocus
              placeholder="Ex.: aluno faltou 3 aulas seguidas, preciso avisar sobre o material da próxima aula…"
              onChange={(e) => setMotivoConsulta(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
