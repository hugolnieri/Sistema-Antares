// Mapa ÚNICO de status do sistema: cor + ícone + texto.
// Toda badge, tabela e detalhe importa daqui — nunca defina cores de status localmente.

export type StatusColor = 'green' | 'amber' | 'red' | 'gray' | 'blue'

export interface StatusDef {
  label: string
  color: StatusColor
  icon: string
}

export const STATUS: Record<string, StatusDef> = {
  // Genéricos (polos, alunos, professores, materiais)
  ativo:      { label: 'Ativo',      color: 'green', icon: '●' },
  inativo:    { label: 'Inativo',    color: 'gray',  icon: '○' },
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
  atendida:   { label: 'Atendida',   color: 'green', icon: '✓' },
  // Lembrete vinculado a uma aula (ex.: preparar materiais dias antes)
  lembrete:   { label: 'Lembrete',   color: 'amber', icon: '📄' },
  // Aula realizada (histórico) exibida no calendário
  realizada:  { label: 'Realizada',  color: 'green', icon: '✓' },
}

export const statusDe = (key: string): StatusDef =>
  STATUS[key] ?? { label: key, color: 'gray', icon: '○' }
