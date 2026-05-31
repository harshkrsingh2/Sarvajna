# Sarvajna

Universal AI chat powered by [InsForge](https://insforge.app): GPT-4o, Claude Sonnet, and Gemini Flash in one place, with optional **document-only** answers from your uploads.

## Live app

**https://6rymq5wk.insforge.site**

## Features

- Email/password sign-up (with verification code) plus Google & GitHub OAuth
- Switch between GPT-4o, Claude Sonnet, and Gemini Flash per message
- Upload **PDF**, **Word** (.doc/.docx), and **text** files (.txt, .md, .csv, etc.) — indexed with embeddings for RAG
- Toggle **Answer from my documents only** to ground replies in your files (not general web knowledge)

## Local development

```bash
npm install
cp .env.example .env   # fill VITE_INSFORGE_URL and VITE_INSFORGE_ANON_KEY
npm run dev
```

Get keys from the linked InsForge project:

```bash
npx @insforge/cli current
npx @insforge/cli secrets get ANON_KEY
```

## Backend (InsForge)

| Resource | Details |
|----------|---------|
| Project | Sarvajna (`6rymq5wk.us-east.insforge.app`) |
| Tables | `conversations`, `messages`, `user_documents`, `document_chunks` |
| Storage | Private bucket `user-documents` |
| Functions | `chat`, `ingest-document` |

Apply schema changes:

```bash
npx @insforge/cli db migrations up --all
```

## Deploy

```bash
npm run build
npx @insforge/cli deployments deploy .
```

Or use the InsForge MCP `create-deployment` tool.
