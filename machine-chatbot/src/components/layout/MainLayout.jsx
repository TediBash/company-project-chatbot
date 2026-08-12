import React, { useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTenant } from '../../hooks/useTenant';

export const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenant, status } = useTenant();
  
  // SAFE DECODING:
  let user = {};
  const token = localStorage.getItem('arol_token');
  if (token) {
    try {
      const decoded = jwtDecode(token);
      console.log("🔍 DECODED TOKEN PAYLOAD:", decoded);
      user = decoded.user || {}; 
    } catch (error) {
      console.error('Invalid token format');
    }
  }

  // Ensure CSS variables are set globally for the protected shell
  useEffect(() => {
    if (tenant?.primaryColor) {
      document.documentElement.style.setProperty('--color-tenant-primary', tenant.primaryColor);
    }
  }, [tenant]);

  const handleLogout = () => {
    localStorage.removeItem('arol_token');
    navigate('/login');
  };

  if (status === 'LOADING') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#fafafa]">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-[var(--color-tenant-primary,gray)] rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col font-sans">
      
      {/* Premium Top Navigation */}
      <nav className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-xl border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          
          {/* Left: Branding */}
          <div 
            className="flex items-center gap-4 cursor-pointer group"
            onClick={() => navigate('/dashboard')}
          >
            {tenant?.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.companyName} className="h-8 transition-opacity group-hover:opacity-80" />
            ) : (
              <div className="w-10 h-10 rounded bg-[var(--color-tenant-primary)] flex items-center justify-center shadow-md transition-transform group-hover:scale-105">
                <span className="text-white text-lg font-light">
                  {tenant?.companyName?.charAt(0) || 'A'}
                </span>
              </div>
            )}
            <div className="hidden sm:block">
              <p className="text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">Platform</p>
              <h2 className="text-lg font-light text-gray-900 tracking-wide">{tenant?.companyName}</h2>
            </div>
          </div>

          {/* Right: User Controls */}
          <div className="flex items-center gap-6">
            <div className="text-right hidden md:block">
              <p className="text-sm font-medium text-gray-900">{user.firstName} {user.lastName}</p>
              <p className="text-[10px] uppercase tracking-widest text-[var(--color-tenant-primary)] font-semibold">{user.visibility} Access</p>
            </div>
            
            <div className="w-px h-8 bg-gray-200 hidden md:block"></div>

            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-red-600 transition-colors duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>

        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto">
        <Outlet />
      </main>

    </div>
  );
};

export default MainLayout;