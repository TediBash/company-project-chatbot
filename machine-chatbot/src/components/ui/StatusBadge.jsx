import React from 'react';

const statusStyles = {
  Running: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]',
  Alarm: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse',
  Idle: 'bg-gray-300',
  Stopped: 'bg-gray-800',
  Maintenance: 'bg-orange-400',
  'Size change': 'bg-blue-400',
};

export const StatusBadge = ({ status }) => {
  const dotColor = statusStyles[status] || 'bg-gray-300';

  return (
    <span className="inline-flex items-center gap-2 px-3 py-1 text-xs font-medium text-gray-600 bg-transparent">
      <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>
      {status}
    </span>
  );
};