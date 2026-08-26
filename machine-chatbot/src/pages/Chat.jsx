// src/pages/Chat.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom'; // NEW: Added for deep linking
import apiClient from '../api/client';
import { jwtDecode } from 'jwt-decode';
import { BaseModal } from '../components/ui/BaseModal';

export const ChatPage = () => {
  // 1. Role & Permissions Extraction
  let isAdmin = false;
  let currentUserId = null;
  let currentCompanyId = 'arol_corp'; // Fallback company ID
  const token = localStorage.getItem('arol_token');
  
  if (token) {
    try {
      const decoded = jwtDecode(token);
      isAdmin = decoded.user?.visibility === 'full';
      currentUserId = decoded.user?.id;
      currentCompanyId = decoded.user?.company_id || 'arol_corp';
    } catch (e) {}
  }

  // Router hooks for QR code deep-linking
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // 2. Application State
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [roadmap, setRoadmap] = useState({ steps: [] });
  
  // NEW: Machine Selection State
  const [availableMachines, setAvailableMachines] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState('');
  
  // 3. Admin Toggle & Search State
  const [viewAll, setViewAll] = useState(false);
  const [search, setSearch] = useState('');
  
  // 4. Real-time Agent State
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [agentStatus, setAgentStatus] = useState('');

  // State for pagination
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null); 
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 5. Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState('');
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editChatTitle, setEditChatTitle] = useState('');
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);

  // 6. UI Layout States
  const [isRoadmapOpen, setIsRoadmapOpen] = useState(true);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { if (agentStatus) scrollToBottom(); }, [agentStatus]);

// Fetch Available Machines & Handle QR Code Deep Linking
  useEffect(() => {
    const fetchMachines = async () => {
      try {
        // Fetch machines using your existing Express router
        const response = await apiClient.get('/machines');
        
        // Map the backend data to match the format expected by the React state
        const formattedMachines = response.data.map(machine => ({
          id: machine.id, // The database machine_id 
          serialNumber: machine.serialNumber, // e.g., "15610"
          name: machine.modelDescription || machine.modelCode || 'Unknown Model'
        }));
        
        setAvailableMachines(formattedMachines);
      } catch (err) {
        console.error('Failed to load company machines', err);
      }
    };
    
    fetchMachines();

    // Check if user arrived via QR Code URL (e.g., /chat?machineId=15610)
    const urlMachineId = searchParams.get('machineId');
    if (urlMachineId) {
      setSelectedMachine(urlMachineId);
      setIsCreateModalOpen(true);
      // Clean up the URL so it doesn't trigger again on refresh
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  // Fetch Session History Sidebar
  const fetchSessions = useCallback(async () => {
    try {
      const response = await apiClient.get('/chat/sessions', {
        params: { search, viewAll: viewAll.toString() }
      });
      setSessions(response.data.data);
    } catch (err) {
      console.error('Failed to load sessions', err);
    }
  }, [search, viewAll]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => { fetchSessions(); }, 300);
    return () => clearTimeout(delayDebounce);
  }, [fetchSessions]);

  // Load Initial Conversation (Latest 5)
  const loadConversation = async (sessionId) => {
    try {
      const response = await apiClient.get(`/chat/sessions/${sessionId}`);
      setActiveSession(response.data.session);
      setMessages(response.data.messages);
      setHasMore(response.data.hasMore);
      setRoadmap(response.data.roadmap);
      
      setTimeout(() => scrollToBottom(), 150);
    } catch (err) {
      console.error('Failed to load chat history', err);
    }
  };

  // Scroll Event Listener (Pagination)
  const handleScroll = async (e) => {
    if (e.target.scrollTop === 0 && hasMore && !isLoadingMore) {
      const oldestMessage = messages[0];
      if (!oldestMessage || !oldestMessage.created_at) return;

      setIsLoadingMore(true);
      const oldScrollHeight = e.target.scrollHeight;

      try {
        const id = activeSession.session_id || activeSession.id;
        const res = await apiClient.get(`/chat/sessions/${id}/messages`, {
          params: { before: oldestMessage.created_at, limit: 5 }
        });

        setMessages(prev => [...res.data.messages, ...prev]);
        setHasMore(res.data.hasMore);

        setTimeout(() => {
          if (chatContainerRef.current) {
            const newScrollHeight = chatContainerRef.current.scrollHeight;
            chatContainerRef.current.scrollTop = newScrollHeight - oldScrollHeight;
          }
        }, 0);
      } catch (err) {
        console.error('Failed to load older messages', err);
      } finally {
        setIsLoadingMore(false);
      }
    }
  };

  // UPDATED: Create New Session locked to Machine
  const handleCreateSession = async (e) => {
    e.preventDefault();
    if (!selectedMachine) {
      alert("Please select a machine to begin.");
      return;
    }
    
    try {
      // Send the machine_id and company_id to the new backend endpoint
      const res = await apiClient.post('/chat/sessions', { 
        title: newChatTitle || `Diagnostic Session: ${selectedMachine}`,
        machine_id: selectedMachine,
        company_id: currentCompanyId
      });
      
      setActiveSession(res.data);
      setMessages([]);
      setRoadmap({ steps: [] });
      setIsCreateModalOpen(false);
      setNewChatTitle('');
      setSelectedMachine('');
      fetchSessions();
      
      // Navigate to the clean session URL if needed
      // navigate(`/chat/${res.data.session_id}`);
    } catch (err) {
      console.error('Failed to create chat', err);
      alert('Failed to create chat session.');
    }
  };

  // Update Session Title manually
  const handleUpdateTitle = async (e) => {
    e.preventDefault();
    try {
      const id = activeSession.id || activeSession.session_id;
      await apiClient.put(`/chat/sessions/${id}/title`, { title: editChatTitle });
      setActiveSession(prev => ({ ...prev, title: editChatTitle }));
      setIsEditModalOpen(false);
      fetchSessions();
    } catch (err) {
      alert('Failed to update title.');
    }
  };

  // Delete Session
  const handleDeleteSession = async () => {
    if (!sessionToDelete) return;
    try {
      const id = sessionToDelete.id || sessionToDelete.session_id;
      await apiClient.delete(`/chat/sessions/${id}`);
      
      if (activeSession && (activeSession.id === id || activeSession.session_id === id)) {
        setActiveSession(null);
        setMessages([]);
        setRoadmap({ steps: [] });
      }
      
      setIsDeleteModalOpen(false);
      setSessionToDelete(null);
      fetchSessions();
    } catch (err) {
      alert('Failed to delete chat.');
    }
  };

  // SSE Stream Handler
  const sendMessageStream = async (sessionId, messageContent) => {
    setMessages(prev => [...prev, { role: 'user', content: messageContent }]);
    setTimeout(scrollToBottom, 50);
    setInput('');
    setIsProcessing(true);
    setAgentStatus('Connecting to AI Assistant...');

    try {
      const streamUrl = apiClient.getUri({ url: `/chat/sessions/${sessionId}/stream` });

      const activeMachineSN = availableMachines.find(m => m.id === activeSession.machine_id)?.serialNumber || activeSession.machine_id;
      const activeMachineName = availableMachines.find(m => m.id === activeSession?.machine_id)?.name || 'Unknown Model';

      const response = await fetch(streamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          content: messageContent,
          machine_name: activeMachineName,
          serial_number: activeMachineSN
        })
      });

      if (!response.ok) throw new Error(`Backend rejected request with status: ${response.status}`);
      if (!response.body) throw new Error("ReadableStream not supported or no body returned.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = ''; 

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          if (buffer.trim().startsWith('data:')) {
             try {
                const finalData = JSON.parse(buffer.trim().replace(/^data:\s*/, ''));
                if (finalData.type === 'message') {
                   setMessages(prev => {
                     const newMessages = [...prev];
                     const lastIndex = newMessages.length - 1;
                     if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
                        newMessages[lastIndex].content += finalData.payload;
                     } else {
                        newMessages.push({ role: 'assistant', content: finalData.payload });
                     }
                     return newMessages;
                   });
                }
             } catch(e) {}
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop();

        for (const part of parts) {
          const trimmedPart = part.trim();
          
          if (trimmedPart.startsWith('data:')) {
            try {
              const jsonStr = trimmedPart.replace(/^data:\s*/, '');
              const data = JSON.parse(jsonStr);
              
              if (data.type === 'status') {
                setAgentStatus(data.payload);
              } else if (data.type === 'message') {
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastIndex = newMessages.length - 1;
                  
                  if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
                    newMessages[lastIndex] = {
                      ...newMessages[lastIndex],
                      content: newMessages[lastIndex].content + data.payload
                    };
                  } else {
                    newMessages.push({ role: 'assistant', content: data.payload });
                  }
                  
                  return newMessages;
                });
                setTimeout(scrollToBottom, 50);
              } else if (data.type === 'action_required') {
                setMessages(prev => [...prev, { role: 'assistant', content: JSON.stringify({ isActionRequest: true, ...data.payload }) }]);
              } else if (data.type === 'roadmap_update') {
                setRoadmap(data.payload);
              } else if (data.type === 'title_update') {
                setActiveSession(prev => ({ ...prev, title: data.payload }));
                fetchSessions();
              }
            } catch (err) {
              console.error('SSE JSON Parse Error:', err, 'Raw string:', trimmedPart);
            }
          }
        }
      }
    } catch (err) {
      console.error('Stream error:', err);
      alert(`Failed to connect to AI: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setAgentStatus('');
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isProcessing || !activeSession) return;
    sendMessageStream(activeSession.session_id || activeSession.id, input);
  };

  const handleHumanInTheLoop = async (actionData, approved, messageIndex) => {
    try {
      setAgentStatus(approved ? 'Executing action...' : 'Cancelling action...');
      setIsProcessing(true);
      
      const sessionId = activeSession.session_id || activeSession.id;

      // 1. Force unwrapping of the data
      let data = actionData;
      if (Array.isArray(data)) data = data[0];
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e) {}
      }

      // 2. Extract action type and details
      const actionType = data?.action || data?.action_type || "create_commercial_request";
      let actionDetails = data?.details || data?.payload || {};
      
      if (!actionDetails.type && data?.type) {
        actionDetails = { title: data.title, type: data.type, urgency: data.urgency };
      }

      // 3. Build the exact JSON body
      const requestBody = {
        action: actionType,
        payload: actionDetails,
        machine_id: activeSession?.machine_id || '', 
        company_id: activeSession?.company_id || '', 
        approved: approved
      };

      console.log("[DEBUG] Sending via Fetch:", requestBody);

      // 4. BYPASS AXIOS INTERCEPTORS: Use native fetch!
      const actionUrl = apiClient.getUri({ url: `/chat/sessions/${sessionId}/action` });
      
      const response = await fetch(actionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // token is extracted at the top of Chat.jsx
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Server returned ${response.status}: ${errorText}`);
      }

      const resData = await response.json();
      
      // 5. Update UI to hide the buttons
      setMessages(prev => {
        const newMessages = [...prev];
        if (messageIndex !== undefined && newMessages[messageIndex]) {
          const updatedActionContent = { ...data, isResolved: true, approved: approved };
          newMessages[messageIndex] = { ...newMessages[messageIndex], content: JSON.stringify(updatedActionContent) };
        }
        newMessages.push({ role: 'assistant', content: resData.message || "Action processed." });
        return newMessages;
      });
      
    } catch (err) {
      console.error('Action failed', err);
      alert(`Action failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setAgentStatus('');
      setTimeout(scrollToBottom, 50);
    }
  };

  const renderMessage = (msg, index) => {
    if (msg.role === 'system' || msg.role === 'tool') return null;

    const isUser = msg.role === 'user';
    let actionPayload = null;
    let textContent = msg.content;
    try {
      const parsed = JSON.parse(msg.content);
      if (parsed.isActionRequest) {
        actionPayload = parsed;
        textContent = "The agent is requesting permission to execute an action on your behalf.";
      }
    } catch (e) {} 

    return (
      <div key={index} className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[75%] rounded-2xl p-4 shadow-sm ${isUser ? 'bg-[var(--color-tenant-primary)] text-white rounded-br-none' : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none'}`}>
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{textContent}</div>
          
          {actionPayload && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 text-gray-900">
              <p className="text-[10px] uppercase font-bold text-gray-500 mb-2 tracking-widest">Pending Action</p>
              <h4 className="font-semibold text-sm mb-1">{actionPayload.action.replace(/_/g, ' ').toUpperCase()}</h4>
              <p className="text-xs text-gray-600 mb-4 font-mono bg-white p-2 border border-gray-100 rounded">
                {JSON.stringify(actionPayload.details, null, 2)}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => handleHumanInTheLoop(actionPayload, true)}
                  disabled={isProcessing}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold py-2 rounded transition-colors disabled:opacity-50"
                >
                  Approve Action
                </button>
                <button 
                  onClick={() => handleHumanInTheLoop(actionPayload, false)}
                  disabled={isProcessing}
                  className="flex-1 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 text-xs font-bold py-2 rounded transition-colors disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-50 overflow-hidden animate-in fade-in duration-500">
      
      {/* LEFT SIDEBAR */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col min-h-0">
        <div className="p-4 border-b border-gray-100 shrink-0">
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="w-full py-2.5 mb-4 text-xs font-bold text-white bg-[var(--color-tenant-primary)] hover:opacity-90 rounded-md uppercase tracking-wider shadow-sm transition-opacity"
          >
            + New Chat
          </button>
          
          {isAdmin && (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 mb-4">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">View Team Chats</span>
              <button
                onClick={() => setViewAll(!viewAll)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${viewAll ? 'bg-[var(--color-tenant-primary)]' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${viewAll ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
          )}

          <input 
            type="text" 
            placeholder="Search history..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-[var(--color-tenant-primary)] transition-colors"
          />
        </div>
        
        <div className="flex-1 overflow-y-auto min-h-0 p-2">
          {sessions.map(session => (
            <div 
              key={session.id}
              className={`group relative w-full flex items-center justify-between p-3 rounded-lg mb-1 transition-colors ${activeSession?.id === session.id || activeSession?.session_id === session.id ? 'bg-blue-50 border border-blue-100' : 'hover:bg-gray-50 border border-transparent cursor-pointer'}`}
              onClick={() => loadConversation(session.id)}
            >
              <div className="flex-1 pr-6">
                <h4 className="text-sm font-semibold text-gray-800 line-clamp-1 mb-1">{session.title}</h4>
                <div className="flex justify-between items-center text-[10px] text-gray-400">
                  <span>{new Date(session.updatedAt || Date.now()).toLocaleDateString()}</span>
                  {viewAll && session.userId !== currentUserId && (
                    <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-bold">{session.userName}</span>
                  )}
                </div>
              </div>
              
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setSessionToDelete(session); 
                  setIsDeleteModalOpen(true); 
                }}
                className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all shadow-sm bg-white"
                title="Delete Chat"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* CENTER: Main Chat Interface */}
      <div className="flex-1 flex flex-col relative">
        {/* Chat Header */}
        <div className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
          <div className="flex flex-col justify-center">
            <h2 className="text-lg font-light text-gray-900 leading-tight">
              {activeSession ? activeSession.title : 'Select or create a chat to begin'}
            </h2>
            
            {/* UPDATED: Dynamically look up the machine name from availableMachines state */}
            {activeSession?.machine_id && (
              <p className="text-[10px] font-bold text-[var(--color-tenant-primary)] uppercase tracking-widest mt-0.5 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                {/* Look up the name, fallback to ID if not found */}
                {availableMachines.find(m => m.id === activeSession.machine_id)?.name || 'Unknown Machine'} 
                <span className="text-gray-400 font-medium ml-1">(SN: {availableMachines.find(m => m.id === activeSession.machine_id)?.serialNumber || activeSession.machine_id})</span>
              </p>
            )}
          </div>
          
          {activeSession && (
            <div className="flex gap-3">
              <button 
                onClick={() => { setEditChatTitle(activeSession.title); setIsEditModalOpen(true); }}
                className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-[var(--color-tenant-primary)] transition-colors"
              >
                Edit Title
              </button>
              <button 
                onClick={() => { setSessionToDelete(activeSession); setIsDeleteModalOpen(true); }}
                className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-red-500 transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        <div 
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-6 md:p-8 relative"
        >
          {isLoadingMore && (
            <div className="flex justify-center py-2 absolute top-0 left-0 w-full bg-white/80 z-10">
              <span className="text-xs font-bold text-[var(--color-tenant-primary)] animate-pulse">Loading older messages...</span>
            </div>
          )}
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto opacity-50">
              <svg className="w-16 h-16 text-[var(--color-tenant-primary)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <h3 className="text-xl font-light text-gray-900 mb-2">AROL Support Intelligence</h3>
              <p className="text-sm text-gray-500">I am connected directly to your fleet's telemetry and technical manuals. Select a machine and describe the issue you are facing.</p>
            </div>
          ) : (
            messages.map((msg, idx) => renderMessage(msg, idx))
          )}
          
          {agentStatus && (
            <div className="flex w-full mb-6 justify-start">
              <div className="bg-gray-100 border border-gray-200 text-gray-500 text-xs font-semibold px-4 py-2 rounded-full flex items-center gap-2 shadow-sm">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-tenant-primary)] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-tenant-primary)]"></span>
                </span>
                {agentStatus}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-white border-t border-gray-200">
          <form onSubmit={handleFormSubmit} className="relative max-w-4xl mx-auto flex items-end gap-3">
            <textarea
              rows="1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFormSubmit(e); } }}
              placeholder={isProcessing ? "Agent is processing..." : (activeSession ? "Describe the issue or ask a question..." : "Create a new session to chat...")}
              disabled={isProcessing || !activeSession}
              className="w-full p-4 pr-16 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-tenant-primary)] resize-none disabled:opacity-70 disabled:cursor-not-allowed transition-all"
              style={{ minHeight: '52px', maxHeight: '150px' }}
            />
            <button 
              type="submit" 
              disabled={!input.trim() || isProcessing || !activeSession}
              className="absolute right-2 bottom-2 p-2.5 bg-[var(--color-tenant-primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:bg-gray-400 transition-all shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* RIGHT SIDEBAR: Roadmap (Unchanged) */}
      <div className={`bg-white border-l border-gray-200 hidden lg:flex flex-col shadow-[-4px_0_15px_-5px_rgba(0,0,0,0.05)] z-10 transition-all duration-300 ${isRoadmapOpen ? 'w-72' : 'w-14 items-center'}`}>
        <div className={`p-4 border-b border-gray-100 bg-gray-50/50 flex ${isRoadmapOpen ? 'justify-between' : 'justify-center'} items-center shrink-0`}>
          {isRoadmapOpen && <h3 className="text-[10px] uppercase font-bold tracking-[0.2em] text-gray-500 truncate mr-2">Live Roadmap</h3>}
          <button 
            onClick={() => setIsRoadmapOpen(!isRoadmapOpen)}
            className="text-gray-400 hover:text-[var(--color-tenant-primary)] transition-colors p-1 rounded hover:bg-gray-200"
          >
            <svg className={`w-5 h-5 transform transition-transform duration-300 ${isRoadmapOpen ? 'rotate-0' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {isRoadmapOpen ? (
          <div className="flex-1 overflow-y-auto min-h-0 p-4">
            {!roadmap || !roadmap.steps || roadmap.steps.length === 0 ? (
              <p className="text-xs text-gray-400 text-center mt-10 italic">No active procedures mapped.</p>
            ) : (
              <div className="space-y-6">
                {roadmap.objective && (
                  <h4 className="text-sm font-bold text-gray-900 leading-tight border-l-2 border-[var(--color-tenant-primary)] pl-2">
                    {roadmap.objective}
                  </h4>
                )}
                <ul className="space-y-4">
                  {roadmap.steps.map((step, idx) => (
                    <li key={idx} className="flex gap-3">
                      <div className="mt-0.5 shrink-0">
                        {step.status === 'completed' ? (
                          <div className="w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center shadow-sm">
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          </div>
                        ) : step.status === 'failed' ? (
                          <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center shadow-sm">
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                          </div>
                        ) : (
                          <div className="w-4 h-4 border-2 border-gray-300 rounded-full bg-white shadow-sm"></div>
                        )}
                      </div>
                      <span className={`text-xs ${step.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-700 font-medium'}`}>
                        {step.task}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col pt-6 items-center border-t border-gray-50">
            <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
        )}
      </div>

      {/* --- MODALS --- */}
      
      {/* 1. UPDATED Create Modal: Now requires Machine Selection */}
      <BaseModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Start New Conversation">
        <form onSubmit={handleCreateSession} className="space-y-5">
          
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Select Machinery *</label>
            <select
              required
              value={selectedMachine}
              onChange={(e) => setSelectedMachine(e.target.value)}
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)] focus:ring-1 focus:ring-[var(--color-tenant-primary)] bg-white"
            >
              <option value="" disabled>-- Select a Target Machine --</option>
              {availableMachines.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} (SN: {m.serialNumber || m.id})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Conversation Title (Optional)</label>
            <input 
              type="text"
              placeholder="e.g. Conveyor Belt Maintenance"
              value={newChatTitle}
              onChange={(e) => setNewChatTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)] focus:ring-1 focus:ring-[var(--color-tenant-primary)]"
            />
          </div>
          
          <div className="flex justify-end gap-3 pt-3">
            <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-5 py-2 text-xs font-semibold tracking-wider text-gray-500 uppercase hover:bg-gray-50 rounded-md transition-colors">Cancel</button>
            <button type="submit" disabled={!selectedMachine} className="px-5 py-2 text-xs font-bold tracking-wider text-white bg-[var(--color-tenant-primary)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed rounded-md uppercase transition-opacity">Start Chat</button>
          </div>
        </form>
      </BaseModal>

      {/* 2. Edit Title Modal */}
      <BaseModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Rename Conversation">
        <form onSubmit={handleUpdateTitle} className="space-y-6">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">New Title</label>
            <input 
              type="text"
              required
              value={editChatTitle}
              onChange={(e) => setEditChatTitle(e.target.value)}
              className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-5 py-2 text-xs font-semibold tracking-wider text-gray-500 uppercase hover:bg-gray-50 rounded-md">Cancel</button>
            <button type="submit" className="px-5 py-2 text-xs font-bold tracking-wider text-white bg-[var(--color-tenant-primary)] hover:opacity-90 rounded-md uppercase">Save Title</button>
          </div>
        </form>
      </BaseModal>

      {/* 3. Delete Modal */}
      <BaseModal isOpen={isDeleteModalOpen} onClose={() => { setIsDeleteModalOpen(false); setSessionToDelete(null); }} title="Confirm Deletion">
        <div className="space-y-6">
          <p className="text-sm font-light text-gray-600">
            Are you sure you want to delete <span className="font-semibold text-gray-900">{sessionToDelete?.title}</span>? This will permanently remove the chat history, roadmap, and AI summary.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setIsDeleteModalOpen(false); setSessionToDelete(null); }} className="px-5 py-2 text-xs font-semibold tracking-wider text-gray-500 uppercase hover:bg-gray-50 rounded-md">Cancel</button>
            <button onClick={handleDeleteSession} className="px-5 py-2 text-xs font-bold tracking-wider text-white bg-red-600 hover:bg-red-700 rounded-md uppercase">Delete Chat</button>
          </div>
        </div>
      </BaseModal>
    </div>
  );
};

export default ChatPage;