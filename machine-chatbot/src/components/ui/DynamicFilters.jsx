// src/components/ui/DynamicFilters.jsx
import React from 'react';

export const DynamicFilters = ({ 
  config = [], 
  values = {}, 
  onChange, 
  actionButton = null 
}) => {
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    onChange(name, value);
  };

  return (
    <div className="flex flex-wrap items-center gap-4 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
      {config.map((filter) => {
        
        // -----------------------
        // TEXT INPUT
        // -----------------------
        if (filter.type === 'text') {
          return (
            <input
              key={filter.name}
              type="text"
              name={filter.name}
              placeholder={filter.placeholder || `Search...`}
              value={values[filter.name] || ''}
              onChange={handleChange}
              className={`px-0 py-2 text-sm bg-transparent border-0 border-b border-gray-200 focus:ring-0 focus:border-[var(--color-tenant-primary)] transition-colors ${filter.className || 'flex-1 min-w-[200px]'}`}
            />
          );
        }

        // -----------------------
        // SELECT DROPDOWN
        // -----------------------
        if (filter.type === 'select') {
          return (
            <select
              key={filter.name}
              name={filter.name}
              value={values[filter.name] || ''}
              onChange={handleChange}
              className={`px-0 py-2 text-xs font-semibold text-gray-600 bg-transparent border-0 border-b border-gray-200 focus:ring-0 focus:border-[var(--color-tenant-primary)] transition-colors uppercase tracking-wider ${filter.className || 'w-48'}`}
            >
              {filter.options?.map((opt, index) => (
                <option key={index} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          );
        }

        // Add more filter types here in the future (e.g., date-picker, toggles)
        return null;
      })}

      {/* Render optional action button at the end (e.g., + Map Machine) */}
      {actionButton && (
        <div className="ml-auto">
          {actionButton}
        </div>
      )}
    </div>
  );
};