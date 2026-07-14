import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Logo } from './Logo'
import { Icon, type IconName } from './Icons'
import { fmtData, subtrairDias } from '../lib/format'
import { alternarTema, getTema, type Tema } from '../lib/theme'

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

/* ---------- Navegação lateral ---------- */

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/admin', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/admin/polos', label: 'Polos', icon: 'polos' },
  { to: '/admin/professores', label: 'Professores', icon: 'professores' },
  { to: '/admin/alunos', label: 'Alunos', icon: 'alunos' },
  { to: '/admin/responsaveis', label: 'Responsáveis', icon: 'responsaveis' },
  { to: '/admin/cronograma', label: 'Cronograma', icon: 'cronograma' },
  { to: '/admin/materiais', label: 'Materiais', icon: 'materiais' },
  { to: '/admin/historico', label: 'Histórico', icon: 'historico' },
  { to: '/admin/logs', label: 'Registros', icon: 'logs' },
  { to: '/admin/configuracoes', label: 'Configurações', icon: 'config' },
]

const TITULOS: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/polos': 'Polos',
  '/admin/professores': 'Professores',
  '/admin/alunos': 'Alunos',
  '/admin/responsaveis': 'Responsáveis',
  '/admin/cronograma': 'Calendário / Cronograma',
  '/admin/materiais': 'Materiais didáticos',
  '/admin/historico': 'Histórico de aulas',
  '/admin/logs': 'Registros de atividade',
  '/admin/configuracoes': 'Configurações',
}

interface Notif { id: string; icon: string; texto: string; to: string }

export function AdminShell() {
  const [menuAberto, setMenuAberto] = useState(false)
  const [notifsAbertas, setNotifsAbertas] = useState(false)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [email, setEmail] = useState('')
  const [tema, setTemaState] = useState<Tema>(getTema())
  const location = useLocation()
  const navigate = useNavigate()
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
  }, [])

  useEffect(() => { setMenuAberto(false); setNotifsAbertas(false) }, [location.pathname])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifsAbertas(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    const hoje = new Date().toLocaleDateString('en-CA')
    const em3 = new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-CA')
    const em30 = new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-CA')
    Promise.all([
      supabase.from('alunos_sugeridos').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
      // Janela ampla de aulas futuras: um lembrete pode cair nos próximos dias
      // mesmo que a aula em si esteja mais distante (ex.: aula em 10 dias,
      // lembrete 8 dias antes -> lembrete daqui a 2 dias).
      supabase.from('cronograma')
        .select('id, numero_aula, data, lembretes, polos(nome)')
        .gte('data', hoje).lte('data', em30).order('data'),
      supabase.from('solicitacoes_contato')
        .select('id, aluno_nome, polos(nome)')
        .eq('status', 'pendente').order('created_at', { ascending: false }),
    ]).then(([sug, cr, sol]) => {
      const lista: Notif[] = []
      for (const s of (sol.data ?? []) as any[]) {
        lista.push({
          id: `sol-${s.id}`, icon: '📇',
          texto: `Pedido de contato: ${s.aluno_nome} · ${s.polos?.nome ?? ''}`,
          to: '/admin/alunos',
        })
      }
      if ((sug.count ?? 0) > 0) {
        lista.push({
          id: 'sug', icon: '📥',
          texto: `${sug.count} sugestão(ões) de aluno aguardando aprovação`,
          to: '/admin/alunos',
        })
      }
      for (const c of (cr.data ?? []) as any[]) {
        if (c.data === hoje) {
          lista.push({
            id: `cr-${c.id}`, icon: '📅',
            texto: `Hoje: Aula ${c.numero_aula} · ${c.polos?.nome ?? ''}`,
            to: '/admin/cronograma',
          })
        }
        for (const [i, lb] of ((c.lembretes ?? []) as any[]).entries()) {
          const dataLembrete = subtrairDias(c.data, lb.dias_antes)
          if (dataLembrete >= hoje && dataLembrete <= em3) {
            lista.push({
              id: `lb-${c.id}-${i}`, icon: '📄',
              texto: `${fmtData(dataLembrete)}: ${lb.texto || 'Lembrete'}`,
              to: '/admin/cronograma',
            })
          }
        }
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

  const navLista = (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end}
                 className={({ isActive }) => `side-item ${isActive ? 'is-active' : ''}`}>
          <Icon name={item.icon} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="flex min-h-screen">
      {/* Backdrop mobile */}
      {menuAberto && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMenuAberto(false)} />
      )}

      {/* Menu lateral */}
      <aside className={`fixed z-40 flex h-screen w-[248px] flex-col border-r border-[var(--c-border)] bg-[var(--c-surface)] transition-transform lg:sticky lg:top-0 lg:translate-x-0 ${
        menuAberto ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="brand-stripe h-1 w-full" />
        <div className="flex items-center gap-3 px-4 py-4">
          <Logo size={40} />
          <div className="leading-tight">
            <p className="font-bold tracking-tight">Antares</p>
            <p className="text-[11px] text-[var(--c-text-soft)]">Formação de Bombeiros Civis</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">{navLista}</div>
        <div className="border-t border-[var(--c-border)] p-3">
          <button className="side-item w-full" onClick={sair}>
            <Icon name="sair" /> Sair
          </button>
        </div>
      </aside>

      {/* Área principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4 sm:px-6">
          <span className="lg:hidden">
            <button className="icon-btn" aria-label="Abrir menu" onClick={() => setMenuAberto(true)}>
              <Icon name="menu" />
            </button>
          </span>
          <h1 className="text-lg font-bold">{titulo}</h1>

          <div className="ml-auto flex items-center gap-2">
            <button className="icon-btn" aria-label="Alternar tema claro/escuro"
                    title={tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
                    onClick={() => setTemaState(alternarTema())}>
              <Icon name={tema === 'dark' ? 'sol' : 'lua'} size={18} />
            </button>

            <div className="relative" ref={notifRef}>
              <button className="icon-btn" aria-label="Notificações" onClick={() => setNotifsAbertas((v) => !v)}>
                <Icon name="sino" size={18} />
                {notifs.length > 0 && <span className="dot">{notifs.length}</span>}
              </button>
              {notifsAbertas && (
                <div className="absolute right-0 top-12 z-40 w-[320px] max-w-[90vw] overflow-hidden rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-xl">
                  <div className="border-b border-[var(--c-border)] p-3 font-bold">Notificações</div>
                  {notifs.length === 0 ? (
                    <p className="p-4 text-sm text-[var(--c-text-soft)]">Nada de novo por aqui.</p>
                  ) : (
                    <ul className="max-h-[60vh] overflow-y-auto">
                      {notifs.map((n) => (
                        <li key={n.id}>
                          <Link to={n.to}
                                className="flex items-start gap-2 border-b border-[var(--c-border)] p-3 text-sm hover:bg-[var(--c-primary-soft)]">
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

            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--c-primary)] font-bold text-white"
                 title={email}>
              {inicial}
            </div>
          </div>
        </header>

        <nav className="px-4 pt-4 text-sm text-[var(--c-text-soft)] sm:px-6" aria-label="breadcrumb">
          <Link to="/admin" className="hover:underline">Início</Link>
          {location.pathname !== '/admin' && <> / <span>{titulo}</span></>}
        </nav>

        <main className="flex-1 p-4 pt-4 sm:p-6 sm:pt-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
