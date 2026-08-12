// src/pages/Provisioning.jsx
import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { DynamicTable } from '../components/ui/DynamicTable';
import { BaseModal } from '../components/ui/BaseModal';

export const ProvisioningPage = () => {
  // Data States
  const [machines, setMachines] = useState([]);
  const [stats, setStats] = useState({ totalMachines: 0, totalCompanies: 0, totalActive: 0 });
  const [options, setOptions] = useState({ companies: [], models: [] });
  const [isLoading, setIsLoading] = useState(true);
  
  // Pagination & Filters
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({ search: '', companyId: '', modelId: '' });

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);

  const initialFormState = {
    companyId: '', modelId: '', serialNumber: '', plantLocation: '', 
    deliveryDate: new Date().toISOString().split('T')[0], 
    plcFamily: 'Siemens', softwareVersion: 'v1.0'
  };
  const [form, setForm] = useState(initialFormState);

  // Fetch Options
  useEffect(() => {
    apiClient.get('/provisioning/options').then(res => setOptions(res.data)).catch(console.error);
  }, []);

  // Fetch Paginated Data
  const fetchMachines = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.get('/provisioning', { 
        params: { ...filters, page, limit: 25 } 
      });
      setMachines(response.data.data);
      setStats(response.data.stats);
      setTotalPages(response.data.pagination.totalPages);
    } catch (err) {
      console.error('Failed to load fleet map', err);
    } finally {
      setIsLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => { fetchMachines(); }, 300);
    return () => clearTimeout(delayDebounce);
  }, [fetchMachines]);

  // Reset to page 1 if filters change
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPage(1);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (selectedMachine) {
        await apiClient.put(`/provisioning/${selectedMachine.id}`, form);
      } else {
        await apiClient.post('/provisioning', form);
      }
      setIsModalOpen(false);
      fetchMachines();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save mapping.');
    }
  };

  const handleDelete = async () => {
    try {
      await apiClient.delete(`/provisioning/${selectedMachine.id}`);
      setIsDeleteModalOpen(false);
      fetchMachines();
    } catch (err) {
      alert('Failed to delete machine.');
    }
  };

  const openModal = (machine = null) => {
    setSelectedMachine(machine);
    if (machine) {
      setForm({
        companyId: machine.companyId,
        modelId: machine.modelId,
        serialNumber: machine.serialNumber,
        plantLocation: machine.plantLocation,
        deliveryDate: machine.deliveryDate,
        plcFamily: machine.plcFamily,
        softwareVersion: machine.softwareVersion
      });
    } else {
      setForm(initialFormState);
    }
    setIsModalOpen(true);
  };

  const columns = [
    {
      key: 'serial',
      label: 'Serial Number',
      render: (_, row) => (
        <div>
          <span className="font-bold text-gray-900 block">{row.serialNumber}</span>
          <span className="text-xs text-[var(--color-tenant-primary)] font-medium">{row.modelCode}</span>
        </div>
      )
    },
    {
      key: 'client',
      label: 'Mapped Client',
      render: (_, row) => (
        <div>
          <span className="font-semibold text-gray-800 block text-sm">{row.companyName}</span>
          <span className="text-xs text-gray-500 font-light">📍 {row.plantLocation}</span>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Telemetry Status',
      render: (_, row) => (
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
          row.status === 'Running' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {row.status === 'Running' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          {row.status}
        </span>
      )
    },
    {
      key: 'delivery',
      label: 'Delivery Date',
      render: (_, row) => <span className="text-gray-600 font-light text-sm">{row.deliveryDate}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <button onClick={() => openModal(row)} className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-blue-600">Edit</button>
          <button onClick={() => { setSelectedMachine(row); setIsDeleteModalOpen(true); }} className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-red-500">Unmap</button>
        </div>
      )
    }
  ];

  return (
    <div className="p-8 md:p-12 lg:p-16 animate-in fade-in duration-500">
      
      <header className="flex flex-col lg:flex-row lg:items-end justify-between pb-6 border-b border-gray-200 gap-6 mb-8">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-red-600 uppercase">Global Administration</p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight text-gray-900">Fleet Deployment Map</h1>
        </div>
        
        {/* Automatic Counters */}
        <div className="flex items-center gap-6 text-sm font-medium text-gray-700 bg-white px-6 py-3 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Total Machines</span>
            <span className="text-lg">{stats.totalMachines.toLocaleString()}</span>
          </div>
          <div className="w-px h-8 bg-gray-200"></div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Active Sites</span>
            <span className="text-lg text-emerald-600">{stats.totalCompanies.toLocaleString()}</span>
          </div>
          <div className="w-px h-8 bg-gray-200"></div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Currently Running</span>
            <span className="text-lg text-blue-600">{stats.totalActive.toLocaleString()}</span>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <input 
          type="text" name="search" placeholder="Search S/N or Location..." 
          value={filters.search} onChange={handleFilterChange}
          className="flex-1 min-w-[200px] border-0 border-b border-gray-200 focus:ring-0 focus:border-red-600 text-sm"
        />
        <select 
          name="companyId" value={filters.companyId} onChange={handleFilterChange}
          className="w-48 border-0 border-b border-gray-200 focus:ring-0 focus:border-red-600 text-sm font-medium"
        >
          <option value="">All Companies</option>
          {options.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select 
          name="modelId" value={filters.modelId} onChange={handleFilterChange}
          className="w-48 border-0 border-b border-gray-200 focus:ring-0 focus:border-red-600 text-sm font-medium"
        >
          <option value="">All Models</option>
          {options.models.map(m => <option key={m.id} value={m.id}>{m.code}</option>)}
        </select>
        <button onClick={() => openModal()} className="px-6 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-md uppercase tracking-wider ml-auto">
          + Map Machine
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <DynamicTable columns={columns} data={machines} isLoading={isLoading} />
        
        {/* Pagination Footer (Max 25 Rows per page as requested) */}
        {!isLoading && stats.totalMachines > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500 font-medium">
              Showing <span className="font-bold text-gray-900">{(page - 1) * 25 + 1}</span> to <span className="font-bold text-gray-900">{Math.min(page * 25, stats.totalMachines)}</span> of <span className="font-bold text-gray-900">{stats.totalMachines}</span> mapped machines
            </p>
            <div className="flex gap-2">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed uppercase"
              >
                Previous
              </button>
              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed uppercase"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MAP MODAL */}
      {isModalOpen && (
        <BaseModal isOpen={true} onClose={() => setIsModalOpen(false)} title={selectedMachine ? "Update Provisioning Map" : "Map New Machine"}>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Assign to Company</label>
                <select required value={form.companyId} onChange={(e) => setForm({...form, companyId: e.target.value})} className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600 bg-white">
                  <option value="" disabled>Select Client...</option>
                  {options.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Base Model Blueprint</label>
                <select required value={form.modelId} onChange={(e) => setForm({...form, modelId: e.target.value})} className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600 bg-white">
                  <option value="" disabled>Select Model...</option>
                  {options.models.map(m => <option key={m.id} value={m.id}>{m.code}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Physical Serial Number</label>
                <input type="text" required placeholder="e.g. SN-ALP-205" value={form.serialNumber} onChange={(e) => setForm({...form, serialNumber: e.target.value})} className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Plant Location Name</label>
                <input type="text" required placeholder="e.g. Line 2 - Geneva" value={form.plantLocation} onChange={(e) => setForm({...form, plantLocation: e.target.value})} className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Delivery Date</label>
                <input type="date" required value={form.deliveryDate} onChange={(e) => setForm({...form, deliveryDate: e.target.value})} className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">PLC Family</label>
                <select required value={form.plcFamily} onChange={(e) => setForm({...form, plcFamily: e.target.value})} className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600 bg-white">
                  <option value="Siemens">Siemens</option>
                  <option value="Rockwell">Rockwell / Allen-Bradley</option>
                  <option value="Beckhoff">Beckhoff</option>
                  <option value="B&R">B&R</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Software Version</label>
                <input type="text" required placeholder="e.g. v2.1" value={form.softwareVersion} onChange={(e) => setForm({...form, softwareVersion: e.target.value})} className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600" />
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-xs font-semibold tracking-wider text-gray-500 uppercase hover:bg-gray-50 rounded-md">Cancel</button>
              <button type="submit" className="px-5 py-2.5 text-xs font-bold tracking-wider text-white bg-red-600 hover:bg-red-700 rounded-md uppercase">{selectedMachine ? "Update Mapping" : "Map Machine"}</button>
            </div>
          </form>
        </BaseModal>
      )}

      {/* DELETE MODAL */}
      {isDeleteModalOpen && (
        <BaseModal isOpen={true} onClose={() => setIsDeleteModalOpen(false)} title="Unmap Machine">
          <div className="space-y-6">
            <p className="text-sm text-gray-600">Are you sure you want to permanently unmap machine <strong>{selectedMachine?.serialNumber}</strong> from <strong>{selectedMachine?.companyName}</strong>? This will detach all telemetry history.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setIsDeleteModalOpen(false)} className="px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase hover:bg-gray-50 rounded-md">Cancel</button>
              <button onClick={handleDelete} className="px-5 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-md uppercase">Unmap & Delete</button>
            </div>
          </div>
        </BaseModal>
      )}

    </div>
  );
};

export default ProvisioningPage;