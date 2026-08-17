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

  // State for pagination
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null); 
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 5. Modal States (NEW)
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
      
      // Auto-scroll to the newest message on initial load
      setTimeout(() => scrollToBottom(), 150);
    } catch (err) {
      console.error('Failed to load chat history', err);
    }
  };

  // Scroll Event Listener
  const handleScroll = async (e) => {
    // If we hit the absolute top of the container, have more to load, and aren't already loading
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

        // Prepend the older messages to the array
        setMessages(prev => [...res.data.messages, ...prev]);
        setHasMore(res.data.hasMore);

        // Instantly restore scroll position so the user's view doesn't jump
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
    if (!sessionToDelete) return;
    try {
      const id = sessionToDelete.id || sessionToDelete.session_id;
      await apiClient.delete(`/chat/sessions/${id}`);
      
      // If we are currently looking at the chat we just deleted, clear the screen
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

  // SSE Stream Handler: Sends message and listens to Agent thought process
  const sendMessageStream = async (sessionId, messageContent) => {
    // Optimistic UI Update
    setMessages(prev => [...prev, { role: 'user', content: messageContent }]);
    setTimeout(scrollToBottom, 50);
    setInput('');
    setIsProcessing(true);
    setAgentStatus('Connecting to AI Assistant...');

    try {
      // 1. Ask Axios to generate the exact URL
      const streamUrl = apiClient.getUri({ url: `/chat/sessions/${sessionId}/stream` });

      // 2. Use native fetch to handle the streaming response
      const response = await fetch(streamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: messageContent })
      });

      if (!response.ok) {
        throw new Error(`Backend rejected request with status: ${response.status}`);
      }

      if (!response.body) {
         throw new Error("ReadableStream not supported or no body returned.");
      }

      // Initialize the reader EXACTLY ONCE
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = ''; 

      // Single loop to read the stream
      // Read the stream chunk by chunk
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          // If the stream closes but there is still data in the buffer, process it!
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

        // Append the new network chunk to the buffer
        buffer += decoder.decode(value, { stream: true });

        // 🚨 THE FIX: Split safely handling both \n\n and \r\n\r\n
        const parts = buffer.split(/\r?\n\r?\n/);
        
        // The last part might be an incomplete network chunk. 
        buffer = parts.pop();

        for (const part of parts) {
          const trimmedPart = part.trim();
          
          if (trimmedPart.startsWith('data:')) {
            try {
              // Strip the "data: " prefix safely
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
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col min-h-0">
        <div className="p-4 border-b border-gray-100 shrink-0">
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
        
        {/* Added min-h-0 and block formatting context to guarantee scrolling */}
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
                  <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
                  {viewAll && session.userId !== currentUserId && (
                    <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-bold">{session.userName}</span>
                  )}
                </div>
              </div>
              
              {/* Inline Delete Button (Shows on Hover) */}
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); // Prevents loadConversation from firing
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
                onClick={() => { setSessionToDelete(activeSession); setIsDeleteModalOpen(true); }}
                className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-red-500 transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Message Area */}
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

      {/* RIGHT SIDEBAR: Dynamic Roadmap (Collapsible) */}
      <div className={`bg-white border-l border-gray-200 hidden lg:flex flex-col shadow-[-4px_0_15px_-5px_rgba(0,0,0,0.05)] z-10 transition-all duration-300 ${isRoadmapOpen ? 'w-72' : 'w-14 items-center'}`}>
        
        {/* Sidebar Header & Toggle */}
        <div className={`p-4 border-b border-gray-100 bg-gray-50/50 flex ${isRoadmapOpen ? 'justify-between' : 'justify-center'} items-center shrink-0`}>
          {isRoadmapOpen && <h3 className="text-[10px] uppercase font-bold tracking-[0.2em] text-gray-500 truncate mr-2">Live Roadmap</h3>}
          <button 
            onClick={() => setIsRoadmapOpen(!isRoadmapOpen)}
            className="text-gray-400 hover:text-[var(--color-tenant-primary)] transition-colors p-1 rounded hover:bg-gray-200"
            title={isRoadmapOpen ? "Collapse Roadmap" : "Expand Roadmap"}
          >
            <svg className={`w-5 h-5 transform transition-transform duration-300 ${isRoadmapOpen ? 'rotate-0' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Sidebar Content */}
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
          /* Collapsed View Icon Placeholder */
          <div className="flex-1 flex flex-col pt-6 items-center border-t border-gray-50">
            <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
        )}
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