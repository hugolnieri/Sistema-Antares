// Mock da Edge Function "polo" — área do professor no modo demonstração.
// Reproduz as mesmas regras do servidor: senha do polo, token com versão
// (trocar a senha derruba a sessão), fotos só imagem/5MB, alunos só do polo.

import { loadDB, saveDB, uuid } from './db'
import { pdfDemoUrl, storageUrl } from './mockClient'
import type { ChamadaDetalhe, DadosPolo, PoloSessao } from '../lib/types'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const MAX_FOTO_BYTES = 5 * 1024 * 1024
const MAX_FOTOS = 10

// Fotos pequenas viram data URL (sobrevivem ao reload); grandes usam URL
// temporária para não estourar a cota do localStorage no modo demo.
const LIMITE_PERSISTENCIA = 300 * 1024

const fotoParaUrl = (f: File) =>
  new Promise<string>((resolve) => {
    if (f.size > LIMITE_PERSISTENCIA) { resolve(URL.createObjectURL(f)); return }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => resolve(URL.createObjectURL(f))
    reader.readAsDataURL(f)
  })

type MockDB = ReturnType<typeof loadDB>

// Registro de auditoria de uma ação do professor (login, chamada, fotos, etc.).
function registrarLogProfessor(
  db: MockDB,
  polo: MockDB['polos'][number],
  entrada: { acao: string; entidade: string; entidadeId?: string | null; descricao: string },
) {
  db.logs.push({
    id: uuid(),
    ator: `Professor · ${polo.nome}`,
    ator_tipo: 'professor',
    acao: entrada.acao,
    entidade: entrada.entidade,
    entidade_id: entrada.entidadeId ?? null,
    descricao: entrada.descricao,
    created_at: new Date().toISOString(),
  })
}

// O ciclo se encerra quando TODAS as 18 aulas do ciclo atual têm foto
// (concluídas). Avança polo.ciclo_atual e retorna true se completou agora.
function avancarCicloSeCompleto(db: MockDB, polo: MockDB['polos'][number]): boolean {
  const comFotos = new Set(
    db.historico_aulas
      .filter((h) => h.polo_id === polo.id && h.ciclo === polo.ciclo_atual)
      .filter((h) => db.fotos_aula.some((f) => f.historico_id === h.id))
      .map((h) => h.numero_aula),
  )
  if (comFotos.size < 18) return false
  polo.ciclo_atual += 1
  return true
}

export const mockPoloApi = {
  async info(slug: string): Promise<{ nome: string }> {
    await sleep(200)
    const polo = loadDB().polos.find((p) => p.slug === slug && p.status === 'ativo')
    if (!polo) throw new Error('Polo não encontrado')
    return { nome: polo.nome }
  },

  async login(slug: string, senha: string): Promise<PoloSessao> {
    await sleep(350)
    const db = loadDB()
    const polo = db.polos.find((p) => p.slug === slug && p.status === 'ativo')
    if (!polo || !polo.senha || polo.senha !== senha) {
      throw new Error('Senha incorreta. Verifique com o administrativo.')
    }
    registrarLogProfessor(db, polo, {
      acao: 'login', entidade: 'sessao', entidadeId: polo.id,
      descricao: `Professor acessou o polo "${polo.nome}".`,
    })
    saveDB(db)
    return {
      token: `${polo.id}.${polo.token_version}`,
      polo: { id: polo.id, nome: polo.nome },
    }
  },

  async dados(token: string): Promise<DadosPolo> {
    await sleep(300)
    const db = loadDB()
    const [poloId, tv] = token.split('.')
    const polo = db.polos.find((p) => p.id === poloId)
    if (!polo || polo.status !== 'ativo' || String(polo.token_version) !== tv) {
      throw new Error('Sessão expirada. Digite a senha novamente.')
    }
    const alunos = db.alunos
      .filter((a) => a.polo_id === polo.id && a.status === 'ativo')
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((a) => ({
        id: a.id,
        nome: a.nome,
        contato: a.contato,
        observacoes: a.observacoes,
      }))
    const materiais = db.materiais
      .filter((m) => m.status === 'ativo')
      .sort((a, b) => a.numero_aula - b.numero_aula)
      .map((m) => ({
        numero_aula: m.numero_aula,
        titulo: m.titulo,
        descricao: m.descricao,
        url: m.arquivo_path
          ? (storageUrl('materiais', m.arquivo_path) ?? pdfDemoUrl(m.titulo))
          : null,
      }))
    // Chamadas do ciclo atual. temFotos separa "pendente de fotos" (ainda
    // selecionável, pra anexar depois) de "concluída" (bloqueada no select).
    const chamadas = db.historico_aulas
      .filter((h) => h.polo_id === polo.id && h.ciclo === polo.ciclo_atual)
      .map((h) => ({
        numeroAula: h.numero_aula,
        historicoId: h.id,
        temFotos: db.fotos_aula.some((f) => f.historico_id === h.id),
      }))
    return {
      polo: { id: polo.id, nome: polo.nome, contato: polo.contato ?? null, ciclo: polo.ciclo_atual },
      alunos, materiais, chamadas,
    }
  },

  async solicitarContato(
    token: string, alunoId: string, alunoNome: string, motivo: string,
  ): Promise<{ ok: boolean }> {
    await sleep(200)
    const db = loadDB()
    const [poloId, tv] = token.split('.')
    const polo = db.polos.find((p) => p.id === poloId)
    if (!polo || polo.status !== 'ativo' || String(polo.token_version) !== tv) {
      throw new Error('Sessão expirada. Digite a senha novamente.')
    }
    const aluno = db.alunos.find((a) => a.id === alunoId && a.polo_id === polo.id)
    const nome = aluno?.nome ?? alunoNome
    // Se já existe um pedido pendente para o mesmo aluno, atualiza o motivo
    // e a data (em vez de duplicar) — o admin sempre vê o pedido mais recente.
    const existente = db.solicitacoes_contato.find(
      (s) => s.polo_id === polo.id && s.status === 'pendente' &&
        (aluno ? s.aluno_id === aluno.id : s.aluno_nome === nome),
    )
    if (existente) {
      existente.motivo = motivo || null
      existente.created_at = new Date().toISOString()
    } else {
      db.solicitacoes_contato.push({
        id: uuid(), polo_id: polo.id, aluno_id: aluno?.id ?? null,
        aluno_nome: nome, motivo: motivo || null, status: 'pendente', created_at: new Date().toISOString(),
      })
    }
    registrarLogProfessor(db, polo, {
      acao: 'contato', entidade: 'aluno', entidadeId: aluno?.id ?? null,
      descricao: `Solicitou o contato do responsável de "${nome}".`,
    })
    saveDB(db)
    return { ok: true }
  },

  // Sugere o cadastro de um aluno fora da lista (antes ou depois da chamada
  // existir). Vira pendência de aprovação no admin — não cria o aluno.
  async sugerirAluno(
    token: string, nome: string, historicoId?: string,
  ): Promise<{ ok: boolean }> {
    await sleep(200)
    const db = loadDB()
    const [poloId, tv] = token.split('.')
    const polo = db.polos.find((p) => p.id === poloId)
    if (!polo || polo.status !== 'ativo' || String(polo.token_version) !== tv) {
      throw new Error('Sessão expirada. Digite a senha novamente.')
    }
    const nomeTrim = (nome ?? '').trim()
    if (!nomeTrim) throw new Error('Informe o nome do aluno')
    const jaExiste = db.alunos_sugeridos.some(
      (s) => s.polo_id === polo.id && s.status === 'pendente' &&
        s.nome.trim().toLowerCase() === nomeTrim.toLowerCase(),
    )
    if (!jaExiste) {
      db.alunos_sugeridos.push({
        id: uuid(), polo_id: polo.id, historico_id: historicoId ?? null,
        nome: nomeTrim, status: 'pendente', created_at: new Date().toISOString(),
      })
      registrarLogProfessor(db, polo, {
        acao: 'sugestao', entidade: 'aluno',
        descricao: `Sugeriu o cadastro do aluno "${nomeTrim}".`,
      })
      saveDB(db)
    }
    return { ok: true }
  },

  // Retoma uma chamada "pendente de fotos" — usado ao selecionar de novo a
  // aula, inclusive depois de recarregar a página.
  async obterChamada(token: string, historicoId: string): Promise<ChamadaDetalhe> {
    await sleep(200)
    const db = loadDB()
    const [poloId, tv] = token.split('.')
    const polo = db.polos.find((p) => p.id === poloId)
    if (!polo || polo.status !== 'ativo' || String(polo.token_version) !== tv) {
      throw new Error('Sessão expirada. Digite a senha novamente.')
    }
    const hist = db.historico_aulas.find((h) => h.id === historicoId && h.polo_id === polo.id)
    if (!hist) throw new Error('Registro de aula não encontrado')
    const presencas = db.presencas
      .filter((p) => p.historico_id === hist.id)
      .map((p) => ({ alunoId: p.aluno_id, presente: p.presente }))
    return {
      historicoId: hist.id,
      numeroAula: hist.numero_aula,
      dataAula: hist.data_hora.slice(0, 10),
      professoresNomes: hist.professores_nomes,
      relatorio: hist.relatorio,
      presencas,
    }
  },

  // Salva a presença de UM aluno na hora (sem esperar um botão de "salvar
  // chamada" — cada toggle do professor já fica gravado). A chamada em si
  // já precisa existir — é criada no 1º toggle via salvarChamada.
  async atualizarPresenca(
    token: string, historicoId: string, alunoId: string, presente: boolean,
  ): Promise<{ ok: boolean }> {
    await sleep(200)
    const db = loadDB()
    const [poloId, tv] = token.split('.')
    const polo = db.polos.find((p) => p.id === poloId)
    if (!polo || polo.status !== 'ativo' || String(polo.token_version) !== tv) {
      throw new Error('Sessão expirada. Digite a senha novamente.')
    }
    const hist = db.historico_aulas.find((h) => h.id === historicoId && h.polo_id === polo.id)
    if (!hist) throw new Error('Registro de aula não encontrado')
    const aluno = db.alunos.find((a) => a.id === alunoId && a.polo_id === polo.id)
    if (!aluno) throw new Error('Aluno inválido')

    const existente = db.presencas.find((p) => p.historico_id === historicoId && p.aluno_id === alunoId)
    if (existente) existente.presente = presente
    else db.presencas.push({ id: uuid(), historico_id: historicoId, aluno_id: alunoId, aluno_nome: aluno.nome, presente })
    saveDB(db)
    return { ok: true }
  },

  async salvarChamada(
    token: string,
    dados: {
      numeroAula: number
      professoresNomes: string[]
      dataAula: string
      relatorio?: string
      presencas: { alunoId: string; presente: boolean }[]
      alunosExtras?: string[]
    },
    fotos: File[],
  ): Promise<{ historicoId: string; fotosErro: string[]; cicloConcluido: boolean }> {
    await sleep(500)
    const db = loadDB()
    const [poloId, tv] = token.split('.')
    const polo = db.polos.find((p) => p.id === poloId)
    if (!polo || polo.status !== 'ativo' || String(polo.token_version) !== tv) {
      throw new Error('Sessão expirada. Digite a senha novamente.')
    }
    const professores = (dados.professoresNomes ?? []).map((n) => n.trim()).filter(Boolean)
    if (!professores.length) throw new Error('Informe ao menos um professor')
    if (!dados.numeroAula || dados.numeroAula < 1 || dados.numeroAula > 18) {
      throw new Error('Aula inválida')
    }
    if (!dados.dataAula || !/^\d{4}-\d{2}-\d{2}$/.test(dados.dataAula)) {
      throw new Error('Informe a data da aula')
    }
    const jaDada = db.historico_aulas.some(
      (h) => h.polo_id === polo.id && h.ciclo === polo.ciclo_atual && h.numero_aula === dados.numeroAula,
    )
    if (jaDada) throw new Error('Esta aula já foi registrada neste ciclo. Escolha outra.')
    if (fotos.length > MAX_FOTOS) throw new Error(`Máximo de ${MAX_FOTOS} fotos`)
    for (const f of fotos) {
      if (!f.type.startsWith('image/')) throw new Error(`"${f.name}" não é uma imagem`)
      if (f.size > MAX_FOTO_BYTES) throw new Error(`"${f.name}" passa de 5 MB`)
    }

    const alunosPolo = db.alunos.filter((a) => a.polo_id === polo.id)
    const nomePorId = new Map(alunosPolo.map((a) => [a.id, a.nome]))
    const idsValidos = new Set(alunosPolo.map((a) => a.id))
    const presencas = dados.presencas.filter((p) => idsValidos.has(p.alunoId))
    if (!presencas.length) throw new Error('Alunos inválidos para este polo')

    const agora = new Date().toISOString()
    const cicloDaAula = polo.ciclo_atual
    const dataHora = new Date(`${dados.dataAula}T12:00:00`).toISOString()
    const historicoId = uuid()
    db.historico_aulas.push({
      id: historicoId,
      polo_id: polo.id,
      numero_aula: dados.numeroAula,
      ciclo: cicloDaAula,
      professor_nome: professores.join(', '),
      professores_nomes: professores,
      data_hora: dataHora,
      relatorio: dados.relatorio || null,
      criado_por: 'professor',
      created_at: agora,
    })
    for (const p of presencas) {
      db.presencas.push({
        id: uuid(), historico_id: historicoId, aluno_id: p.alunoId,
        aluno_nome: nomePorId.get(p.alunoId) ?? null, presente: p.presente,
      })
    }
    // Alunos fora da lista viram sugestão de cadastro (pendente)
    for (const nome of (dados.alunosExtras ?? []).map((n) => n.trim()).filter(Boolean)) {
      db.alunos_sugeridos.push({
        id: uuid(), polo_id: polo.id, historico_id: historicoId,
        nome, status: 'pendente', created_at: agora,
      })
    }
    for (const f of fotos) {
      db.fotos_aula.push({
        id: uuid(),
        historico_id: historicoId,
        polo_id: polo.id,
        nome_arquivo: f.name,
        arquivo_path: null,
        url_externa: await fotoParaUrl(f),
        created_at: agora,
      })
    }
    registrarLogProfessor(db, polo, {
      acao: 'chamada', entidade: 'chamada', entidadeId: historicoId,
      descricao: `Registrou a chamada da Aula ${dados.numeroAula} (Ciclo ${cicloDaAula}).`,
    })
    // Se o professor já enviou fotos junto, isso pode ter fechado o ciclo
    // (todas as 18 concluídas). Sem fotos, a aula fica pendente.
    const cicloConcluido = avancarCicloSeCompleto(db, polo)
    saveDB(db)
    return { historicoId, fotosErro: [], cicloConcluido }
  },

  async adicionarFotos(
    token: string,
    historicoId: string,
    fotos: File[],
  ): Promise<{ historicoId: string; fotosErro: string[]; cicloConcluido: boolean }> {
    await sleep(400)
    const db = loadDB()
    const [poloId, tv] = token.split('.')
    const polo = db.polos.find((p) => p.id === poloId)
    if (!polo || polo.status !== 'ativo' || String(polo.token_version) !== tv) {
      throw new Error('Sessão expirada. Digite a senha novamente.')
    }
    const hist = db.historico_aulas.find((h) => h.id === historicoId && h.polo_id === polo.id)
    if (!hist) throw new Error('Registro de aula não encontrado')
    const existentes = db.fotos_aula.filter((f) => f.historico_id === historicoId).length
    if (existentes + fotos.length > MAX_FOTOS) throw new Error(`Máximo de ${MAX_FOTOS} fotos por chamada`)
    for (const f of fotos) {
      if (!f.type.startsWith('image/')) throw new Error(`"${f.name}" não é uma imagem`)
      if (f.size > MAX_FOTO_BYTES) throw new Error(`"${f.name}" passa de 5 MB`)
    }
    const agora = new Date().toISOString()
    for (const f of fotos) {
      db.fotos_aula.push({
        id: uuid(), historico_id: historicoId, polo_id: polo.id,
        nome_arquivo: f.name, arquivo_path: null,
        url_externa: await fotoParaUrl(f), created_at: agora,
      })
    }
    registrarLogProfessor(db, polo, {
      acao: 'fotos', entidade: 'chamada', entidadeId: historicoId,
      descricao: `Enviou ${fotos.length} foto${fotos.length === 1 ? '' : 's'} da Aula ${hist.numero_aula} (Ciclo ${hist.ciclo}).`,
    })
    // Anexar fotos pode ter concluído a última aula pendente do ciclo.
    const cicloConcluido = avancarCicloSeCompleto(db, polo)
    saveDB(db)
    return { historicoId, fotosErro: [], cicloConcluido }
  },
}
