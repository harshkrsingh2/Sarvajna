# Sarvajna

Universal AI chat powered by [InsForge](https://insforge.app): GPT-4o, Claude Sonnet, and Gemini Flash in one place, with optional **document-only** answers from your uploads.
Sarvajna is a multi-model AI platform designed to provide users with a unified workspace for interacting with multiple leading AI systems through a single interface. Instead of switching between different applications, users can communicate with various AI models, upload documents, retrieve insights from their own data, and manage conversations in one centralized environment.

The project demonstrates how modern AI development platforms and automation tools can be combined to rapidly build intelligent applications that leverage Large Language Models (LLMs), Retrieval-Augmented Generation (RAG), document intelligence, and cloud-based backend services.

## Live app

**https://6rymq5wk.insforge.site**

## Features

- Email/password sign-up (with verification code) plus Google & GitHub OAuth
- Switch between GPT-4o, Claude Sonnet, and Gemini Flash per message
- Upload **PDF**, **Word** (.doc/.docx), and **text** files (.txt, .md, .csv, etc.) — indexed with embeddings for RAG
- Toggle **Answer from my documents only** to ground replies in your files (not general web knowledge)

## Key Features
Multi-Model AI Interaction

Users can interact with multiple state-of-the-art AI models from a single interface, including:

GPT-4o
Claude Sonnet
Gemini Flash
Grok xAI

This enables users to compare responses, leverage different model strengths, and choose the most suitable AI for their tasks.

## Document Intelligence

Users can upload documents in various formats, including:

PDF
DOC/DOCX
TXT
Markdown
CSV

The platform processes and indexes uploaded content, allowing users to ask questions directly about their documents.

## Retrieval-Augmented Generation (RAG)

Sarvajna implements the RAG architecture, enabling AI responses to be grounded in user-provided information.

The workflow includes:

Document upload and processing
Text chunking and embedding generation
Semantic search over document content
Context retrieval based on user queries
AI-generated responses using retrieved context

This approach reduces hallucinations and improves the accuracy and relevance of answers.

## User Authentication

The platform supports:

Email and password authentication
Verification-based account creation
Google Sign-In
GitHub Sign-In
Conversation Management

Users can maintain ongoing conversations with AI models while preserving context and chat history for future reference.


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

# SARVAJNA 
<img width="1906" height="899" alt="image" src="https://github.com/user-attachments/assets/5b8715fb-9b6c-4339-92d3-9278ea6b27e6" />

