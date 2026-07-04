import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, MOCK } from '../../lib/supabase'
import { Field } from '../../components/ui'
import { Logo } from '../../components/Logo'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const navigate = useNavigate()

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setSalvando(false)
    if (error) {
      setErro('E-mail ou senha incorretos.')
      return
    }
    navigate('/admin', { replace: true })
  }

  return (
    <div className="gradient-hero flex min-h-screen items-center justify-center p-4">
      <form onSubmit={entrar} className="card w-full max-w-sm !p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={72} />
          <span className="mt-3 text-xl font-bold">Antares</span>
          <p className="text-xs text-[var(--c-text-soft)]">
            Centro de Formação de Bombeiros Civis
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--c-text-soft)]">Acesso administrativo</p>
        </div>
        <div className="flex flex-col gap-4">
          <Field label="E-mail" required>
            <input type="email" value={email} required autoFocus
                   onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Senha" required error={erro || undefined}>
            <input type="password" value={senha} required aria-invalid={!!erro}
                   onChange={(e) => setSenha(e.target.value)} />
          </Field>
          <button type="submit" className="btn btn-primary btn-lg w-full"
                  disabled={salvando || !email || !senha}>
            {salvando ? 'Entrando…' : 'Entrar'}
          </button>
          {MOCK && (
            <p className="rounded-lg bg-[var(--c-amber-bg)] p-3 text-xs text-[var(--c-amber-fg)]">
              🧪 <strong>Modo demonstração:</strong> entre com qualquer e-mail e senha.
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
