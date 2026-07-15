export interface Polo {
  id: string
  nome: string
  slug: string
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  responsavel: string | null
  contato: string | null
  pix: string | null
  observacoes: string | null
  latitude: number | null
  longitude: number | null
  token_version: number
  ciclo_atual: number
  status: 'ativo' | 'inativo'
  created_at: string
}

export interface AlunoSugerido {
  id: string
  polo_id: string
  historico_id: string | null
  nome: string
  status: 'pendente' | 'aprovado' | 'recusado'
  created_at: string
  polos?: { nome: string } | null
}

export interface SolicitacaoContato {
  id: string
  polo_id: string
  aluno_id: string | null
  aluno_nome: string
  motivo: string | null
  status: 'pendente' | 'atendida'
  created_at: string
  polos?: { nome: string } | null
}

export interface Professor {
  id: string
  nome: string
  contato: string | null
  pix: string | null
  status: 'ativo' | 'inativo'
  observacoes: string | null
  created_at: string
  professor_polos?: { polo_id: string; polos?: { nome: string } | null }[]
}

export interface Aluno {
  id: string
  nome: string
  contato: string | null
  polo_id: string | null
  status: 'ativo' | 'inativo'
  observacoes: string | null
  created_at: string
  polos?: { nome: string } | null
  aluno_responsaveis?: AlunoResponsavel[]
}

export interface Responsavel {
  id: string
  nome: string
  telefone: string | null
  observacoes: string | null
  created_at: string
  aluno_responsaveis?: { aluno_id: string; parentesco: string | null; alunos?: { nome: string } | null }[]
}

export interface AlunoResponsavel {
  aluno_id: string
  responsavel_id: string
  parentesco: string | null
  responsaveis?: Responsavel | null
}

export interface Material {
  id: string
  numero_aula: number
  titulo: string
  descricao: string | null
  arquivo_path: string | null
  relatorio: string | null
  status: 'ativo' | 'inativo'
  created_at: string
}

// Um lembrete de uma aula agendada: aparece sozinho no calendário X dias antes.
// Uma aula pode ter vários (botão "+" no cronograma).
export interface LembreteCronograma {
  dias_antes: number
  texto: string
}

// Um professor responsável por uma aula agendada, com o status da confirmação
// de presença. Cada linha tem um token único que gera o link enviado no WhatsApp.
export interface CronogramaProfessor {
  id: string
  cronograma_id: string
  professor_id: string | null
  professor_nome: string       // snapshot — sobrevive à exclusão do professor
  token: string
  status: 'pendente' | 'confirmado' | 'recusado'
  respondido_em: string | null
  professores?: { nome: string; contato: string | null } | null
}

export interface CronogramaItem {
  id: string
  polo_id: string
  numero_aula: number
  data: string
  professor_id: string | null
  observacoes: string | null
  status: 'agendada' | 'concluida' | 'cancelada'
  lembretes: LembreteCronograma[]
  // Campos antigos (1 lembrete só) — mantidos para migração/leitura de dados legados.
  lembrete_dias_antes?: number | null
  lembrete_texto?: string | null
  relatorio_lembrete_data: string | null
  created_at: string
  polos?: { nome: string } | null
  professores?: { nome: string } | null
  // Professores responsáveis + confirmação de presença (fonte da verdade da lista).
  cronograma_professores?: CronogramaProfessor[]
}

// Resposta das RPCs info_confirmacao / responder_confirmacao (tela pública).
export interface InfoConfirmacao {
  professor_nome: string
  numero_aula: number
  data: string
  polo_nome: string
  status: 'pendente' | 'confirmado' | 'recusado'
}

// Registro de auditoria: o que cada usuário fez no sistema.
export interface LogEntry {
  id: string
  created_at: string
  ator: string            // e-mail do admin, "Professor · <polo>" ou "Sistema"
  ator_tipo: 'admin' | 'professor' | 'sistema'
  acao: string            // 'criar' | 'editar' | 'excluir' | 'login' | 'chamada' | ...
  entidade: string        // 'polo' | 'professor' | 'aluno' | 'responsavel' | ...
  entidade_id: string | null
  descricao: string
}

export interface HistoricoAula {
  id: string
  polo_id: string
  numero_aula: number
  ciclo: number
  professor_nome: string
  professores_nomes: string[]
  data_hora: string
  relatorio: string | null
  criado_por: string
  created_at: string
  polos?: { nome: string } | null
  presencas?: Presenca[]
  fotos_aula?: FotoAula[]
}

export interface Presenca {
  id: string
  historico_id: string
  aluno_id: string | null       // vira null se o aluno for excluído (o histórico é preservado)
  aluno_nome?: string | null    // nome gravado na hora da chamada (sobrevive à exclusão do aluno)
  presente: boolean
  alunos?: { nome: string } | null
}

export interface FotoAula {
  id: string
  historico_id: string
  polo_id: string
  nome_arquivo: string
  arquivo_path: string | null
  url_externa: string | null
  created_at: string
}

// ---- Tipos da área do professor (respostas da Edge Function) ----

export interface PoloSessao {
  token: string
  polo: { id: string; nome: string }
}

export interface AlunoChamada {
  id: string
  nome: string
  contato: string | null
  observacoes: string | null
}

export interface MaterialChamada {
  numero_aula: number
  titulo: string
  descricao: string | null
  url: string | null
}

// Detalhe completo de uma chamada — usado para retomar uma aula "pendente de
// fotos" (ex.: o professor recarregou a página) com a presença já marcada
// re-hidratada na tela.
export interface ChamadaDetalhe {
  historicoId: string
  numeroAula: number
  dataAula: string // YYYY-MM-DD
  professoresNomes: string[]
  relatorio: string | null
  presencas: { alunoId: string; presente: boolean }[]
}

// Uma chamada já registrada no ciclo atual do polo.
// - temFotos = false -> pendente: continua selecionável para anexar fotos depois
// - temFotos = true  -> concluída: bloqueada no seletor
export interface ChamadaExistente {
  numeroAula: number
  historicoId: string
  temFotos: boolean
}

export interface DadosPolo {
  polo: { id: string; nome: string; contato: string | null; ciclo: number }
  // WhatsApp do responsável do colégio Antares (Configurações do admin).
  // É este número que recebe as consultas de responsáveis feitas pelo
  // professor — o contato do polo acima é apenas informativo.
  contatoAntares: string | null
  alunos: AlunoChamada[]
  materiais: MaterialChamada[]
  chamadas: ChamadaExistente[]
}

// Configuração geral do sistema (chave/valor) — editada em /admin/configuracoes.
export interface Configuracao {
  chave: string
  valor: string | null
}
