import { createClient } from 'npm:@insforge/sdk@latest';
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1';
import mammoth from 'npm:mammoth@1.8.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;
const BUCKET = 'user-documents';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_SIZE, normalized.length);
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return chunks.filter((c) => c.length > 20);
}

async function openRouterEmbedBatch(apiKey: string, inputs: string[]) {
  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embedding error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return (data.data ?? []).map((d: { embedding: number[] }) => d.embedding);
}

function extensionFromName(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? (parts.pop() ?? '').toLowerCase() : '';
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n\n') : String(text ?? '');
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const result = await mammoth.extractRawText({
    arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  return result.value ?? '';
}

function decodePlainText(bytes: Uint8Array, mimeType?: string, fileName?: string): string {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const text = decoder.decode(bytes);

  if (mimeType?.includes('json') || extensionFromName(fileName ?? '') === 'json') {
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
    } catch {
      return text;
    }
  }

  return text;
}

async function extractTextFromFile(
  bytes: Uint8Array,
  fileName: string,
  mimeType?: string,
): Promise<string> {
  const ext = extensionFromName(fileName);
  const mime = mimeType?.toLowerCase() ?? '';

  if (ext === 'pdf' || mime.includes('pdf')) {
    const pdfText = await extractPdfText(bytes);
    if (pdfText.trim()) return pdfText;
    throw new Error('No text could be extracted from this PDF (it may be scanned images only).');
  }

  if (ext === 'docx' || mime.includes('wordprocessingml') || mime.includes('officedocument')) {
    const docxText = await extractDocxText(bytes);
    if (docxText.trim()) return docxText;
    throw new Error('No text could be extracted from this Word document.');
  }

  if (ext === 'doc' || mime === 'application/msword') {
    try {
      const docText = await extractDocxText(bytes);
      if (docText.trim()) return docText;
    } catch {
      /* fall through */
    }
    throw new Error(
      'Legacy .doc files are not fully supported. Please save as .docx or .pdf and upload again.',
    );
  }

  const plain = decodePlainText(bytes, mimeType, fileName);
  if (!plain.trim()) {
    throw new Error(
      'Could not read text from this file. Supported: PDF, Word (.docx), and text files (.txt, .md, .csv, etc.).',
    );
  }
  return plain;
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

  let body: { documentId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.documentId) {
    return jsonResponse({ error: 'documentId is required' }, 400);
  }

  const { data: doc, error: docError } = await client.database
    .from('user_documents')
    .select('*')
    .eq('id', body.documentId)
    .single();

  if (docError || !doc) {
    return jsonResponse({ error: 'Document not found' }, 404);
  }

  await client.database
    .from('user_documents')
    .update({ status: 'processing', error_message: null })
    .eq('id', body.documentId);

  try {
    const { data: fileData, error: downloadError } = await client.storage
      .from(BUCKET)
      .download(doc.storage_key);

    if (downloadError || !fileData) {
      throw new Error(downloadError?.message ?? 'Failed to download file');
    }

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    const text = await extractTextFromFile(bytes, doc.name, doc.mime_type);

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      throw new Error('Document too short to index');
    }

    await client.database
      .from('document_chunks')
      .delete()
      .eq('document_id', body.documentId);

    const batchSize = 20;
    let inserted = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await openRouterEmbedBatch(openRouterKey, batch);

      const rows = batch.map((content, idx) => ({
        document_id: body.documentId,
        user_id: userId,
        content,
        chunk_index: i + idx,
        embedding: embeddings[idx],
      }));

      const { error: insertError } = await client.database.from('document_chunks').insert(rows);
      if (insertError) throw new Error(insertError.message);
      inserted += rows.length;
    }

    await client.database
      .from('user_documents')
      .update({ status: 'ready', chunk_count: inserted, error_message: null })
      .eq('id', body.documentId);

    return jsonResponse({ documentId: body.documentId, chunkCount: inserted, status: 'ready' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ingest failed';
    await client.database
      .from('user_documents')
      .update({ status: 'error', error_message: msg })
      .eq('id', body.documentId);

    return jsonResponse({ error: msg }, 500);
  }
}
