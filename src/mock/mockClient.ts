// Mock do client Supabase para o MODO DEMONSTRAÇÃO.
// Implementa exatamente os encadeamentos usados pelas páginas:
// from().select().eq().gte().order().limit().single(), insert().select().single(),
// update().eq(), delete().eq(), rpc(), auth.* e storage.*.
// Nenhuma página precisa saber se está falando com o mock ou com o Supabase real.

import { loadDB, saveDB, resetDB, uuid, type MockDB } from './db'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ---------------- Embeds (relações aninhadas do select) ---------------- */

const nomeDe = (arr: any[], id: string | null) => {
  const x = arr.find((a) => a.id === id)
  return x ? { nome: x.nome } : null
}

function embed(db: MockDB, table: string, row: any, sel: string): any {
  const r = { ...row }
  if (table === 'polos') delete r.senha // nunca expor a senha, nem no mock

  if (table === 'professores' && sel.includes('professor_polos')) {
    r.professor_polos = db.professor_polos
      .filter((pp) => pp.professor_id === row.id)
      .map((pp) => ({
        polo_id: pp.polo_id,
        ...(sel.includes('polos(') ? { polos: nomeDe(db.polos, pp.polo_id) } : {}),
      }))
  }

  if (table === 'alunos') {
    if (sel.includes('polos(')) r.polos = nomeDe(db.polos, row.polo_id)
    if (sel.includes('aluno_responsaveis')) {
      r.aluno_responsaveis = db.aluno_responsaveis
        .filter((ar) => ar.aluno_id === row.id)
        .map((ar) => ({
          aluno_id: ar.aluno_id,
          responsavel_id: ar.responsavel_id,
          parentesco: ar.parentesco,
          ...(sel.includes('responsaveis(')
            ? { responsaveis: db.responsaveis.find((x) => x.id === ar.responsavel_id) ?? null }
            : {}),
        }))
    }
  }

  if (table === 'responsaveis' && sel.includes('aluno_responsaveis')) {
    r.aluno_responsaveis = db.aluno_responsaveis
      .filter((ar) => ar.responsavel_id === row.id)
      .map((ar) => ({
        aluno_id: ar.aluno_id,
        parentesco: ar.parentesco,
        ...(sel.includes('alunos(') ? { alunos: nomeDe(db.alunos, ar.aluno_id) } : {}),
      }))
  }

  if (table === 'cronograma') {
    if (sel.includes('polos(')) r.polos = nomeDe(db.polos, row.polo_id)
    if (sel.includes('professores(')) r.professores = nomeDe(db.professores, row.professor_id)
  }

  if (table === 'historico_aulas') {
    if (sel.includes('polos(')) r.polos = nomeDe(db.polos, row.polo_id)
    if (sel.includes('presencas')) {
      r.presencas = db.presencas
        .filter((p) => p.historico_id === row.id)
        .map((p) => ({
          ...p,
          // Nome vem do aluno atual; se o aluno foi excluído, usa o snapshot.
          ...(sel.includes('alunos(')
            ? { alunos: nomeDe(db.alunos, p.aluno_id) ?? (p.aluno_nome ? { nome: p.aluno_nome } : null) }
            : {}),
        }))
    }
    if (sel.includes('fotos_aula')) {
      r.fotos_aula = db.fotos_aula.filter((f) => f.historico_id === row.id)
    }
  }

  if (table === 'fotos_aula' && sel.includes('historico_aulas')) {
    const h = db.historico_aulas.find((x) => x.id === row.historico_id)
    r.historico_aulas = h
      ? {
          numero_aula: h.numero_aula,
          ciclo: h.ciclo,
          data_hora: h.data_hora,
          professor_nome: h.professor_nome,
          ...(sel.includes('polos(') ? { polos: nomeDe(db.polos, h.polo_id) } : {}),
        }
      : null
  }

  if (table === 'alunos_sugeridos' && sel.includes('polos(')) {
    r.polos = nomeDe(db.polos, row.polo_id)
  }

  if (table === 'solicitacoes_contato' && sel.includes('polos(')) {
    r.polos = nomeDe(db.polos, row.polo_id)
  }

  if (table === 'presencas' && sel.includes('historico_aulas')) {
    const h = db.historico_aulas.find((x) => x.id === row.historico_id)
    r.historico_aulas = h
      ? {
          numero_aula: h.numero_aula,
          data_hora: h.data_hora,
          ...(sel.includes('polos(') ? { polos: nomeDe(db.polos, h.polo_id) } : {}),
        }
      : null
  }

  return r
}

/* ---------------- Exclusão em cascata ---------------- */

// Reproduz o comportamento das foreign keys do schema ao excluir um registro.
// Regra especial: excluir um ALUNO preserva as presenças (histórico) — só
// desvincula o aluno_id; o aluno_nome já gravado mantém o nome no histórico.
function cascadeDelete(db: MockDB, table: keyof MockDB, excluidos: any[]) {
  const ids = new Set(excluidos.map((r) => r.id))
  if (!ids.size) return

  if (table === 'polos') {
    db.professor_polos = db.professor_polos.filter((pp) => !ids.has(pp.polo_id))
    for (const a of db.alunos) if (ids.has(a.polo_id)) a.polo_id = null // on delete set null
    db.cronograma = db.cronograma.filter((c) => !ids.has(c.polo_id))
    const histIds = new Set(
      db.historico_aulas.filter((h) => ids.has(h.polo_id)).map((h) => h.id),
    )
    db.historico_aulas = db.historico_aulas.filter((h) => !ids.has(h.polo_id))
    db.presencas = db.presencas.filter((p) => !histIds.has(p.historico_id))
    db.fotos_aula = db.fotos_aula.filter((f) => !ids.has(f.polo_id))
    db.alunos_sugeridos = db.alunos_sugeridos.filter((s) => !ids.has(s.polo_id))
    db.solicitacoes_contato = db.solicitacoes_contato.filter((s) => !ids.has(s.polo_id))
  }

  if (table === 'professores') {
    db.professor_polos = db.professor_polos.filter((pp) => !ids.has(pp.professor_id))
    for (const c of db.cronograma) if (ids.has(c.professor_id)) c.professor_id = null
    // historico_aulas guarda o nome do professor como texto -> preservado.
  }

  if (table === 'alunos') {
    db.aluno_responsaveis = db.aluno_responsaveis.filter((ar) => !ids.has(ar.aluno_id))
    // Presenças PRESERVADAS: mantém o registro do que o aluno frequentou.
    for (const p of db.presencas) if (ids.has(p.aluno_id)) p.aluno_id = null
    for (const s of db.solicitacoes_contato) if (ids.has(s.aluno_id)) s.aluno_id = null
  }

  if (table === 'responsaveis') {
    db.aluno_responsaveis = db.aluno_responsaveis.filter((ar) => !ids.has(ar.responsavel_id))
  }
}

/* ---------------- Query builder ---------------- */

type Filtro = { op: 'eq' | 'gte' | 'lte'; col: string; val: any }
type Modo = 'select' | 'insert' | 'update' | 'delete'

class MockQuery implements PromiseLike<any> {
  private modo: Modo = 'select'
  private payload: any = null
  private sel = '*'
  private filtros: Filtro[] = []
  private ordem: { col: string; asc: boolean } | null = null
  private limite: number | null = null
  private unico = false
  private head = false

  constructor(private table: keyof MockDB) {}

  select(cols = '*', opts?: { count?: string; head?: boolean }) {
    if (this.modo === 'select') this.sel = cols
    if (opts?.head) this.head = true
    return this
  }
  eq(col: string, val: any) { this.filtros.push({ op: 'eq', col, val }); return this }
  gte(col: string, val: any) { this.filtros.push({ op: 'gte', col, val }); return this }
  lte(col: string, val: any) { this.filtros.push({ op: 'lte', col, val }); return this }
  order(col: string, opts?: { ascending?: boolean }) {
    this.ordem = { col, asc: opts?.ascending !== false }; return this
  }
  limit(n: number) { this.limite = n; return this }
  single() { this.unico = true; return this }
  insert(p: any) { this.modo = 'insert'; this.payload = p; return this }
  update(p: any) { this.modo = 'update'; this.payload = p; return this }
  delete() { this.modo = 'delete'; return this }

  then<T1 = any, T2 = never>(
    onFulfilled?: ((v: any) => T1 | PromiseLike<T1>) | null,
    onRejected?: ((e: any) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return this.exec().then(onFulfilled, onRejected)
  }

  private aplica(rows: any[]) {
    return rows.filter((r) =>
      this.filtros.every((f) => {
        if (f.op === 'eq') return r[f.col] === f.val
        if (f.op === 'gte') return String(r[f.col] ?? '') >= String(f.val)
        return String(r[f.col] ?? '') <= String(f.val) // lte
      }))
  }

  private async exec(): Promise<any> {
    await sleep(180) // simula rede para os estados de loading aparecerem
    const db = loadDB()
    const tabela = db[this.table] as any[]

    if (this.modo === 'insert') {
      const linhas = (Array.isArray(this.payload) ? this.payload : [this.payload])
        .map((p: any) => ({ id: uuid(), created_at: new Date().toISOString(), ...p }))
      if (this.table === 'polos') {
        for (const l of linhas) {
          if (tabela.some((x) => x.slug === l.slug)) return { data: null, error: { code: '23505' } }
          l.token_version = l.token_version ?? 1
          l.senha = l.senha ?? null
        }
      }
      tabela.push(...linhas)
      saveDB(db)
      return { data: this.unico ? linhas[0] : linhas, error: null }
    }

    if (this.modo === 'update') {
      const alvo = this.aplica(tabela)
      if (this.table === 'polos' && this.payload.slug !== undefined) {
        const ids = new Set(alvo.map((x) => x.id))
        if (tabela.some((x) => !ids.has(x.id) && x.slug === this.payload.slug)) {
          return { data: null, error: { code: '23505' } }
        }
      }
      for (const r of alvo) Object.assign(r, this.payload)
      saveDB(db)
      return { data: null, error: null }
    }

    if (this.modo === 'delete') {
      const excluidos = this.aplica(tabela)
      const remover = new Set(excluidos)
      ;(db[this.table] as any[]) = tabela.filter((r) => !remover.has(r))
      cascadeDelete(db, this.table, excluidos)
      saveDB(db)
      return { data: null, error: null }
    }

    // select
    let rows = this.aplica(tabela)
    if (this.head) return { data: null, count: rows.length, error: null }
    if (this.ordem) {
      const { col, asc } = this.ordem
      rows = [...rows].sort((a, b) => {
        const va = a[col]; const vb = b[col]
        const cmp = typeof va === 'string'
          ? String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR')
          : (va < vb ? -1 : va > vb ? 1 : 0)
        return asc ? cmp : -cmp
      })
    }
    if (this.limite !== null) rows = rows.slice(0, this.limite)
    const data = rows.map((r) => embed(db, this.table, r, this.sel))
    if (this.unico) {
      return data.length
        ? { data: data[0], error: null }
        : { data: null, error: { message: 'Nenhum registro encontrado' } }
    }
    return { data, error: null, count: data.length }
  }
}

/* ---------------- Auth ---------------- */

const AUTH_KEY = 'antares-mock-auth'
type AuthCallback = (event: string, session: any) => void
const listeners: AuthCallback[] = []

const sessaoAtual = () => {
  const email = localStorage.getItem(AUTH_KEY)
  return email ? { user: { email } } : null
}

const auth = {
  async getSession() { return { data: { session: sessaoAtual() } } },
  async getUser() { return { data: { user: sessaoAtual()?.user ?? null } } },
  onAuthStateChange(cb: AuthCallback) {
    listeners.push(cb)
    return {
      data: {
        subscription: {
          unsubscribe() {
            const i = listeners.indexOf(cb)
            if (i >= 0) listeners.splice(i, 1)
          },
        },
      },
    }
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    await sleep(300)
    if (!email || !password) return { data: { session: null }, error: { message: 'Credenciais inválidas' } }
    localStorage.setItem(AUTH_KEY, email)
    const s = sessaoAtual()
    listeners.forEach((cb) => cb('SIGNED_IN', s))
    return { data: { session: s }, error: null }
  },
  async signOut() {
    localStorage.removeItem(AUTH_KEY)
    listeners.forEach((cb) => cb('SIGNED_OUT', null))
    return { error: null }
  },
  // Troca de senha do próprio usuário — na demo só simula o sucesso.
  async updateUser(_attrs: { password?: string }) {
    await sleep(300)
    return { data: { user: sessaoAtual()?.user ?? null }, error: null }
  },
}

/* ---------------- Storage ---------------- */

const arquivos = new Map<string, string>()
const pdfCache = new Map<string, string>()

// PDF mínimo gerado em memória para os materiais de demonstração
export function pdfDemoUrl(titulo: string): string {
  const cached = pdfCache.get(titulo)
  if (cached) return cached
  const texto = titulo.replace(/[()\\]/g, ' ')
  const corpo = `BT /F1 22 Tf 72 700 Td (Antares - Material de demonstracao) Tj ET\n` +
    `BT /F1 16 Tf 72 660 Td (${texto}) Tj ET`
  const pdf = `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources <</Font <</F1 4 0 R>>>> /Contents 5 0 R>> endobj
4 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
5 0 obj <</Length ${corpo.length}>> stream
${corpo}
endstream
endobj
trailer <</Root 1 0 R>>
%%EOF`
  const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }))
  pdfCache.set(titulo, url)
  return url
}

const storage = {
  from(bucket: string) {
    return {
      async upload(path: string, file: File | Blob) {
        await sleep(250)
        arquivos.set(`${bucket}/${path}`, URL.createObjectURL(file))
        return { data: { path }, error: null }
      },
      async createSignedUrl(path: string, _ttl: number) {
        await sleep(80)
        const url = arquivos.get(`${bucket}/${path}`) ?? pdfDemoUrl(path)
        return { data: { signedUrl: url }, error: null }
      },
    }
  },
}

export function storageUrl(bucket: string, path: string): string | null {
  return arquivos.get(`${bucket}/${path}`) ?? null
}

/* ---------------- RPC ---------------- */

async function rpc(nome: string, params: any) {
  await sleep(200)
  const db = loadDB()
  // Permissões do usuário logado — espelha a RPC real. Na demonstração
  // qualquer e-mail entra (permitido: true); restrições valem se o e-mail
  // estiver em permissoes_usuarios.
  if (nome === 'minha_permissao') {
    const email = (localStorage.getItem(AUTH_KEY) ?? '').toLowerCase()
    const row = db.permissoes_usuarios.find((u) => String(u.email).toLowerCase() === email)
    return {
      data: { permitido: !!email, master: false, permissoes: row?.permissoes ?? null },
      error: null,
    }
  }
  if (nome === 'set_polo_password') {
    const polo = db.polos.find((p) => p.id === params.p_polo_id)
    if (!polo) return { data: null, error: { message: 'Polo não encontrado' } }
    if (String(params.p_password ?? '').length < 4) {
      return { data: null, error: { message: 'A senha deve ter pelo menos 4 caracteres' } }
    }
    polo.senha = params.p_password
    polo.token_version += 1 // invalida sessões antigas, igual ao real
    saveDB(db)
    return { data: null, error: null }
  }
  return { data: null, error: { message: `RPC desconhecida: ${nome}` } }
}

/* ---------------- Edge Functions ---------------- */

// Na demonstração as fotos usam url_externa (data URLs), então nenhuma passa
// pela função "fotos". Mantemos a interface para o front não quebrar.
const functions = {
  async invoke(nome: string, _opts?: { body?: any }) {
    await sleep(100)
    if (nome === 'fotos') return { data: { urls: {} }, error: null }
    if (nome === 'admin-usuarios') return { data: { ok: true }, error: null }
    return { data: null, error: { message: `Função desconhecida: ${nome}` } }
  },
}

/* ---------------- Client ---------------- */

export function createMockSupabase() {
  if (typeof window !== 'undefined') {
    ;(window as any).antaresResetDemo = () => { resetDB(); location.reload() }
  }
  return {
    from: (table: string) => new MockQuery(table as keyof MockDB),
    rpc,
    auth,
    storage,
    functions,
  }
}
