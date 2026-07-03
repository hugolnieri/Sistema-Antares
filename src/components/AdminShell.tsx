import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/* ---------- Guarda de autenticação ---------- */

export function RequireAuth({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === null) navigate('/admin/login', { replace: true })
  }, [session, navigate])

  if (session === undefined) {
    return <div className="flex h-screen items-center justify-center">Carregando…</div>
  }
  if (session === null) return null
  return <>{children}</>
}

/* ---------- Navegação (grupos + página ativa) ---------- */

const NAV = [
  {
    grupo: 'Geral',
    itens: [{ to: '/admin', label: 'Dashboard', icon: '📊', end: true }],
  },
  {
    grupo: 'Cadastros',
    itens: [
      { to: '/admin/polos', label: 'Polos', icon: '📍' },
      { to: '/admin/professores', label: 'Professores', icon: '🧑‍🏫' },
      { to: '/admin/alunos', label: 'Alunos', icon: '🎓' },
      { to: '/admin/responsaveis', label: 'Responsáveis', icon: '👪' },
    ],
  },
  {
    grupo: 'Operação',
    itens: [
      { to: '/admin/mapeamento', label: 'Mapeamento', icon: '🗺️' },
      { to: '/admin/cronograma', label: 'Cronograma', icon: '📅' },
      { to: '/admin/materiais', label: 'Materiais', icon: '📚' },
      { to: '/admin/historico', label: 'Histórico', icon: '🕘' },
    ],
  },
]

const TITULOS: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/polos': 'Polos',
  '/admin/professores': 'Professores',
  '/admin/alunos': 'Alunos',
  '/admin/responsaveis': 'Responsáveis',
  '/admin/mapeamento': 'Mapeamento de professores',
  '/admin/cronograma': 'Calendário / Cronograma',
  '/admin/materiais': 'Materiais didáticos',
  '/admin/historico': 'Histórico de aulas',
}

export function AdminShell() {
  const [sidebarAberta, setSidebarAberta] = useState(false)
  const [email, setEmail] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
  }, [])

  useEffect(() => setSidebarAberta(false), [location.pathname])

  const sair = async () => {
    await supabase.auth.signOut()
    navigate('/admin/login')
  }

  const base = '/admin/' + (location.pathname.split('/')[2] ?? '')
  const titulo = TITULOS[location.pathname] ?? TITULOS[base.replace(/\/$/, '')] ?? 'Detalhe'

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      {sidebarAberta && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden"
             onClick={() => setSidebarAberta(false)} />
      )}
      <aside className={`fixed z-40 flex h-screen w-[250px] flex-col bg-[#1c2333] p-4 transition-transform lg:sticky lg:top-0 lg:translate-x-0 ${
        sidebarAberta ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="mb-6 px-2">
          <span className="text-lg font-bold text-white">✦ Antares</span>
          <p className="text-xs text-[#8b93a7]">Gestão dos Polos</p>
        </div>
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {NAV.map((g) => (
            <div key={g.grupo}>
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#8b93a7]">
                {g.grupo}
              </p>
              <div className="flex flex-col gap-0.5">
                {g.itens.map((item) => (
                  <NavLink
                    key={item.to} to={item.to} end={(item as any).end}
                    className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
                  >
                    <span aria-hidden="true">{item.icon}</span> {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Área principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[var(--c-border)] bg-white px-4">
          <div className="flex items-center gap-3">
            <button className="btn btn-ghost !px-2 !py-1 lg:hidden"
                    onClick={() => setSidebarAberta(true)} aria-label="Abrir menu">☰</button>
            <span className="font-semibold">{titulo}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-[var(--c-text-soft)] sm:inline">{email}</span>
            <button className="btn btn-ghost !px-3 !py-1" onClick={sair}>Sair</button>
          </div>
        </header>

        <nav className="px-6 pt-4 text-sm text-[var(--c-text-soft)]" aria-label="breadcrumb">
          <Link to="/admin" className="hover:underline">Início</Link>
          {location.pathname !== '/admin' && <> / <span>{titulo}</span></>}
        </nav>

        <main className="flex-1 p-6 pt-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
