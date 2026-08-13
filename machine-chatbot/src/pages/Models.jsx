// src/pages/Models.jsx
import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { DynamicTable } from '../components/ui/DynamicTable';
import { BaseModal } from '../components/ui/BaseModal';
import { DynamicFilters } from '../components/ui/DynamicFilters';

export const ModelsPage = () => {
  // Data States
  const [models, setModels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filter States
  const [filters, setFilters] = useState({ search: '', status: 'ALL' });

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(null);

  // Form State
  const initialFormState = {
    modelCode: '',
    description: '',
    containerType: '',
    capType: '',
    nominalHeads: '',
    primitiveDiameter: '',
    manualUrl: ''
  };
  const [form, setForm] = useState(initialFormState);

  // Fetch Models
  const fetchModels = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiClient.get('/models', { params: { search: filters.search } });
      setModels(response.data);
    } catch (err) {
      console.error('Error fetching models:', err);
      setError('Failed to load machine catalog.');
    } finally {
      setIsLoading(false);
    }
  }, [filters.search]);

  // Debounced Search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchModels();
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [fetchModels]);

  // Configuration for DynamicFilters
  const filterConfig = [
    {
      name: 'search',
      type: 'text',
      placeholder: 'Search models, specs, descriptions...',
      className: 'flex-1 min-w-[250px]'
    },
    {
      name: 'status',
      type: 'select',
      className: 'min-w-[150px]',
      options: [
        { value: 'ALL', label: 'All Statuses' },
        { value: 'ACTIVE', label: 'Active Only' },
        { value: 'INACTIVE', label: 'Inactive Only' }
      ]
    }
  ];

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  // Handlers
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/models', form);
      setIsCreateModalOpen(false);
      fetchModels();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create model.');
    }
  };

  const handleUpdateSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiClient.put(`/models/${selectedModel.id}`, form);
      setIsEditModalOpen(false);
      fetchModels();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update model.');
    }
  };

  const handleDeleteSubmit = async () => {
    try {
      await apiClient.delete(`/models/${selectedModel.id}`);
      setIsDeleteModalOpen(false);
      fetchModels();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete model.');
    }
  };

  const handleToggleStatus = async (modelId, currentStatus) => {
    try {
      // Optimistic update
      setModels(prev => prev.map(m => m.id === modelId ? { ...m, isActive: !currentStatus } : m));
      await apiClient.patch(`/models/${modelId}/status`, { isActive: !currentStatus });
    } catch (err) {
      alert('Failed to update status.');
      fetchModels(); // Revert on failure
    }
  };

  // Open Modals
  const openCreateModal = () => {
    setForm(initialFormState);
    setIsCreateModalOpen(true);
  };

  const openEditModal = (model) => {
    setSelectedModel(model);
    setForm({
      modelCode: model.modelCode || '',
      description: model.description || '',
      containerType: model.containerType || '',
      capType: model.capType || '',
      nominalHeads: model.nominalHeads || '',
      primitiveDiameter: model.primitiveDiameter || '',
      manualUrl: model.manualUrl || ''
    });
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (model) => {
    setSelectedModel(model);
    setIsDeleteModalOpen(true);
  };

  // Local Filtering for Status
  const filteredModels = models.filter(m => {
    if (filters.status === 'ACTIVE') return m.isActive === true;
    if (filters.status === 'INACTIVE') return m.isActive === false;
    return true;
  });

  // Table Columns
  const columns = [
    {
      key: 'modelCode',
      label: 'Model Identity',
      render: (_, row) => (
        <div>
          <span className="font-bold text-gray-900 block text-sm">{row.modelCode}</span>
          <span className="text-xs text-gray-500 font-light line-clamp-1 max-w-[200px]" title={row.description}>
            {row.description}
          </span>
        </div>
      )
    },
    {
      key: 'specs',
      label: 'Format Specs',
      render: (_, row) => (
        <div className="text-xs text-gray-700">
          <p><span className="text-gray-400">Cont:</span> {row.containerType}</p>
          <p><span className="text-gray-400">Cap:</span> {row.capType}</p>
        </div>
      )
    },
    {
      key: 'technical',
      label: 'Technical',
      render: (_, row) => (
        <div className="text-xs text-gray-700">
          <p><span className="text-gray-400">Heads:</span> {row.nominalHeads || 'N/A'}</p>
          <p><span className="text-gray-400">Diam:</span> {row.primitiveDiameter ? `${row.primitiveDiameter}mm` : 'N/A'}</p>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => (
        <button
          onClick={() => handleToggleStatus(row.id, row.isActive)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${row.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${row.isActive ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-4">
          {row.manualUrl && (
            <a 
              href={row.manualUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold uppercase tracking-widest text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-1"
              title="View PDF Manual"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </a>
          )}
          <button 
            onClick={() => openEditModal(row)}
            className="text-xs font-semibold uppercase tracking-widest text-gray-400 hover:text-blue-600 transition-colors"
          >
            Edit
          </button>
          <button 
            onClick={() => openDeleteModal(row)}
            className="text-xs font-semibold uppercase tracking-widest text-gray-400 hover:text-red-500 transition-colors"
          >
            Delete
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="p-8 md:p-12 lg:p-16 animate-in fade-in duration-500">
      
      <header className="flex flex-col sm:flex-row sm:items-end justify-between pb-6 border-b border-gray-200 gap-4 mb-8">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-red-600 uppercase">
            Global Administration
          </p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight text-gray-900">
            Machine Catalog
          </h1>
        </div>
        <button 
          onClick={openCreateModal}
          className="self-start sm:self-auto px-6 py-2.5 text-xs font-bold tracking-wider text-white transition-all duration-300 rounded-md bg-red-600 hover:bg-red-700 shadow-sm uppercase"
        >
          + Add Model
        </button>
      </header>

      {/* Filters */}
      <div className="mb-6">
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

      <DynamicTable 
        columns={columns} 
        data={filteredModels} 
        isLoading={isLoading}
      />

      {/* CREATE/EDIT MODAL */}
      {(isCreateModalOpen || isEditModalOpen) && (
        <BaseModal
          isOpen={true}
          onClose={() => { setIsCreateModalOpen(false); setIsEditModalOpen(false); }}
          title={isEditModalOpen ? "Update Machine Model" : "Define New Model"}
        >
          <form onSubmit={isEditModalOpen ? handleUpdateSubmit : handleCreateSubmit} className="space-y-6">
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Model Code</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. EURO-PK-12"
                  value={form.modelCode}
                  onChange={(e) => setForm({...form, modelCode: e.target.value})}
                  className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Manual PDF URL (Optional)</label>
                <input 
                  type="text"
                  placeholder="/manuals/EURO-PK-12.pdf"
                  value={form.manualUrl}
                  onChange={(e) => setForm({...form, manualUrl: e.target.value})}
                  className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Description / Family</label>
              <input 
                type="text"
                required
                value={form.description}
                onChange={(e) => setForm({...form, description: e.target.value})}
                className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600"
              />
            </div>

            <div className="pt-2">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-3">Format Specifications</p>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[9px] text-gray-400 uppercase block">Container Type</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. PET Bottle"
                    value={form.containerType}
                    onChange={(e) => setForm({...form, containerType: e.target.value})}
                    className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-gray-400 uppercase block">Cap Type</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. Plastic Screw"
                    value={form.capType}
                    onChange={(e) => setForm({...form, capType: e.target.value})}
                    className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-3">Technical Details</p>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[9px] text-gray-400 uppercase block">Nominal Heads</label>
                  <input 
                    type="number"
                    min="1"
                    placeholder="e.g. 10"
                    value={form.nominalHeads}
                    onChange={(e) => setForm({...form, nominalHeads: e.target.value})}
                    className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-gray-400 uppercase block">Primitive Diameter (mm)</label>
                  <input 
                    type="number"
                    step="0.1"
                    min="1"
                    placeholder="e.g. 240"
                    value={form.primitiveDiameter}
                    onChange={(e) => setForm({...form, primitiveDiameter: e.target.value})}
                    className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3">
              <button 
                type="button" 
                onClick={() => { setIsCreateModalOpen(false); setIsEditModalOpen(false); }}
                className="px-5 py-2.5 text-xs font-semibold tracking-wider text-gray-500 uppercase hover:bg-gray-50 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-5 py-2.5 text-xs font-bold tracking-wider text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors uppercase shadow-sm"
              >
                {isEditModalOpen ? "Save Changes" : "Save Model"}
              </button>
            </div>
          </form>
        </BaseModal>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && selectedModel && (
        <BaseModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Confirm Deletion"
        >
          <div className="space-y-6">
            <p className="text-sm font-light text-gray-600">
              Are you sure you want to delete <span className="font-semibold text-gray-900">{selectedModel.modelCode}</span> from the global catalog?
              <br/><br/>
              <span className="text-red-600 font-semibold text-xs">Note: You cannot delete a model if there are provisioned machines of this type in the field. Deactivate it instead.</span>
            </p>
            
            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-5 py-2.5 text-xs font-semibold tracking-wider text-gray-500 uppercase hover:bg-gray-50 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteSubmit}
                className="px-5 py-2.5 text-xs font-bold tracking-wider text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors uppercase shadow-sm"
              >
                Delete Model
              </button>
            </div>
          </div>
        </BaseModal>
      )}

    </div>
  );
};

export default ModelsPage;