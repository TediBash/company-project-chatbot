import React from 'react';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';

// 1. Modular Configuration Array
// You can easily add, remove, or reorder modules here.
const DASHBOARD_MODULES = [
  {
    id: 'machines',
    title: 'Company Fleet',
    description: 'Monitor machines, view real-time telemetry, and access manuals.',
    path: '/machines',
    allowedRoles: ['full', 'technician', 'commercial'],
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
      </svg>
    )
  },
  {
    id: 'chat',
    title: 'AI Support Chat',
    description: 'Ask troubleshooting questions and fetch manual procedures.',
    path: '/chat',
    allowedRoles: ['full', 'technician', 'commercial'],
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    )
  },
  {
    id: 'users',
    title: 'User Management',
    description: 'Add personnel, manage roles, and control access levels.',
    path: '/users',
    // Notice this is strictly limited to 'full' admins
    allowedRoles: ['full'], 
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    )
  },
  {
    id: 'commercial',
    title: 'Commercial & Quotes',
    description: 'Manage spare parts orders, machine quotes, and invoices.',
    path: '/commercial',
    // Visible only to Commercial and Full admins (hidden from technicians)
    allowedRoles: ['full', 'commercial'],
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    )
  }
];

export const DashboardPage = () => {
  const navigate = useNavigate();
  // Safely retrieve user data (fallback to empty object if not found)
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
  
  // 2. Dynamic Filtering: Keep only modules the user is allowed to see
  const availableModules = DASHBOARD_MODULES.filter(module => 
    module.allowedRoles.includes(user.visibility)
  );

  return (
    <div className="p-8 md:p-12 lg:p-16 animate-in fade-in duration-500">
      
      <header className="mb-12">
        <h1 className="text-3xl md:text-4xl font-light tracking-tight text-gray-900">
          Welcome, <span className="font-semibold text-[var(--color-tenant-primary)]">{user.firstName}</span>
        </h1>
        <p className="mt-2 text-gray-500 font-light">Select a module below to begin your session.</p>
      </header>

      {/* 3. Render the boxes dynamically */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        
        {availableModules.map((module) => (
          <button 
            key={module.id}
            onClick={() => navigate(module.path)}
            className="group relative flex flex-col items-start p-8 bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-gray-100 hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] hover:border-[var(--color-tenant-primary)] transition-all duration-300 text-left overflow-hidden"
          >
            {/* Background Hover Accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-tenant-primary)] opacity-5 rounded-bl-full transition-transform duration-500 group-hover:scale-110"></div>
            
            {/* Icon Block */}
            <div className="w-14 h-14 rounded-xl bg-gray-50 text-[var(--color-tenant-primary)] flex items-center justify-center mb-6 group-hover:bg-[var(--color-tenant-primary)] group-hover:text-white transition-colors duration-300 shadow-sm">
              {module.icon}
            </div>
            
            {/* Text Content */}
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {module.title}
            </h3>
            <p className="text-sm font-light text-gray-500">
              {module.description}
            </p>
          </button>
        ))}

      </div>
    </div>
  );
};

export default DashboardPage;