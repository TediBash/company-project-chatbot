// src/pages/QuoteBuilder.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { DynamicTable } from '../components/ui/DynamicTable';
import { BaseModal } from '../components/ui/BaseModal';
import { jwtDecode } from 'jwt-decode';

export const QuoteBuilderPage = () => {
  const { id } = useParams(); // The Parent Quote ID
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
  const [quote, setQuote] = useState(null);
  const [activeRevisionId, setActiveRevisionId] = useState(null);
  const [machines, setMachines] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals - Revisions
  const [isRevModalOpen, setIsRevModalOpen] = useState(false);
  const [selectedRev, setSelectedRev] = useState(null);
  const [revForm, setRevForm] = useState({ revisionNumber: 1, revisionStatus: 'Draft', discountRate: 0, changeSummary: '' });

  // Modals - Lines
  const [isLineModalOpen, setIsLineModalOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState(null);
  const [lineForm, setLineForm] = useState({ machineId: '', price: 0, description: '' });

  // 1. Fetch Master Data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Step A: Fetch the Quote first so we know which company it belongs to
      const quoteRes = await apiClient.get(`/quotes/${id}`);
      const quoteData = quoteRes.data;
      setQuote(quoteData);

      // Step B: Fetch machines specifically for the Quote's target company
      const machinesRes = await apiClient.get(`/machines?companyId=${quoteData.companyId}`);
      setMachines(machinesRes.data || []);

      // Step C: Auto-select the most recent revision if none is selected
      if (quoteData.revisions?.length > 0 && !activeRevisionId) {
        setActiveRevisionId(quoteData.revisions[0].id);
      }
    } catch (err) {
      console.error('Failed to load quote details', err);
      setError('Unable to load quote builder.');
    } finally {
      setIsLoading(false);
    }
  }, [id, activeRevisionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Derived State: The currently active revision object
  const activeRevision = useMemo(() => {
    if (!quote || !quote.revisions) return null;
    return quote.revisions.find(r => r.id === activeRevisionId) || quote.revisions[0];
  }, [quote, activeRevisionId]);

  // ==========================================
  // REVISION HANDLERS
  // ==========================================
  const openRevModal = (rev = null) => {
    setSelectedRev(rev);
    if (rev) {
      setRevForm({
        revisionNumber: rev.revisionNumber,
        revisionStatus: rev.revisionStatus,
        discountRate: rev.discountRate * 100, // DB stores 0.05, UI shows 5%
        changeSummary: rev.changeSummary || ''
      });
    } else {
      // Auto-increment revision number for new creations
      const nextRevNum = quote?.revisions?.length > 0 
        ? Math.max(...quote.revisions.map(r => r.revisionNumber)) + 1 
        : 1;
      setRevForm({ revisionNumber: nextRevNum, revisionStatus: 'Draft', discountRate: 0, changeSummary: '' });
    }
    setIsRevModalOpen(true);
  };

  const handleSaveRev = async (e) => {
    e.preventDefault();
    const payload = { ...revForm, discountRate: revForm.discountRate / 100 };
    try {
      if (selectedRev) {
        await apiClient.put(`/quotes/revisions/${selectedRev.id}`, payload);
      } else {
        const res = await apiClient.post(`/quotes/${id}/revisions`, payload);
        setActiveRevisionId(res.data.id); // Auto-switch to newly created revision
      }
      setIsRevModalOpen(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save revision.');
    }
  };

  const handleDeleteRev = async () => {
    if (!window.confirm("Are you sure? This will delete the revision and all its line items.")) return;
    try {
      await apiClient.delete(`/quotes/revisions/${selectedRev.id}`);
      setIsRevModalOpen(false);
      setActiveRevisionId(null); // Reset active tab so it auto-selects another
      fetchData();
    } catch (err) {
      alert('Failed to delete revision.');
    }
  };

  // ==========================================
  // LINE ITEM HANDLERS
  // ==========================================
  const openLineModal = (line = null) => {
    setSelectedLine(line);
    if (line) {
      setLineForm({
        machineId: line.machineId || '',
        price: line.price,
        description: line.item_description || line.description || '' 
      });
    } else {
      setLineForm({ machineId: '', price: 0, description: '' });
    }
    setIsLineModalOpen(true);
  };

  const handleSaveLine = async (e) => {
    e.preventDefault();
    try {
      if (selectedLine) {
        await apiClient.put(`/quotes/lines/${selectedLine.id}`, lineForm);
      } else {
        await apiClient.post(`/quotes/revisions/${activeRevision.id}/lines`, lineForm);
      }
      setIsLineModalOpen(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save line item.');
    }
  };

  const handleDeleteLine = async (lineId) => {
    if (!window.confirm("Delete this line item?")) return;
    try {
      await apiClient.delete(`/quotes/lines/${lineId}`);
      fetchData();
    } catch (err) {
      alert('Failed to delete line item.');
    }
  };

  // ==========================================
  // UI RENDERERS
  // ==========================================
  if (isLoading && !quote) {
    return (
      <div className="p-16 flex justify-center">
        <div className="w-8 h-8 border-2 border-t-[var(--color-tenant-primary)] border-gray-200 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !quote) {
    return <div className="p-16 text-red-500">{error || "Quote not found."}</div>;
  }

  const currencySymbol = quote.currency === 'EUR' ? '€' : quote.currency === 'USD' ? '$' : '£';
  
  // Calculate Totals for active revision
  const subTotal = activeRevision?.lines?.reduce((sum, line) => sum + Number(line.price), 0) || 0;
  const discountAmount = subTotal * (activeRevision?.discountRate || 0);
  const finalTotal = subTotal - discountAmount;

  // Base columns visible to everyone
  const lineColumns = [
    {
      key: 'description',
      label: 'Item Description',
      render: (_, row) => <span className="font-semibold text-gray-800">{row.item_description}</span>
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
      key: 'price',
      label: 'Price',
      render: (_, row) => (
        <span className="font-mono text-gray-900">
          {currencySymbol} {Number(row.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
          <button onClick={() => openLineModal(row)} className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-tenant-primary)] hover:opacity-80">Edit</button>
          <button onClick={() => handleDeleteLine(row.id)} className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:opacity-80">Remove</button>
        </div>
      )
    });
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'Approved': return 'bg-emerald-100 text-emerald-800';
      case 'Rejected': return 'bg-red-100 text-red-800';
      case 'Submitted': return 'bg-blue-100 text-blue-800';
      case 'Superseded': return 'bg-gray-200 text-gray-600';
      default: return 'bg-amber-100 text-amber-800'; // Draft
    }
  };

  return (
    <div className="p-8 md:p-12 lg:p-16 animate-in fade-in duration-500 flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      
      {/* 1. MASTER HEADER */}
      <header className="shrink-0 mb-6 flex justify-between items-start border-b border-gray-200 pb-6">
        <div>
          <button onClick={() => navigate('/quotes')} className="text-xs font-bold text-gray-400 hover:text-[var(--color-tenant-primary)] uppercase tracking-widest mb-4 flex items-center gap-1 transition-colors">
            &larr; Back to Quotes
          </button>
          <h1 className="text-3xl font-light text-gray-900 leading-tight">
            {isPlatformOwner ? 'Quote Builder' : 'Quote Details'}
          </h1>
          <p className="text-sm font-medium text-gray-500 mt-1">{quote.description}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Quote Reference</p>
          <p className="text-lg font-mono text-gray-900">{quote.id.split('-')[0]}-{quote.id.split('-')[1]}</p>
          <p className="text-xs text-gray-500 mt-1">Valid until: {new Date(quote.validUntil).toLocaleDateString()}</p>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-4 lg:gap-8">
        
        {/* 2. LEFT SIDEBAR: REVISIONS LIST */}
        <div className="w-80 shrink-0 flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <h2 className="text-[10px] uppercase font-bold tracking-[0.2em] text-gray-500">Revisions</h2>
            {isPlatformOwner && (
              <button onClick={() => openRevModal()} className="text-[10px] uppercase font-bold text-[var(--color-tenant-primary)] hover:opacity-80 tracking-widest transition-opacity">
                + New Rev
              </button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {quote.revisions?.length === 0 && (
              <p className="p-4 text-xs text-gray-400 text-center italic">No revisions found.</p>
            )}
            
            {quote.revisions?.map(rev => (
              <div 
                key={rev.id}
                onClick={() => setActiveRevisionId(rev.id)}
                className={`p-4 rounded-lg cursor-pointer transition-all border ${activeRevisionId === rev.id ? 'bg-blue-50/50 border-blue-200 shadow-sm' : 'border-transparent hover:bg-gray-50'}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-gray-900 text-sm">Rev {rev.revisionNumber}</span>
                  <span className={`text-[9px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded ${getStatusColor(rev.revisionStatus)}`}>
                    {rev.revisionStatus}
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{rev.changeSummary || 'No change summary provided.'}</p>
                <div className="mt-3 flex justify-between items-center text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                  <span>{new Date(rev.issuedAt).toLocaleDateString()}</span>
                  {isPlatformOwner && (
                    <button onClick={(e) => { e.stopPropagation(); openRevModal(rev); }} className="hover:text-[var(--color-tenant-primary)] transition-colors">Edit Setup</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. RIGHT CONTENT: LINE ITEMS FOR ACTIVE REVISION */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-gray-200 rounded-xl shadow-sm">
          {!activeRevision ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Select a revision to view items.</div>
          ) : (
            <>
              {/* Revision Header */}
              <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 bg-gray-50/50">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Revision {activeRevision.revisionNumber} Lines</h2>
                  <p className="text-sm text-gray-500 mt-1 max-w-2xl">{activeRevision.changeSummary}</p>
                </div>
                {isPlatformOwner && (
                  <button onClick={() => openLineModal()} className="w-full sm:w-auto shrink-0 px-6 py-2 text-xs font-bold text-white bg-[var(--color-tenant-primary)] hover:opacity-90 rounded-md uppercase tracking-wider shadow-sm transition-opacity">
                    + Add Line Item
                  </button>
                )}
              </div>

              {/* Lines Table */}
              <div className="flex-1 overflow-x-auto overflow-y-auto w-full">
                <DynamicTable columns={lineColumns} data={activeRevision.lines || []} />
              </div>

              {/* Financial Summary Footer */}
              <div className="shrink-0 bg-gray-900 text-white p-4 sm:p-6 flex flex-col sm:flex-row sm:justify-end items-stretch sm:items-center gap-3 sm:gap-8 lg:gap-12 rounded-b-xl">
                
                <div className="flex justify-between sm:block text-right">
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold sm:mb-1">Subtotal</p>
                  <p className="font-mono text-gray-300">{currencySymbol} {subTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
                
                <div className="flex justify-between sm:block text-right">
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold sm:mb-1">Discount ({(activeRevision.discountRate * 100).toFixed(0)}%)</p>
                  <p className="font-mono text-red-400">- {currencySymbol} {discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
                
                <div className="flex justify-between sm:block text-right pt-3 sm:pt-0 sm:pl-8 border-t sm:border-t-0 sm:border-l border-gray-700">
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold sm:mb-1 flex items-center">Final Total</p>
                  <p className="text-lg sm:text-xl font-mono text-white">{currencySymbol} {finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
                
              </div>
            </>
          )}
        </div>
      </div>

      {/* ========================================== */}
      {/* MODALS (Only Accessible to Platform Owners) */}
      {/* ========================================== */}
      {isPlatformOwner && isRevModalOpen && (
        <BaseModal isOpen={true} onClose={() => setIsRevModalOpen(false)} title={selectedRev ? "Update Revision" : "Create New Revision"}>
          <form onSubmit={handleSaveRev} className="space-y-6">
            <div className="grid grid-cols-3 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Rev Number</label>
                <input type="number" required min="1" value={revForm.revisionNumber} onChange={e => setRevForm({...revForm, revisionNumber: e.target.value})} className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Status</label>
                <select value={revForm.revisionStatus} onChange={e => setRevForm({...revForm, revisionStatus: e.target.value})} className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]">
                  <option value="Draft">Draft</option>
                  <option value="Submitted">Submitted (To Client)</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Superseded">Superseded</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Discount (%)</label>
                <input type="number" required min="0" max="100" step="0.1" value={revForm.discountRate} onChange={e => setRevForm({...revForm, discountRate: e.target.value})} className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Change Summary</label>
              <textarea rows="3" value={revForm.changeSummary} onChange={e => setRevForm({...revForm, changeSummary: e.target.value})} className="w-full border border-gray-300 rounded-md p-3 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]" />
            </div>
            <div className="pt-4 flex justify-between gap-3 border-t border-gray-100">
              {selectedRev ? <button type="button" onClick={handleDeleteRev} className="px-5 py-2.5 text-xs font-bold text-red-500 uppercase hover:bg-red-50 rounded-md">Delete Rev</button> : <div></div>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setIsRevModalOpen(false)} className="px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase hover:bg-gray-50 rounded-md">Cancel</button>
                <button type="submit" className="px-5 py-2.5 text-xs font-bold text-white bg-[var(--color-tenant-primary)] hover:opacity-90 rounded-md uppercase">Save Rev</button>
              </div>
            </div>
          </form>
        </BaseModal>
      )}

      {isPlatformOwner && isLineModalOpen && (
        <BaseModal isOpen={true} onClose={() => setIsLineModalOpen(false)} title={selectedLine ? "Edit Line Item" : "Add Line Item"}>
          <form onSubmit={handleSaveLine} className="space-y-6">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Item Description</label>
              <textarea required rows="2" value={lineForm.description} onChange={e => setLineForm({...lineForm, description: e.target.value})} className="w-full border border-gray-300 rounded-md p-3 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]" />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Target Machine</label>
                <select value={lineForm.machineId} onChange={e => setLineForm({...lineForm, machineId: e.target.value})} className="w-full border-b border-gray-300 py-2 text-sm bg-white focus:outline-none focus:border-[var(--color-tenant-primary)]">
                  <option value="">-- General Supply / No Asset --</option>
                  {machines.map(m => (
                    <option key={m.id} value={m.id}>{m.serialNumber} - {m.modelCode}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Price ({currencySymbol})</label>
                <input type="number" required min="0" step="0.01" value={lineForm.price} onChange={e => setLineForm({...lineForm, price: e.target.value})} className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]" />
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

export default QuoteBuilderPage;