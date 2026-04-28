import React, { useState, useEffect } from 'react';
import { MessageSquare, CheckCircle, Send, Plus, X, Clock } from 'lucide-react';
import { apiFetch } from '../../utils/apiFetch';
import { AuditEmptyState } from '../../components/ui/AuditEmptyState';

interface Comment {
  id: string;
  thread_id: string;
  text: string;
  author: string;
  created_at: string;
}

interface Thread {
  id: string;
  job_id: string;
  title: string;
  author: string;
  resolved: boolean;
  created_at: string;
  comments?: Comment[];
}

export default function AuditComments({ jobId }: { jobId: string }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newCommentText, setNewCommentText] = useState('');
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [loading, setLoading] = useState(false);
  const [threadsError, setThreadsError] = useState(false);

  // Hardcode an author name for MVP
  const currentUser = "Auditor (Demo)";

  const fetchThreads = async () => {
    setThreadsError(false);
    try {
      const res = await apiFetch(`http://localhost:8000/audits/${jobId}/threads`);
      if (!res.ok) {
        setThreads([]);
        setThreadsError(true);
        return;
      }
      const data = await res.json();
      setThreads(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch threads', e);
      setThreads([]);
      setThreadsError(true);
    }
  };

  useEffect(() => {
    if (jobId) fetchThreads();
  }, [jobId]);

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newThreadTitle.trim()) return;
    try {
      setLoading(true);
      await apiFetch(`http://localhost:8000/audits/${jobId}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newThreadTitle, author: currentUser })
      });
      setNewThreadTitle('');
      setIsCreatingThread(false);
      await fetchThreads();
    } catch (e) {
      console.error('Failed to create thread', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async (threadId: string) => {
    try {
      const res = await apiFetch(`http://localhost:8000/threads/${threadId}/comments`);
      const data = await res.json();
      setThreads(prev => prev.map(t => t.id === threadId ? { ...t, comments: data } : t));
    } catch (e) {
      console.error('Failed to fetch comments', e);
    }
  };

  useEffect(() => {
    if (activeThreadId) {
      fetchComments(activeThreadId);
    }
  }, [activeThreadId]);

  const handleAddComment = async (e: React.FormEvent, threadId: string) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    try {
      setLoading(true);
      await apiFetch(`http://localhost:8000/threads/${threadId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newCommentText, author: currentUser })
      });
      setNewCommentText('');
      await fetchComments(threadId);
    } catch (e) {
      console.error('Failed to add comment', e);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveThread = async (threadId: string, resolved: boolean) => {
    try {
      await apiFetch(`http://localhost:8000/threads/${threadId}/resolve?resolved=${resolved}`, {
        method: 'PATCH'
      });
      await fetchThreads();
    } catch (e) {
      console.error('Failed to resolve thread', e);
    }
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (threadsError && threads.length === 0) {
    return (
      <AuditEmptyState
        variant="failed-api"
        title="Comments could not load"
        description="The collaboration service did not respond. Check the API, then retry."
        onRetry={() => void fetchThreads()}
        retryLabel="Reload threads"
        className="glass-panel h-[400px] justify-center border-primary-500/20"
        compact
      />
    );
  }

  return (
    <div className="glass-panel p-6 border-primary-500/20 flex flex-col h-[600px]">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-semibold flex items-center gap-2 text-primary-400">
          <MessageSquare /> Collaborative Audit Comments
        </h3>
        {!isCreatingThread && (
          <button 
            onClick={() => setIsCreatingThread(true)}
            className="flex items-center gap-1 text-sm bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={16} /> New Thread
          </button>
        )}
      </div>

      {isCreatingThread && (
        <form onSubmit={handleCreateThread} className="mb-6 p-4 bg-dark-800 rounded-xl border border-primary-500/30">
          <div className="flex justify-between mb-2">
            <h4 className="text-sm font-medium text-slate-300">Start a discussion</h4>
            <button type="button" onClick={() => setIsCreatingThread(false)} className="text-slate-500 hover:text-slate-300">
              <X size={16} />
            </button>
          </div>
          <input
            type="text"
            value={newThreadTitle}
            onChange={(e) => setNewThreadTitle(e.target.value)}
            placeholder="e.g. Bias detected in age groups, let's discuss..."
            className="w-full bg-dark-900 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500 mb-3"
            autoFocus
          />
          <div className="flex justify-end">
            <button 
              type="submit" 
              disabled={loading || !newThreadTitle.trim()}
              className="bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors"
            >
              Post Thread
            </button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
        {threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-3">
            <MessageSquare size={32} className="opacity-40" />
            <p>No comments yet. Start a thread to collaborate.</p>
          </div>
        ) : (
          threads.map(thread => (
            <div key={thread.id} className={`border rounded-xl overflow-hidden transition-all duration-200 ${activeThreadId === thread.id ? 'border-primary-500 shadow-lg shadow-primary-500/10' : 'border-slate-700/60 hover:border-slate-600 bg-dark-800/50'}`}>
              <div 
                className={`p-4 cursor-pointer flex justify-between items-start ${activeThreadId === thread.id ? 'bg-dark-800' : ''}`}
                onClick={() => setActiveThreadId(activeThreadId === thread.id ? null : thread.id)}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {thread.resolved && <CheckCircle size={16} className="text-emerald-500" />}
                    <h4 className={`font-medium ${thread.resolved ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                      {thread.title}
                    </h4>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>{thread.author}</span>
                    <span className="flex items-center gap-1"><Clock size={12} /> {formatDate(thread.created_at)}</span>
                  </div>
                </div>
                
                {activeThreadId === thread.id && (
                   <button 
                     onClick={(e) => { e.stopPropagation(); handleResolveThread(thread.id, !thread.resolved); }}
                     className={`text-xs px-2 py-1 rounded border ${thread.resolved ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'}`}
                   >
                     {thread.resolved ? 'Reopen' : 'Resolve'}
                   </button>
                )}
              </div>

              {activeThreadId === thread.id && (
                <div className="bg-dark-900/50 border-t border-slate-700/50 p-4">
                  <div className="space-y-4 mb-4 max-h-60 overflow-y-auto pr-2">
                    {thread.comments?.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-2">No replies yet.</p>
                    ) : (
                      thread.comments?.map(comment => (
                        <div key={comment.id} className="bg-dark-800 rounded-lg p-3 border border-slate-700/50">
                          <p className="text-sm text-slate-300 mb-2">{comment.text}</p>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span className="font-medium text-indigo-300">{comment.author}</span>
                            <span>{formatDate(comment.created_at)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {!thread.resolved && (
                    <form onSubmit={(e) => handleAddComment(e, thread.id)} className="flex gap-2">
                      <input
                        type="text"
                        value={newCommentText}
                        onChange={(e) => setNewCommentText(e.target.value)}
                        placeholder="Reply to this thread..."
                        className="flex-1 bg-dark-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
                      />
                      <button 
                        type="submit" 
                        disabled={loading || !newCommentText.trim()}
                        className="bg-primary-500 text-white p-2 rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors flex items-center justify-center w-10"
                      >
                        <Send size={16} />
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
