// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTenant } from './hooks/useTenant';
import ProtectedRoute from './components/guards/ProtectedRoute';
import RoleGuard from './components/guards/RoleGuard';

// Layouts & Pages
import { MainLayout } from './components/layout/MainLayout';
import LoginPage from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { UsersPage } from './pages/Users';

// Placeholders
const Machines = () => <div className="p-8">My Machines Fleet Content Here</div>;
const Chat = () => <div className="p-8">AI Chat Workspace Content Here</div>;
const NotFound = () => <div className="p-8 text-red-600">Tenant Not Found</div>;

function App() {
  const { tenant, status } = useTenant();

  if (status === 'LOADING') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#fafafa]">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (status === 'NOT_FOUND') {
    return <NotFound />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage tenant={tenant} />} />

        {/* Protected Application Shell */}
        <Route element={<ProtectedRoute />}>
          
          {/* MainLayout wraps all these routes to provide the persistent Navbar */}
          <Route element={<MainLayout />}>
            
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            
            {/* The New Dashboard Hub */}
            <Route path="/dashboard" element={<DashboardPage />} />

            {/* Admin Tools */}
            <Route path="/users" element={
              <RoleGuard allowedRoles={['full']}>
                <UsersPage />
              </RoleGuard>
            } />

            {/* Operational Tools */}
            <Route path="/machines" element={
              <RoleGuard allowedRoles={['full', 'technician', 'commercial']}>
                <Machines />
              </RoleGuard>
            } />

            <Route path="/chat" element={
              <RoleGuard allowedRoles={['full', 'technician', 'commercial']}>
                <Chat />
              </RoleGuard>
            } />

          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;