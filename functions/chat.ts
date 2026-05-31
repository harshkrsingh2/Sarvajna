import { createClient } from 'npm:@insforge/sdk@latest';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const MODELS: Record<string, string> = {
  'gpt-4o': 'openai/gpt-4o',
  'claude-sonnet': 'anthropic/claude-sonnet-4',
  'gemini-flash': 'google/gemini-2.5-flash',
  'grok': 'x-ai/grok-4.20',
};

/** Fallback if primary slug is unavailable on OpenRouter. */
const MODEL_FALLBACKS: Record<string, string> = {
  'google/gemini-2.5-flash': 'google/gemini-2.0-flash-001',
  'x-ai/grok-4.20': 'x-ai/grok-4.3',
  'x-ai/grok-4.3': 'x-ai/grok-build-0.1',
};

function extractMessageContent(message: Record<string, unknown> | undefined): string {
  if (!message) return '';

  const content = message.content;
  if (typeof content === 'string' && content.trim()) return content;

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: string }).text ?? '');
        }
        return '';
      })
      .join('');
    if (text.trim()) return text;
  }

  const reasoning = message.reasoning;
  if (typeof reasoning === 'string' && reasoning.trim()) return reasoning;

  return '';
}

const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
/** Below this chunk count, send all indexed text (small libraries). */
const FULL_CONTEXT_CHUNK_LIMIT = 25;
const VECTOR_MATCH_THRESHOLD = 0.55;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function requestCompletion(
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<{ data: Record<string, unknown>; modelUsed: string }> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://sarvajna.insforge.app',
      'X-Title': 'Sarvajna',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${errText}`);
  }

  const data = await res.json() as Record<string, unknown>;
  return { data, modelUsed: String(payload.model) };
}

async function openRouterChat(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options?: { webSearch?: boolean },
) {
  const useWebSearch = Boolean(options?.webSearch);
  const modelsToTry = [model, MODEL_FALLBACKS[model]].filter(
    (m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i,
  );

  let lastError: Error | null = null;

  for (const modelId of modelsToTry) {
    const payload: Record<string, unknown> = {
      model: modelId,
      messages,
      max_completion_tokens: 2048,
    };

    if (useWebSearch) {
      payload.tools = [{ type: 'openrouter:web_search', max_results: 8 }];
    }

    try {
      let { data, modelUsed } = await requestCompletion(apiKey, payload);
      const choices = data.choices as Array<{ message?: Record<string, unknown> }> | undefined;
      let msg = choices?.[0]?.message;
      let content = extractMessageContent(msg);

      if (!content.trim() && useWebSearch) {
        const withoutSearch = { ...payload, model: modelId };
        delete withoutSearch.tools;
        ({ data, modelUsed } = await requestCompletion(apiKey, withoutSearch));
        msg = (data.choices as Array<{ message?: Record<string, unknown> }>)?.[0]?.message;
        content = extractMessageContent(msg);
      }

      if (!content.trim()) {
        lastError = new Error(`Model ${modelId} returned an empty response`);
        continue;
      }

      return {
        content,
        model: (data.model as string) ?? modelUsed,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message.toLowerCase();
      if (!msg.includes('model') && !msg.includes('404') && !msg.includes('not found')) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error('All model attempts failed');
}

async function openRouterEmbed(apiKey: string, input: string) {
  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embedding error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.data?.[0]?.embedding as number[];
}

type DocChunk = {
  content: string;
  document_name?: string;
};

async function fetchAllUserChunks(
  client: ReturnType<typeof createClient>,
  userId: string,
): Promise<DocChunk[]> {
  const { data: docs, error: docsError } = await client.database
    .from('user_documents')
    .select('id, name')
    .eq('user_id', userId)
    .eq('status', 'ready');

  if (docsError || !docs?.length) return [];

  const docNames = new Map(docs.map((d: { id: string; name: string }) => [d.id, d.name]));

  const { data: chunks, error: chunksError } = await client.database
    .from('document_chunks')
    .select('content, document_id, chunk_index')
    .eq('user_id', userId)
    .order('document_id', { ascending: true })
    .order('chunk_index', { ascending: true });

  if (chunksError || !chunks?.length) return [];

  return chunks.map((c: { content: string; document_id: string }) => ({
    content: c.content,
    document_name: docNames.get(c.document_id) ?? 'Document',
  }));
}

async function fetchRelevantChunks(
  client: ReturnType<typeof createClient>,
  userId: string,
  openRouterKey: string,
  query: string,
): Promise<DocChunk[]> {
  const allChunks = await fetchAllUserChunks(client, userId);
  if (allChunks.length === 0) return [];

  if (allChunks.length <= FULL_CONTEXT_CHUNK_LIMIT) {
    return allChunks;
  }

  const embedding = await openRouterEmbed(openRouterKey, query);
  const { data: matched, error: searchError } = await client.database.rpc('match_user_chunks', {
    p_user_id: userId,
    query_embedding: embedding,
    match_count: 12,
    match_threshold: VECTOR_MATCH_THRESHOLD,
  });

  if (searchError) {
    console.error('match_user_chunks error:', searchError.message);
    return allChunks;
  }

  const rows = (matched ?? []) as Array<{ content: string; document_id: string }>;
  if (rows.length === 0) {
    return allChunks;
  }

  const { data: docs } = await client.database
    .from('user_documents')
    .select('id, name')
    .eq('user_id', userId);

  const docNames = new Map((docs ?? []).map((d: { id: string; name: string }) => [d.id, d.name]));

  return rows.map((r) => ({
    content: r.content,
    document_name: docNames.get(r.document_id) ?? 'Document',
  }));
}

function buildDocumentSystemPrompt(chunks: DocChunk[]): string {
  if (chunks.length === 0) {
    return (
      'The user enabled document-only mode but has no indexed documents yet. ' +
      'Tell them to upload PDF, Word, or text files in the Documents tab and wait until indexing shows "ready". ' +
      'Do not use general internet knowledge.'
    );
  }

  const byDoc = new Map<string, string[]>();
  for (const chunk of chunks) {
    const name = chunk.document_name ?? 'Document';
    if (!byDoc.has(name)) byDoc.set(name, []);
    byDoc.get(name)!.push(chunk.content);
  }

  const sections: string[] = [];
  for (const [name, parts] of byDoc) {
    sections.push(`### File: ${name}\n${parts.join('\n\n')}`);
  }

  const fileList = [...byDoc.keys()].join(', ');

  return (
    'You are Sarvajna answering ONLY from the user\'s uploaded documents listed below.\n' +
    `Indexed files: ${fileList}\n` +
    'Rules:\n' +
    '- Use ONLY the excerpts below. Do not say files are missing — they are provided in this message.\n' +
    '- If the answer is not in the excerpts, say what is missing from those specific files.\n' +
    '- Do not use outside or internet knowledge.\n\n' +
    '--- UPLOADED DOCUMENT CONTENT ---\n\n' +
    sections.join('\n\n---\n\n')
  );
}

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!openRouterKey) {
    return jsonResponse({ error: 'AI not configured' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  const userToken = authHeader?.replace(/^Bearer\s+/i, '') ?? null;
  if (!userToken) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const client = createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL')!,
    edgeFunctionToken: userToken,
  });

  const { data: userData, error: userError } = await client.auth.getCurrentUser();
  if (userError || !userData?.user?.id) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const userId = userData.user.id;

  let body: {
    conversationId?: string;
    message?: string;
    modelKey?: string;
    useDocuments?: boolean;
    webSearch?: boolean;
    title?: string;
  };

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const message = body.message?.trim();
  if (!message) {
    return jsonResponse({ error: 'Message is required' }, 400);
  }

  const modelKey = body.modelKey ?? 'gpt-4o';
  const openRouterModel = MODELS[modelKey] ?? MODELS['gpt-4o'];
  const useDocuments = Boolean(body.useDocuments);
  const webSearch = !useDocuments && body.webSearch !== false;

  let conversationId = body.conversationId;

  if (!conversationId) {
    const { data: conv, error: convError } = await client.database
      .from('conversations')
      .insert([{
        user_id: userId,
        title: body.title?.slice(0, 80) || message.slice(0, 60),
        model: openRouterModel,
        use_documents: useDocuments,
      }])
      .select('id')
      .single();

    if (convError || !conv?.id) {
      return jsonResponse({ error: convError?.message ?? 'Failed to create conversation' }, 500);
    }
    conversationId = conv.id;
  } else if (useDocuments) {
    await client.database
      .from('conversations')
      .update({ use_documents: true })
      .eq('id', conversationId);
  }

  const { error: userMsgError } = await client.database.from('messages').insert([{
    conversation_id: conversationId,
    user_id: userId,
    role: 'user',
    content: message,
  }]);

  if (userMsgError) {
    return jsonResponse({ error: userMsgError.message }, 500);
  }

  const { data: history, error: historyError } = await client.database
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(40);

  if (historyError) {
    return jsonResponse({ error: historyError.message }, 500);
  }

  const chatMessages: Array<{ role: string; content: string }> = [];
  let chunksUsed = 0;

  if (useDocuments) {
    const chunks = await fetchRelevantChunks(client, userId, openRouterKey, message);
    chunksUsed = chunks.length;
    chatMessages.push({ role: 'system', content: buildDocumentSystemPrompt(chunks) });
  } else {
    chatMessages.push({
      role: 'system',
      content: webSearch
        ? 'You are Sarvajna, a helpful AI assistant with live web search enabled. ' +
          'For questions about current events, recent news, prices, weather, sports scores, ' +
          'product releases, or anything that changes over time, use the web search tool to ' +
          'find up-to-date information before answering. Combine search results with your ' +
          'reasoning. Mention sources or URLs when the search returns them. ' +
          'For stable general knowledge you may answer directly. Be clear and helpful.'
        : 'You are Sarvajna, a helpful AI assistant. Answer using your broad knowledge. ' +
          'Be clear, accurate, and concise. If you are unsure about very recent events, say so.',
    });
  }

  for (const row of history ?? []) {
    if (row.role === 'user' || row.role === 'assistant') {
      chatMessages.push({ role: row.role, content: row.content });
    }
  }

  try {
    const completion = await openRouterChat(openRouterKey, openRouterModel, chatMessages, {
      webSearch,
    });

    const { error: assistantError } = await client.database.from('messages').insert([{
      conversation_id: conversationId,
      user_id: userId,
      role: 'assistant',
      content: completion.content,
      model: completion.model,
    }]);

    if (assistantError) {
      return jsonResponse({ error: assistantError.message }, 500);
    }

    await client.database
      .from('conversations')
      .update({ updated_at: new Date().toISOString(), model: openRouterModel })
      .eq('id', conversationId);

    return jsonResponse({
      conversationId,
      reply: completion.content,
      model: completion.model,
      documentChunksUsed: useDocuments ? chunksUsed : 0,
      webSearchUsed: webSearch,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Chat failed';
    return jsonResponse({ error: msg }, 500);
  }
}
