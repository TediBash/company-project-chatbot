// src/pages/Commercial.jsx
import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { DynamicTable } from '../components/ui/DynamicTable';
import { BaseModal } from '../components/ui/BaseModal';
import { DynamicFilters } from '../components/ui/DynamicFilters';
import { jwtDecode } from 'jwt-decode';

export const CommercialPage = () => {
  // Decode Token to check permissions
  let isPlatformOwner = false;
  const token = localStorage.getItem('arol_token');
  if (token) {
    try {
      isPlatformOwner = jwtDecode(token).tenant?.isPlatformOwner === true;
    } catch (e) {}
  }

  // Data States
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({ totalRequests: 0, pendingAction: 0, activeOrders: 0 });
  const [options, setOptions] = useState({ companies: [], machines: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Pagination & Filters
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({ search: '', companyId: '', status: '', urgency: '' });

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);

  const initialFormState = {
    companyId: '', machineId: '', title: '', description: '', 
    type: 'Spare Parts', urgency: 'Standard', status: 'Requested',
    quoteUrl: '', poUrl: '', invoiceUrl: ''
  };
  const [form, setForm] = useState(initialFormState);

  // Fetch Options (Companies & Machines)
  useEffect(() => {
    apiClient.get('/commercial/options').then(res => setOptions(res.data)).catch(console.error);
  }, []);

  // Fetch Paginated Data
  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiClient.get('/commercial', { 
        params: { ...filters, page, limit: 25 } 
      });
      setRequests(response.data.data);
      setStats(response.data.stats);
      setTotalPages(response.data.pagination.totalPages);
    } catch (err) {
      console.error('Failed to load commercial records', err);
      setError('Unable to load commercial queue.');
    } finally {
      setIsLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => { fetchRequests(); }, 300);
    return () => clearTimeout(delayDebounce);
  }, [fetchRequests]);

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
    setPage(1);
  };

  // Handlers
  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (selectedRequest) {
        await apiClient.put(`/commercial/${selectedRequest.id}`, form);
      } else {
        await apiClient.post('/commercial', form);
      }
      setIsModalOpen(false);
      fetchRequests();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save request.');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this request?")) return;
    try {
      await apiClient.delete(`/commercial/${selectedRequest.id}`);
      setIsModalOpen(false);
      fetchRequests();
    } catch (err) {
      alert('Failed to delete request.');
    }
  };

  const openModal = (request = null) => {
    setSelectedRequest(request);
    if (request) {
      setForm({
        companyId: request.companyId || '',
        machineId: request.machineId || '',
        title: request.title || '',
        description: request.description || '',
        type: request.type || 'Spare Parts',
        urgency: request.urgency || 'Standard',
        status: request.status || 'Requested',
        quoteUrl: request.quoteUrl || '',
        poUrl: request.poUrl || '',
        invoiceUrl: request.invoiceUrl || ''
      });
    } else {
      setForm(initialFormState);
    }
    setIsModalOpen(true);
  };

  // UI Helpers
  const getStatusBadge = (status) => {
    const styles = {
      'Requested': 'bg-gray-100 text-gray-700 border-gray-200',
      'Quoted': 'bg-blue-50 text-blue-700 border-blue-200',
      'Approved': 'bg-purple-50 text-purple-700 border-purple-200',
      'Processing': 'bg-amber-50 text-amber-700 border-amber-200',
      'Shipped': 'bg-indigo-50 text-indigo-700 border-indigo-200',
      'Invoiced': 'bg-emerald-50 text-emerald-700 border-emerald-200',
      'Cancelled': 'bg-red-50 text-red-700 border-red-200'
    };
    return (
      <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${styles[status] || styles['Requested']}`}>
        {status}
      </span>
    );
  };

  const getUrgencyIcon = (urgency) => {
    if (urgency === 'Critical') return <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block mr-1.5" title="Critical"></span>;
    if (urgency === 'Urgent') return <span className="w-2 h-2 rounded-full bg-orange-500 inline-block mr-1.5" title="Urgent"></span>;
    if (urgency === 'Low') return <span className="w-2 h-2 rounded-full bg-gray-400 inline-block mr-1.5" title="Low Priority"></span>;
    return <span className="w-2 h-2 rounded-full bg-blue-400 inline-block mr-1.5" title="Standard"></span>;
  };

  // Dynamic Filter Configuration
  const filterConfig = [
    { name: 'search', type: 'text', placeholder: 'Search Ticket, Title, Company...', className: 'flex-1 min-w-[200px]' },
    {
      name: 'status', type: 'select', className: 'w-40',
      options: [
        { value: '', label: 'All Statuses' },
        { value: 'Requested', label: 'Requested' },
        { value: 'Quoted', label: 'Quoted' },
        { value: 'Approved', label: 'Approved' },
        { value: 'Processing', label: 'Processing' },
        { value: 'Shipped', label: 'Shipped' },
        { value: 'Invoiced', label: 'Invoiced' }
      ]
    },
    {
      name: 'urgency', type: 'select', className: 'w-40',
      options: [
        { value: '', label: 'All Urgencies' },
        { value: 'Critical', label: 'Critical' },
        { value: 'Urgent', label: 'Urgent' },
        { value: 'Standard', label: 'Standard' },
        { value: 'Low', label: 'Low Priority' }
      ]
    }
  ];

  if (isPlatformOwner) {
    filterConfig.splice(1, 0, {
      name: 'companyId', type: 'select', className: 'w-48',
      options: [
        { value: '', label: 'All Companies' },
        ...options.companies.map(c => ({ value: c.id, label: c.name }))
      ]
    });
  }

  // Table Columns
  const columns = [
    {
      key: 'ticket',
      label: 'Ticket / Request',
      render: (_, row) => (
        <div>
          <span className="text-[10px] font-bold tracking-widest text-[var(--color-tenant-primary)] block mb-0.5">{row.ticketNumber}</span>
          <span className="font-semibold text-gray-900 block text-sm">{row.title}</span>
          <span className="text-xs text-gray-500">{row.type}</span>
        </div>
      )
    },
    ...(isPlatformOwner ? [{
      key: 'client',
      label: 'Client Details',
      render: (_, row) => (
        <div>
          <span className="font-semibold text-gray-800 block text-sm">{row.companyName}</span>
          <span className="text-xs text-gray-500 font-light">{row.requesterName}</span>
        </div>
      )
    }] : []),
    {
      key: 'machine',
      label: 'Asset',
      render: (_, row) => (
        <span className="text-sm font-medium text-gray-700">
          {row.serialNumber || <span className="text-gray-400 italic font-light">General Supply</span>}
        </span>
      )
    },
    {
      key: 'status',
      label: 'Pipeline Status',
      render: (_, row) => getStatusBadge(row.status)
    },
    {
      key: 'urgency',
      label: 'Urgency',
      render: (_, row) => (
        <div className="flex items-center text-xs font-medium text-gray-700">
          {getUrgencyIcon(row.urgency)}
          {row.urgency}
        </div>
      )
    },
    {
      key: 'date',
      label: 'Date',
      render: (_, row) => <span className="text-gray-500 text-xs">{row.createdAt}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <button 
          onClick={() => openModal(row)}
          className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-tenant-primary)] hover:opacity-80 transition-opacity"
        >
          {isPlatformOwner ? 'Manage' : 'View / Edit'}
        </button>
      )
    }
  ];

  return (
    <div className="p-8 md:p-12 lg:p-16 animate-in fade-in duration-500">
      
      <header className="flex flex-col lg:flex-row lg:items-end justify-between pb-6 border-b border-gray-200 gap-6 mb-8">
        <div className="space-y-1">
          <p className={`text-[11px] font-semibold tracking-[0.2em] uppercase ${isPlatformOwner ? 'text-red-600' : 'text-[var(--color-tenant-primary)]'}`}>
            {isPlatformOwner ? 'Global Inbox' : 'Procurement'}
          </p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight text-gray-900">
            Commercial & Quotes
          </h1>
        </div>
        
        {/* Automatic Counters */}
        <div className="flex items-center gap-6 text-sm font-medium text-gray-700 bg-white px-6 py-3 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Total Requests</span>
            <span className="text-lg">{stats.totalRequests}</span>
          </div>
          <div className="w-px h-8 bg-gray-200"></div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Pending Action</span>
            <span className="text-lg text-orange-500">{stats.pendingAction}</span>
          </div>
          <div className="w-px h-8 bg-gray-200"></div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Active Orders</span>
            <span className="text-lg text-emerald-600">{stats.activeOrders}</span>
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
            !isPlatformOwner && (
              <button 
                onClick={() => openModal()} 
                className="px-6 py-2 text-xs font-bold text-white bg-[var(--color-tenant-primary)] hover:opacity-90 rounded-md uppercase tracking-wider shadow-sm"
              >
                + New Request
              </button>
            )
          }
        />
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-sm font-light text-red-600">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <DynamicTable columns={columns} data={requests} isLoading={isLoading} />
        
        {/* Pagination Footer */}
        {!isLoading && stats.totalRequests > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500 font-medium">
              Showing <span className="font-bold text-gray-900">{(page - 1) * 25 + 1}</span> to <span className="font-bold text-gray-900">{Math.min(page * 25, stats.totalRequests)}</span> of <span className="font-bold text-gray-900">{stats.totalRequests}</span> requests
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
          title={selectedRequest ? `Manage Ticket: ${selectedRequest.ticketNumber}` : "Submit New Request"}
          size="lg"
        >
          <form onSubmit={handleSave} className="space-y-6">
            
            {/* Core Info (Editable only when creating) */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Request Title</label>
                <input 
                  type="text" required disabled={!!selectedRequest}
                  value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} 
                  className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)] disabled:bg-gray-50 disabled:text-gray-500" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Target Machine</label>
                <select 
                  value={form.machineId} disabled={!!selectedRequest}
                  onChange={(e) => setForm({...form, machineId: e.target.value})} 
                  className="w-full border-b border-gray-300 py-2 text-sm bg-white focus:outline-none focus:border-[var(--color-tenant-primary)] disabled:bg-gray-50 disabled:text-gray-500"
                >
                  <option value="">General Plant Supply (No Machine)</option>
                  {options.machines.map(m => <option key={m.id} value={m.id}>{m.serial} - {m.location}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Detailed Description</label>
              <textarea 
                required disabled={!!selectedRequest} rows={3}
                value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} 
                className="w-full border border-gray-300 rounded-md p-3 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)] disabled:bg-gray-50 disabled:text-gray-500" 
              />
            </div>

            <div className="grid grid-cols-3 gap-6 pb-4 border-b border-gray-100">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Request Type</label>
                <select 
                  value={form.type} disabled={!!selectedRequest}
                  onChange={(e) => setForm({...form, type: e.target.value})} 
                  className="w-full border-b border-gray-300 py-2 text-sm bg-white disabled:bg-gray-50"
                >
                  <option value="Spare Parts">Spare Parts</option>
                  <option value="Machine Upgrade">Machine Upgrade</option>
                  <option value="Maintenance Service">Maintenance Service</option>
                  <option value="Consumables">Consumables</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Urgency</label>
                <select 
                  value={form.urgency} disabled={!!selectedRequest && !isPlatformOwner}
                  onChange={(e) => setForm({...form, urgency: e.target.value})} 
                  className="w-full border-b border-gray-300 py-2 text-sm bg-white disabled:bg-gray-50"
                >
                  <option value="Low">Low Priority</option>
                  <option value="Standard">Standard</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Critical">Critical (Line Down)</option>
                </select>
              </div>
              
              {/* Pipeline Status (Only Admins can change at will, Clients can only move from Quoted -> Approved) */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Pipeline Status</label>
                <select 
                  value={form.status} disabled={!selectedRequest || (!isPlatformOwner && form.status !== 'Quoted')}
                  onChange={(e) => setForm({...form, status: e.target.value})} 
                  className="w-full border-b border-gray-300 py-2 text-sm font-semibold bg-white disabled:bg-gray-50"
                >
                  <option value="Requested">Requested</option>
                  <option value="Quoted" disabled={!isPlatformOwner}>Quoted</option>
                  <option value="Approved">Approved</option>
                  <option value="Processing" disabled={!isPlatformOwner}>Processing</option>
                  <option value="Shipped" disabled={!isPlatformOwner}>Shipped</option>
                  <option value="Invoiced" disabled={!isPlatformOwner}>Invoiced</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {/* DOCUMENT VAULT */}
            {selectedRequest && (
              <div className="pt-2 space-y-4 bg-gray-50/50 p-4 rounded-lg border border-gray-100">
                <h4 className="text-[11px] uppercase tracking-widest font-bold text-gray-900 mb-2">Document Vault</h4>
                
                {/* Quote (Uploaded by AROL) */}
                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-gray-400 font-semibold block">AROL Quote PDF URL</label>
                    <input 
                      type="text" placeholder="https://..." value={form.quoteUrl} 
                      disabled={!isPlatformOwner} onChange={(e) => setForm({...form, quoteUrl: e.target.value})} 
                      className="w-full border-b border-gray-300 py-1 text-xs focus:outline-none focus:border-[var(--color-tenant-primary)] disabled:bg-transparent" 
                    />
                  </div>
                  {form.quoteUrl && (
                    <a href={form.quoteUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 hover:underline mt-4 shrink-0">View Quote</a>
                  )}
                </div>

                {/* Purchase Order (Uploaded by Client) */}
                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-gray-400 font-semibold block">Client Purchase Order (PO) URL</label>
                    <input 
                      type="text" placeholder="Upload your PO link here to approve..." value={form.poUrl} 
                      disabled={isPlatformOwner} onChange={(e) => setForm({...form, poUrl: e.target.value})} 
                      className="w-full border-b border-gray-300 py-1 text-xs focus:outline-none focus:border-[var(--color-tenant-primary)] disabled:bg-transparent" 
                    />
                  </div>
                  {form.poUrl && (
                    <a href={form.poUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-purple-600 hover:underline mt-4 shrink-0">View PO</a>
                  )}
                </div>

                {/* Invoice (Uploaded by AROL) */}
                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-gray-400 font-semibold block">AROL Final Invoice URL</label>
                    <input 
                      type="text" placeholder="https://..." value={form.invoiceUrl} 
                      disabled={!isPlatformOwner} onChange={(e) => setForm({...form, invoiceUrl: e.target.value})} 
                      className="w-full border-b border-gray-300 py-1 text-xs focus:outline-none focus:border-[var(--color-tenant-primary)] disabled:bg-transparent" 
                    />
                  </div>
                  {form.invoiceUrl && (
                    <a href={form.invoiceUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-emerald-600 hover:underline mt-4 shrink-0">View Invoice</a>
                  )}
                </div>
              </div>
            )}

            <div className="pt-4 flex justify-between gap-3">
              {selectedRequest && isPlatformOwner ? (
                <button type="button" onClick={handleDelete} className="px-5 py-2.5 text-xs font-bold tracking-wider text-red-500 uppercase hover:bg-red-50 rounded-md">Delete Request</button>
              ) : <div></div>}
              
              <div className="flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-xs font-semibold tracking-wider text-gray-500 uppercase hover:bg-gray-50 rounded-md">Cancel</button>
                <button type="submit" className="px-5 py-2.5 text-xs font-bold tracking-wider text-white bg-[var(--color-tenant-primary)] hover:opacity-90 rounded-md uppercase">
                  {selectedRequest ? "Save Updates" : "Submit Request"}
                </button>
              </div>
            </div>
          </form>
        </BaseModal>
      )}

    </div>
  );
};

export default CommercialPage;