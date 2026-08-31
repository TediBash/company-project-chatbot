// src/pages/Dashboard.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

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
    allowedRoles: ['full'], 
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    )
  },
  /*{
    id: 'commercial',
    title: 'Commercial & Quotes',
    description: 'Manage spare parts orders, machine quotes, and invoices.',
    path: '/commercial',
    allowedRoles: ['full', 'commercial'],
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    )
  },*/
  // --- AROL SUPER ADMIN MODULES ---
  {
    id: 'arol-models',
    title: 'Global Machine Catalog',
    description: 'Define generic machine models, specs, and default manual PDFs.',
    path: '/arol/models',
    allowedRoles: ['full'],
    requiresPlatformOwner: true,
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
      </svg>
    )
  },
  {
    id: 'arol-companies',
    title: 'Tenant Management',
    description: 'Onboard new companies, assign slugs, and customize UI branding.',
    path: '/arol/companies',
    allowedRoles: ['full'],
    requiresPlatformOwner: true,
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
      </svg>
    )
  },
  {
    id: 'arol-mapping',
    title: 'Fleet Provisioning',
    description: 'Deploy physical machines to client companies and set plant locations.',
    path: '/arol/provisioning',
    allowedRoles: ['full'],
    requiresPlatformOwner: true,
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
    )
  },
  {
    id: 'arol-quotes',
    title: ' Quotes',
    description: 'Manage spare parts orders, machine quotes, and invoices.',
    path: '/quotes',
    allowedRoles: ['full', 'commercial'],
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    )
  },
  {
    id: 'arol-orders',
    title: 'Orders & Fulfillment',
    description: 'Track active orders, monitor shipment statuses, and manage fulfillment dates.',
    path: '/commercial/orders',
    allowedRoles: ['full', 'commercial'],
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    )
  }
];

export const DashboardPage = () => {
  const navigate = useNavigate();
  
  let user = {};
  let isPlatformOwner = false;
  
  const token = localStorage.getItem('arol_token');
  if (token) {
    try {
      const decoded = jwtDecode(token);
      user = decoded.user || {}; 
      isPlatformOwner = decoded.tenant?.isPlatformOwner || false;
    } catch (error) {
      console.error('Invalid token format');
    }
  }
  
  // Dynamic Filtering: Check Role AND Platform Owner flag
  const availableModules = DASHBOARD_MODULES.filter(module => {
    const hasRole = module.allowedRoles.includes(user.visibility);
    const hasPlatformAccess = module.requiresPlatformOwner ? isPlatformOwner : true;
    return hasRole && hasPlatformAccess;
  });

  return (
    <div className="p-8 md:p-12 lg:p-16 animate-in fade-in duration-500">
      
      <header className="mb-12">
        <h1 className="text-3xl md:text-4xl font-light tracking-tight text-gray-900">
          Welcome, <span className="font-semibold text-[var(--color-tenant-primary)]">{user.firstName}</span>
        </h1>
        <p className="mt-2 text-gray-500 font-light">
          {isPlatformOwner 
            ? "AROL Global Administration Dashboard."
            : "Select a module below to begin your session."}
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {availableModules.map((module) => (
          <button 
            key={module.id}
            onClick={() => navigate(module.path)}
            className="group relative flex flex-col items-start p-8 bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-gray-100 hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] hover:border-[var(--color-tenant-primary)] transition-all duration-300 text-left overflow-hidden"
          >
            {/* Darker background accent for AROL-only modules */}
            <div className={`absolute top-0 right-0 w-32 h-32 opacity-5 rounded-bl-full transition-transform duration-500 group-hover:scale-110 ${module.requiresPlatformOwner ? 'bg-red-600' : 'bg-[var(--color-tenant-primary)]'}`}></div>
            
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 transition-colors duration-300 shadow-sm ${module.requiresPlatformOwner ? 'bg-red-50 text-red-600 group-hover:bg-red-600 group-hover:text-white' : 'bg-gray-50 text-[var(--color-tenant-primary)] group-hover:bg-[var(--color-tenant-primary)] group-hover:text-white'}`}>
              {module.icon}
            </div>
            
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