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
