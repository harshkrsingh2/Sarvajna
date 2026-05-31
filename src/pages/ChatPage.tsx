import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { insforge, MODEL_OPTIONS, type ModelKey } from '../lib/insforge';
import {
  ACCEPT_FILE_TYPES,
  BUCKET,
  isAllowedUpload,
  mimeForFile,
} from '../lib/documents';
import { useAuth } from '../hooks/useAuth';
import SacredBackground from '../components/SacredBackground';

type Conversation = {
  id: string;
  title: string;
  model: string;
  use_documents: boolean;
  updated_at: string;
};

type Message = {
  id: string;
  role: string;
  content: string;
  model?: string;
  created_at: string;
};

type UserDocument = {
  id: string;
  name: string;
  status: string;
  chunk_count: number;
  error_message?: string;
  created_at: string;
};

export default function ChatPage() {
  const { user, signOut } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [input, setInput] = useState('');
  const [modelKey, setModelKey] = useState<ModelKey>('gpt-4o');
  const [useDocuments, setUseDocuments] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'chats' | 'docs'>('chats');
  const bottomRef = useRef<HTMLDivElement>(null);
  const sidebarFileRef = useRef<HTMLInputElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(async () => {
    const { data } = await insforge.database
      .from('conversations')
      .select('id, title, model, use_documents, updated_at')
      .order('updated_at', { ascending: false })
      .limit(50);
    setConversations((data as Conversation[]) ?? []);
  }, []);

  const loadDocuments = useCallback(async () => {
    const { data } = await insforge.database
      .from('user_documents')
      .select('id, name, status, chunk_count, error_message, created_at')
      .order('created_at', { ascending: false });
    setDocuments((data as UserDocument[]) ?? []);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data } = await insforge.database
      .from('messages')
      .select('id, role, content, model, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    setMessages((data as Message[]) ?? []);
  }, []);

  useEffect(() => {
    loadConversations();
    loadDocuments();
  }, [loadConversations, loadDocuments]);

  useEffect(() => {
    if (activeId) {
      loadMessages(activeId);
    } else {
      setMessages([]);
    }
  }, [activeId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const startNewChat = () => {
    setActiveId(null);
    setMessages([]);
    setInput('');
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput('');

    const optimisticUser: Message = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const { data, error } = await insforge.functions.invoke('chat', {
        body: {
          conversationId: activeId ?? undefined,
          message: text,
          modelKey,
          useDocuments,
          webSearch: useDocuments ? false : useWebSearch,
          title: text.slice(0, 60),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const convId = data.conversationId as string;
      if (!activeId) {
        setActiveId(convId);
        await loadConversations();
      }

      const assistant: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.reply as string,
        model: data.model as string,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => {
        const withoutTmp = prev.filter((m) => m.id !== optimisticUser.id);
        return [
          ...withoutTmp,
          { ...optimisticUser, id: `u-${Date.now()}` },
          assistant,
        ];
      });

      await loadConversations();
      if (convId) await loadMessages(convId);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      alert(err instanceof Error ? err.message : 'Failed to send message');
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!file || uploading) return;
    if (!user?.id) {
      setUploadError('You must be signed in to upload files.');
      return;
    }

    setUploading(true);
    setUploadError('');

    try {
      if (!isAllowedUpload(file.name)) {
        throw new Error(
          'Unsupported file type. Use PDF, Word (.doc/.docx), or text files (.txt, .md, .csv, etc.).',
        );
      }

      const safeName = file.name.replace(/[^\w.\-() ]+/g, '_');
      const storageKey = `${user.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await insforge.storage
        .from(BUCKET)
        .upload(storageKey, file);

      if (uploadError) {
        throw new Error(uploadError.message ?? 'Storage upload failed');
      }

      const { data: docRow, error: docError } = await insforge.database
        .from('user_documents')
        .insert([{
          user_id: user.id,
          name: file.name,
          storage_key: storageKey,
          mime_type: mimeForFile(file.name, file.type),
          status: 'pending',
        }])
        .select('id')
        .single();

      if (docError || !docRow?.id) {
        await insforge.storage.from(BUCKET).remove([storageKey]).catch(() => undefined);
        throw new Error(docError?.message ?? 'Failed to register document');
      }

      await loadDocuments();

      const { data: ingestData, error: ingestError } = await insforge.functions.invoke(
        'ingest-document',
        { body: { documentId: docRow.id } },
      );

      if (ingestError) throw ingestError;
      if (ingestData?.error) throw new Error(ingestData.error);

      await loadDocuments();
      setUseDocuments(true);
      setSidebarTab('docs');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(msg);
    } finally {
      setUploading(false);
      if (sidebarFileRef.current) sidebarFileRef.current.value = '';
      if (chatFileRef.current) chatFileRef.current.value = '';
    }
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleUpload(f);
  };

  const deleteDocument = async (id: string) => {
    if (!confirm('Delete this document and all its chunks?')) return;
    await insforge.database.from('user_documents').delete().eq('id', id);
    await loadDocuments();
  };

  const fileInputProps = {
    type: 'file' as const,
    accept: ACCEPT_FILE_TYPES,
    className: 'hidden' as const,
    onChange: onFilePicked,
    disabled: uploading,
  };

  return (
    <div className="h-screen flex relative">
      <SacredBackground />
      <aside className="w-72 border-r border-stone-800/70 flex flex-col glass-panel shrink-0">
        <div className="p-4 border-b border-stone-800">
          <h1 className="font-display text-2xl text-saffron-400">Sarvajna</h1>
          <p className="text-xs text-stone-500 mt-0.5 truncate">{user?.email}</p>
        </div>

        <div className="flex border-b border-stone-800">
          <button
            type="button"
            onClick={() => setSidebarTab('chats')}
            className={`flex-1 py-2.5 text-xs font-medium ${sidebarTab === 'chats' ? 'text-saffron-400 border-b-2 border-saffron-500' : 'text-stone-500'}`}
          >
            Chats
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('docs')}
            className={`flex-1 py-2.5 text-xs font-medium ${sidebarTab === 'docs' ? 'text-saffron-400 border-b-2 border-saffron-500' : 'text-stone-500'}`}
          >
            Documents
          </button>
        </div>

        {sidebarTab === 'chats' ? (
          <>
            <button
              type="button"
              onClick={startNewChat}
              className="m-3 py-2.5 bg-saffron-600/90 hover:bg-saffron-500 text-white text-sm font-medium rounded-lg transition"
            >
              + New chat
            </button>
            <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-2 space-y-1">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setActiveId(c.id);
                    setUseDocuments(c.use_documents);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition truncate ${
                    activeId === c.id
                      ? 'bg-stone-800 text-stone-100'
                      : 'text-stone-400 hover:bg-stone-800/50'
                  }`}
                >
                  <span className="block truncate">{c.title}</span>
                  {c.use_documents ? (
                    <span className="text-[10px] text-saffron-500/80">📄 docs</span>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col p-3 overflow-hidden">
            <input ref={sidebarFileRef} {...fileInputProps} />
            <button
              type="button"
              disabled={uploading}
              onClick={() => sidebarFileRef.current?.click()}
              className="py-2.5 border border-dashed border-stone-600 rounded-lg text-sm text-stone-400 hover:border-saffron-500 hover:text-saffron-400 transition disabled:opacity-50"
            >
              {uploading ? 'Processing…' : '+ Upload document'}
            </button>
            <p className="text-[10px] text-stone-600 mt-2 px-1 leading-relaxed">
              PDF, Word (.doc/.docx), .txt, .md, .csv, .json, .rtf
            </p>
            {uploadError ? (
              <p className="text-[11px] text-red-400 mt-2 px-1">{uploadError}</p>
            ) : null}
            <div className="flex-1 overflow-y-auto scrollbar-thin mt-3 space-y-2">
              {documents.map((d) => (
                <div
                  key={d.id}
                  className="p-2.5 rounded-lg bg-ink-950 border border-stone-800 text-xs"
                >
                  <p className="text-stone-200 truncate font-medium">{d.name}</p>
                  <p className={`mt-1 ${
                    d.status === 'ready'
                      ? 'text-emerald-500'
                      : d.status === 'error'
                        ? 'text-red-400'
                        : 'text-amber-500'
                  }`}>
                    {d.status === 'ready'
                      ? `${d.chunk_count} chunks indexed`
                      : d.status === 'error'
                        ? d.error_message ?? 'Error'
                        : d.status}
                  </p>
                  <button
                    type="button"
                    onClick={() => deleteDocument(d.id)}
                    className="mt-2 text-stone-500 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              ))}
              {documents.length === 0 ? (
                <p className="text-stone-600 text-xs text-center py-4">No documents yet</p>
              ) : null}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={signOut}
          className="m-3 py-2 text-sm text-stone-500 hover:text-stone-300 border-t border-stone-800 pt-3"
        >
          Sign out
        </button>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-stone-800/70 glass-panel">
          <label className="text-xs text-stone-500">Model</label>
          <select
            value={modelKey}
            onChange={(e) => setModelKey(e.target.value as ModelKey)}
            className="bg-ink-950 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-200 focus:outline-none focus:border-saffron-500"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.provider})
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 ml-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useDocuments}
              onChange={(e) => {
                const on = e.target.checked;
                setUseDocuments(on);
                if (on) setUseWebSearch(false);
                else setUseWebSearch(true);
              }}
              className="rounded border-stone-600 text-saffron-600 focus:ring-saffron-500"
            />
            <span className="text-sm text-stone-300">
              Answer from my documents only
              {useDocuments && documents.some((d) => d.status === 'ready') ? (
                <span className="text-saffron-500/90 ml-1">
                  ({documents.filter((d) => d.status === 'ready').reduce((n, d) => n + d.chunk_count, 0)} chunks ready)
                </span>
              ) : null}
            </span>
          </label>

          {!useDocuments ? (
            <label className="flex items-center gap-2 ml-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useWebSearch}
                onChange={(e) => setUseWebSearch(e.target.checked)}
                className="rounded border-stone-600 text-saffron-600 focus:ring-saffron-500"
              />
              <span className="text-sm text-stone-300">Search the web for current info</span>
            </label>
          ) : null}
        </header>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6">
          {messages.length === 0 ? (
            <div className="max-w-lg mx-auto text-center mt-24">
              <h2 className="font-display text-3xl text-stone-200">Welcome to Sarvajna</h2>
              <p className="text-stone-500 mt-3 text-sm leading-relaxed">
                Chat with GPT-4o, Claude Sonnet, Gemini Flash, or Grok. Turn on web search for
                live news and current events, or use document mode for your uploaded files.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-saffron-600 text-white'
                        : 'bg-ink-900/70 border border-stone-800/80 backdrop-blur-sm text-stone-200'
                    }`}
                  >
                    {m.content}
                    {m.model && m.role === 'assistant' ? (
                      <p className="text-[10px] opacity-50 mt-2">{m.model}</p>
                    ) : null}
                  </div>
                </div>
              ))}
              {sending ? (
                <div className="flex justify-start">
                  <div className="bg-ink-900 border border-stone-800 rounded-2xl px-4 py-3 text-sm text-stone-500">
                    Thinking…
                  </div>
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <form onSubmit={sendMessage} className="p-4 border-t border-stone-800/70 glass-panel">
          <div className="max-w-3xl mx-auto">
            {uploadError && sidebarTab === 'chats' ? (
              <p className="text-xs text-red-400 mb-2">{uploadError}</p>
            ) : null}
            <div className="flex gap-2 items-end">
              <input ref={chatFileRef} {...fileInputProps} />
              <button
                type="button"
                disabled={uploading}
                onClick={() => chatFileRef.current?.click()}
                title="Upload PDF, Word, or text file"
                className="shrink-0 px-3 py-3 border border-stone-700 rounded-xl text-stone-400 hover:text-saffron-400 hover:border-saffron-600 disabled:opacity-40 transition"
                aria-label="Upload document"
              >
                {uploading ? (
                  <span className="inline-block w-5 h-5 border-2 border-saffron-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.114-5.114 2.898 2.898a2.25 2.25 0 1 0 3.182-3.182l-2.898-2.898" />
                  </svg>
                )}
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  useDocuments
                    ? 'Ask about your uploaded documents…'
                    : 'Message Sarvajna…'
                }
                disabled={sending}
                className="flex-1 px-4 py-3 bg-ink-950 border border-stone-700 rounded-xl text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-saffron-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="shrink-0 px-5 py-3 bg-saffron-600 hover:bg-saffron-500 disabled:opacity-40 text-white font-medium rounded-xl transition"
              >
                Send
              </button>
            </div>
            <p className="text-[10px] text-stone-600 mt-2 text-center">
              Attach PDF, Word, or text files · indexed for document-mode chat
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
