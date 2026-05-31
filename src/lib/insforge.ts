import { createClient } from '@insforge/sdk';

const baseUrl = import.meta.env.VITE_INSFORGE_URL as string;
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY as string;

if (!baseUrl || !anonKey) {
  console.warn('Missing VITE_INSFORGE_URL or VITE_INSFORGE_ANON_KEY');
}

export const insforge = createClient({
  baseUrl,
  anonKey,
});

export const MODEL_OPTIONS = [
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
  { id: 'claude-sonnet', label: 'Claude Sonnet', provider: 'Anthropic' },
  { id: 'gemini-flash', label: 'Gemini 2.5 Flash', provider: 'Google' },
  { id: 'grok', label: 'Grok 4.20', provider: 'xAI' },
] as const;

export type ModelKey = (typeof MODEL_OPTIONS)[number]['id'];
