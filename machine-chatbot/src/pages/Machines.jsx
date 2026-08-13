// src/pages/Machines.jsx
import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { BaseModal } from '../components/ui/BaseModal';
import { DynamicFilters } from '../components/ui/DynamicFilters';
import { jwtDecode } from 'jwt-decode';

export const MachinesPage = () => {
  let isAdmin = false;
  const token = localStorage.getItem('arol_token');
  if (token) {
    try {
      isAdmin = jwtDecode(token).user?.visibility === 'full';
    } catch (e) {}
  }

  const [machines, setMachines] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Unified Filter State
  const [filters, setFilters] = useState({ search: '', status: 'ALL' });
  
  const [selectedMachine, setSelectedMachine] = useState(null);

  // Configuration for DynamicFilters
  const filterConfig = [
    {
      name: 'search',
      type: 'text',
      placeholder: 'Search by Serial Number, Model, or Location...',
      className: 'flex-1 min-w-[240px]'
    },
    {
      name: 'status',
      type: 'select',
      className: 'min-w-[160px]',
      options: [
        { value: 'ALL', label: 'All Statuses' },
        { value: 'RUNNING', label: 'Running' },
        { value: 'MAINTENANCE', label: 'Maintenance' },
        { value: 'STOPPED', label: 'Stopped' }
      ]
    }
  ];

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };
  
  // NEW: State for the Full-Screen PDF Viewer
  const [viewingManual, setViewingManual] = useState(null);

  const fetchMachines = useCallback(async () => {
    try {
      const response = await apiClient.get('/machines');
      setMachines(response.data);
      
      if (selectedMachine) {
        const updatedTarget = response.data.find(m => m.id === selectedMachine.id);
        if (updatedTarget) setSelectedMachine(updatedTarget);
      }
    } catch (err) {
      console.error('Failed to load machines:', err);
      setError('Unable to load machinery fleet.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedMachine]);

  useEffect(() => {
    fetchMachines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStatusUpdate = async (machineId, newStatus) => {
    try {
      setSelectedMachine(prev => ({ ...prev, status: newStatus }));
      await apiClient.patch(`/machines/${machineId}/status`, { status: newStatus });
      fetchMachines();
    } catch (err) {
      console.error('Failed to update status', err);
      alert('Failed to update machine status. Please check your permissions.');
      fetchMachines(); 
    }
  };

  const filteredMachines = machines.filter((m) => {
    const matchesSearch =
      m.serialNumber.toLowerCase().includes(filters.search.toLowerCase()) ||
      m.modelCode.toLowerCase().includes(filters.search.toLowerCase()) ||
      m.plantLocation.toLowerCase().includes(filters.search.toLowerCase());

    const matchesStatus =
      filters.status === 'ALL' ||
      m.status.toUpperCase() === filters.status.toUpperCase();

    return matchesSearch && matchesStatus;
  });

  const runningCount = filteredMachines.filter(m => m.status?.toLowerCase() === 'running').length;
  const maintenanceCount = filteredMachines.filter(m => m.status?.toLowerCase() === 'maintenance').length;
  const stoppedCount = filteredMachines.filter(m => !['running', 'maintenance'].includes(m.status?.toLowerCase())).length;

  const getStatusBadge = (status) => {
    switch (status?.toLowerCase()) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Running
          </span>
        );
      case 'maintenance':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Maintenance
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            Stopped
          </span>
        );
    }
  };

  return (
    <div className="p-8 md:p-12 lg:p-16 animate-in fade-in duration-500">
      
      <header className="flex flex-col lg:flex-row lg:items-end justify-between pb-6 border-b border-gray-200 gap-6 mb-8">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-[var(--color-tenant-primary)] uppercase">
            Operations
          </p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight text-gray-900">
            Installed Fleet
          </h1>
        </div>
        
        <div className="flex items-center gap-4 text-xs font-medium text-gray-600 bg-white px-5 py-2.5 rounded-lg border border-gray-100 shadow-sm self-start lg:self-auto">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>{runningCount} Running</span>
          </div>
          <div className="w-px h-4 bg-gray-200"></div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>{maintenanceCount} Maintenance</span>
          </div>
          <div className="w-px h-4 bg-gray-200"></div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-400"></span>
            <span>{stoppedCount} Stopped</span>
          </div>
        </div>
      </header>

      <div className="mb-8">
        <DynamicFilters 
          config={filterConfig} 
          values={filters} 
          onChange={handleFilterChange} 
        />
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-sm font-light text-red-600">
          {error}
        </div>
      )}

      {isLoading && machines.length === 0 ? (
        <div className="flex justify-center items-center h-48">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-[var(--color-tenant-primary)] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMachines.map((machine) => (
            <div
              key={machine.id}
              onClick={() => setSelectedMachine(machine)}
              className="group cursor-pointer bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] hover:border-[var(--color-tenant-primary)] transition-all duration-300 relative overflow-hidden"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">
                    SN {machine.serialNumber}
                  </span>
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-[var(--color-tenant-primary)] transition-colors">
                    {machine.modelCode}
                  </h3>
                </div>
                {getStatusBadge(machine.status)}
              </div>

              <p className="text-xs text-gray-500 mb-6 font-light line-clamp-2">
                {machine.modelDescription}
              </p>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 text-xs">
                <div>
                  <p className="text-gray-400 font-medium">Production Rate</p>
                  <p className="font-semibold text-gray-800 text-sm">
                    {machine.productionRateBph.toLocaleString()} <span className="text-[10px] text-gray-400 font-normal">BPH</span>
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 font-medium">Uptime</p>
                  <p className="font-semibold text-gray-800 text-sm">
                    {machine.uptimePercentage}%
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between text-[11px] text-gray-400">
                <span className="truncate max-w-[180px]">📍 {machine.plantLocation}</span>
                <span className="font-semibold text-[var(--color-tenant-primary)] group-hover:translate-x-1 transition-transform inline-block">
                  Inspect →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* INSPECT MACHINE MODAL */}
      {selectedMachine && (
        <BaseModal
          isOpen={!!selectedMachine && !viewingManual} // Hide this modal if the PDF viewer is active
          onClose={() => setSelectedMachine(null)}
          title={`Machine Specification: S/N ${selectedMachine.serialNumber}`}
        >
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-xl gap-4">
              <div>
                <h4 className="font-bold text-gray-900">{selectedMachine.modelCode}</h4>
                <p className="text-xs text-gray-500">{selectedMachine.modelDescription}</p>
              </div>
              
              {isAdmin ? (
                <div className="flex flex-col items-end gap-1">
                  <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Override Status</label>
                  <select 
                    value={selectedMachine.status}
                    onChange={(e) => handleStatusUpdate(selectedMachine.id, e.target.value)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border-gray-300 text-gray-700 bg-white shadow-sm focus:border-[var(--color-tenant-primary)] focus:ring-0"
                  >
                    <option value="Running">🟢 Running</option>
                    <option value="Maintenance">🟠 Maintenance</option>
                    <option value="Stopped">⚪ Stopped</option>
                  </select>
                </div>
              ) : (
                getStatusBadge(selectedMachine.status)
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 border rounded-lg">
                <p className="text-gray-400 uppercase text-[10px] font-bold">Location</p>
                <p className="font-medium text-gray-800">{selectedMachine.plantLocation}</p>
              </div>
              <div className="p-3 border rounded-lg">
                <p className="text-gray-400 uppercase text-[10px] font-bold">PLC / Software</p>
                <p className="font-medium text-gray-800">{selectedMachine.plcFamily} ({selectedMachine.softwareVersion})</p>
              </div>
              <div className="p-3 border rounded-lg">
                <p className="text-gray-400 uppercase text-[10px] font-bold">Container & Cap</p>
                <p className="font-medium text-gray-800">{selectedMachine.containerType} / {selectedMachine.capType}</p>
              </div>
              <div className="p-3 border rounded-lg">
                <p className="text-gray-400 uppercase text-[10px] font-bold">Nominal Heads</p>
                <p className="font-medium text-gray-800">{selectedMachine.nominalHeads} Heads</p>
              </div>
            </div>

            {selectedMachine.healthNote && (
              <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs">
                <p className="text-[10px] font-bold text-blue-700 uppercase mb-1">Telemetry Note</p>
                <p className="text-blue-900 font-light">{selectedMachine.healthNote}</p>
              </div>
            )}

            {/* UPDATED FOOTER: Added "Open Manual" Button */}
            <div className="flex justify-between items-center pt-4 border-t border-gray-100">
              <button
                onClick={() => setViewingManual(selectedMachine)}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold tracking-wider text-white bg-[var(--color-tenant-primary)] hover:opacity-90 transition-opacity rounded-md uppercase shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Open Manual
              </button>

              <button
                onClick={() => setSelectedMachine(null)}
                className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:bg-gray-50 rounded-md"
              >
                Close
              </button>
            </div>
          </div>
        </BaseModal>
      )}

      {/* FULL-SCREEN PDF THEATER OVERLAY */}
      {viewingManual && (
        <div className="fixed inset-0 z-[100] bg-gray-900/95 backdrop-blur-sm flex flex-col animate-in fade-in duration-300">
          
          {/* Top Navbar for the PDF Viewer */}
          <header className="flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-800 shadow-xl z-10">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">
                Technical Documentation
              </p>
              <h2 className="text-xl font-light text-white">
                {viewingManual.modelCode} - Operations Manual
              </h2>
            </div>
            
            <div className="flex items-center gap-4">
              <a 
                /* In the future, replace this href with: viewingManual.manualUrl */
                href={`/manuals/${viewingManual.modelCode}.pdf`} 
                download={`${viewingManual.modelCode}_Manual.pdf`}
                className="px-4 py-2 text-xs font-bold text-white bg-gray-800 border border-gray-700 hover:bg-gray-700 rounded-md uppercase tracking-wider transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </a>
              
              <div className="w-px h-6 bg-gray-700"></div>
              
              <button 
                onClick={() => setViewingManual(null)}
                className="p-2 text-gray-400 hover:text-white hover:bg-red-500/20 rounded-full transition-colors group"
                title="Close Manual"
              >
                <svg className="w-6 h-6 group-hover:text-red-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </header>

          {/* PDF iFrame Container */}
          <div className="flex-1 w-full h-full p-4 md:p-8 flex justify-center items-center">
            <iframe 
              /* In the future, replace this src with: viewingManual.manualUrl */
              src={`/manuals/${viewingManual.modelCode}.pdf`} 
              className="w-full max-w-6xl h-full rounded-xl shadow-2xl border border-gray-700 bg-white"
              title={`${viewingManual.modelCode} Technical Manual`}
            />
          </div>
        </div>
      )}

    </div>
  );
};

export default MachinesPage;