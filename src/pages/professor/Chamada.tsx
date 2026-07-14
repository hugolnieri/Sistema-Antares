import { useEffect, useRef, useState } from 'react'
import { poloApi } from '../../lib/poloApi'
import { linkWhatsApp } from '../../lib/format'
import { Field, EmptyState, Modal } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { usePolo } from './PoloLayout'

const MAX_FOTO_BYTES = 5 * 1024 * 1024
const MAX_FOTOS = 10

export default function Chamada() {
  const { token, dados, recarregar } = usePolo()
  const toast = useToast()

  const hoje = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD no fuso local
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
  const [fotos, setFotos] = useState<File[]>([])
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

  // Confirma o popup: abre o WhatsApp com o motivo na mensagem e registra o
  // pedido no admin (o motivo some junto no painel).
  const confirmarConsultaResponsaveis = () => {
    if (!consultaAluno) return
    const motivo = motivoConsulta.trim()
    if (!motivo) {
      toast.error('Informe o motivo da consulta.')
      return
    }
    if (dados.contatoAntares) {
      window.open(linkWhatsApp(dados.contatoAntares, mensagemConsultaResponsavel(consultaAluno.nome, motivo)), '_blank')
    }
    setEnviandoConsulta(true)
    poloApi.solicitarContato(token, consultaAluno.id, consultaAluno.nome, motivo)
      .catch(() => {})
      .finally(() => setEnviandoConsulta(false))
    toast.info('O administrativo foi avisado do seu pedido de contato.')
    setConsultaAluno(null)
  }

  const mudarProfessor = (i: number, valor: string) =>
    setProfessores((ps) => ps.map((p, j) => (j === i ? valor : p)))

  const professoresPreenchidos = professores.map((p) => p.trim()).filter(Boolean)

  const limparFormulario = () => {
    setHistoricoId(null)
    setDataAula(hoje)
    setProfessores(['', ''])
    setPresencas({})
    setRelatorio('')
    setFotos([])
    setSugeridos([])
    setNovoExtra('')
    setErros({})
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

  // Escolher a aula reseta o formulário. Se a aula já tiver uma chamada em
  // andamento (pendente de fotos), busca os dados salvos e re-hidrata a tela
  // — inclusive depois de recarregar a página sem querer.
  const selecionarAula = async (n: number) => {
    setNumeroAula(n)
    setErros({})
    setFotos([])
    setNovoExtra('')
    const existente = dados.chamadas.find((c) => c.numeroAula === n)

    if (!existente) {
      setHistoricoId(null)
      setDataAula(hoje)
      setProfessores(['', ''])
      setPresencas({})
      setRelatorio('')
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
      setSugeridos([])
      const marcados: Record<string, boolean> = {}
      for (const p of c.presencas) if (p.presente) marcados[p.alunoId] = true
      setPresencas(marcados)
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao carregar a chamada.')
      setNumeroAula(0)
      limparFormulario()
    } finally {
      setCarregandoResumo(false)
    }
  }

  // Reabre sozinho a aula em andamento (pendente de fotos) ao carregar/recarregar
  // a página — sem isso, a presença já salva no servidor só reaparecia depois
  // que o professor selecionasse a aula de novo no dropdown.
  useEffect(() => {
    if (numeroAula !== 0) return
    const pendentes = dados.chamadas.filter((c) => !c.temFotos)
    if (pendentes.length === 1) selecionarAula(pendentes[0].numeroAula)
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
          professoresNomes: professoresPreenchidos,
          dataAula,
          relatorio: relatorio.trim() || undefined,
          presencas: lista,
        }, [])
        setHistoricoId(r.historicoId)
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
        toast.success('🎉 Ciclo concluído! As aulas 1-18 estão liberadas de novo.')
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

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Passo 0: escolher a aula (o resto do formulário só aparece depois) */}
      <div className="card flex flex-col gap-2">
        <Field label="Aula" required>
          <select value={numeroAula} className="!py-3 !text-lg"
                  onChange={(e) => selecionarAula(Number(e.target.value))}>
            <option value={0}>Selecione…</option>
            {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => {
              const c = dados.chamadas.find((ch) => ch.numeroAula === n)
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
          Ciclo atual: {dados.polo.ciclo}
        </p>
      </div>

      {numeroAula === 0 ? (
        <div className="card">
          <EmptyState
            icon="📋" title="Selecione a aula"
            message="Escolha a aula acima para começar a marcar presença."
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
              ✓ Aula iniciada — cada presença confirmada é salva na hora. Pode
              fechar o link e voltar depois: nada se perde. Data, professor e
              relatório já foram gravados e não podem mais ser alterados.
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

          {/* Lista de alunos */}
          <div className="card !p-0">
            <div className="flex items-center justify-between p-4">
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
              <ul className="border-t border-[var(--c-border)]">
                {dados.alunos.map((a) => {
                  const marcado = presencas[a.id]
                  const travado = criandoChamada || pendentes.has(a.id)
                  return (
                    <li key={a.id}
                        className="flex flex-col gap-2.5 border-b border-[var(--c-border)] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{a.nome}</p>
                          {a.observacoes && (
                            <p className="mt-0.5 text-xs text-[var(--c-amber-fg)]">⚠️ {a.observacoes}</p>
                          )}
                        </div>
                        {dados.contatoAntares && (
                          <button
                            onClick={() => abrirConsultaResponsaveis(a.id, a.nome)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--c-border)] px-3 py-1 text-xs font-semibold text-[var(--c-primary)] transition-colors hover:bg-[var(--c-primary-soft)]"
                          >
                            💬 Consultar responsáveis
                          </button>
                        )}
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
                })}
              </ul>
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

          {/* Relatório da aula */}
          <div className="card flex flex-col gap-4">
            <Field label="Relatório da aula">
              <textarea rows={4} value={relatorio} disabled={camposTravados}
                        placeholder="Como foi a aula? O que foi trabalhado?"
                        onChange={(e) => setRelatorio(e.target.value)} />
            </Field>
          </div>

          {/* Fotos — só existe depois que a chamada foi criada (1º toggle) */}
          {chamadaIniciada && (
            <div className="card flex flex-col gap-3">
              <h2 className="font-bold">📷 Fotos da Aula {numeroAula}</h2>
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
        title="Consultar responsáveis"
        onClose={() => setConsultaAluno(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConsultaAluno(null)} disabled={enviandoConsulta}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={confirmarConsultaResponsaveis} disabled={enviandoConsulta}>
              {enviandoConsulta ? 'Enviando…' : '💬 Abrir WhatsApp'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--c-text-soft)]">
            Isso abre o WhatsApp do administrativo pedindo o contato do responsável por{' '}
            <strong>{consultaAluno?.nome}</strong>. O motivo abaixo vai junto na mensagem e no painel.
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
