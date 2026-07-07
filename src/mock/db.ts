// Banco de dados FICTÍCIO do modo demonstração.
// Vive no localStorage — os cadastros feitos na demo sobrevivem ao reload.
// Para zerar: rode antaresResetDemo() no console do navegador.

export interface MockDB {
  polos: any[]
  professores: any[]
  professor_polos: any[]
  alunos: any[]
  responsaveis: any[]
  aluno_responsaveis: any[]
  materiais: any[]
  cronograma: any[]
  historico_aulas: any[]
  presencas: any[]
  fotos_aula: any[]
  alunos_sugeridos: any[]
  solicitacoes_contato: any[]
}

const KEY = 'antares-mock-db'

export const uuid = () => crypto.randomUUID()
const diasAtras = (n: number) => new Date(Date.now() - n * 86400000).toISOString()
const dataEm = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

// "Foto" de demonstração: SVG embutido como data URI
const foto = (label: string, cor: string) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">` +
    `<rect width="400" height="300" fill="${cor}"/>` +
    `<text x="200" y="155" font-family="sans-serif" font-size="22" fill="#fff" text-anchor="middle">${label}</text></svg>`,
  )

function seed(): MockDB {
  // Polos
  const p1 = uuid(); const p2 = uuid(); const p3 = uuid(); const p4 = uuid()
  // Professores
  const pr1 = uuid(); const pr2 = uuid(); const pr3 = uuid(); const pr4 = uuid()
  // Alunos
  const al = Array.from({ length: 12 }, () => uuid())
  // Responsáveis
  const r = Array.from({ length: 7 }, () => uuid())
  // Histórico
  const h1 = uuid(); const h2 = uuid(); const h3 = uuid()

  return {
    polos: [
      { id: p1, nome: 'Jardim Santa Maria', slug: 'jardim-santa-maria', cep: '01310-200', logradouro: 'Av. Paulista', numero: '1578', complemento: null, bairro: 'Bela Vista', cidade: 'São Paulo', estado: 'SP', responsavel: 'Carla Mendes', contato: '(11) 98888-1111', pix: 'pix-santamaria@antares.com', observacoes: 'Aulas às terças e quintas.', latitude: -23.5614, longitude: -46.6559, senha: '1234', token_version: 1, ciclo_atual: 1, status: 'ativo', created_at: diasAtras(90) },
      { id: p2, nome: 'Centro', slug: 'centro', cep: '18520-085', logradouro: 'Av. Brasil', numero: '205', complemento: null, bairro: 'Centro', cidade: 'Cerquilho', estado: 'SP', responsavel: 'Roberto Dias', contato: '(11) 97777-2222', pix: null, observacoes: null, latitude: -23.1649435, longitude: -47.7389505, senha: '1234', token_version: 1, ciclo_atual: 1, status: 'ativo', created_at: diasAtras(80) },
      { id: p3, nome: 'Vila Nova', slug: 'vila-nova', cep: '04094-050', logradouro: 'Av. Pedro Álvares Cabral', numero: 's/n', complemento: null, bairro: 'Ibirapuera', cidade: 'São Paulo', estado: 'SP', responsavel: 'Fernanda Rocha', contato: '(11) 96666-3333', pix: 'pix-vilanova@antares.com', observacoes: null, latitude: -23.5874, longitude: -46.6576, senha: '1234', token_version: 1, ciclo_atual: 1, status: 'ativo', created_at: diasAtras(60) },
      { id: p4, nome: 'Parque das Flores', slug: 'parque-das-flores', cep: '01024-000', logradouro: 'Rua da Cantareira', numero: '306', complemento: null, bairro: 'Centro', cidade: 'São Paulo', estado: 'SP', responsavel: null, contato: null, pix: null, observacoes: 'Polo pausado neste semestre.', latitude: -23.5416, longitude: -46.6294, senha: '1234', token_version: 1, ciclo_atual: 1, status: 'inativo', created_at: diasAtras(120) },
    ],
    professores: [
      { id: pr1, nome: 'Ana Lima', contato: '(11) 95555-0001', pix: 'ana.lima@pix.com', status: 'disponivel', ativo: true, observacoes: null, created_at: diasAtras(85) },
      { id: pr2, nome: 'Bruno Castro', contato: '(11) 95555-0002', pix: null, status: 'ocupado', ativo: true, observacoes: 'Atende dois polos.', created_at: diasAtras(70) },
      { id: pr3, nome: 'Carlos Nunes', contato: '(11) 95555-0003', pix: null, status: 'disponivel', ativo: true, observacoes: 'Aguardando vínculo com polo.', created_at: diasAtras(30) },
      { id: pr4, nome: 'Diana Prado', contato: '(11) 95555-0004', pix: null, status: 'disponivel', ativo: false, observacoes: 'Afastada temporariamente.', created_at: diasAtras(100) },
    ],
    professor_polos: [
      { professor_id: pr1, polo_id: p1 },
      { professor_id: pr2, polo_id: p1 },
      { professor_id: pr2, polo_id: p2 },
      { professor_id: pr4, polo_id: p3 },
    ],
    alunos: [
      { id: al[0], nome: 'Alice Ferreira', contato: null, polo_id: p1, status: 'ativo', observacoes: 'Alergia a amendoim.', created_at: diasAtras(60) },
      { id: al[1], nome: 'Bernardo Souza', contato: null, polo_id: p1, status: 'ativo', observacoes: null, created_at: diasAtras(60) },
      { id: al[2], nome: 'Cecília Ramos', contato: '(11) 94444-0003', polo_id: p1, status: 'ativo', observacoes: null, created_at: diasAtras(55) },
      { id: al[3], nome: 'Davi Oliveira', contato: null, polo_id: p1, status: 'ativo', observacoes: null, created_at: diasAtras(50) },
      { id: al[4], nome: 'Eduarda Pinto', contato: null, polo_id: p1, status: 'inativo', observacoes: 'Mudou de cidade.', created_at: diasAtras(58) },
      { id: al[5], nome: 'Felipe Martins', contato: null, polo_id: p2, status: 'ativo', observacoes: null, created_at: diasAtras(45) },
      { id: al[6], nome: 'Gabriela Costa', contato: null, polo_id: p2, status: 'ativo', observacoes: null, created_at: diasAtras(45) },
      { id: al[7], nome: 'Heitor Almeida', contato: null, polo_id: p2, status: 'ativo', observacoes: null, created_at: diasAtras(40) },
      { id: al[8], nome: 'Isabela Cardoso', contato: null, polo_id: p2, status: 'ativo', observacoes: null, created_at: diasAtras(38) },
      { id: al[9], nome: 'João Pedro Silva', contato: null, polo_id: p3, status: 'ativo', observacoes: null, created_at: diasAtras(30) },
      { id: al[10], nome: 'Larissa Gomes', contato: null, polo_id: p3, status: 'ativo', observacoes: null, created_at: diasAtras(28) },
      { id: al[11], nome: 'Miguel Barbosa', contato: null, polo_id: p3, status: 'ativo', observacoes: null, created_at: diasAtras(25) },
    ],
    responsaveis: [
      { id: r[0], nome: 'Mariana Ferreira', telefone: '(11) 93333-0001', observacoes: 'Prefere contato por WhatsApp.', created_at: diasAtras(60) },
      { id: r[1], nome: 'Dona Rosa Ferreira', telefone: '(11) 93333-0002', observacoes: 'Avó — busca a aluna às sextas.', created_at: diasAtras(60) },
      { id: r[2], nome: 'Paulo Souza', telefone: '(11) 93333-0003', observacoes: null, created_at: diasAtras(60) },
      { id: r[3], nome: 'Renata Ramos', telefone: '(11) 93333-0004', observacoes: null, created_at: diasAtras(55) },
      { id: r[4], nome: 'Silvia Oliveira', telefone: null, observacoes: 'Sem telefone cadastrado.', created_at: diasAtras(50) },
      { id: r[5], nome: 'Tiago Martins', telefone: '(11) 93333-0006', observacoes: null, created_at: diasAtras(45) },
      { id: r[6], nome: 'Vera Silva', telefone: '(11) 93333-0007', observacoes: null, created_at: diasAtras(30) },
    ],
    aluno_responsaveis: [
      { aluno_id: al[0], responsavel_id: r[0], parentesco: 'Mãe' },
      { aluno_id: al[0], responsavel_id: r[1], parentesco: 'Avó' },
      { aluno_id: al[1], responsavel_id: r[2], parentesco: 'Pai' },
      { aluno_id: al[2], responsavel_id: r[3], parentesco: 'Mãe' },
      { aluno_id: al[3], responsavel_id: r[4], parentesco: 'Tia' },
      { aluno_id: al[5], responsavel_id: r[5], parentesco: 'Pai' },
      { aluno_id: al[9], responsavel_id: r[6], parentesco: 'Mãe' },
    ],
    materiais: [
      { id: uuid(), numero_aula: 1, titulo: 'Boas-vindas e apresentação', descricao: 'Primeira aula do programa.', arquivo_path: 'aula-01.pdf', status: 'ativo', created_at: diasAtras(80) },
      { id: uuid(), numero_aula: 2, titulo: 'Fundamentos — parte 1', descricao: null, arquivo_path: 'aula-02.pdf', status: 'ativo', created_at: diasAtras(80) },
      { id: uuid(), numero_aula: 3, titulo: 'Fundamentos — parte 2', descricao: null, arquivo_path: 'aula-03.pdf', status: 'ativo', created_at: diasAtras(80) },
      { id: uuid(), numero_aula: 4, titulo: 'Atividades práticas', descricao: 'Levar material impresso.', arquivo_path: 'aula-04.pdf', status: 'ativo', created_at: diasAtras(75) },
      { id: uuid(), numero_aula: 5, titulo: 'Revisão do módulo 1', descricao: null, arquivo_path: 'aula-05.pdf', status: 'ativo', created_at: diasAtras(70) },
      { id: uuid(), numero_aula: 6, titulo: 'Aula em revisão (oculta)', descricao: 'Material sendo atualizado.', arquivo_path: 'aula-06.pdf', status: 'inativo', created_at: diasAtras(65) },
    ],
    cronograma: [
      { id: uuid(), polo_id: p1, numero_aula: 3, data: dataEm(-7), professor_id: pr1, observacoes: null, status: 'concluida', lembrete_dias_antes: null, lembrete_texto: null, created_at: diasAtras(20) },
      { id: uuid(), polo_id: p2, numero_aula: 1, data: dataEm(-5), professor_id: pr2, observacoes: null, status: 'concluida', lembrete_dias_antes: null, lembrete_texto: null, created_at: diasAtras(20) },
      { id: uuid(), polo_id: p1, numero_aula: 4, data: dataEm(0), professor_id: pr1, observacoes: 'Hoje!', status: 'agendada', lembrete_dias_antes: 2, lembrete_texto: 'Organizar materiais', created_at: diasAtras(10) },
      { id: uuid(), polo_id: p3, numero_aula: 1, data: dataEm(3), professor_id: null, observacoes: 'Professor a definir.', status: 'agendada', lembrete_dias_antes: 2, lembrete_texto: 'Imprimir listas de presença', created_at: diasAtras(8) },
      { id: uuid(), polo_id: p2, numero_aula: 2, data: dataEm(7), professor_id: pr2, observacoes: null, status: 'agendada', lembrete_dias_antes: null, lembrete_texto: null, created_at: diasAtras(5) },
      { id: uuid(), polo_id: p1, numero_aula: 5, data: dataEm(14), professor_id: pr1, observacoes: null, status: 'agendada', lembrete_dias_antes: null, lembrete_texto: null, created_at: diasAtras(3) },
    ],
    historico_aulas: [
      { id: h1, polo_id: p1, numero_aula: 3, ciclo: 1, professor_nome: 'Ana Lima, Bruno Castro', professores_nomes: ['Ana Lima', 'Bruno Castro'], data_hora: diasAtras(2), relatorio: 'Trabalhamos os fundamentos da parte 2 com dinâmica em grupo. Todos concluíram a atividade.', criado_por: 'professor', created_at: diasAtras(2) },
      { id: h2, polo_id: p2, numero_aula: 1, ciclo: 1, professor_nome: 'Bruno Castro', professores_nomes: ['Bruno Castro'], data_hora: diasAtras(5), relatorio: 'Aula de boas-vindas, apresentação do programa às famílias.', criado_por: 'professor', created_at: diasAtras(5) },
      { id: h3, polo_id: p1, numero_aula: 2, ciclo: 1, professor_nome: 'Ana Lima', professores_nomes: ['Ana Lima'], data_hora: diasAtras(20), relatorio: null, criado_por: 'professor', created_at: diasAtras(20) },
    ],
    presencas: [
      { id: uuid(), historico_id: h1, aluno_id: al[0], presente: true },
      { id: uuid(), historico_id: h1, aluno_id: al[1], presente: true },
      { id: uuid(), historico_id: h1, aluno_id: al[2], presente: false },
      { id: uuid(), historico_id: h1, aluno_id: al[3], presente: true },
      { id: uuid(), historico_id: h2, aluno_id: al[5], presente: true },
      { id: uuid(), historico_id: h2, aluno_id: al[6], presente: true },
      { id: uuid(), historico_id: h2, aluno_id: al[7], presente: false },
      { id: uuid(), historico_id: h2, aluno_id: al[8], presente: true },
      { id: uuid(), historico_id: h3, aluno_id: al[0], presente: true },
      { id: uuid(), historico_id: h3, aluno_id: al[1], presente: false },
      { id: uuid(), historico_id: h3, aluno_id: al[2], presente: true },
      { id: uuid(), historico_id: h3, aluno_id: al[3], presente: true },
    ],
    fotos_aula: [
      { id: uuid(), historico_id: h1, polo_id: p1, nome_arquivo: 'atividade-grupo.jpg', arquivo_path: null, url_externa: foto('Atividade em grupo', '#4c6ef5'), created_at: diasAtras(2) },
      { id: uuid(), historico_id: h1, polo_id: p1, nome_arquivo: 'turma.jpg', arquivo_path: null, url_externa: foto('Foto da turma', '#12b886'), created_at: diasAtras(2) },
    ],
    alunos_sugeridos: [
      { id: uuid(), polo_id: p1, historico_id: h1, nome: 'Sofia Andrade', status: 'pendente', created_at: diasAtras(2) },
    ],
    solicitacoes_contato: [
      { id: uuid(), polo_id: p2, aluno_id: al[5], aluno_nome: 'Felipe Martins', status: 'pendente', created_at: diasAtras(1) },
    ],
  }
}

export function loadDB(): MockDB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const db = JSON.parse(raw) as MockDB
      // Migração: dados salvos antes de novas tabelas/colunas existirem
      if (!db.alunos_sugeridos) db.alunos_sugeridos = []
      if (!db.solicitacoes_contato) db.solicitacoes_contato = []
      delete (db as any).eventos
      for (const c of db.cronograma) {
        if (c.lembrete_dias_antes === undefined) c.lembrete_dias_antes = null
        if (c.lembrete_texto === undefined) c.lembrete_texto = null
      }
      for (const p of db.polos) if (p.ciclo_atual === undefined) p.ciclo_atual = 1
      for (const h of db.historico_aulas) if (h.ciclo === undefined) h.ciclo = 1
      return db
    }
  } catch { /* seed abaixo */ }
  const db = seed()
  saveDB(db)
  return db
}

export function saveDB(db: MockDB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    // Cota do localStorage cheia (fotos grandes na demo): segue em memória.
    console.warn('Demo: não foi possível persistir os dados (cota do localStorage).')
  }
}

export function resetDB() {
  localStorage.removeItem(KEY)
}
