import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { poloApi } from '../../lib/poloApi'
import { linkWhatsApp } from '../../lib/format'
import { Field, Modal, EmptyState } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { usePolo } from './PoloLayout'
import type { AlunoChamada } from '../../lib/types'

const MAX_FOTO_BYTES = 5 * 1024 * 1024
const MAX_FOTOS = 10

export default function Chamada() {
  const { slug, token, dados } = usePolo()
  const navigate = useNavigate()
  const toast = useToast()

  const [numeroAula, setNumeroAula] = useState(0)
  const [professorNome, setProfessorNome] = useState('')
  const [presencas, setPresencas] = useState<Record<string, boolean>>({})
  const [observacoes, setObservacoes] = useState('')
  const [relatorio, setRelatorio] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  const [alunosExtras, setAlunosExtras] = useState<string[]>([])
  const [novoExtra, setNovoExtra] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [alunoDetalhe, setAlunoDetalhe] = useState<AlunoChamada | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const marcar = (alunoId: string, presente: boolean) =>
    setPresencas((p) => ({ ...p, [alunoId]: presente }))

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

  const salvar = async () => {
    const novosErros: Record<string, string> = {}
    if (!numeroAula) novosErros.aula = 'Selecione a aula.'
    if (!professorNome.trim()) novosErros.professor = 'Informe seu nome.'
    const marcados = Object.keys(presencas)
    if (marcados.length === 0) novosErros.presencas = 'Marque a presença de pelo menos um aluno.'
    setErros(novosErros)
    if (Object.keys(novosErros).length) {
      toast.error('Confira os campos destacados antes de salvar.')
      return
    }

    setSalvando(true)
    try {
      // Aluno sem marcação explícita entra como ausente
      const lista = dados.alunos.map((a) => ({
        alunoId: a.id,
        presente: presencas[a.id] ?? false,
      }))
      const resultado = await poloApi.salvarChamada(token, {
        numeroAula,
        professorNome: professorNome.trim(),
        observacoes: observacoes.trim() || undefined,
        relatorio: relatorio.trim() || undefined,
        presencas: lista,
        alunosExtras: alunosExtras.length ? alunosExtras : undefined,
      }, fotos)
      if (resultado.fotosErro?.length) {
        toast.error(`Chamada salva, mas ${resultado.fotosErro.length} foto(s) falharam no envio.`)
      }
      navigate(`/professor/polo/${slug}/confirmacao`, {
        state: {
          historicoId: resultado.historicoId,
          numeroAula,
          presentes: lista.filter((p) => p.presente).length,
          total: lista.length,
          fotos: fotos.length - (resultado.fotosErro?.length ?? 0),
          sugestoes: alunosExtras.length,
        },
      })
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao salvar a chamada.')
    } finally {
      setSalvando(false)
    }
  }

  const presentesCount = dados.alunos.filter((a) => presencas[a.id]).length
  const marcadosCount = Object.keys(presencas).length

  return (
    <div className="flex flex-col gap-4 pb-28">
      {/* Aula e professor */}
      <div className="card flex flex-col gap-4">
        <Field label="Qual aula é hoje?" required error={erros.aula}>
          <select value={numeroAula} aria-invalid={!!erros.aula}
                  className="!py-3 !text-lg"
                  onChange={(e) => setNumeroAula(Number(e.target.value))}>
            <option value={0}>Selecione a aula…</option>
            {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>Aula {n}</option>
            ))}
          </select>
        </Field>
        <Field label="Seu nome (professor)" required error={erros.professor}>
          <input value={professorNome} aria-invalid={!!erros.professor}
                 className="!py-3 !text-lg" placeholder="Ex.: Maria Souza"
                 onChange={(e) => setProfessorNome(e.target.value)} />
        </Field>
      </div>

      {/* Lista de alunos */}
      <div className="card !p-0">
        <div className="flex items-center justify-between p-4">
          <h2 className="font-bold">Alunos ({dados.alunos.length})</h2>
          <span className="text-sm text-[var(--c-text-soft)]">
            {presentesCount} presente{presentesCount === 1 ? '' : 's'}
          </span>
        </div>
        {erros.presencas && (
          <p className="field-error px-4 pb-2">{erros.presencas}</p>
        )}
        {dados.alunos.length === 0 ? (
          <EmptyState
            icon="🎓" title="Nenhum aluno neste polo"
            message="Peça ao administrativo para cadastrar os alunos deste polo."
          />
        ) : (
          <ul className="border-t border-[var(--c-border)]">
            {dados.alunos.map((a) => {
              const marcado = presencas[a.id]
              return (
                <li key={a.id}
                    className="flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{a.nome}</p>
                    {a.responsaveis.length > 0 && (
                      <button
                        className="text-xs font-semibold text-[var(--c-primary)] underline"
                        onClick={() => setAlunoDetalhe(a)}
                      >
                        👪 Ver responsável
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className={`btn !px-4 !py-2 ${marcado === true
                        ? '!bg-[var(--c-green-fg)] !text-white'
                        : 'btn-ghost'}`}
                      onClick={() => marcar(a.id, true)}
                      aria-pressed={marcado === true}
                    >
                      ✓ Presente
                    </button>
                    <button
                      className={`btn !px-4 !py-2 ${marcado === false
                        ? 'btn-danger'
                        : 'btn-ghost'}`}
                      onClick={() => marcar(a.id, false)}
                      aria-pressed={marcado === false}
                    >
                      ✕ Ausente
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Alunos que não estão na lista (sugestão de cadastro) */}
      <div className="card flex flex-col gap-3">
        <h2 className="font-bold">Aluno não está na lista?</h2>
        <p className="text-xs text-[var(--c-text-soft)]">
          Escreva o nome e adicione. Isso <strong>não cria o cadastro</strong> —
          vai como sugestão para o administrativo aprovar.
        </p>
        <div className="flex gap-2">
          <input
            value={novoExtra}
            placeholder="Nome do aluno"
            className="min-w-0 flex-1 rounded-lg border border-[var(--c-border)] px-3 py-2"
            onChange={(e) => setNovoExtra(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && novoExtra.trim()) {
                setAlunosExtras((xs) => [...xs, novoExtra.trim()])
                setNovoExtra('')
              }
            }}
          />
          <button
            className="btn btn-ghost"
            disabled={!novoExtra.trim()}
            onClick={() => {
              setAlunosExtras((xs) => [...xs, novoExtra.trim()])
              setNovoExtra('')
            }}
          >
            + Adicionar
          </button>
        </div>
        {alunosExtras.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {alunosExtras.map((nome, i) => (
              <li key={i} className="badge badge--amber !text-sm">
                <span aria-hidden="true">◐</span> {nome}
                <button
                  className="ml-1 font-bold"
                  onClick={() => setAlunosExtras((xs) => xs.filter((_, j) => j !== i))}
                  aria-label={`Remover ${nome}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Observações e relatório */}
      <div className="card flex flex-col gap-4">
        <Field label="Observações">
          <textarea rows={3} value={observacoes} placeholder="Alguma observação sobre a aula?"
                    onChange={(e) => setObservacoes(e.target.value)} />
        </Field>
        <Field label="Relatório da aula">
          <textarea rows={4} value={relatorio}
                    placeholder="Como foi a aula? O que foi trabalhado?"
                    onChange={(e) => setRelatorio(e.target.value)} />
        </Field>
      </div>

      {/* Fotos */}
      <div className="card flex flex-col gap-3">
        <h2 className="font-bold">Fotos da aula <span className="text-xs font-normal text-[var(--c-text-soft)]">(opcional)</span></h2>
        <p className="rounded-lg bg-[var(--c-blue-bg)] p-3 text-xs text-[var(--c-blue-fg)]">
          A foto fica para o final da aula? Sem problema: <strong>salve a chamada
          agora</strong> e anexe as fotos depois, na tela de confirmação.
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
      </div>

      {/* Barra fixa de salvar */}
      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-2xl -translate-x-1/2 border-t border-[var(--c-border)] bg-white p-4">
        <button className="btn btn-primary btn-lg w-full" onClick={salvar} disabled={salvando}>
          {salvando
            ? 'Salvando chamada…'
            : `Salvar chamada${marcadosCount ? ` (${presentesCount}/${dados.alunos.length} presentes)` : ''}`}
        </button>
      </div>

      {/* Modal de responsáveis (somente leitura) */}
      <Modal
        open={!!alunoDetalhe}
        title={`Responsáveis — ${alunoDetalhe?.nome ?? ''}`}
        onClose={() => setAlunoDetalhe(null)}
      >
        <div className="flex flex-col gap-4">
          {alunoDetalhe?.observacoes && (
            <p className="rounded-lg bg-[var(--c-amber-bg)] p-3 text-sm text-[var(--c-amber-fg)]">
              <strong>Observações do aluno:</strong> {alunoDetalhe.observacoes}
            </p>
          )}
          {(alunoDetalhe?.responsaveis ?? []).map((r, i) => (
            <div key={i} className="rounded-lg border border-[var(--c-border)] p-3">
              <p className="font-bold">{r.nome}</p>
              {r.parentesco && (
                <p className="text-sm text-[var(--c-text-soft)]">{r.parentesco}</p>
              )}
              {r.telefone ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{r.telefone}</span>
                  <a href={linkWhatsApp(r.telefone)} target="_blank" rel="noreferrer"
                     className="btn btn-ghost !px-3 !py-1 text-xs">
                    💬 WhatsApp
                  </a>
                  <a href={`tel:${r.telefone.replace(/\D/g, '')}`}
                     className="btn btn-ghost !px-3 !py-1 text-xs">
                    📞 Ligar
                  </a>
                </div>
              ) : (
                <p className="mt-1 text-sm text-[var(--c-text-soft)]">Sem telefone cadastrado.</p>
              )}
              {r.observacoes && (
                <p className="mt-2 text-sm text-[var(--c-text-soft)]">{r.observacoes}</p>
              )}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
