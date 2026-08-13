// src/components/ui/BaseModal.jsx
import React, { useEffect } from 'react';

export const BaseModal = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md' // Default size
}) => {
  // Prevent the background page from scrolling when the modal is open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  // Dynamic width classes
  const maxWidth = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95vw]'
  }[size] || 'max-w-2xl';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      
      {/* 
        max-h-[90vh]: Prevents the modal from being taller than 90% of the screen.
        flex flex-col: Allows the body inside to scroll while keeping the header fixed.
      */}
      <div className={`bg-white rounded-2xl shadow-2xl w-full flex flex-col ${maxWidth} max-h-[90vh]`}>
        
        {/* Fixed Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Scrollable Content Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {children}
        </div>
        
      </div>
    </div>
  );
};