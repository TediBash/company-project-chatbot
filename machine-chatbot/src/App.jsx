// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTenant } from './hooks/useTenant';
import ProtectedRoute from './components/guards/ProtectedRoute';
import RoleGuard from './components/guards/RoleGuard';
import { jwtDecode } from 'jwt-decode';

// Layouts & Pages
import { MainLayout } from './components/layout/MainLayout';
import LoginPage from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { UsersPage } from './pages/Users';
import { MachinesPage } from './pages/Machines';
import { CompaniesPage } from './pages/Companies';
import { ModelsPage } from './pages/Models';

// Placeholders for standard routes
const Chat = () => <div className="p-8">AI Chat Workspace Content Here</div>;
const Commercial = () => <div className="p-8">Commercial & Quotes Content Here</div>;
const NotFound = () => <div className="p-8 text-red-600">Tenant Not Found</div>;

// Placeholders for AROL Global Routes
const ArolModels = () => <div className="p-8">Global Machine Models Catalog Builder</div>;
const ArolCompanies = () => <div className="p-8">Tenant Company Configuration Manager</div>;
const ArolProvisioning = () => <div className="p-8">Machine Provisioning & Fleet Deployment Map</div>;

// --- NEW SECURITY GUARD: Platform Owner Only ---
const PlatformOwnerGuard = ({ children }) => {
  const token = localStorage.getItem('arol_token');
  if (!token) return <Navigate to="/login" replace />;
  try {
    const isPlatformOwner = jwtDecode(token).tenant?.isPlatformOwner;
    if (!isPlatformOwner) return <Navigate to="/dashboard" replace />;
    return children;
  } catch (error) {
    return <Navigate to="/login" replace />;
  }
};
// -----------------------------------------------

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

        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />

            {/* Standard Tenant Routes */}
            <Route path="/users" element={<RoleGuard allowedRoles={['full']}><UsersPage /></RoleGuard>} />
            <Route path="/machines" element={<RoleGuard allowedRoles={['full', 'technician', 'commercial']}><MachinesPage /></RoleGuard>} />
            <Route path="/chat" element={<RoleGuard allowedRoles={['full', 'technician', 'commercial']}><Chat /></RoleGuard>} />
            <Route path="/commercial" element={<RoleGuard allowedRoles={['full', 'commercial']}><Commercial /></RoleGuard>} />

            {/* AROL-ONLY ROUTES */}
            <Route path="/arol/models" element={<PlatformOwnerGuard><ModelsPage /></PlatformOwnerGuard>} />
            <Route path="/arol/companies" element={<PlatformOwnerGuard><CompaniesPage /></PlatformOwnerGuard>} />
            <Route path="/arol/provisioning" element={<PlatformOwnerGuard><ArolProvisioning /></PlatformOwnerGuard>} />

          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;