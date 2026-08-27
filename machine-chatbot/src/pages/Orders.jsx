// src/pages/Orders.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { DynamicTable } from '../components/ui/DynamicTable';
import { BaseModal } from '../components/ui/BaseModal';
import { DynamicFilters } from '../components/ui/DynamicFilters';
import { jwtDecode } from 'jwt-decode';

export const OrdersPage = () => {
  const navigate = useNavigate();

  let isPlatformOwner = false;
  let userCompanyId = ''; // <-- ADD THIS
  
  const token = localStorage.getItem('arol_token');
  if (token) {
    try {
      const decoded = jwtDecode(token);
      isPlatformOwner = decoded.tenant?.isPlatformOwner === true;
      userCompanyId = decoded.tenant?.companyId || '';
    } catch (e) {}
  }

  // Data States
  const [orders, setOrders] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [options, setOptions] = useState({ companies: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Cascading Dropdown States
  const [availableQuotes, setAvailableQuotes] = useState([]);
  const [availableRevisions, setAvailableRevisions] = useState([]);
  const [isLoadingCascade, setIsLoadingCascade] = useState(false);

  // Pagination & Filters
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({ search: '', companyId: '', orderStatus: '' });

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const initialFormState = {
    companyId: '',
    quoteId: '',
    quoteRevisionId: '',
    orderStatus: 'Confirmed',
    shipmentStatus: 'Pending',
    orderDate: new Date().toISOString().split('T')[0],
    expectedDeliveryDate: '',
    currency: 'EUR',
    notes: ''
  };
  const [form, setForm] = useState(initialFormState);

  // Fetch Companies
  useEffect(() => {
    if (isPlatformOwner) {
      apiClient.get('/companies').then(res => {
        setOptions(prev => ({ ...prev, companies: res.data || [] }));
      }).catch(console.error);
    }
  }, [isPlatformOwner]);

  // CASCADING EFFECT 1: Fetch Quotes when Company is selected
  useEffect(() => {
    if (form.companyId) {
      setIsLoadingCascade(true);
      apiClient.get('/quotes', { params: { companyId: form.companyId, limit: 100 } })
        .then(res => setAvailableQuotes(res.data.data || []))
        .catch(console.error)
        .finally(() => setIsLoadingCascade(false));
    } else {
      setAvailableQuotes([]);
    }
  }, [form.companyId]);

  // CASCADING EFFECT 2: Fetch Revisions when Quote is selected
  useEffect(() => {
    if (form.quoteId) {
      setIsLoadingCascade(true);
      apiClient.get(`/quotes/${form.quoteId}`)
        .then(res => setAvailableRevisions(res.data.revisions || []))
        .catch(console.error)
        .finally(() => setIsLoadingCascade(false));
    } else {
      setAvailableRevisions([]);
    }
  }, [form.quoteId]);

  // Fetch Paginated Orders
  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiClient.get('/orders', { 
        params: { ...filters, page, limit: 25 } 
      });
      setOrders(response.data.data);
      setTotalRecords(response.data.pagination.total);
      setTotalPages(response.data.pagination.totalPages);
    } catch (err) {
      console.error('Failed to load orders', err);
      setError('Unable to load commercial orders.');
    } finally {
      setIsLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => { fetchOrders(); }, 300);
    return () => clearTimeout(delayDebounce);
  }, [fetchOrders]);

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
    setPage(1);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isPlatformOwner && !form.companyId && !selectedOrder) {
      alert('Please select a target company for this order.');
      return;
    }

    try {
      if (selectedOrder) {
        await apiClient.put(`/orders/${selectedOrder.id}`, form);
      } else {
        await apiClient.post('/orders', form);
      }
      setIsModalOpen(false);
      fetchOrders();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save order.');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to permanently delete this order? This will also delete all associated order lines.")) return;
    try {
      await apiClient.delete(`/orders/${selectedOrder.id}`);
      setIsModalOpen(false);
      fetchOrders();
    } catch (err) {
      alert('Failed to delete order.');
    }
  };

  const openModal = (order = null) => {
    setSelectedOrder(order);
    if (order) {
      setForm({
        companyId: order.companyId || '',
        quoteId: order.quoteId || '',
        quoteRevisionId: order.quoteRevisionId || '', // Note: Assuming backend returns this if available
        orderStatus: order.orderStatus || 'Confirmed',
        shipmentStatus: order.shipmentStatus || 'Pending',
        orderDate: order.orderDate ? new Date(order.orderDate).toISOString().split('T')[0] : '',
        expectedDeliveryDate: order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate).toISOString().split('T')[0] : '',
        currency: order.currency || 'EUR',
        notes: order.notes || ''
      });
    } else {
      setForm({...initialFormState, companyId: isPlatformOwner ? '' : userCompanyId});
    }
    setIsModalOpen(true);
  };

  const filterConfig = [
    { name: 'search', type: 'text', placeholder: 'Search ID or notes...', className: 'flex-1 min-w-[200px]' },
    { name: 'quoteId', type: 'text', placeholder: 'Filter by Quote ID...', className: 'w-48' },
    {
      name: 'orderStatus', type: 'select', className: 'w-48',
      options: [
        { value: '', label: 'All Statuses' },
        { value: 'Confirmed', label: 'Confirmed' },
        { value: 'In production', label: 'In Production' },
        { value: 'Closed', label: 'Closed' },
        { value: 'Cancelled', label: 'Cancelled' }
      ]
    }
  ];

  if (isPlatformOwner) {
    filterConfig.splice(1, 0, {
      name: 'companyId', type: 'select', className: 'w-48',
      options: [
        { value: '', label: 'All Companies' },
        ...options.companies.map(c => ({ 
          value: c.id || c.company_id, 
          label: c.name || c.companyName || c.company_name || c.id || 'Unknown Company' 
        }))
      ]
    });
  }

  const getStatusBadge = (status, type = 'order') => {
    if (!status) return null;
    let colorClass = 'bg-gray-100 text-gray-600 border-gray-200';
    const s = status.toLowerCase();
    
    if (s.includes('confirm') || s.includes('ready')) colorClass = 'bg-blue-50 text-blue-700 border-blue-200';
    if (s.includes('production') || s.includes('transit')) colorClass = 'bg-amber-50 text-amber-700 border-amber-200';
    if (s.includes('deliver') || s.includes('close')) colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s.includes('cancel')) colorClass = 'bg-red-50 text-red-700 border-red-200';

    return (
      <span className={`inline-flex px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider border ${colorClass}`}>
        {status}
      </span>
    );
  };

  const columns = [
    {
      key: 'orderDetails',
      label: 'Order Details',
      render: (_, row) => (
        <div>
          <span className="font-semibold text-gray-900 block text-sm">{row.id.split('-')[0]}-{row.id.split('-')[1]}</span>
          {row.notes && <span className="text-xs text-gray-500 block mt-0.5 line-clamp-1">{row.notes}</span>}
        </div>
      )
    },
    {
      key: 'linkedQuote',
      label: 'Linked Quote',
      render: (_, row) => {
        if (!row.quoteId && !row.quoteRevisionId) {
          return <span className="text-gray-400 text-xs italic font-light">Manual Order</span>;
        }
        return (
          <div>
            {row.quoteId && (
              <span className="font-semibold text-[var(--color-tenant-primary)] block text-sm">
                QTE-{row.quoteId.split('-')[0].toUpperCase()}
              </span>
            )}
            {row.quoteRevisionId && (
              <span className="text-[10px] font-bold tracking-widest text-gray-500 block uppercase mt-0.5">
                Rev: {row.quoteRevisionId.split('-')[0]}
              </span>
            )}
          </div>
        );
      }
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
      key: 'timeline',
      label: 'Timeline',
      render: (_, row) => (
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex justify-between w-32 text-gray-500">
            <span>Ordered:</span>
            <span className="font-medium text-gray-700">{row.orderDate ? new Date(row.orderDate).toLocaleDateString() : '-'}</span>
          </div>
          <div className="flex justify-between w-32 text-gray-500">
            <span>ETA:</span>
            <span className="font-medium text-gray-700">{row.expectedDeliveryDate ? new Date(row.expectedDeliveryDate).toLocaleDateString() : '-'}</span>
          </div>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Fulfillment Status',
      render: (_, row) => (
        <div className="flex flex-col gap-1.5 items-start">
          {getStatusBadge(row.orderStatus, 'order')}
          {getStatusBadge(row.shipmentStatus, 'shipment')}
        </div>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex gap-4 items-center">
          {/* Conditionally hide Edit Info for standard users */}
          {isPlatformOwner && (
            <button 
              onClick={() => openModal(row)}
              className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-colors"
            >
              Edit Info
            </button>
          )}
          <button 
            onClick={() => navigate(`/commercial/orders/${row.id}`)}
            className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-tenant-primary)] hover:opacity-80 transition-opacity bg-blue-50 px-2 py-1.5 rounded"
          >
            Track Fulfillment &rarr;
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
            {isPlatformOwner ? 'Global Administration' : 'Procurement'}
          </p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight text-gray-900">
            Order Management
          </h1>
        </div>
        
        <div className="flex items-center gap-6 text-sm font-medium text-gray-700 bg-white px-6 py-3 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Total Orders</span>
            <span className="text-lg">{totalRecords}</span>
          </div>
        </div>
      </header>

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
                + Create Order
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
        <DynamicTable columns={columns} data={orders} isLoading={isLoading} />
        
        {!isLoading && totalRecords > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500 font-medium">
              Showing <span className="font-bold text-gray-900">{(page - 1) * 25 + 1}</span> to <span className="font-bold text-gray-900">{Math.min(page * 25, totalRecords)}</span> of <span className="font-bold text-gray-900">{totalRecords}</span> orders
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

      {isPlatformOwner && isModalOpen && (
        <BaseModal 
          isOpen={true} 
          onClose={() => setIsModalOpen(false)} 
          title={selectedOrder ? "Update Order Details" : "Manually Create Order"}
        >
          <form onSubmit={handleSave} className="space-y-6">
            
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Target Client Company</label>
              <select 
                required disabled={!!selectedOrder}
                value={form.companyId} 
                onChange={(e) => setForm({...form, companyId: e.target.value, quoteId: '', quoteRevisionId: ''})} 
                className="w-full border-b border-gray-300 py-2 text-sm bg-white focus:outline-none focus:border-[var(--color-tenant-primary)] disabled:bg-gray-50 disabled:text-gray-500"
              >
                <option value="">-- Select a Client --</option>
                {options.companies.map(c => (
                  <option key={c.id || c.company_id} value={c.id || c.company_id}>
                    {c.name || c.companyName || c.company_name || c.id || 'Unknown Company'}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Linked Quote</label>
                <select 
                  disabled={!form.companyId || !!selectedOrder || isLoadingCascade}
                  value={form.quoteId} 
                  onChange={(e) => setForm({...form, quoteId: e.target.value, quoteRevisionId: ''})} 
                  className="w-full border-b border-gray-300 py-2 text-sm bg-white focus:outline-none focus:border-[var(--color-tenant-primary)] disabled:bg-gray-50 disabled:text-gray-500"
                >
                  <option value="">{isLoadingCascade ? 'Loading...' : '-- Select Quote --'}</option>
                  {availableQuotes.map(q => (
                    <option key={q.id} value={q.id}>{q.id.split('-')[0]} - {q.description}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Approved Quote Revision</label>
                <select 
                  required
                  disabled={!form.quoteId || !!selectedOrder || isLoadingCascade}
                  value={form.quoteRevisionId} 
                  onChange={(e) => setForm({...form, quoteRevisionId: e.target.value})} 
                  className="w-full border-b border-gray-300 py-2 text-sm bg-white focus:outline-none focus:border-[var(--color-tenant-primary)] disabled:bg-gray-50 disabled:text-gray-500"
                >
                  <option value="">{isLoadingCascade ? 'Loading...' : '-- Select Revision --'}</option>
                  {availableRevisions.map(r => (
                    <option key={r.id} value={r.id}>Rev {r.revisionNumber} ({r.revisionStatus}) - {(r.discountRate * 100).toFixed(0)}% Discount</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
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
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Order Date</label>
                <input 
                  type="date" required
                  value={form.orderDate} 
                  onChange={(e) => setForm({...form, orderDate: e.target.value})} 
                  className="w-full border-b border-gray-300 py-2 text-sm bg-white focus:outline-none focus:border-[var(--color-tenant-primary)]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Expected Delivery</label>
                <input 
                  type="date" required
                  value={form.expectedDeliveryDate} 
                  onChange={(e) => setForm({...form, expectedDeliveryDate: e.target.value})} 
                  className="w-full border-b border-gray-300 py-2 text-sm bg-white focus:outline-none focus:border-[var(--color-tenant-primary)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Order Status</label>
                <select 
                  required
                  value={form.orderStatus} 
                  onChange={(e) => setForm({...form, orderStatus: e.target.value})} 
                  className="w-full border-b border-gray-300 py-2 text-sm bg-white focus:outline-none focus:border-[var(--color-tenant-primary)]"
                >
                  <option value="Confirmed">Confirmed</option>
                  <option value="In production">In production</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Closed">Closed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Shipment Status</label>
                <select 
                  required
                  value={form.shipmentStatus} 
                  onChange={(e) => setForm({...form, shipmentStatus: e.target.value})} 
                  className="w-full border-b border-gray-300 py-2 text-sm bg-white focus:outline-none focus:border-[var(--color-tenant-primary)]"
                >
                  <option value="Pending">Pending</option>
                  <option value="Manufacturing">Manufacturing</option>
                  <option value="Ready for shipment">Ready for shipment</option>
                  <option value="In transit">In transit</option>
                  <option value="Installed">Installed</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Order Notes</label>
              <textarea 
                rows={2}
                placeholder="Internal notes or special instructions..."
                value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} 
                className="w-full border border-gray-300 rounded-md p-3 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]" 
              />
            </div>

            <div className="pt-4 flex justify-between gap-3 border-t border-gray-100">
              {selectedOrder && isPlatformOwner ? (
                <button type="button" onClick={handleDelete} className="px-5 py-2.5 text-xs font-bold tracking-wider text-red-500 uppercase hover:bg-red-50 rounded-md">Delete Order</button>
              ) : <div></div>}
              
              <div className="flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-xs font-semibold tracking-wider text-gray-500 uppercase hover:bg-gray-50 rounded-md">Cancel</button>
                <button type="submit" className={`px-5 py-2.5 text-xs font-bold tracking-wider text-white rounded-md uppercase ${isPlatformOwner ? 'bg-gray-900 hover:bg-black' : 'bg-[var(--color-tenant-primary)] hover:opacity-90'}`}>
                  {selectedOrder ? "Save Updates" : "Create Order"}
                </button>
              </div>
            </div>
          </form>
        </BaseModal>
      )}
    </div>
  );
};

export default OrdersPage;