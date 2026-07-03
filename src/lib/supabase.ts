import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createMockSupabase } from '../mock/mockClient'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// MODO DEMONSTRAÇÃO: liga automaticamente quando o .env não está configurado
// (ou forçando com VITE_MOCK=1). Usa dados fictícios em localStorage — nenhuma
// página muda quando o Supabase real for vinculado.
export const MOCK =
  import.meta.env.VITE_MOCK === '1' ||
  !SUPABASE_URL ||
  !SUPABASE_ANON_KEY ||
  SUPABASE_URL.includes('SEU-PROJETO')

if (MOCK) {
  console.info(
    '🧪 Antares em MODO DEMONSTRAÇÃO (dados fictícios). ' +
    'Preencha o .env com o Supabase real para sair da demo. ' +
    'Para zerar os dados de exemplo: antaresResetDemo()',
  )
}

export const supabase: SupabaseClient = MOCK
  ? (createMockSupabase() as unknown as SupabaseClient)
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
