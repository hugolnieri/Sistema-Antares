import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { AdminShell, RequireAuth } from './components/AdminShell'
import { MOCK } from './lib/supabase'

import Login from './pages/admin/Login'
import Dashboard from './pages/admin/Dashboard'
import Polos from './pages/admin/Polos'
import Professores from './pages/admin/Professores'
import Alunos from './pages/admin/Alunos'
import Responsaveis from './pages/admin/Responsaveis'
import Cronograma from './pages/admin/Cronograma'
import Materiais from './pages/admin/Materiais'
import Historico from './pages/admin/Historico'
import HistoricoDetalhe from './pages/admin/HistoricoDetalhe'
import Logs from './pages/admin/Logs'

import PoloLogin from './pages/professor/PoloLogin'
import PoloLayout from './pages/professor/PoloLayout'
import Chamada from './pages/professor/Chamada'
import MateriaisProfessor from './pages/professor/MateriaisProfessor'

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          {/* Área administrativa */}
          <Route path="/admin/login" element={<Login />} />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <AdminShell />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="polos" element={<Polos />} />
            <Route path="professores" element={<Professores />} />
            <Route path="alunos" element={<Alunos />} />
            <Route path="responsaveis" element={<Responsaveis />} />
            <Route path="cronograma" element={<Cronograma />} />
            <Route path="materiais" element={<Materiais />} />
            <Route path="historico" element={<Historico />} />
            <Route path="historico/:id" element={<HistoricoDetalhe />} />
            <Route path="logs" element={<Logs />} />
          </Route>

          {/* Área do professor (link direto do polo) */}
          <Route path="/professor/polo/:slug" element={<PoloLogin />} />
          <Route path="/professor/polo/:slug" element={<PoloLayout />}>
            <Route path="chamada" element={<Chamada />} />
            <Route path="materiais" element={<MateriaisProfessor />} />
          </Route>

          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>

        {MOCK && (
          <div
            className="fixed bottom-2 left-2 z-[95] rounded-full border border-[var(--c-amber-fg)]/30 bg-[var(--c-amber-bg)] px-3 py-1 text-xs font-semibold text-[var(--c-amber-fg)] shadow"
            title="Dados fictícios em localStorage. Para zerar: antaresResetDemo() no console. Preencha o .env para usar o Supabase real."
          >
            🧪 Modo demonstração — dados fictícios
          </div>
        )}
      </ToastProvider>
    </BrowserRouter>
  )
}
