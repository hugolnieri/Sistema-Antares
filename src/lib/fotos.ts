// Resolve as URLs exibíveis das fotos de aula, cobrindo os três casos:
//   1. url_externa preenchida  -> uso direto (modo demonstração usa data URLs)
//   2. arquivo_path "sp:<id>"  -> foto no SharePoint: pede à Edge Function
//                                 "fotos" a URL temporária + a miniatura
//   3. arquivo_path = caminho  -> fallback no bucket privado: URL assinada
//
// `thumb` é a versão reduzida servida pelo próprio SharePoint. Usar a miniatura
// nas grades (galeria, histórico) evita baixar o original de vários MB só para
// preencher uma célula de 180px. Onde não existe miniatura, cai para a original.
import { supabase } from './supabase'

export interface FotoRef {
  id: string
  arquivo_path: string | null
  url_externa: string | null
}

export interface FotoUrls {
  url: string | null
  thumb: string | null
}

export async function resolverUrlsFotos(
  fotos: FotoRef[],
): Promise<Record<string, FotoUrls>> {
  const urls: Record<string, FotoUrls> = {}

  // 1) SharePoint: resolvidas em lote pela Edge Function "fotos".
  const idsSharePoint = fotos
    .filter((f) => !f.url_externa && (f.arquivo_path ?? '').startsWith('sp:'))
    .map((f) => f.id)
  if (idsSharePoint.length) {
    const { data, error } = await supabase.functions.invoke('fotos', {
      body: { action: 'urls', fotoIds: idsSharePoint },
    })
    const mapa = (!error && (data as any)?.urls) || {}
    for (const id of idsSharePoint) {
      urls[id] = mapa[id] ?? { url: null, thumb: null }
    }
  }

  // 2) url_externa direta (demonstração).
  const restantes = fotos.filter((f) => !(f.id in urls))
  for (const f of restantes) {
    if (f.url_externa) urls[f.id] = { url: f.url_externa, thumb: f.url_externa }
  }

  // 3) Fallback no bucket: uma única chamada em lote para todos os caminhos.
  const noBucket = restantes.filter(
    (f) => !f.url_externa && f.arquivo_path && !f.arquivo_path.startsWith('sp:'),
  )
  if (noBucket.length) {
    const { data } = await supabase.storage
      .from('fotos-aulas')
      .createSignedUrls(noBucket.map((f) => f.arquivo_path as string), 3600)
    const porCaminho = new Map(
      (data ?? []).map((d: any) => [d.path as string, d.signedUrl as string | null]),
    )
    for (const f of noBucket) {
      const assinada = porCaminho.get(f.arquivo_path as string) ?? null
      urls[f.id] = { url: assinada, thumb: assinada }
    }
  }

  // Qualquer foto sem arquivo algum.
  for (const f of fotos) {
    if (!(f.id in urls)) urls[f.id] = { url: null, thumb: null }
  }

  return urls
}
