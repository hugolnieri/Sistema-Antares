// Registro de auditoria das ações do administrativo.
// Cada create/update/delete/senha das telas admin chama registrarLog().
// Nunca deve interromper a ação principal — falhas de log são engolidas.
import { supabase } from './supabase'

export async function registrarLog(entrada: {
  acao: string          // 'criar' | 'editar' | 'excluir' | 'senha' | 'status' | 'importar' | ...
  entidade: string      // 'polo' | 'professor' | 'aluno' | 'responsavel' | 'material' | 'cronograma'
  entidadeId?: string | null
  descricao: string
}) {
  try {
    const { data } = await supabase.auth.getUser()
    const ator = data.user?.email ?? 'administrativo'
    await supabase.from('logs').insert({
      ator,
      ator_tipo: 'admin',
      acao: entrada.acao,
      entidade: entrada.entidade,
      entidade_id: entrada.entidadeId ?? null,
      descricao: entrada.descricao,
    })
  } catch {
    /* logs não podem quebrar o fluxo principal */
  }
}
