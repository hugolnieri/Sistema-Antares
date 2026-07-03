import { useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { poloApi } from '../../lib/poloApi'
import { useToast } from '../../components/Toast'
import { usePolo } from './PoloLayout'

const MAX_FOTO_BYTES = 5 * 1024 * 1024

export default function Confirmacao() {
  const { slug = '' } = useParams()
  const { token } = usePolo()
  const toast = useToast()
  const { state } = useLocation() as {
    state?: {
      historicoId: string
      numeroAula: number
      presentes: number
      total: number
      fotos: number
      sugestoes: number
    }
  }

  const [fotos, setFotos] = useState<File[]>([])
  const [enviadas, setEnviadas] = useState(state?.fotos ?? 0)
  const [enviando, setEnviando] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

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
    setFotos((atual) => [...atual, ...novas])
    if (fileInput.current) fileInput.current.value = ''
  }

  const enviar = async () => {
    if (!state?.historicoId || fotos.length === 0) return
    setEnviando(true)
    try {
      const r = await poloApi.adicionarFotos(token, state.historicoId, fotos)
      const ok = fotos.length - (r.fotosErro?.length ?? 0)
      setEnviadas((e) => e + ok)
      setFotos([])
      if (r.fotosErro?.length) toast.error(`${r.fotosErro.length} foto(s) falharam no envio.`)
      else toast.success(`${ok} foto${ok === 1 ? '' : 's'} anexada${ok === 1 ? '' : 's'} à chamada.`)
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao enviar as fotos.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col items-center gap-4 py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--c-green-bg)] text-3xl">
          ✓
        </div>
        <h1 className="text-xl font-bold">Chamada salva com sucesso!</h1>
        {state && (
          <div className="text-sm text-[var(--c-text-soft)]">
            <p><strong>Aula {state.numeroAula}</strong></p>
            <p>{state.presentes} de {state.total} alunos presentes</p>
            {enviadas > 0 && (
              <p>{enviadas} foto{enviadas === 1 ? '' : 's'} anexada{enviadas === 1 ? '' : 's'}</p>
            )}
            {state.sugestoes > 0 && (
              <p className="mt-1 text-[var(--c-amber-fg)]">
                {state.sugestoes} aluno{state.sugestoes === 1 ? '' : 's'} enviado
                {state.sugestoes === 1 ? '' : 's'} para aprovação do administrativo
              </p>
            )}
          </div>
        )}
        <p className="text-sm text-[var(--c-text-soft)]">
          O registro foi enviado para o administrativo.
        </p>
      </div>

      {/* Anexar fotos depois de salvar (a foto fica para o final da aula) */}
      {state?.historicoId && (
        <div className="card flex flex-col gap-3">
          <h2 className="font-bold">📷 Tirou as fotos agora?</h2>
          <p className="text-xs text-[var(--c-text-soft)]">
            Você ainda pode anexar as fotos desta chamada por aqui.
          </p>
          <input
            ref={fileInput}
            type="file" accept="image/*" multiple capture="environment"
            className="hidden" id="fotos-confirmacao"
            onChange={(e) => adicionarFotos(e.target.files)}
          />
          <label htmlFor="fotos-confirmacao" className="btn btn-ghost btn-lg cursor-pointer">
            📷 Escolher fotos
          </label>
          {fotos.length > 0 && (
            <>
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
              <button className="btn btn-primary btn-lg" onClick={enviar} disabled={enviando}>
                {enviando
                  ? 'Enviando fotos…'
                  : `Enviar ${fotos.length} foto${fotos.length === 1 ? '' : 's'}`}
              </button>
            </>
          )}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-xs flex-col gap-2">
        <Link to={`/professor/polo/${slug}/chamada`} className="btn btn-primary btn-lg">
          Nova chamada
        </Link>
        <Link to={`/professor/polo/${slug}/materiais`} className="btn btn-ghost">
          Ver material didático
        </Link>
      </div>
    </div>
  )
}
