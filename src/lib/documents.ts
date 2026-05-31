export const BUCKET = 'user-documents';

/** Extensions users can upload (PDF, Word, plain text, and common text formats). */
export const ALLOWED_EXTENSIONS = [
  'txt',
  'text',
  'md',
  'markdown',
  'json',
  'csv',
  'html',
  'xml',
  'pdf',
  'doc',
  'docx',
  'rtf',
] as const;

export const ACCEPT_FILE_TYPES =
  '.txt,.md,.json,.csv,.html,.xml,.pdf,.doc,.docx,.rtf,text/plain,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return (parts.pop() ?? '').toLowerCase();
}

export function isAllowedUpload(filename: string): boolean {
  const ext = getFileExtension(filename);
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

export function mimeForFile(filename: string, fileType: string): string {
  if (fileType) return fileType;
  const ext = getFileExtension(filename);
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    html: 'text/html',
    xml: 'application/xml',
    rtf: 'application/rtf',
  };
  return map[ext] ?? 'application/octet-stream';
}
