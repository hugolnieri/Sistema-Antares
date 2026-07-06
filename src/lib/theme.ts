// Tema claro/escuro. O estado vive no atributo data-theme do <html> e é
// persistido em localStorage. O index.html aplica antes do render (no-flash).
export type Tema = 'light' | 'dark'
const KEY = 'antares-theme'

export const getTema = (): Tema =>
  document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'

export function setTema(tema: Tema) {
  if (tema === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')
  try { localStorage.setItem(KEY, tema) } catch { /* modo privado */ }
}

export const alternarTema = (): Tema => {
  const proximo: Tema = getTema() === 'dark' ? 'light' : 'dark'
  setTema(proximo)
  return proximo
}
