// src/pages/Companies.jsx
import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { DynamicTable } from '../components/ui/DynamicTable';
import { BaseModal } from '../components/ui/BaseModal';

export const CompaniesPage = () => {
  // Data States
  const [companies, setCompanies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);

  // Form State
  const initialFormState = {
    companyName: '',
    country: '',
    city: '',
    sector: '',
    subdomainSlug: '',
    primaryColor: '#2563eb',
    secondaryColor: '#1e40af',
    logoUrl: '' // Added Logo URL to state
  };
  const [form, setForm] = useState(initialFormState);

  const fetchCompanies = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiClient.get('/companies', { params: { search } });
      setCompanies(response.data);
    } catch (err) {
      console.error('Error fetching companies:', err);
      setError('Failed to load companies. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchCompanies();
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [fetchCompanies]);

  const handleNameChange = (e) => {
    const name = e.target.value;
    setForm(prev => {
      const currentGeneratedSlug = prev.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      if (prev.subdomainSlug === currentGeneratedSlug || prev.subdomainSlug === '') {
        return {
          ...prev,
          companyName: name,
          subdomainSlug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
        };
      }
      return { ...prev, companyName: name };
    });
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/companies', form);
      setIsCreateModalOpen(false);
      fetchCompanies();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create company.');
    }
  };

  const handleUpdateSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiClient.put(`/companies/${selectedCompany.id}`, form);
      setIsEditModalOpen(false);
      fetchCompanies();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update company.');
    }
  };

  const handleDeleteSubmit = async () => {
    try {
      await apiClient.delete(`/companies/${selectedCompany.id}`);
      setIsDeleteModalOpen(false);
      fetchCompanies();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete company.');
    }
  };

  const openCreateModal = () => {
    setForm(initialFormState);
    setIsCreateModalOpen(true);
  };

  const openEditModal = (company) => {
    setSelectedCompany(company);
    setForm({
      companyName: company.companyName,
      country: company.country,
      city: company.city,
      sector: company.sector,
      subdomainSlug: company.subdomainSlug,
      primaryColor: company.primaryColor,
      secondaryColor: company.secondaryColor,
      logoUrl: company.logoUrl || '' // Load existing logo if present
    });
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (company) => {
    setSelectedCompany(company);
    setIsDeleteModalOpen(true);
  };

  const columns = [
    {
      key: 'companyName',
      label: 'Company',
      render: (_, row) => (
        <div className="flex items-center gap-3">
          {/* Display Logo if exists, otherwise display Color Block */}
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-sm flex-shrink-0 bg-white border border-gray-100 overflow-hidden"
            style={{ backgroundColor: row.logoUrl ? 'transparent' : row.primaryColor }}
          >
            {row.logoUrl ? (
              <img src={row.logoUrl} alt={row.companyName} className="w-full h-full object-contain" />
            ) : (
              <span className="font-bold text-xs">{row.companyName.charAt(0)}</span>
            )}
          </div>
          <div>
            <span className="font-semibold text-gray-900 block">{row.companyName}</span>
            {row.isPlatformOwner && (
              <span className="text-[9px] uppercase tracking-widest font-bold text-red-500">Platform Owner</span>
            )}
          </div>
        </div>
      )
    },
    {
      key: 'location',
      label: 'Location',
      render: (_, row) => <span className="text-gray-600 font-light">{row.city}, {row.country}</span>
    },
    {
      key: 'sector',
      label: 'Sector',
      render: (val) => <span className="text-gray-600 font-light">{val}</span>
    },
    {
      key: 'subdomainSlug',
      label: 'Login Portal',
      render: (val) => (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
          {/* Changed from .arol.com to .com */}
          {val}.com
        </span>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-4">
          <button 
            onClick={() => openEditModal(row)}
            className="text-xs font-semibold uppercase tracking-widest text-gray-400 hover:text-blue-600 transition-colors"
          >
            Edit
          </button>
          {!row.isPlatformOwner && (
            <button 
              onClick={() => openDeleteModal(row)}
              className="text-xs font-semibold uppercase tracking-widest text-gray-400 hover:text-red-500 transition-colors"
            >
              Delete
            </button>
          )}
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
            Tenant Management
          </h1>
        </div>
        <button 
          onClick={openCreateModal}
          className="self-start sm:self-auto px-6 py-2.5 text-xs font-bold tracking-wider text-white transition-all duration-300 rounded-md bg-red-600 hover:bg-red-700 shadow-sm uppercase"
        >
          + Onboard Company
        </button>
      </header>

      <div className="flex flex-wrap gap-4 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <input 
          type="text" 
          placeholder="Search by name, location, or sector..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[250px] px-0 py-2 text-sm bg-transparent border-0 border-b border-gray-200 focus:ring-0 focus:border-red-600 transition-colors"
        />
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-sm font-light text-red-600">
          {error}
        </div>
      )}

      <DynamicTable 
        columns={columns} 
        data={companies} 
        isLoading={isLoading}
      />

      {(isCreateModalOpen || isEditModalOpen) && (
        <BaseModal
          isOpen={true}
          onClose={() => { setIsCreateModalOpen(false); setIsEditModalOpen(false); }}
          title={isEditModalOpen ? "Update Tenant Settings" : "Onboard New Tenant"}
        >
          <form onSubmit={isEditModalOpen ? handleUpdateSubmit : handleCreateSubmit} className="space-y-6">
            
            {/* Informational block during creation */}
            {!isEditModalOpen && (
              <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-lg">
                <p className="text-xs text-blue-800 font-bold uppercase tracking-widest mb-1">Auto-Provisioning</p>
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  Creating this tenant will automatically generate a default administrator account:<br/>
                  <strong>Email:</strong> admin@{form.subdomainSlug || 'domain'}.com <br/>
                  <strong>Password:</strong> admin123
                </p>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Company Name</label>
              <input 
                type="text"
                required
                value={form.companyName}
                onChange={handleNameChange}
                className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Login Subdomain Slug</label>
              <div className="flex items-end w-full">
                <input 
                  type="text"
                  required
                  value={form.subdomainSlug}
                  onChange={(e) => setForm({...form, subdomainSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})}
                  className="flex-1 border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600"
                />
                <span className="border-b border-gray-300 py-2 text-sm text-gray-400 pointer-events-none select-none px-1">
                  .com
                </span>
              </div>
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Brand Logo URL (Optional)</label>
              <input 
                type="url"
                placeholder="https://example.com/logo.png"
                value={form.logoUrl}
                onChange={(e) => setForm({...form, logoUrl: e.target.value})}
                className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Country</label>
                <input 
                  type="text"
                  required
                  value={form.country}
                  onChange={(e) => setForm({...form, country: e.target.value})}
                  className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">City</label>
                <input 
                  type="text"
                  required
                  value={form.city}
                  onChange={(e) => setForm({...form, city: e.target.value})}
                  className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Industry Sector</label>
              <input 
                type="text"
                required
                value={form.sector}
                onChange={(e) => setForm({...form, sector: e.target.value})}
                className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-red-600"
              />
            </div>

            <div className="pt-2">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-3">UI Branding Colors</p>
              <div className="grid grid-cols-2 gap-6">
                
                <div className="flex items-center gap-3 border-b border-gray-300 pb-1">
                  <input 
                    type="color"
                    value={form.primaryColor}
                    onChange={(e) => setForm({...form, primaryColor: e.target.value})}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                  />
                  <div className="flex-1">
                    <label className="text-[9px] text-gray-400 uppercase block">Primary Hex</label>
                    <input 
                      type="text"
                      value={form.primaryColor}
                      onChange={(e) => setForm({...form, primaryColor: e.target.value})}
                      className="w-full text-sm focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 border-b border-gray-300 pb-1">
                  <input 
                    type="color"
                    value={form.secondaryColor}
                    onChange={(e) => setForm({...form, secondaryColor: e.target.value})}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                  />
                  <div className="flex-1">
                    <label className="text-[9px] text-gray-400 uppercase block">Secondary Hex</label>
                    <input 
                      type="text"
                      value={form.secondaryColor}
                      onChange={(e) => setForm({...form, secondaryColor: e.target.value})}
                      className="w-full text-sm focus:outline-none"
                    />
                  </div>
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
                {isEditModalOpen ? "Save Changes" : "Create Tenant"}
              </button>
            </div>
          </form>
        </BaseModal>
      )}

      {isDeleteModalOpen && selectedCompany && (
        <BaseModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Confirm Deletion"
        >
          <div className="space-y-6">
            <p className="text-sm font-light text-gray-600">
              Are you sure you want to delete <span className="font-semibold text-gray-900">{selectedCompany.companyName}</span>? 
              This will remove their tenant access. <br/><br/>
              <span className="text-red-600 font-semibold text-xs">Note: You cannot delete a company if they still have registered users or machines.</span>
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
                Delete Company
              </button>
            </div>
          </div>
        </BaseModal>
      )}

    </div>
  );
};

export default CompaniesPage;