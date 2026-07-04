// Geocodificação gratuita via Nominatim/OpenStreetMap, usando os campos
// estruturados do endereço (rua, cidade, UF, CEP) em vez de texto livre —
// é o que dá precisão à busca automática de coordenadas do polo.

export interface EnderecoParaGeocodificar {
  logradouro?: string | null
  numero?: string | null
  cidade?: string | null
  estado?: string | null
  cep?: string | null
}

// Mínimo necessário para uma busca ter chance de dar certo.
export const enderecoBuscavel = (e: EnderecoParaGeocodificar): boolean =>
  !!(e.logradouro?.trim() && e.cidade?.trim() && e.estado?.trim())

export async function geocodificarEndereco(
  e: EnderecoParaGeocodificar,
  signal?: AbortSignal,
): Promise<{ lat: string; lon: string } | null> {
  if (!enderecoBuscavel(e)) return null

  const street = [e.numero, e.logradouro].filter(Boolean).join(' ')
  const params = new URLSearchParams({
    format: 'json',
    limit: '1',
    countrycodes: 'br',
    street,
    city: e.cidade!.trim(),
    state: e.estado!.trim(),
  })
  if (e.cep?.trim()) params.set('postalcode', e.cep.trim())

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal })
  if (!res.ok) return null
  const data = await res.json()
  return Array.isArray(data) && data.length ? { lat: data[0].lat, lon: data[0].lon } : null
}
