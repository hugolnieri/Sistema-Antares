import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { poloApi, poloSessao } from '../../lib/poloApi'
import { MOCK } from '../../lib/supabase'
import { Field } from '../../components/ui'
import { Logo } from '../../components/Logo'

export default function PoloLogin() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const [nomePolo, setNomePolo] = useState<string | null>(null)
  const [poloInvalido, setPoloInvalido] = useState(false)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)

  useEffect(() => {
    // Sessão ainda válida? Vai direto para a chamada.
    if (poloSessao.get(slug)) {
      navigate(`/professor/polo/${slug}/chamada`, { replace: true })
      return
    }
    poloApi.info(slug)
      .then((r) => setNomePolo(r.nome))
      .catch(() => setPoloInvalido(true))
  }, [slug, navigate])

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    setEntrando(true)
    try {
      const sessao = await poloApi.login(slug, senha)
      poloSessao.set(slug, sessao)
      navigate(`/professor/polo/${slug}/chamada`, { replace: true })
    } catch (err: any) {
      setErro(err.message ?? 'Senha incorreta. Verifique com o administrativo.')
    } finally {
      setEntrando(false)
    }
  }

  return (
    <div className="gradient-hero flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm !p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={64} />
          <span className="mt-2 text-xl font-bold">Antares</span>
          {poloInvalido ? (
            <p className="mt-3 rounded-lg bg-[var(--c-red-bg)] p-3 text-sm text-[var(--c-red-fg)]">
              Polo não encontrado ou inativo. Confira o link com o administrativo.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-[var(--c-text-soft)]">Acesso do professor</p>
              <p className="mt-1 text-lg font-bold">
                {nomePolo ?? <span className="skeleton inline-block h-5 w-40" />}
              </p>
            </>
          )}
        </div>

        {!poloInvalido && (
          <form onSubmit={entrar} className="flex flex-col gap-4">
            <Field label="Senha do polo" required error={erro || undefined}>
              <input
                type="password"
                value={senha}
                required
                autoFocus
                aria-invalid={!!erro}
                placeholder="Digite a senha do polo"
                className="!py-3 !text-lg"
                onChange={(e) => { setSenha(e.target.value); setErro('') }}
              />
            </Field>
            <button type="submit" className="btn btn-primary btn-lg w-full"
                    disabled={entrando || !senha || !nomePolo}>
              {entrando ? 'Entrando…' : 'Entrar'}
            </button>
            {MOCK && (
              <p className="rounded-lg bg-[var(--c-amber-bg)] p-3 text-xs text-[var(--c-amber-fg)]">
                🧪 <strong>Modo demonstração:</strong> a senha dos polos de exemplo é{' '}
                <strong>1234</strong>.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
