// Cliente da Edge Function "polo" — única porta de acesso da área do professor.
// No modo demonstração, delega para o mock (mesma interface).
import { SUPABASE_URL, SUPABASE_ANON_KEY, MOCK } from './supabase'
import { mockPoloApi } from '../mock/mockPoloApi'
import type { DadosPolo, PoloSessao } from './types'

const FN_URL = `${SUPABASE_URL}/functions/v1/polo`
const HEADERS = {
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  apikey: SUPABASE_ANON_KEY,
}

async function post(body: unknown): Promise<any> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Erro de comunicação com o servidor')
  return data
}

const realPoloApi = {
  info: (slug: string) => post({ action: 'info', slug }) as Promise<{ nome: string }>,

  login: (slug: string, senha: string) =>
    post({ action: 'login', slug, senha }) as Promise<PoloSessao>,

  dados: (token: string) => post({ action: 'dados', token }) as Promise<DadosPolo>,

  solicitarContato: (token: string, alunoId: string, alunoNome: string) =>
    post({ action: 'solicitarContato', token, alunoId, alunoNome }) as Promise<{ ok: boolean }>,

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
    const form = new FormData()
    form.append('token', token)
    form.append('dados', JSON.stringify(dados))
    for (const foto of fotos) form.append('fotos', foto)
    const res = await fetch(FN_URL, { method: 'POST', headers: HEADERS, body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar a chamada')
    return data
  },

  // Anexa fotos a uma chamada já salva (a foto pode ficar para o final)
  async adicionarFotos(
    token: string,
    historicoId: string,
    fotos: File[],
  ): Promise<{ historicoId: string; fotosErro: string[] }> {
    const form = new FormData()
    form.append('token', token)
    form.append('historicoId', historicoId)
    for (const foto of fotos) form.append('fotos', foto)
    const res = await fetch(FN_URL, { method: 'POST', headers: HEADERS, body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? 'Erro ao enviar as fotos')
    return data
  },
}

export const poloApi = MOCK ? mockPoloApi : realPoloApi

// ---- Sessão do polo (sessionStorage: fecha o navegador, acabou) ----

const sessKey = (slug: string) => `antares-polo:${slug}`

export const poloSessao = {
  get(slug: string): PoloSessao | null {
    try {
      const raw = sessionStorage.getItem(sessKey(slug))
      return raw ? (JSON.parse(raw) as PoloSessao) : null
    } catch {
      return null
    }
  },
  set(slug: string, sessao: PoloSessao) {
    sessionStorage.setItem(sessKey(slug), JSON.stringify(sessao))
  },
  clear(slug: string) {
    sessionStorage.removeItem(sessKey(slug))
  },
}
