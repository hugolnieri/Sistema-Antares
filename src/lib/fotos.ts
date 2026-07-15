// Resolve as URLs exibíveis das fotos de aula, cobrindo os três casos:
//   1. url_externa preenchida  -> uso direto (modo demonstração usa data URLs)
//   2. arquivo_path "sp:<id>"  -> foto no SharePoint: pede uma URL temporária
//                                 à Edge Function "fotos" (só admin autorizado)
//   3. arquivo_path = caminho  -> foto no bucket privado: URL assinada
//
// As fotos do SharePoint não são públicas (compartilhamento anônimo desligado
// no tenant), por isso a URL vem da função e expira em ~1h.
import { supabase } from './supabase'

export interface FotoRef {
  id: string
  arquivo_path: string | null
  url_externa: string | null
}

export async function resolverUrlsFotos(
  fotos: FotoRef[],
): Promise<Record<string, string | null>> {
  const urls: Record<string, string | null> = {}

  // 1) SharePoint: resolvidas em lote pela Edge Function "fotos".
  const idsSharePoint = fotos
    .filter((f) => !f.url_externa && (f.arquivo_path ?? '').startsWith('sp:'))
    .map((f) => f.id)
  if (idsSharePoint.length) {
    const { data, error } = await supabase.functions.invoke('fotos', {
      body: { action: 'urls', fotoIds: idsSharePoint },
    })
    const mapa = (!error && (data as any)?.urls) || {}
    for (const id of idsSharePoint) urls[id] = mapa[id] ?? null
  }

  // 2) url_externa direta e 3) bucket privado (URL assinada).
  await Promise.all(
    fotos.map(async (f) => {
      if (f.id in urls) return // já resolvida (SharePoint)
      if (f.url_externa) { urls[f.id] = f.url_externa; return }
      if (!f.arquivo_path || f.arquivo_path.startsWith('sp:')) { urls[f.id] = null; return }
      const { data } = await supabase.storage
        .from('fotos-aulas').createSignedUrl(f.arquivo_path, 3600)
      urls[f.id] = data?.signedUrl ?? null
    }),
  )

  return urls
}
