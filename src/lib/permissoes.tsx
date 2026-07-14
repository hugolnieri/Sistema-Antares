// Controle de acesso do admin: o que cada usuário (e-mail) pode fazer em cada
// menu. Três níveis: 'editar' | 'ver' | 'nenhum'.
//
// Regra central: usuário SEM registro em permissoes_usuarios tem acesso total
// (evita trancar todo mundo para fora — restrições são criadas por e-mail em
// /admin/configuracoes). Registro existente sem a chave de um menu = 'editar'
// (menus novos não bloqueiam ninguém por acidente).
//
// A interface esconde menus e botões, e o schema.sql reforça no servidor:
// gravações exigem 'editar' via RLS (pode_editar_menu).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { EmptyState } from '../components/ui'

export type NivelPermissao = 'editar' | 'ver' | 'nenhum'

export const NIVEIS: { valor: NivelPermissao; label: string }[] = [
  { valor: 'editar', label: 'Editar' },
  { valor: 'ver', label: 'Só visualizar' },
  { valor: 'nenhum', label: 'Sem acesso' },
]

export const MENUS: { key: string; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'polos', label: 'Polos' },
  { key: 'professores', label: 'Professores' },
  { key: 'alunos', label: 'Alunos' },
  { key: 'responsaveis', label: 'Responsáveis' },
  { key: 'cronograma', label: 'Cronograma' },
  { key: 'materiais', label: 'Materiais' },
  { key: 'historico', label: 'Histórico' },
  { key: 'galeria', label: 'Galeria de fotos' },
  { key: 'logs', label: 'Registros' },
  { key: 'configuracoes', label: 'Configurações' },
]

export interface PermissaoUsuario {
  email: string
  permissoes: Record<string, NivelPermissao>
}

interface PermissoesCtx {
  email: string
  // true quando o usuário logado tem um registro de restrição
  restrito: boolean
  nivel: (menu: string) => NivelPermissao
  podeVer: (menu: string) => boolean
  podeEditar: (menu: string) => boolean
}

const contextoPadrao: PermissoesCtx = {
  email: '',
  restrito: false,
  nivel: () => 'editar',
  podeVer: () => true,
  podeEditar: () => true,
}

const Contexto = createContext<PermissoesCtx>(contextoPadrao)

export function PermissoesProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<
    { email: string; permissoes: Record<string, NivelPermissao> | null } | undefined
  >(undefined)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser()
      const email = (data.user?.email ?? '').trim().toLowerCase()
      let permissoes: Record<string, NivelPermissao> | null = null
      if (email) {
        const { data: rows } = await supabase
          .from('permissoes_usuarios').select('email, permissoes').eq('email', email).limit(1)
        permissoes = (rows?.[0] as any)?.permissoes ?? null
      }
      setEstado({ email, permissoes })
    })()
  }, [])

  if (estado === undefined) {
    return <div className="flex h-screen items-center justify-center">Carregando…</div>
  }

  const nivel = (menu: string): NivelPermissao =>
    estado.permissoes ? ((estado.permissoes[menu] as NivelPermissao) ?? 'editar') : 'editar'

  const ctx: PermissoesCtx = {
    email: estado.email,
    restrito: !!estado.permissoes,
    nivel,
    podeVer: (m) => nivel(m) !== 'nenhum',
    podeEditar: (m) => nivel(m) === 'editar',
  }
  return <Contexto.Provider value={ctx}>{children}</Contexto.Provider>
}

export const usePermissoes = () => useContext(Contexto)

// Guarda de rota: bloqueia a página inteira quando o nível do menu é 'nenhum'.
export function RequireMenu({ menu, children }: { menu: string; children: ReactNode }) {
  const { podeVer } = usePermissoes()
  if (!podeVer(menu)) {
    return (
      <div className="card">
        <EmptyState
          icon="🔒" title="Acesso restrito"
          message="Você não tem permissão para acessar esta área. Fale com o administrador do sistema."
        />
      </div>
    )
  }
  return <>{children}</>
}
