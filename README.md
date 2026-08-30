# XStudio

XStudio is an open, Git-native publishing studio for technical teams and independent creators. It combines a structured Tiptap editing experience with portable MDX, reviewable Git history, and a fast Astro publishing layer.

## Product promise

Write once in a calm visual editor. Store content as portable MDX. Review it like code. Publish it as a fast, searchable developer publication.

## Included in this foundation

- GitBook-inspired product landing page with XStudio's own identity
- Three-column developer article experience: series navigation, article, table of contents
- Two-column XStudio workspace with a functional Tiptap editor island
- Supabase-ready draft autosave with a local-first fallback
- Multi-tenant Phase 1 schema with RLS, revisions, publish jobs, and metrics
- GitBook/Substack-style content library with workflow tabs, cards/lists, series, tags, date filters, popularity, and views
- Astro + React + MDX foundation
- Responsive layouts and accessible navigation
- Sample long-form article structure inspired by high-quality developer tutorials

## Run locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and provide the project's URL and modern publishable key to enable Supabase. Never place a secret or `service_role` key in a public environment variable.

Apply `supabase/migrations/20260830120000_xstudio_phase_1.sql` to the selected XStudio project, then create the first signed-in workspace with:

```sql
select * from public.xstudio_create_workspace('My publication', 'my-publication');
```

Production check:

```bash
npm run build
npm run preview
```

## Routes

- `/` — product landing page
- `/blog/generate-pdf-invoices-aspnet-core/` — three-column article example
- `/studio/` — editor workspace foundation
- `/studio/content` — drafts, reviews, schedules, published content, filters, and display customization

## Architecture direction

```text
Tiptap JSON <-> Canonical document model <-> MDX serializer <-> Git provider
                                              |
                                              +-> Astro content collections
                                              +-> GitBook adapter
                                              +-> external publishing adapters
```

The canonical document model—not Tiptap JSON and not GitBook—is the editing source of truth. Supabase stores private workflow state; deterministic MDX committed to Git remains the published ledger. See `docs/MASTER_BUILD_PROMPT.md` for the complete implementation brief.

## Status

Phase 1 now includes the canonical editor, deterministic MDX conversion, local-first/Supabase draft persistence, workflow library, secure schema, and provider-aware release planning. Authentication UI, the trusted publishing worker, GitHub App authorization, and external provider delivery remain subsequent milestones.
