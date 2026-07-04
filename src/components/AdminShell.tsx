import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { BrandHeader } from './Logo'
import { fmtData } from '../lib/format'

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

/* ---------- Navegação (itens do topo) ---------- */

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: '📊', end: true },
  { to: '/admin/polos', label: 'Polos', icon: '📍' },
  { to: '/admin/professores', label: 'Professores', icon: '🧑‍🏫' },
  { to: '/admin/alunos', label: 'Alunos', icon: '🎓' },
  { to: '/admin/responsaveis', label: 'Responsáveis', icon: '👪' },
  { to: '/admin/mapeamento', label: 'Mapeamento', icon: '🗺️' },
  { to: '/admin/cronograma', label: 'Cronograma', icon: '📅' },
  { to: '/admin/materiais', label: 'Materiais', icon: '📚' },
  { to: '/admin/historico', label: 'Histórico', icon: '🕘' },
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

interface Notif { id: string; icon: string; texto: string; to: string }

export function AdminShell() {
  const [menuAberto, setMenuAberto] = useState(false)
  const [notifsAbertas, setNotifsAbertas] = useState(false)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [email, setEmail] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
  }, [])

  useEffect(() => { setMenuAberto(false); setNotifsAbertas(false) }, [location.pathname])

  // Fecha o painel de notificações ao clicar fora
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifsAbertas(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Notificações: sugestões de aluno pendentes + eventos/aulas próximos
  useEffect(() => {
    const hoje = new Date().toLocaleDateString('en-CA')
    const em3 = new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-CA')
    Promise.all([
      supabase.from('alunos_sugeridos').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
      supabase.from('eventos').select('id, titulo, data, tipo').gte('data', hoje).lte('data', em3).order('data'),
      supabase.from('cronograma').select('id, numero_aula, data, polos(nome)').eq('data', hoje),
    ]).then(([sug, ev, cr]) => {
      const lista: Notif[] = []
      if ((sug.count ?? 0) > 0) {
        lista.push({
          id: 'sug', icon: '📥',
          texto: `${sug.count} sugestão(ões) de aluno aguardando aprovação`,
          to: '/admin/alunos',
        })
      }
      for (const c of (cr.data ?? []) as any[]) {
        lista.push({
          id: `cr-${c.id}`, icon: '📅',
          texto: `Hoje: Aula ${c.numero_aula} · ${c.polos?.nome ?? ''}`,
          to: '/admin/cronograma',
        })
      }
      for (const e of (ev.data ?? []) as any[]) {
        lista.push({
          id: `ev-${e.id}`, icon: e.tipo === 'preparo' ? '📄' : '📌',
          texto: `${fmtData(e.data)}: ${e.titulo}`,
          to: '/admin/cronograma',
        })
      }
      setNotifs(lista)
    })
  }, [location.pathname])

  const sair = async () => {
    await supabase.auth.signOut()
    navigate('/admin/login')
  }

  const base = '/admin/' + (location.pathname.split('/')[2] ?? '')
  const titulo = TITULOS[location.pathname] ?? TITULOS[base.replace(/\/$/, '')] ?? 'Detalhe'
  const inicial = (email[0] ?? 'A').toUpperCase()

  return (
    <div className="min-h-screen">
      {/* Topbar de marca + ações */}
      <header className="sticky top-0 z-30 border-b border-[var(--c-border)] bg-white">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <BrandHeader size={40} />

          <div className="ml-auto flex items-center gap-2">
            <NavLink to="/admin/historico" className="icon-btn" aria-label="Buscar" title="Buscar no histórico">🔍</NavLink>

            {/* Notificações */}
            <div className="relative" ref={notifRef}>
              <button className="icon-btn" aria-label="Notificações"
                      onClick={() => setNotifsAbertas((v) => !v)}>
                🔔
                {notifs.length > 0 && <span className="dot">{notifs.length}</span>}
              </button>
              {notifsAbertas && (
                <div className="absolute right-0 top-12 z-40 w-[320px] max-w-[90vw] overflow-hidden rounded-xl border border-[var(--c-border)] bg-white shadow-xl">
                  <div className="border-b border-[var(--c-border)] p-3 font-bold">Notificações</div>
                  {notifs.length === 0 ? (
                    <p className="p-4 text-sm text-[var(--c-text-soft)]">Nada de novo por aqui. 🎉</p>
                  ) : (
                    <ul className="max-h-[60vh] overflow-y-auto">
                      {notifs.map((n) => (
                        <li key={n.id}>
                          <Link to={n.to}
                                className="flex items-start gap-2 border-b border-[var(--c-border)] p-3 text-sm hover:bg-[var(--c-gray-bg)]">
                            <span aria-hidden="true">{n.icon}</span>
                            <span>{n.texto}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Avatar + sair */}
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--c-primary)] font-bold text-white"
                 title={email}>
              {inicial}
            </div>
            <button className="btn btn-ghost !px-3 !py-1.5" onClick={sair}>Sair</button>

            {/* Menu mobile */}
            <span className="lg:hidden">
              <button className="icon-btn" aria-label="Abrir menu"
                      onClick={() => setMenuAberto((v) => !v)}>☰</button>
            </span>
          </div>
        </div>

        {/* Navegação horizontal (desktop) */}
        <nav className="hidden gap-1 overflow-x-auto px-4 pb-2 sm:px-6 lg:flex">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={(item as any).end}
                     className={({ isActive }) => `topnav-item ${isActive ? 'is-active' : ''}`}>
              <span aria-hidden="true">{item.icon}</span> {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Navegação (mobile, dropdown) */}
        {menuAberto && (
          <nav className="flex flex-col gap-1 border-t border-[var(--c-border)] p-3 lg:hidden">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={(item as any).end}
                       className={({ isActive }) => `topnav-item ${isActive ? 'is-active' : ''}`}>
                <span aria-hidden="true">{item.icon}</span> {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {/* Breadcrumb + conteúdo */}
      <nav className="px-4 pt-4 text-sm text-[var(--c-text-soft)] sm:px-6" aria-label="breadcrumb">
        <Link to="/admin" className="hover:underline">Início</Link>
        {location.pathname !== '/admin' && <> / <span>{titulo}</span></>}
      </nav>

      <main className="mx-auto max-w-[1400px] p-4 pt-4 sm:p-6 sm:pt-4">
        <Outlet />
      </main>
    </div>
  )
}
