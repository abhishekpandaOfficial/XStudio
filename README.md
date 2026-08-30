# XStudio

XStudio is an open, Git-native publishing studio for technical teams and independent creators. It combines a structured Tiptap editing experience with portable MDX, reviewable Git history, and a fast Astro publishing layer.

## Product promise

Write once in a calm visual editor. Store content as portable MDX. Review it like code. Publish it as a fast, searchable developer publication.

## Included in this foundation

- GitBook-inspired product landing page with XStudio's own identity
- Three-column developer article experience: series navigation, article, table of contents
- Two-column XStudio workspace with a functional Tiptap editor island
- Astro + React + MDX foundation
- Responsive layouts and accessible navigation
- Sample long-form article structure inspired by high-quality developer tutorials

## Run locally

```bash
npm install
npm run dev
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

## Architecture direction

```text
Tiptap JSON <-> Canonical document model <-> MDX serializer <-> Git provider
                                              |
                                              +-> Astro content collections
                                              +-> GitBook adapter
                                              +-> external publishing adapters
```

The canonical document model—not Tiptap JSON and not GitBook—is the long-term source of truth. MDX remains the portable representation committed to Git. See `docs/MASTER_BUILD_PROMPT.md` for the complete implementation brief.

## Status

This is the UI foundation and vertical-slice scaffold. Authentication, persistence, collaboration, GitHub App flows, production MDX serialization, and provider publishing are deliberately staged for subsequent milestones.

