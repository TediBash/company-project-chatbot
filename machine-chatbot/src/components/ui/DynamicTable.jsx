import React from 'react';

export const DynamicTable = ({ columns, data, onRowClick, isLoading = false }) => {
  if (isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="w-8 h-8 border-2 rounded-full border-t-[var(--color-primary)] border-gray-200 animate-spin"></div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full p-12 text-center bg-white rounded-xl shadow-sm border border-gray-100">
        <p className="text-sm font-light tracking-wide text-gray-400 uppercase">No records found</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto bg-white rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-gray-100">
      <table className="min-w-full">
        <thead>
          <tr>
            {columns.map((col, index) => (
              <th 
                key={index}
                className="px-8 py-5 text-left text-[10px] font-bold tracking-[0.15em] text-gray-400 uppercase bg-white border-b border-gray-100"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.map((row, rowIndex) => (
            <tr 
              key={rowIndex} 
              onClick={() => onRowClick && onRowClick(row)}
              // Luxury Hover: Very subtle background shift, left border accent using tenant primary color
              className={onRowClick ? 'cursor-pointer group hover:bg-gray-50/50 transition-all duration-300 relative' : ''}
            >
              {/* Tenant Color Accent Bar on Hover */}
              {onRowClick && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--color-primary)] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              )}
              
              {columns.map((col, colIndex) => (
                <td key={colIndex} className="px-8 py-5 whitespace-nowrap text-sm font-light text-gray-700">
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};