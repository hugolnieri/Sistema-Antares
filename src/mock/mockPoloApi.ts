// Mock da Edge Function "polo" — área do professor no modo demonstração.
// Reproduz as mesmas regras do servidor: senha do polo, token com versão
// (trocar a senha derruba a sessão), fotos só imagem/5MB, alunos só do polo.

import { loadDB, saveDB, uuid } from './db'
import { pdfDemoUrl, storageUrl } from './mockClient'
import type { DadosPolo, PoloSessao } from '../lib/types'

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

export const mockPoloApi = {
  async info(slug: string): Promise<{ nome: string }> {
    await sleep(200)
    const polo = loadDB().polos.find((p) => p.slug === slug && p.status === 'ativo')
    if (!polo) throw new Error('Polo não encontrado')
    return { nome: polo.nome }
  },

  async login(slug: string, senha: string): Promise<PoloSessao> {
    await sleep(350)
    const polo = loadDB().polos.find((p) => p.slug === slug && p.status === 'ativo')
    if (!polo || !polo.senha || polo.senha !== senha) {
      throw new Error('Senha incorreta. Verifique com o administrativo.')
    }
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
    return { polo: { id: polo.id, nome: polo.nome, contato: polo.contato ?? null }, alunos, materiais }
  },

  async solicitarContato(token: string, alunoId: string, alunoNome: string): Promise<{ ok: boolean }> {
    await sleep(200)
    const db = loadDB()
    const [poloId, tv] = token.split('.')
    const polo = db.polos.find((p) => p.id === poloId)
    if (!polo || polo.status !== 'ativo' || String(polo.token_version) !== tv) {
      throw new Error('Sessão expirada. Digite a senha novamente.')
    }
    const aluno = db.alunos.find((a) => a.id === alunoId && a.polo_id === polo.id)
    const nome = aluno?.nome ?? alunoNome
    const jaExiste = db.solicitacoes_contato.some(
      (s) => s.polo_id === polo.id && s.status === 'pendente' &&
        (aluno ? s.aluno_id === aluno.id : s.aluno_nome === nome),
    )
    if (!jaExiste) {
      db.solicitacoes_contato.push({
        id: uuid(), polo_id: polo.id, aluno_id: aluno?.id ?? null,
        aluno_nome: nome, status: 'pendente', created_at: new Date().toISOString(),
      })
      saveDB(db)
    }
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
  ): Promise<{ historicoId: string; fotosErro: string[] }> {
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
    if (fotos.length > MAX_FOTOS) throw new Error(`Máximo de ${MAX_FOTOS} fotos`)
    for (const f of fotos) {
      if (!f.type.startsWith('image/')) throw new Error(`"${f.name}" não é uma imagem`)
      if (f.size > MAX_FOTO_BYTES) throw new Error(`"${f.name}" passa de 5 MB`)
    }

    const idsValidos = new Set(db.alunos.filter((a) => a.polo_id === polo.id).map((a) => a.id))
    const presencas = dados.presencas.filter((p) => idsValidos.has(p.alunoId))
    if (!presencas.length) throw new Error('Alunos inválidos para este polo')

    const agora = new Date().toISOString()
    const dataHora = new Date(`${dados.dataAula}T12:00:00`).toISOString()
    const historicoId = uuid()
    db.historico_aulas.push({
      id: historicoId,
      polo_id: polo.id,
      numero_aula: dados.numeroAula,
      professor_nome: professores.join(', '),
      professores_nomes: professores,
      data_hora: dataHora,
      relatorio: dados.relatorio || null,
      criado_por: 'professor',
      created_at: agora,
    })
    for (const p of presencas) {
      db.presencas.push({
        id: uuid(), historico_id: historicoId, aluno_id: p.alunoId, presente: p.presente,
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
    saveDB(db)
    return { historicoId, fotosErro: [] }
  },

  async adicionarFotos(
    token: string,
    historicoId: string,
    fotos: File[],
  ): Promise<{ historicoId: string; fotosErro: string[] }> {
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
    saveDB(db)
    return { historicoId, fotosErro: [] }
  },
}
