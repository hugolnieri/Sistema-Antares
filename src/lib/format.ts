const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g')

export const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  return d.toLocaleDateString('pt-BR')
}

export const fmtDataHora = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
  })}`
}

export const gerarSlug = (nome: string): string =>
  nome
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

export const linkDoPolo = (slug: string): string =>
  `${window.location.origin}/professor/polo/${slug}`

export const linkWhatsApp = (telefone: string): string =>
  `https://wa.me/55${telefone.replace(/\D/g, '')}`

interface EnderecoEstruturado {
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
  cep?: string | null
}

// Compõe o endereço completo a partir dos campos estruturados
// (Logradouro, Número, Bairro, Cidade/UF, CEP) para exibição.
export const enderecoCompleto = (p: EnderecoEstruturado): string => {
  const rua = [p.logradouro, p.numero].filter(Boolean).join(', ')
  const linha1 = [rua, p.complemento].filter(Boolean).join(' - ')
  const cidadeUf = [p.cidade, p.estado].filter(Boolean).join('/')
  const linha2 = [p.bairro, cidadeUf].filter(Boolean).join(', ')
  const cep = p.cep ? `CEP ${p.cep}` : ''
  return [linha1, linha2, cep].filter(Boolean).join(' — ')
}
