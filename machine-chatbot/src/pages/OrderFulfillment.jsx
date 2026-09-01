// src/pages/OrderFulfillment.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { DynamicTable } from '../components/ui/DynamicTable';
import { BaseModal } from '../components/ui/BaseModal';
import { jwtDecode } from 'jwt-decode';

export const OrderFulfillmentPage = () => {
  const { id } = useParams();
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
  const [order, setOrder] = useState(null);
  const [machines, setMachines] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals - Lines
  const [isLineModalOpen, setIsLineModalOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState(null);
  const [lineForm, setLineForm] = useState({ 
    machineId: '', 
    itemDescription: '', 
    fulfillmentStatus: 'Pending' 
  });

  // 1. Fetch Master Data sequentially (Order first, then Company Machines)
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Step A: Fetch the Order first so we know which company it belongs to
      const orderRes = await apiClient.get(`/orders/${id}`);
      const orderData = orderRes.data;
      setOrder(orderData);

      // Step B: Fetch machines specifically for the Order's target company
      const machinesRes = await apiClient.get(`/machines?companyId=${orderData.companyId}`);
      setMachines(machinesRes.data || []);
    } catch (err) {
      console.error('Failed to load order details', err);
      setError('Unable to load order fulfillment data.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ==========================================
  // INLINE STATUS UPDATE (Fast UX)
  // ==========================================
  const handleInlineStatusChange = async (lineId, newStatus) => {
    if (!isPlatformOwner) return; // Extra safety guard

    // Optimistic UI update
    setOrder(prev => ({
      ...prev,
      lines: prev.lines.map(l => l.id === lineId ? { ...l, fulfillmentStatus: newStatus } : l)
    }));

    try {
      await apiClient.put(`/orders/lines/${lineId}`, { fulfillmentStatus: newStatus });
    } catch (err) {
      alert('Failed to update line status.');
      fetchData(); // Revert on failure
    }
  };

  // ==========================================
  // LINE ITEM HANDLERS (Full Edit / Create)
  // ==========================================
  const openLineModal = (line = null) => {
    setSelectedLine(line);
    if (line) {
      setLineForm({
        machineId: line.machineId || '',
        itemDescription: line.itemDescription || '',
        fulfillmentStatus: line.fulfillmentStatus || 'Pending'
      });
    } else {
      setLineForm({ machineId: '', itemDescription: '', fulfillmentStatus: 'Pending' });
    }
    setIsLineModalOpen(true);
  };

  const handleSaveLine = async (e) => {
    e.preventDefault();
    try {
      if (selectedLine) {
        await apiClient.put(`/orders/lines/${selectedLine.id}`, lineForm);
      } else {
        await apiClient.post(`/orders/${id}/lines`, lineForm);
      }
      setIsLineModalOpen(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save line item.');
    }
  };

  const handleDeleteLine = async (lineId) => {
    if (!window.confirm("Are you sure you want to delete this line item?")) return;
    try {
      await apiClient.delete(`/orders/lines/${lineId}`);
      fetchData();
    } catch (err) {
      alert('Failed to delete line item.');
    }
  };

  // ==========================================
  // UI RENDERERS
  // ==========================================
  if (isLoading && !order) {
    return (
      <div className="p-16 flex justify-center">
        <div className="w-8 h-8 border-2 border-t-[var(--color-tenant-primary)] border-gray-200 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !order) {
    return <div className="p-16 text-red-500">{error || "Order not found."}</div>;
  }

  const getStatusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('ready') || s.includes('confirm')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (s.includes('production') || s.includes('transit') || s.includes('manufacturing')) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (s.includes('deliver') || s.includes('close') || s.includes('installed')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s.includes('cancel')) return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  };

  // Base columns visible to everyone
  const lineColumns = [
    {
      key: 'itemDescription',
      label: 'Item Description',
      render: (_, row) => <span className="font-semibold text-gray-800">{row.itemDescription || 'No description'}</span>
    },
    {
      key: 'machine',
      label: 'Target Asset',
      render: (_, row) => {
        if (!row.machineId) return <span className="text-gray-400 italic text-xs">General / No Machine</span>;
        const m = machines.find(mac => mac.id === row.machineId);
        return <span className="text-xs font-medium text-gray-700">{m ? `${m.modelCode} (SN: ${m.serialNumber})` : 'Unknown'}</span>;
      }
    },
    {
      key: 'fulfillmentStatus',
      label: 'Fulfillment Status',
      // Conditionally render an interactive Select vs a static Badge
      render: (_, row) => isPlatformOwner ? (
        <select 
          value={row.fulfillmentStatus}
          onChange={(e) => handleInlineStatusChange(row.id, e.target.value)}
          className={`px-2 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider border focus:outline-none cursor-pointer transition-colors ${getStatusColor(row.fulfillmentStatus)}`}
        >
          <option value="Pending" className="bg-white text-gray-900">Pending</option>
          <option value="Manufacturing" className="bg-white text-gray-900">Manufacturing</option>
          <option value="Ready for shipment" className="bg-white text-gray-900">Ready for shipment</option>
          <option value="In transit" className="bg-white text-gray-900">In transit</option>
          <option value="Installed" className="bg-white text-gray-900">Installed</option>
        </select>
      ) : (
        <span className={`inline-flex px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(row.fulfillmentStatus)}`}>
          {row.fulfillmentStatus}
        </span>
      )
    }
  ];

  // Append actions column ONLY for Platform Owners
  if (isPlatformOwner) {
    lineColumns.push({
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex gap-3">
          <button onClick={() => openLineModal(row)} className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-tenant-primary)] hover:opacity-80 transition-opacity">Edit Details</button>
          <button onClick={() => handleDeleteLine(row.id)} className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:opacity-80 transition-opacity">Remove</button>
        </div>
      )
    });
  }

  return (
    <div className="p-8 md:p-12 lg:p-16 animate-in fade-in duration-500 flex flex-col h-full min-h-[calc(100vh-64px)]">
      
      {/* 1. MASTER HEADER */}
      <header className="shrink-0 mb-8 flex justify-between items-start border-b border-gray-200 pb-6">
        <div>
          <button onClick={() => navigate('/commercial/orders')} className="text-xs font-bold text-gray-400 hover:text-[var(--color-tenant-primary)] uppercase tracking-widest mb-4 flex items-center gap-1 transition-colors">
            &larr; Back to Orders
          </button>
          <h1 className="text-3xl font-light text-gray-900 leading-tight">Order Fulfillment</h1>
          <div className="flex items-center gap-3 mt-3">
            <span className={`inline-flex px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(order.orderStatus)}`}>
              Order: {order.orderStatus}
            </span>
            <span className={`inline-flex px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(order.shipmentStatus)}`}>
              Shipment: {order.shipmentStatus}
            </span>
          </div>
        </div>
        <div className="text-right flex flex-col items-end">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Order Reference</p>
          <p className="text-xl font-mono text-gray-900 mt-0.5">{order.id.split('-')[0]}-{order.id.split('-')[1]}</p>
          <div className="text-xs text-gray-500 mt-2 space-y-1 text-right">
            <p>Ordered: <span className="font-medium text-gray-800">{new Date(order.orderDate).toLocaleDateString()}</span></p>
            <p>ETA: <span className="font-medium text-gray-800">{order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate).toLocaleDateString() : 'TBD'}</span></p>
          </div>
        </div>
      </header>

      {/* 2. ORDER NOTES / DETAILS CARD */}
      {order.notes && (
        <div className="mb-8 p-4 bg-gray-50 border border-gray-200 rounded-xl">
          <h4 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Order Notes / Instructions</h4>
          <p className="text-sm text-gray-700">{order.notes}</p>
        </div>
      )}

      {/* 3. ORDER LINES TABLE */}
      <div className="flex-1 flex flex-col bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-900">Fulfillment Manifest ({order.lines?.length || 0} Items)</h2>
          {isPlatformOwner && (
            <button onClick={() => openLineModal()} className="px-6 py-2 text-xs font-bold text-white bg-[var(--color-tenant-primary)] hover:opacity-90 rounded-md uppercase tracking-wider shadow-sm transition-colors">
              + Add Manual Line
            </button>
          )}
        </div>
        
        <div className="flex-1 overflow-auto">
          <DynamicTable columns={lineColumns} data={order.lines || []} />
        </div>
      </div>

      {/* ========================================== */}
      {/* MODAL (Only Accessible to Platform Owners) */}
      {/* ========================================== */}
      {isPlatformOwner && isLineModalOpen && (
        <BaseModal isOpen={true} onClose={() => setIsLineModalOpen(false)} title={selectedLine ? "Edit Line Item" : "Add Manual Line Item"}>
          <form onSubmit={handleSaveLine} className="space-y-6">
            
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Item Description</label>
              <textarea 
                required rows="2" 
                value={lineForm.itemDescription} 
                onChange={e => setLineForm({...lineForm, itemDescription: e.target.value})} 
                className="w-full border border-gray-300 rounded-md p-3 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]" 
              />
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Target Asset</label>
                <select 
                  value={lineForm.machineId} 
                  onChange={e => setLineForm({...lineForm, machineId: e.target.value})} 
                  className="w-full border-b border-gray-300 py-2 text-sm bg-white focus:outline-none focus:border-[var(--color-tenant-primary)]"
                >
                  <option value="">-- General Supply / No Asset --</option>
                  {machines.map(m => (
                    <option key={m.id} value={m.id}>{m.serialNumber} - {m.modelDescription}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Fulfillment Status</label>
                <select 
                  required
                  value={lineForm.fulfillmentStatus} 
                  onChange={e => setLineForm({...lineForm, fulfillmentStatus: e.target.value})} 
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
            
            <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
              <button type="button" onClick={() => setIsLineModalOpen(false)} className="px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase hover:bg-gray-50 rounded-md">Cancel</button>
              <button type="submit" className="px-5 py-2.5 text-xs font-bold text-white bg-[var(--color-tenant-primary)] hover:opacity-90 rounded-md uppercase">Save Item</button>
            </div>
          </form>
        </BaseModal>
      )}

    </div>
  );
};

export default OrderFulfillmentPage;