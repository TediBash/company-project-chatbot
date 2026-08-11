import React from 'react';

const roleStyles = {
  full: 'bg-slate-800',
  technician: 'bg-amber-500',
  commercial: 'bg-indigo-500',
};

export const RoleBadge = ({ role }) => {
  const dotColor = roleStyles[role] || 'bg-gray-400';
  
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-gray-200 bg-white shadow-sm text-[10px] font-semibold tracking-widest uppercase text-gray-700">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
      {role}
    </span>
  );
};