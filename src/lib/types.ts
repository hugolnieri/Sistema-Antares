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
  status: 'pendente' | 'atendida'
  created_at: string
  polos?: { nome: string } | null
}

export interface Professor {
  id: string
  nome: string
  contato: string | null
  pix: string | null
  status: 'disponivel' | 'ocupado'
  ativo: boolean
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
  status: 'ativo' | 'inativo'
  created_at: string
}

export interface CronogramaItem {
  id: string
  polo_id: string
  numero_aula: number
  data: string
  professor_id: string | null
  observacoes: string | null
  status: 'agendada' | 'concluida' | 'cancelada'
  lembrete_dias_antes: number | null
  lembrete_texto: string | null
  created_at: string
  polos?: { nome: string } | null
  professores?: { nome: string } | null
}

export interface HistoricoAula {
  id: string
  polo_id: string
  numero_aula: number
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
  aluno_id: string
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

export interface DadosPolo {
  polo: { id: string; nome: string; contato: string | null }
  alunos: AlunoChamada[]
  materiais: MaterialChamada[]
}
