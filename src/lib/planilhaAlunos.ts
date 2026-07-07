// Modelo padronizado (.xlsx) para cadastro em massa de alunos, e leitura do
// arquivo preenchido de volta. Os cabeçalhos aqui são o "contrato" entre o
// modelo baixado pelo admin e o que o importador sabe reconhecer.
import * as XLSX from '@e965/xlsx'

export const COLUNAS_ALUNOS = [
  { chave: 'nome', cabecalho: 'Nome do aluno *' },
  { chave: 'polo', cabecalho: 'Polo *' },
  { chave: 'contato', cabecalho: 'Contato do aluno' },
  { chave: 'respNome', cabecalho: 'Nome do responsável' },
  { chave: 'respTelefone', cabecalho: 'Telefone do responsável' },
  { chave: 'parentesco', cabecalho: 'Parentesco' },
  { chave: 'observacoes', cabecalho: 'Observações' },
  { chave: 'status', cabecalho: 'Status (Ativo/Inativo)' },
] as const

type ChaveColuna = (typeof COLUNAS_ALUNOS)[number]['chave']
export type LinhaPlanilhaAlunos = Record<ChaveColuna, string>

// Gera e baixa o .xlsx padronizado: aba "Alunos" com o cabeçalho + exemplos
// preenchidos, e aba "Polos cadastrados" com os nomes exatos (o nome do polo
// precisa bater exatamente com um polo já cadastrado para o vínculo funcionar).
export function baixarModeloAlunos(nomesPolos: string[]) {
  const cabecalhos = COLUNAS_ALUNOS.map((c) => c.cabecalho)
  const poloExemplo = nomesPolos[0] ?? 'Nome do polo'
  const exemplos = [
    ['Maria da Silva', poloExemplo, '(11) 90000-0000', 'João da Silva', '(11) 90000-0001', 'Pai', 'Alergia a amendoim', 'Ativo'],
    ['Pedro Souza', poloExemplo, '', '', '', '', '', ''],
  ]
  const abaAlunos = XLSX.utils.aoa_to_sheet([cabecalhos, ...exemplos])
  abaAlunos['!cols'] = cabecalhos.map((c) => ({ wch: Math.max(18, c.length) }))

  const abaPolos = XLSX.utils.aoa_to_sheet([
    ['Polos cadastrados (copie o nome exato na coluna "Polo")'],
    ...nomesPolos.map((n) => [n]),
  ])
  abaPolos['!cols'] = [{ wch: 40 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, abaAlunos, 'Alunos')
  XLSX.utils.book_append_sheet(wb, abaPolos, 'Polos cadastrados')
  XLSX.writeFile(wb, 'modelo-importacao-alunos-antares.xlsx')
}

// Lê o arquivo enviado e devolve uma linha por aluno, já mapeada para as
// chaves internas. Linhas totalmente vazias (ex.: sobras de formatação) são
// descartadas.
export async function lerPlanilhaAlunos(arquivo: File): Promise<LinhaPlanilhaAlunos[]> {
  const buffer = await arquivo.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const aba = wb.Sheets['Alunos'] ?? wb.Sheets[wb.SheetNames[0]]
  if (!aba) return []
  const linhasBrutas = XLSX.utils.sheet_to_json<Record<string, unknown>>(aba, { defval: '' })
  return linhasBrutas
    .map((linha) => {
      const mapeada = {} as LinhaPlanilhaAlunos
      for (const { chave, cabecalho } of COLUNAS_ALUNOS) {
        mapeada[chave] = String(linha[cabecalho] ?? '').trim()
      }
      return mapeada
    })
    .filter((linha) => Object.values(linha).some((v) => v !== ''))
}
