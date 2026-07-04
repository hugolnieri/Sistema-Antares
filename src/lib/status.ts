// Mapa ÚNICO de status do sistema: cor + ícone + texto.
// Toda badge, tabela e detalhe importa daqui — nunca defina cores de status localmente.

export type StatusColor = 'green' | 'amber' | 'red' | 'gray' | 'blue'

export interface StatusDef {
  label: string
  color: StatusColor
  icon: string
}

export const STATUS: Record<string, StatusDef> = {
  // Genéricos (polos, alunos, materiais)
  ativo:      { label: 'Ativo',      color: 'green', icon: '●' },
  inativo:    { label: 'Inativo',    color: 'gray',  icon: '○' },
  // Professores
  disponivel: { label: 'Disponível', color: 'green', icon: '●' },
  ocupado:    { label: 'Ocupado',    color: 'amber', icon: '◐' },
  // Cronograma
  agendada:   { label: 'Agendada',   color: 'blue',  icon: '◷' },
  concluida:  { label: 'Concluída',  color: 'green', icon: '✓' },
  cancelada:  { label: 'Cancelada',  color: 'red',   icon: '✕' },
  // Presença
  presente:   { label: 'Presente',   color: 'green', icon: '✓' },
  ausente:    { label: 'Ausente',    color: 'red',   icon: '✕' },
  // Sugestões de cadastro (professor -> admin)
  pendente:   { label: 'Pendente',   color: 'amber', icon: '◐' },
  aprovado:   { label: 'Aprovado',   color: 'green', icon: '✓' },
  recusado:   { label: 'Recusado',   color: 'red',   icon: '✕' },
  // Tipos de evento do cronograma
  preparo:    { label: 'Preparação', color: 'amber', icon: '📄' },
  reuniao:    { label: 'Reunião',    color: 'blue',  icon: '👥' },
  entrega:    { label: 'Entrega',    color: 'red',   icon: '📦' },
  geral:      { label: 'Evento',     color: 'gray',  icon: '📌' },
  // Aula realizada (histórico) exibida no calendário
  realizada:  { label: 'Realizada',  color: 'green', icon: '✓' },
}

export const statusDe = (key: string): StatusDef =>
  STATUS[key] ?? { label: key, color: 'gray', icon: '○' }
