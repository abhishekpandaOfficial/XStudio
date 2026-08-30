# XStudio — Enterprise Build Master Prompt

Use this document as the authoritative build brief for coding agents and human contributors.

## Mission

Build XStudio as an enterprise-grade, AI-native publishing system for developers, architects, technical educators, engineering organizations, and independent publications. It must combine the best conceptual strengths of a structured visual editor, Git-native collaboration, portable MDX, documentation publishing, and premium long-form blogging without cloning any reference product.

The system must support this round trip:

```text
Tiptap editor <-> canonical document schema <-> MDX/Git <-> GitBook adapter
                                             <-> Astro publication
                                             <-> external channels
```

## Non-negotiable product rules

1. XStudio owns the canonical document schema. Tiptap JSON is an editor projection; MDX is a portable Git projection; GitBook is an integration target.
2. Every meaningful conversion must be deterministic, versioned, testable, and observable.
3. Never promise lossless round-tripping for an unsupported node. Preserve it as an explicit raw/unsupported block and warn the author.
4. Public content must be fast, accessible, SEO-friendly, responsive, and readable without client-side JavaScript.
5. Tenant boundaries, permissions, audit logs, approvals, and secret isolation are architectural foundations—not late enterprise add-ons.
6. Authors must own their content and be able to export clean MDX, media, redirects, and metadata.

## Target experience

### Marketing site

Create a restrained, editorial landing page inspired by the clarity and product-in-context storytelling of GitBook. Show the actual XStudio publishing interface inside the first major visual. Use bold typography, generous whitespace, confident contrast, compact enterprise proof, and alternating product narratives. Do not reuse GitBook copy, illustrations, brand colors, or proprietary assets.

Required sections:

- navigation with Product, Solutions, Developers, Pricing, Sign in, and Start writing
- hero positioning XStudio as publishing infrastructure for technical knowledge
- interactive or representative product preview
- editor and portable-content story
- Git review and collaboration workflow
- Astro/GitBook/external publishing adapters
- AI assistance with provenance and human approval
- enterprise governance and security
- proof/customer area driven by real data when available
- final CTA and complete footer

### Public publication and article reader

Support two- and three-column templates. The flagship developer article uses:

- sticky publication header with search
- left series/course navigation and progress
- central readable article column
- right sticky table of contents
- metadata, author, tags, lesson context, reading time, and update date
- syntax-highlighted code with copy controls
- callouts, diagrams, media, tables, tabs, steps, file trees, API examples, and interactive embeds
- progress tracking, next/previous lesson, reactions, comments, related reading, and newsletter CTA
- mobile drawers replacing both sidebars

Article composition should follow a strong teaching arc: problem, context, architecture, prerequisites, implementation, validation, production concerns, recap, and next action.

### XStudio workspace

Build a dense, calm application shell rather than a marketing page:

- workspace/tenant switcher
- spaces, collections, posts, docs, courses, media, templates, trash
- command palette and global search
- document tree and drag/drop ordering
- editor canvas with slash commands and block handles
- outline/settings/activity inspector
- preview, branch, review, schedule, and publish controls
- draft, review, scheduled, published, archived, and deleted states
- autosave, version history, presence, comments, suggestions, and conflict resolution
- responsive tablet view; desktop is primary for authoring

## Functional architecture

Use a modular monorepo:

```text
apps/
  web/             Astro public site and publications
  studio/          authoring workspace
  api/             application and integration API
  worker/          queues, imports, exports, webhooks, AI jobs
packages/
  document-model/  canonical schema, migrations, validation
  editor/          Tiptap extensions and React UI
  mdx/             parser, serializer, AST transforms
  git-provider/    GitHub/GitLab provider interfaces
  gitbook/         GitBook import/export adapter
  publishing/      build, preview, release, redirect contracts
  design-system/   tokens, primitives, icons
  observability/   OTel conventions and instrumentation
```

For the initial vertical slice, Astro may host React islands for the editor. Keep clean boundaries so the Studio application can later move to a dedicated application runtime without coupling the document model to the UI framework.

## Canonical content model

Define a versioned schema with stable node IDs. Required nodes include document, paragraph, heading, text marks, bullet/ordered/task lists, blockquote, code block, image, video, file, table, divider, callout, tabs, steps, cards, embed, equation, diagram, API request/response, reusable snippet, and raw MDX.

Every document includes:

- identity, tenant, space, collection, locale, and schema version
- title, subtitle, slug, excerpt, cover, canonical URL, tags, authors
- status, visibility, access policy, publish targets, schedule
- created/updated/published timestamps and actor IDs
- SEO and social metadata
- source mapping for Git path, branch, commit, and external provider IDs
- provenance for AI-created or AI-edited blocks

Implement schema migration functions and golden round-trip fixtures before expanding block coverage.

## Editor requirements

Use Tiptap with custom extensions. Provide slash commands, bubble and floating menus, keyboard shortcuts, code-language selection, syntax highlighting, paste normalization, drag/drop, nested blocks, collaborative cursors, comments, suggestions, word count, reading time, and accessible labels.

Autosave must be debounced and revision-aware. Never silently overwrite a newer server revision. Offline edits use an outbox and reconcile explicitly.

AI actions include outline, rewrite, shorten, expand, title, excerpt, SEO, alt text, code explanation, translation, fact-check hints, and publication adaptation. All AI output is proposed, diffable, attributable, reversible, and subject to approval.

## Git and MDX behavior

- Store deterministic UTF-8 MDX plus normalized frontmatter.
- Preserve stable node IDs without polluting visible output.
- Format commits and pull requests with document-aware summaries.
- Support repository, branch, directory, and asset-path configuration per space.
- Import through a parse/validate/preview/commit pipeline.
- Export through a validate/serialize/diff/commit pipeline.
- Handle webhook delivery idempotently and verify signatures.
- Detect conflicts at block level where possible; never resolve destructive conflicts silently.
- Provide GitHub first through a GitHub App. Design a provider interface for GitLab and Bitbucket.

## GitBook adapter

Treat GitBook as an external publishing and migration integration. Implement capability discovery and a mapping matrix. Supported content maps structurally; unsupported content becomes an explicit preservation block with a report. Store provider IDs and sync cursors. Prevent echo loops using origin, revision, and idempotency metadata.

Do not embed or reuse GitBook's private editor. XStudio must own its editor and integration contract.

## Public rendering

Use Astro content collections and static rendering wherever possible. Add incremental/on-demand builds only when scale requires it. Generate clean routes without hashes. Include canonical tags, JSON-LD, sitemap, RSS, Open Graph metadata, code highlighting, image optimization, accessible landmarks, and Core Web Vitals budgets.

Themes use tokens for typography, color, spacing, borders, code, and layout. Support publication-level overrides without allowing arbitrary unsafe CSS by default.

## Platform services

Recommended baseline:

- PostgreSQL for transactional metadata
- object storage for original and transformed assets
- Redis-compatible cache and job coordination
- queue-backed workers for import, export, builds, webhooks, AI, email, and media
- OpenTelemetry traces, metrics, and structured logs
- OpenSearch/Typesense/Meilisearch abstraction for public and workspace search
- OIDC/OAuth authentication with Google and GitHub; SAML/SCIM for enterprise
- Stripe-compatible billing boundary without coupling entitlements to the payment provider

Use explicit service interfaces so the deployment can run on Azure, Cloudflare-compatible edge services, or a hybrid architecture.

## Security and governance

- enforce tenant isolation at API and database layers
- use least-privilege provider installations and short-lived tokens
- encrypt secrets with a managed key service
- validate uploads, restrict MIME types, scan files, and use signed URLs
- sanitize rendered HTML and use a strict Content Security Policy
- protect against SSRF in embeds, imports, link previews, and PDF/image workers
- implement rate limits, quotas, idempotency keys, audit trails, retention, export, and deletion
- add RBAC roles: owner, admin, editor, author, reviewer, viewer
- prepare controls for SSO, SCIM, legal hold, data residency, and private publications

## Quality gates

Each milestone must pass:

- strict TypeScript and linting
- unit tests for document transforms and permission rules
- golden tests for Tiptap JSON <-> canonical schema <-> MDX
- integration tests for Git provider and webhook idempotency
- accessibility checks against WCAG 2.2 AA
- responsive checks for reader and workspace
- performance budgets for article pages
- dependency and secret scanning
- database migration and rollback review
- structured logs and traces for critical flows

## Delivery sequence

### Phase 0 — Foundation

Establish monorepo boundaries, design tokens, ADRs, CI, preview environments, observability, security baseline, and the canonical schema RFC.

### Phase 1 — Publishable vertical slice

Deliver authentication, tenant/workspace, collection tree, Tiptap editor, autosave, core blocks, MDX serialization, GitHub repository sync, Astro publication, three-column article template, preview, publish, and rollback.

### Phase 2 — Professional workflow

Add branches, comments, suggestions, approvals, scheduling, revisions, analytics, search, media library, reusable blocks, themes, domains, redirects, and course/series navigation.

### Phase 3 — Integrations and distribution

Add GitBook migration/sync, RSS/importers, Substack/Medium/Hashnode adapters where their supported APIs and policies permit, social distribution, newsletters, and webhooks.

### Phase 4 — Enterprise and AI

Add SAML, SCIM, advanced RBAC, audit exports, private publications, compliance controls, provenance-aware AI, knowledge graph, semantic search, stale-content detection, and content-quality intelligence.

## Definition of done for the first production release

A new tenant can register, create a publication, write a mixed prose/code article in Tiptap, preview it, commit deterministic MDX to an authorized GitHub repository, publish it through Astro on a clean URL, update it through a reviewable revision, roll back, search it, and inspect a complete audit trail. The reader passes accessibility and performance gates. Conversion fixtures prove that supported content survives editor-to-MDX-to-editor round trips.

When implementing, work in small reviewable milestones. Preserve existing behavior, document architectural decisions, add tests with each contract, and never substitute a visual mock for a requested working capability.
