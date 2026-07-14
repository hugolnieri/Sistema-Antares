// Controle de acesso do admin — modelo ALLOWLIST:
//   * Só entra no sistema o administrador master (configuracoes.admin_master)
//     e os e-mails cadastrados em permissoes_usuarios.
//   * Quem está na lista tem três níveis por menu: 'editar' | 'ver' | 'nenhum'
//     (chave ausente = 'editar', para menus novos não bloquearem por acidente).
//   * Tudo é validado no SERVIDOR (RPC minha_permissao + RLS + trigger que
//     impede contas fora da lista). A interface só reflete o que o banco diz.
//
// No modo demonstração qualquer e-mail entra (permitido) e restrições valem
// se o e-mail estiver na lista — paridade via rpc do mockClient.
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
  // true quando é o administrador master (acesso total garantido)
  master: boolean
  // true quando o usuário logado tem um registro de restrição
  restrito: boolean
  nivel: (menu: string) => NivelPermissao
  podeVer: (menu: string) => boolean
  podeEditar: (menu: string) => boolean
}

const contextoPadrao: PermissoesCtx = {
  email: '',
  master: false,
  restrito: false,
  nivel: () => 'editar',
  podeVer: () => true,
  podeEditar: () => true,
}

const Contexto = createContext<PermissoesCtx>(contextoPadrao)

interface EstadoPermissao {
  email: string
  permitido: boolean
  master: boolean
  permissoes: Record<string, NivelPermissao> | null
}

export function PermissoesProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoPermissao | 'erro' | undefined>(undefined)

  const carregar = async () => {
    setEstado(undefined)
    const { data: u } = await supabase.auth.getUser()
    const email = (u.user?.email ?? '').trim().toLowerCase()
    // Validação no servidor: a RPC decide se o e-mail pode usar o sistema.
    const { data, error } = await supabase.rpc('minha_permissao')
    if (error || !data) { setEstado('erro'); return }
    setEstado({
      email,
      permitido: !!(data as any).permitido,
      master: !!(data as any).master,
      permissoes: (data as any).permissoes ?? null,
    })
  }

  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sair = async () => {
    await supabase.auth.signOut()
    window.location.href = '/admin/login'
  }

  if (estado === undefined) {
    return <div className="flex h-screen items-center justify-center">Carregando…</div>
  }

  if (estado === 'erro') {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <div className="card max-w-md">
          <EmptyState
            icon="⚠️" title="Não foi possível verificar o seu acesso"
            message="Verifique a conexão e tente novamente."
            action={
              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={carregar}>Tentar novamente</button>
                <button className="btn btn-ghost" onClick={sair}>Sair</button>
              </div>
            }
          />
        </div>
      </div>
    )
  }

  if (!estado.permitido) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <div className="card max-w-md">
          <EmptyState
            icon="🔒" title="Acesso não autorizado"
            message="Este e-mail não tem permissão para usar o sistema. Fale com o administrador do colégio Antares."
            action={<button className="btn btn-primary" onClick={sair}>Sair</button>}
          />
        </div>
      </div>
    )
  }

  // Master ou usuário sem mapa de permissões (demo) = acesso total.
  const nivel = (menu: string): NivelPermissao =>
    estado.master || !estado.permissoes
      ? 'editar'
      : ((estado.permissoes[menu] as NivelPermissao) ?? 'editar')

  const ctx: PermissoesCtx = {
    email: estado.email,
    master: estado.master,
    restrito: !estado.master && !!estado.permissoes,
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
