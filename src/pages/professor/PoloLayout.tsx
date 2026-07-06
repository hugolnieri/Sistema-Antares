import { useCallback, useEffect, useState } from 'react'
import {
  NavLink, Outlet, useNavigate, useOutletContext, useParams,
} from 'react-router-dom'
import { poloApi, poloSessao } from '../../lib/poloApi'
import { EmptyState } from '../../components/ui'
import { Logo } from '../../components/Logo'
import type { DadosPolo } from '../../lib/types'

export interface PoloContext {
  slug: string
  token: string
  dados: DadosPolo
  recarregar: () => void
}

export const usePolo = () => useOutletContext<PoloContext>()

export default function PoloLayout() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const [dados, setDados] = useState<DadosPolo | null>(null)
  const [erro, setErro] = useState('')
  const sessao = poloSessao.get(slug)

  const sairParaSenha = useCallback(() => {
    poloSessao.clear(slug)
    navigate(`/professor/polo/${slug}`, { replace: true })
  }, [slug, navigate])

  const recarregar = useCallback(() => {
    if (!sessao) return
    setErro('')
    poloApi.dados(sessao.token)
      .then(setDados)
      .catch((e: any) => {
        // Sessão expirada ou senha trocada -> volta para a tela de senha
        if (String(e.message).includes('Sessão')) sairParaSenha()
        else setErro(e.message ?? 'Erro ao carregar os dados do polo.')
      })
  }, [sessao?.token, sairParaSenha]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sessao) {
      navigate(`/professor/polo/${slug}`, { replace: true })
      return
    }
    recarregar()
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!sessao) return null

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={36} />
            <div>
              <p className="text-xs text-[var(--c-text-soft)]">Antares — Professor</p>
              <p className="font-bold">{sessao.polo.nome}</p>
            </div>
          </div>
          <button className="btn btn-ghost !px-3 !py-1 text-xs" onClick={sairParaSenha}>
            Sair
          </button>
        </div>
        <nav className="mt-3 flex gap-2">
          <NavLink
            to={`/professor/polo/${slug}/chamada`}
            className={({ isActive }) =>
              `btn flex-1 !py-2 ${isActive ? 'btn-primary' : 'btn-ghost'}`}
          >
            📋 Chamada
          </NavLink>
          <NavLink
            to={`/professor/polo/${slug}/materiais`}
            className={({ isActive }) =>
              `btn flex-1 !py-2 ${isActive ? 'btn-primary' : 'btn-ghost'}`}
          >
            📚 Material didático
          </NavLink>
        </nav>
      </header>

      <main className="flex-1 p-4">
        {erro ? (
          <div className="card">
            <EmptyState
              icon="⚠️" title="Erro ao carregar" message={erro}
              action={<button className="btn btn-ghost" onClick={recarregar}>Tentar novamente</button>}
            />
          </div>
        ) : !dados ? (
          <div className="card flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" />)}
          </div>
        ) : (
          <Outlet context={{ slug, token: sessao.token, dados, recarregar } satisfies PoloContext} />
        )}
      </main>
    </div>
  )
}
