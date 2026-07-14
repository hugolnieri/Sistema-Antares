// Cliente da Edge Function "admin-usuarios" — criação/remoção/reset de contas
// do painel. A service role nunca chega ao navegador: a função valida no
// servidor se quem chama pode editar Configurações.
import { supabase, MOCK } from './supabase'

// Senha inicial de todo usuário novo (ele troca depois no próprio painel,
// pelo botão no avatar). Mantida em sincronia com a Edge Function.
export const SENHA_PADRAO = 'Antares@2026'

type AcaoUsuario = 'criarUsuario' | 'removerUsuario' | 'resetarSenha'

export async function adminUsuarios(
  action: AcaoUsuario,
  email: string,
): Promise<{ ok: boolean; jaExistia?: boolean; naoExistia?: boolean }> {
  // Na demonstração não existem contas reais — as ações são simuladas.
  if (MOCK) return { ok: true }
  const { data, error } = await supabase.functions.invoke('admin-usuarios', {
    body: { action, email },
  })
  if (error) throw new Error('Erro ao comunicar com o servidor de usuários.')
  if (data?.error) throw new Error(data.error)
  return data
}
