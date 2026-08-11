import React, { useEffect } from 'react';

export const BaseModal = ({ isOpen, onClose, title, children, maxWidth = 'max-w-2xl' }) => {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Luxury Backdrop: Dark with heavy blur */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
      ></div>

      {/* Modal Panel: Pristine white, very soft shadow, sharp text */}
      <div 
        className={`relative w-full ${maxWidth} bg-white rounded-xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.2)] transform transition-all duration-300 overflow-hidden border border-gray-100`}
        role="dialog"
      >
        <div className="flex items-center justify-between px-8 py-6 border-b border-gray-50">
          <h3 className="text-xl font-light text-gray-900 tracking-wide">{title}</h3>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 transition-colors duration-200 rounded-full hover:bg-gray-50 hover:text-gray-900 focus:outline-none"
          >
            <span className="sr-only">Close</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="px-8 py-6">
          {children}
        </div>
      </div>
    </div>
  );
};