// src/pages/Quotes.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { DynamicTable } from '../components/ui/DynamicTable';
import { BaseModal } from '../components/ui/BaseModal';
import { DynamicFilters } from '../components/ui/DynamicFilters';
import { jwtDecode } from 'jwt-decode';

export const QuotesPage = () => {
  const navigate = useNavigate();

  // Decode Token to check permissions
  let isPlatformOwner = false;
  const token = localStorage.getItem('arol_token');
  if (token) {
    try {
      isPlatformOwner = jwtDecode(token).tenant?.isPlatformOwner === true;
    } catch (e) {}
  }

  // Data States
  const [quotes, setQuotes] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [options, setOptions] = useState({ companies: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Pagination & Filters
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({ search: '', companyId: '', validity: '' });

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);

  const initialFormState = {
    companyId: '',
    description: '',
    currency: 'EUR',
    validUntil: ''
  };
  const [form, setForm] = useState(initialFormState);

  // Fetch Companies (Only if Admin)
  useEffect(() => {
    if (isPlatformOwner) {
      apiClient.get('/companies').then(res => {
        setOptions(prev => ({ ...prev, companies: res.data || [] }));
      }).catch(console.error);
    }
  }, [isPlatformOwner]);

  // Fetch Paginated Data
  const fetchQuotes = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiClient.get('/quotes', { 
        params: { ...filters, page, limit: 25 } 
      });
      setQuotes(response.data.data);
      setTotalRecords(response.data.pagination.total);
      setTotalPages(response.data.pagination.totalPages);
    } catch (err) {
      console.error('Failed to load quotes', err);
      setError('Unable to load commercial quotes.');
    } finally {
      setIsLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => { fetchQuotes(); }, 300);
    return () => clearTimeout(delayDebounce);
  }, [fetchQuotes]);

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
    setPage(1);
  };

  // Handlers
  const handleSave = async (e) => {
    e.preventDefault();
    if (isPlatformOwner && !form.companyId && !selectedQuote) {
      alert('Please select a target company for this quote.');
      return;
    }

    try {
      if (selectedQuote) {
        await apiClient.put(`/quotes/${selectedQuote.id}`, form);
      } else {
        await apiClient.post('/quotes', form);
      }
      setIsModalOpen(false);
      fetchQuotes();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save quote.');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to permanently delete this quote? This will also delete all revisions and line items.")) return;
    try {
      await apiClient.delete(`/quotes/${selectedQuote.id}`);
      setIsModalOpen(false);
      fetchQuotes();
    } catch (err) {
      alert('Failed to delete quote.');
    }
  };

  const openModal = (quote = null) => {
    setSelectedQuote(quote);
    if (quote) {
      setForm({
        companyId: quote.companyId || '',
        description: quote.description || '',
        currency: quote.currency || 'EUR',
        validUntil: quote.validUntil ? new Date(quote.validUntil).toISOString().split('T')[0] : ''
      });
    } else {
      setForm(initialFormState);
    }
    setIsModalOpen(true);
  };

  // Dynamic Filter Configuration
  const filterConfig = [
    { name: 'search', type: 'text', placeholder: 'Search description...', className: 'flex-1 min-w-[200px]' },
    {
      name: 'validity', type: 'select', className: 'w-40',
      options: [
        { value: '', label: 'All Quotes' },
        { value: 'active', label: 'Active' },
        { value: 'expired', label: 'Expired' }
      ]
    }
  ];

  if (isPlatformOwner) {
    filterConfig.splice(1, 0, {
      name: 'companyId', type: 'select', className: 'w-48',
      options: [
        { value: '', label: 'All Companies' },
        // Safely extract the name regardless of backend casing
        ...options.companies.map(c => ({ 
          value: c.id || c.company_id, 
          label: c.name || c.companyName || c.company_name || c.id || 'Unknown Company' 
        }))
      ]
    });
  }

  // Table Columns
  const columns = [
    {
      key: 'quote',
      label: 'Quote Details',
      render: (_, row) => (
        <div>
          <span className="font-semibold text-gray-900 block text-sm line-clamp-1">{row.description || 'No Description'}</span>
          <span className="text-[10px] font-bold tracking-widest text-gray-500 block uppercase mt-0.5">ID: {row.id.split('-')[0]}...</span>
        </div>
      )
    },
    ...(isPlatformOwner ? [{
      key: 'company',
      label: 'Client Company',
      render: (_, row) => {
        // 1. Safely match the ID regardless of backend casing
        const company = options.companies.find(c => 
          (c.id || c.company_id) === row.companyId
        );
        
        // 2. Safely extract the name regardless of backend casing
        const displayName = company 
          ? (company.name || company.companyName || company.company_name || 'Unnamed Company') 
          : (row.companyId || 'Unknown');

        return (
          <span className="font-semibold text-[var(--color-tenant-primary)] text-sm block">
            {displayName}
          </span>
        );
      }
    }] : []),
    {
      key: 'orderStatus',
      label: 'Order Status',
      render: (_, row) => {
        if (row.hasOrder) {
          return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-widest border border-emerald-200">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              Ordered
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-50 text-gray-500 text-[10px] font-bold uppercase tracking-widest border border-gray-200">
            Pending
          </span>
        );
      }
    },
    {
      key: 'validity',
      label: 'Valid Until',
      render: (_, row) => {
        const isExpired = new Date(row.validUntil) < new Date();
        return (
          <div>
            <span className={`text-sm font-medium ${isExpired ? 'text-red-500' : 'text-gray-700'}`}>
              {new Date(row.validUntil).toLocaleDateString()}
            </span>
            {isExpired && <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-50 text-red-600 border border-red-200">Expired</span>}
          </div>
        );
      }
    },
    {
      key: 'currency',
      label: 'Currency',
      render: (_, row) => (
        <span className="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs font-bold tracking-widest">
          {row.currency}
        </span>
      )
    },
    {
      key: 'createdAt',
      label: 'Created Date',
      render: (_, row) => <span className="text-gray-500 text-xs">{new Date(row.createdAt).toLocaleDateString()}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex gap-4 items-center">
          {isPlatformOwner && (
            <button 
              onClick={() => openModal(row)}
              className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-colors"
            >
              Edit Info
            </button>
          )}
          <button 
            onClick={() => navigate(`/commercial/quotes/${row.id}`)}
            className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-tenant-primary)] hover:opacity-80 transition-opacity bg-blue-50 px-2 py-1.5 rounded"
          >
            Manage Builder &rarr;
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="p-8 md:p-12 lg:p-16 animate-in fade-in duration-500">
      
      <header className="flex flex-col lg:flex-row lg:items-end justify-between pb-6 border-b border-gray-200 gap-6 mb-8">
        <div className="space-y-1">
          <p className={`text-[11px] font-semibold tracking-[0.2em] uppercase ${isPlatformOwner ? 'text-red-600' : 'text-[var(--color-tenant-primary)]'}`}>
            {isPlatformOwner ? 'Global Commercial' : 'Procurement'}
          </p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight text-gray-900">
            Quote Management
          </h1>
        </div>
        
        <div className="flex items-center gap-6 text-sm font-medium text-gray-700 bg-white px-6 py-3 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Total Quotes</span>
            <span className="text-lg">{totalRecords}</span>
          </div>
        </div>
      </header>

      {/* Dynamic Filters Component */}
      <div className="mb-6">
        <DynamicFilters 
          config={filterConfig} 
          values={filters} 
          onChange={handleFilterChange} 
          actionButton={
            isPlatformOwner ? (
              <button 
                onClick={() => openModal()} 
                className="px-6 py-2 text-xs font-bold text-white rounded-md uppercase tracking-wider shadow-sm transition-colors bg-gray-900 hover:bg-black"
              >
                + Create Quote
              </button>
            ) : null
          }
        />
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-sm font-light text-red-600">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <DynamicTable columns={columns} data={quotes} isLoading={isLoading} />
        
        {/* Pagination Footer */}
        {!isLoading && totalRecords > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500 font-medium">
              Showing <span className="font-bold text-gray-900">{(page - 1) * 25 + 1}</span> to <span className="font-bold text-gray-900">{Math.min(page * 25, totalRecords)}</span> of <span className="font-bold text-gray-900">{totalRecords}</span> quotes
            </p>
            <div className="flex gap-2">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed uppercase"
              >
                Prev
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

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <BaseModal 
          isOpen={true} 
          onClose={() => setIsModalOpen(false)} 
          title={selectedQuote ? "Update Quote Details" : "Create New Quote"}
        >
          <form onSubmit={handleSave} className="space-y-6">
            
            {/* Conditional Company Selector for Platform Owners */}
            {isPlatformOwner && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Target Client Company</label>
                <select 
                  required disabled={!!selectedQuote} // Prevent changing company after creation
                  value={form.companyId} 
                  onChange={(e) => setForm({...form, companyId: e.target.value})} 
                  className="w-full border-b border-gray-300 py-2 text-sm bg-white focus:outline-none focus:border-[var(--color-tenant-primary)] disabled:bg-gray-50 disabled:text-gray-500"
                >
                  <option value="">-- Select a Client --</option>
                  {options.companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Quote Description</label>
              <textarea 
                required rows={3}
                placeholder="e.g. Scheduled 12000 h closure head overhaul..."
                value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} 
                className="w-full border border-gray-300 rounded-md p-3 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]" 
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Currency</label>
                <select 
                  required
                  value={form.currency} 
                  onChange={(e) => setForm({...form, currency: e.target.value})} 
                  className="w-full border-b border-gray-300 py-2 text-sm bg-white focus:outline-none focus:border-[var(--color-tenant-primary)]"
                >
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Valid Until</label>
                <input 
                  type="date" required
                  value={form.validUntil} 
                  onChange={(e) => setForm({...form, validUntil: e.target.value})} 
                  className="w-full border-b border-gray-300 py-2 text-sm bg-white focus:outline-none focus:border-[var(--color-tenant-primary)]"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-between gap-3 border-t border-gray-100">
              {selectedQuote ? (
                <button type="button" onClick={handleDelete} className="px-5 py-2.5 text-xs font-bold tracking-wider text-red-500 uppercase hover:bg-red-50 rounded-md">Delete Quote</button>
              ) : <div></div>}
              
              <div className="flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-xs font-semibold tracking-wider text-gray-500 uppercase hover:bg-gray-50 rounded-md">Cancel</button>
                <button type="submit" className={`px-5 py-2.5 text-xs font-bold tracking-wider text-white rounded-md uppercase ${isPlatformOwner ? 'bg-gray-900 hover:bg-black' : 'bg-[var(--color-tenant-primary)] hover:opacity-90'}`}>
                  {selectedQuote ? "Save Updates" : "Create Quote"}
                </button>
              </div>
            </div>
          </form>
        </BaseModal>
      )}
    </div>
  );
};

export default QuotesPage;