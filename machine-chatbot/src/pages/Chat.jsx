// src/pages/Chat.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../api/client';
import { jwtDecode } from 'jwt-decode';
import { BaseModal } from '../components/ui/BaseModal';

export const ChatPage = () => {
  // 1. Role & Permissions Extraction
  let isAdmin = false;
  let currentUserId = null;
  const token = localStorage.getItem('arol_token');
  
  if (token) {
    try {
      const decoded = jwtDecode(token);
      isAdmin = decoded.user?.visibility === 'full';
      currentUserId = decoded.user?.id;
    } catch (e) {}
  }

  // 2. Application State
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [roadmap, setRoadmap] = useState({ steps: [] });
  
  // 3. Admin Toggle & Search State
  const [viewAll, setViewAll] = useState(false);
  const [search, setSearch] = useState('');
  
  // 4. Real-time Agent State
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [agentStatus, setAgentStatus] = useState('');
  const messagesEndRef = useRef(null);

  // 5. Modal States (NEW)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState('');
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editChatTitle, setEditChatTitle] = useState('');
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => { scrollToBottom(); }, [messages, agentStatus]);

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

  // Load a Specific Conversation
  const loadConversation = async (sessionId) => {
    try {
      const response = await apiClient.get(`/chat/sessions/${sessionId}`);
      setActiveSession(response.data.session);
      setMessages(response.data.messages);
      setRoadmap(response.data.roadmap);
    } catch (err) {
      console.error('Failed to load chat history', err);
    }
  };

  // Create New Session via Modal
  const handleCreateSession = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/chat/sessions', { title: newChatTitle });
      setActiveSession(res.data);
      setMessages([]);
      setRoadmap({ steps: [] });
      setIsCreateModalOpen(false);
      setNewChatTitle('');
      fetchSessions();
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
    try {
      const id = activeSession.id || activeSession.session_id;
      await apiClient.delete(`/chat/sessions/${id}`);
      setActiveSession(null);
      setMessages([]);
      setRoadmap({ steps: [] });
      setIsDeleteModalOpen(false);
      fetchSessions();
    } catch (err) {
      alert('Failed to delete chat.');
    }
  };

  // SSE Stream Handler: Sends message and listens to Agent thought process
  const sendMessageStream = async (sessionId, messageContent) => {
    // Optimistic UI Update
    setMessages(prev => [...prev, { role: 'user', content: messageContent }]);
    setInput('');
    setIsProcessing(true);
    setAgentStatus('Connecting to AI Assistant...');

    try {
      // Using native fetch because Axios doesn't handle SSE streams gracefully
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/chat/sessions/${sessionId}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: messageContent })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      // Read the stream chunk by chunk
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.replace('data: ', ''));
            
            if (data.type === 'status') {
              setAgentStatus(data.payload);
            } else if (data.type === 'message') {
              setMessages(prev => [...prev, { role: 'assistant', content: data.payload }]);
            } else if (data.type === 'action_required') {
              setMessages(prev => [...prev, { role: 'assistant', content: JSON.stringify({ isActionRequest: true, ...data.payload }) }]);
            } else if (data.type === 'roadmap_update') {
              setRoadmap(data.payload);
            } else if (data.type === 'title_update') {
              // Automatically update the title if the AI renamed it
              setActiveSession(prev => ({ ...prev, title: data.payload }));
              fetchSessions(); // Refresh sidebar
            } else if (data.type === 'error') {
              alert(data.payload);
            }
          }
        }
      }
    } catch (err) {
      console.error('Stream error:', err);
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

  const handleHumanInTheLoop = async (actionData, approved) => {
    try {
      setAgentStatus(approved ? 'Executing action...' : 'Cancelling action...');
      setIsProcessing(true);
      
      const res = await apiClient.post(`/chat/sessions/${activeSession.session_id || activeSession.id}/action`, {
        action: actionData.action,
        details: actionData.details,
        approved
      });
      
      // Append the system/assistant acknowledgment to the chat
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.message }]);
    } catch (err) {
      console.error('Action failed', err);
    } finally {
      setIsProcessing(false);
      setAgentStatus('');
    }
  };

  // Render a Message Bubble
  const renderMessage = (msg, index) => {
    if (msg.role === 'system' || msg.role === 'tool') return null; // Hide system internals

    const isUser = msg.role === 'user';
    
    // Parse HITL Action Requests
    let actionPayload = null;
    let textContent = msg.content;
    try {
      const parsed = JSON.parse(msg.content);
      if (parsed.isActionRequest) {
        actionPayload = parsed;
        textContent = "The agent is requesting permission to execute an action on your behalf.";
      }
    } catch (e) {} // Not JSON, treat as standard text

    return (
      <div key={index} className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[75%] rounded-2xl p-4 shadow-sm ${isUser ? 'bg-[var(--color-tenant-primary)] text-white rounded-br-none' : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none'}`}>
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{textContent}</div>
          
          {/* Render Human-in-the-Loop Action Card */}
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
      
      {/* LEFT SIDEBAR: Session History */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="w-full py-2.5 mb-4 text-xs font-bold text-white bg-[var(--color-tenant-primary)] hover:opacity-90 rounded-md uppercase tracking-wider shadow-sm transition-opacity"
          >
            + New Chat
          </button>
          
          {/* THE ADMIN TOGGLE SWITCH */}
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
        
        <div className="flex-1 overflow-y-auto p-2">
          {sessions.map(session => (
            <button 
              key={session.id}
              onClick={() => loadConversation(session.id)}
              className={`w-full text-left p-3 rounded-lg mb-1 transition-colors ${activeSession?.id === session.id ? 'bg-blue-50 border border-blue-100' : 'hover:bg-gray-50 border border-transparent'}`}
            >
              <h4 className="text-sm font-semibold text-gray-800 line-clamp-1 mb-1">{session.title}</h4>
              <div className="flex justify-between items-center text-[10px] text-gray-400">
                <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
                {viewAll && session.userId !== currentUserId && (
                  <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-bold">{session.userName}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* CENTER: Main Chat Interface */}
      <div className="flex-1 flex flex-col relative">
        {/* Chat Header */}
        <div className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
          <h2 className="text-lg font-light text-gray-900">
            {activeSession ? activeSession.title : 'Select or create a chat to begin'}
          </h2>
          
          {activeSession && (
            <div className="flex gap-3">
              <button 
                onClick={() => { setEditChatTitle(activeSession.title); setIsEditModalOpen(true); }}
                className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-blue-600 transition-colors"
              >
                Edit Title
              </button>
              <button 
                onClick={() => setIsDeleteModalOpen(true)}
                className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-red-500 transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Message Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto opacity-50">
              <svg className="w-16 h-16 text-[var(--color-tenant-primary)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <h3 className="text-xl font-light text-gray-900 mb-2">AROL Support Intelligence</h3>
              <p className="text-sm text-gray-500">I am connected directly to your fleet's telemetry and technical manuals. Describe the issue you are facing, or ask me for operational insights.</p>
            </div>
          ) : (
            messages.map((msg, idx) => renderMessage(msg, idx))
          )}
          
          {/* Agent Status Indicator (SSE Pipeline) */}
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

        {/* Input Form */}
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

      {/* RIGHT SIDEBAR: Dynamic Roadmap */}
      <div className="w-72 bg-white border-l border-gray-200 hidden lg:flex flex-col shadow-[-4px_0_15px_-5px_rgba(0,0,0,0.05)] z-10">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-[10px] uppercase font-bold tracking-[0.2em] text-gray-500">Live Roadmap</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
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
                    <div className="mt-0.5">
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
      </div>

      {/* --- MODALS --- */}
      
      {/* 1. Create Modal */}
      <BaseModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Start New Conversation">
        <form onSubmit={handleCreateSession} className="space-y-6">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Conversation Title (Optional)</label>
            <input 
              type="text"
              placeholder="e.g. Conveyor Belt Maintenance"
              value={newChatTitle}
              onChange={(e) => setNewChatTitle(e.target.value)}
              className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]"
            />
            <p className="text-xs text-gray-400 mt-1">Leave blank to let the system generate a default title.</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-5 py-2 text-xs font-semibold tracking-wider text-gray-500 uppercase hover:bg-gray-50 rounded-md">Cancel</button>
            <button type="submit" className="px-5 py-2 text-xs font-bold tracking-wider text-white bg-[var(--color-tenant-primary)] hover:opacity-90 rounded-md uppercase">Start Chat</button>
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
            <button type="submit" className="px-5 py-2 text-xs font-bold tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-md uppercase">Save Title</button>
          </div>
        </form>
      </BaseModal>

      {/* 3. Delete Modal */}
      <BaseModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Deletion">
        <div className="space-y-6">
          <p className="text-sm font-light text-gray-600">
            Are you sure you want to delete <span className="font-semibold text-gray-900">{activeSession?.title}</span>? This will permanently remove the chat history, roadmap, and AI summary.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setIsDeleteModalOpen(false)} className="px-5 py-2 text-xs font-semibold tracking-wider text-gray-500 uppercase hover:bg-gray-50 rounded-md">Cancel</button>
            <button onClick={handleDeleteSession} className="px-5 py-2 text-xs font-bold tracking-wider text-white bg-red-600 hover:bg-red-700 rounded-md uppercase">Delete Chat</button>
          </div>
        </div>
      </BaseModal>
    </div>

  );
};

export default ChatPage;