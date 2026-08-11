import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTenant } from './hooks/useTenant';
import ProtectedRoute from './components/guards/ProtectedRoute';
import RoleGuard from './components/guards/RoleGuard';

// Pages
import LoginPage from './pages/Login';
//import UsersPage from './pages/Users';

// Placeholders for future phases
const Machines = () => <div className="p-8">My Machines Fleet</div>;
const Chat = () => <div className="p-8">AI Chat Workspace</div>;
const NotFound = () => <div className="p-8 text-red-600">Tenant Not Found</div>;

function App() {
  const { tenant, status } = useTenant();

  if (status === 'LOADING') {
    // Luxury Loading State while resolving tenant
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
        {/* Public Login Route injected with dynamic Tenant data */}
        <Route path="/login" element={<LoginPage tenant={tenant} />} />

        {/* Protected Application Shell */}
        <Route element={<ProtectedRoute />}>
          
          <Route path="/" element={<Navigate to="/machines" replace />} />

          {/* Admin / Full Access */}
          <Route path="/users" element={
            <RoleGuard allowedRoles={['full']}>
              {/*<UsersPage />*/}User dash
            </RoleGuard>
          } />

          {/* Operational & Commercial Access */}
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
      </Routes>
    </BrowserRouter>
  );
}

export default App;