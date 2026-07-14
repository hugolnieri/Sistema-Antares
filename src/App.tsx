import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { AdminShell, RequireAuth } from './components/AdminShell'
import { PermissoesProvider, RequireMenu } from './lib/permissoes'
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
import Configuracoes from './pages/admin/Configuracoes'

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
                <PermissoesProvider>
                  <AdminShell />
                </PermissoesProvider>
              </RequireAuth>
            }
          >
            <Route index element={<RequireMenu menu="dashboard"><Dashboard /></RequireMenu>} />
            <Route path="polos" element={<RequireMenu menu="polos"><Polos /></RequireMenu>} />
            <Route path="professores" element={<RequireMenu menu="professores"><Professores /></RequireMenu>} />
            <Route path="alunos" element={<RequireMenu menu="alunos"><Alunos /></RequireMenu>} />
            <Route path="responsaveis" element={<RequireMenu menu="responsaveis"><Responsaveis /></RequireMenu>} />
            <Route path="cronograma" element={<RequireMenu menu="cronograma"><Cronograma /></RequireMenu>} />
            <Route path="materiais" element={<RequireMenu menu="materiais"><Materiais /></RequireMenu>} />
            <Route path="historico" element={<RequireMenu menu="historico"><Historico /></RequireMenu>} />
            <Route path="historico/:id" element={<RequireMenu menu="historico"><HistoricoDetalhe /></RequireMenu>} />
            <Route path="logs" element={<RequireMenu menu="logs"><Logs /></RequireMenu>} />
            <Route path="configuracoes" element={<RequireMenu menu="configuracoes"><Configuracoes /></RequireMenu>} />
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
