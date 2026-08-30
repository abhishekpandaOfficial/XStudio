-- XStudio Phase 1: multi-tenant editorial workflow and discovery catalog.
-- Published MDX remains source-controlled in Git; Postgres owns drafts, workflow,
-- revision metadata, presentation preferences, publish jobs, and analytics.

create extension if not exists pgcrypto;

create table public.xstudio_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create table public.xstudio_memberships (
  workspace_id uuid not null references public.xstudio_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'author', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.xstudio_publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.xstudio_workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null default '',
  is_public boolean not null default false,
  default_view text not null default 'cards' check (default_view in ('cards', 'list')),
  default_sort text not null default 'newest' check (default_sort in ('newest', 'updated', 'popular', 'most_viewed')),
  theme jsonb not null default '{"accent":"#7757ff","density":"comfortable","showCovers":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table public.xstudio_series (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.xstudio_publications(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null default '',
  cover_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (publication_id, slug)
);

create table public.xstudio_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.xstudio_workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 48),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  color text not null default '#7757ff' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table public.xstudio_documents (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.xstudio_publications(id) on delete cascade,
  series_id uuid references public.xstudio_series(id) on delete set null,
  author_id uuid not null references auth.users(id) on delete restrict,
  kind text not null default 'article' check (kind in ('article', 'post', 'page')),
  title text not null check (char_length(title) between 1 and 240),
  subtitle text not null default '',
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  excerpt text not null default '',
  cover_url text,
  status text not null default 'draft' check (status in ('draft', 'review', 'scheduled', 'published', 'archived', 'trash')),
  visibility text not null default 'public' check (visibility in ('public', 'unlisted', 'private')),
  canonical_json jsonb not null default '{"schemaVersion":1,"metadata":{},"content":[]}'::jsonb,
  mdx text not null default '',
  schema_version integer not null default 1 check (schema_version > 0),
  current_revision integer not null default 1 check (current_revision > 0),
  scheduled_at timestamptz,
  published_at timestamptz,
  git_commit_sha text,
  view_count bigint not null default 0 check (view_count >= 0),
  popularity_score numeric(12,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (publication_id, slug),
  check ((status = 'scheduled' and scheduled_at is not null) or status <> 'scheduled'),
  check ((status = 'published' and published_at is not null) or status <> 'published'),
  check ((status = 'trash' and deleted_at is not null) or status <> 'trash')
);

create table public.xstudio_document_tags (
  document_id uuid not null references public.xstudio_documents(id) on delete cascade,
  tag_id uuid not null references public.xstudio_tags(id) on delete cascade,
  primary key (document_id, tag_id)
);

create table public.xstudio_revisions (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.xstudio_documents(id) on delete cascade,
  revision integer not null check (revision > 0),
  actor_id uuid not null references auth.users(id) on delete restrict,
  source text not null default 'xstudio' check (source in ('xstudio', 'github', 'gitbook', 'vscode', 'import')),
  canonical_json jsonb not null,
  mdx text not null,
  git_commit_sha text,
  created_at timestamptz not null default now(),
  unique (document_id, revision)
);

create table public.xstudio_metrics_daily (
  document_id uuid not null references public.xstudio_documents(id) on delete cascade,
  metric_date date not null,
  views bigint not null default 0 check (views >= 0),
  unique_visitors bigint not null default 0 check (unique_visitors >= 0),
  read_seconds bigint not null default 0 check (read_seconds >= 0),
  reactions bigint not null default 0 check (reactions >= 0),
  primary key (document_id, metric_date)
);

create table public.xstudio_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.xstudio_documents(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  target text not null check (target in ('astro', 'github', 'gitbook', 'substack', 'medium', 'hashnode')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique (target, idempotency_key)
);

create table public.xstudio_saved_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.xstudio_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  filters jsonb not null default '{}'::jsonb,
  display_mode text not null default 'cards' check (display_mode in ('cards', 'list')),
  sort_mode text not null default 'updated' check (sort_mode in ('newest', 'updated', 'popular', 'most_viewed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, name)
);

create index xstudio_memberships_user_idx on public.xstudio_memberships (user_id, workspace_id);
create index xstudio_publications_workspace_idx on public.xstudio_publications (workspace_id, updated_at desc);
create index xstudio_series_publication_idx on public.xstudio_series (publication_id, sort_order, title);
create index xstudio_tags_workspace_idx on public.xstudio_tags (workspace_id, name);
create index xstudio_documents_series_idx on public.xstudio_documents (series_id, updated_at desc);
create index xstudio_documents_author_idx on public.xstudio_documents (author_id, updated_at desc);
create index xstudio_documents_workflow_idx on public.xstudio_documents (publication_id, status, updated_at desc);
create index xstudio_documents_public_newest_idx on public.xstudio_documents (publication_id, published_at desc, id)
  where status = 'published' and visibility = 'public';
create index xstudio_documents_public_popular_idx on public.xstudio_documents (publication_id, popularity_score desc, published_at desc, id)
  where status = 'published' and visibility = 'public';
create index xstudio_documents_public_views_idx on public.xstudio_documents (publication_id, view_count desc, published_at desc, id)
  where status = 'published' and visibility = 'public';
create index xstudio_document_tags_tag_idx on public.xstudio_document_tags (tag_id, document_id);
create index xstudio_revisions_document_idx on public.xstudio_revisions (document_id, revision desc);
create index xstudio_metrics_date_idx on public.xstudio_metrics_daily (metric_date desc, document_id);
create index xstudio_publish_jobs_document_idx on public.xstudio_publish_jobs (document_id, created_at desc);
create index xstudio_publish_jobs_queue_idx on public.xstudio_publish_jobs (created_at, id) where status = 'queued';
create index xstudio_saved_views_user_idx on public.xstudio_saved_views (user_id, updated_at desc);

create or replace function public.xstudio_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger xstudio_workspaces_touch before update on public.xstudio_workspaces
for each row execute function public.xstudio_touch_updated_at();
create trigger xstudio_publications_touch before update on public.xstudio_publications
for each row execute function public.xstudio_touch_updated_at();
create trigger xstudio_series_touch before update on public.xstudio_series
for each row execute function public.xstudio_touch_updated_at();
create trigger xstudio_documents_touch before update on public.xstudio_documents
for each row execute function public.xstudio_touch_updated_at();
create trigger xstudio_saved_views_touch before update on public.xstudio_saved_views
for each row execute function public.xstudio_touch_updated_at();

create or replace function public.xstudio_has_role(p_workspace_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.xstudio_memberships m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

revoke all on function public.xstudio_has_role(uuid, text[]) from public;
grant execute on function public.xstudio_has_role(uuid, text[]) to anon, authenticated;

create or replace function public.xstudio_create_workspace(p_name text, p_slug text)
returns table (workspace_id uuid, publication_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_publication_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid slug'; end if;

  insert into public.xstudio_workspaces (owner_id, name, slug)
  values ((select auth.uid()), p_name, p_slug)
  returning id into v_workspace_id;

  insert into public.xstudio_memberships (workspace_id, user_id, role)
  values (v_workspace_id, (select auth.uid()), 'owner');

  insert into public.xstudio_publications (workspace_id, name, slug)
  values (v_workspace_id, p_name, p_slug)
  returning id into v_publication_id;

  return query select v_workspace_id, v_publication_id;
end;
$$;

revoke all on function public.xstudio_create_workspace(text, text) from public;
grant execute on function public.xstudio_create_workspace(text, text) to authenticated;
revoke all on function public.xstudio_touch_updated_at() from public;

alter table public.xstudio_workspaces enable row level security;
alter table public.xstudio_memberships enable row level security;
alter table public.xstudio_publications enable row level security;
alter table public.xstudio_series enable row level security;
alter table public.xstudio_tags enable row level security;
alter table public.xstudio_documents enable row level security;
alter table public.xstudio_document_tags enable row level security;
alter table public.xstudio_revisions enable row level security;
alter table public.xstudio_metrics_daily enable row level security;
alter table public.xstudio_publish_jobs enable row level security;
alter table public.xstudio_saved_views enable row level security;

create policy "workspace members can read workspaces" on public.xstudio_workspaces
for select to authenticated using (public.xstudio_has_role(id, array['owner','editor','author','viewer']));
create policy "users can create workspaces" on public.xstudio_workspaces
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owners can update workspaces" on public.xstudio_workspaces
for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owners can delete workspaces" on public.xstudio_workspaces
for delete to authenticated using (owner_id = (select auth.uid()));

create policy "members can read memberships" on public.xstudio_memberships
for select to authenticated using (user_id = (select auth.uid()) or public.xstudio_has_role(workspace_id, array['owner']));
create policy "owners can add memberships" on public.xstudio_memberships
for insert to authenticated with check (
  public.xstudio_has_role(workspace_id, array['owner'])
  or (user_id = (select auth.uid()) and role = 'owner' and exists (
    select 1 from public.xstudio_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())
  ))
);
create policy "owners can update memberships" on public.xstudio_memberships
for update to authenticated using (public.xstudio_has_role(workspace_id, array['owner']))
with check (public.xstudio_has_role(workspace_id, array['owner']));
create policy "owners can remove memberships" on public.xstudio_memberships
for delete to authenticated using (public.xstudio_has_role(workspace_id, array['owner']));

create policy "public or members can read publications" on public.xstudio_publications
for select to anon, authenticated using (is_public or public.xstudio_has_role(workspace_id, array['owner','editor','author','viewer']));
create policy "editors can create publications" on public.xstudio_publications
for insert to authenticated with check (public.xstudio_has_role(workspace_id, array['owner','editor']));
create policy "editors can update publications" on public.xstudio_publications
for update to authenticated using (public.xstudio_has_role(workspace_id, array['owner','editor']))
with check (public.xstudio_has_role(workspace_id, array['owner','editor']));
create policy "owners can delete publications" on public.xstudio_publications
for delete to authenticated using (public.xstudio_has_role(workspace_id, array['owner']));

create policy "public or members can read series" on public.xstudio_series
for select to anon, authenticated using (exists (
  select 1 from public.xstudio_publications p where p.id = publication_id
    and (p.is_public or public.xstudio_has_role(p.workspace_id, array['owner','editor','author','viewer']))
));
create policy "editors can manage series" on public.xstudio_series
for all to authenticated using (exists (
  select 1 from public.xstudio_publications p where p.id = publication_id
    and public.xstudio_has_role(p.workspace_id, array['owner','editor'])
)) with check (exists (
  select 1 from public.xstudio_publications p where p.id = publication_id
    and public.xstudio_has_role(p.workspace_id, array['owner','editor'])
));

create policy "members or public documents expose tags" on public.xstudio_tags
for select to anon, authenticated using (
  public.xstudio_has_role(workspace_id, array['owner','editor','author','viewer'])
  or exists (
    select 1 from public.xstudio_document_tags dt
    join public.xstudio_documents d on d.id = dt.document_id
    join public.xstudio_publications p on p.id = d.publication_id
    where dt.tag_id = id and p.is_public and d.status = 'published' and d.visibility = 'public'
  )
);
create policy "authors can manage tags" on public.xstudio_tags
for all to authenticated using (public.xstudio_has_role(workspace_id, array['owner','editor','author']))
with check (public.xstudio_has_role(workspace_id, array['owner','editor','author']));

create policy "published documents are public and members see workflow" on public.xstudio_documents
for select to anon, authenticated using (
  (status = 'published' and visibility = 'public' and exists (
    select 1 from public.xstudio_publications p where p.id = publication_id and p.is_public
  ))
  or exists (
    select 1 from public.xstudio_publications p where p.id = publication_id
      and public.xstudio_has_role(p.workspace_id, array['owner','editor','author','viewer'])
  )
);
create policy "authors can create documents" on public.xstudio_documents
for insert to authenticated with check (author_id = (select auth.uid()) and exists (
  select 1 from public.xstudio_publications p where p.id = publication_id
    and public.xstudio_has_role(p.workspace_id, array['owner','editor','author'])
));
create policy "authors can update documents" on public.xstudio_documents
for update to authenticated using (exists (
  select 1 from public.xstudio_publications p where p.id = publication_id
    and (public.xstudio_has_role(p.workspace_id, array['owner','editor'])
      or (author_id = (select auth.uid()) and public.xstudio_has_role(p.workspace_id, array['author'])))
)) with check (exists (
  select 1 from public.xstudio_publications p where p.id = publication_id
    and (public.xstudio_has_role(p.workspace_id, array['owner','editor'])
      or (author_id = (select auth.uid()) and public.xstudio_has_role(p.workspace_id, array['author'])))
));
create policy "editors can delete documents" on public.xstudio_documents
for delete to authenticated using (exists (
  select 1 from public.xstudio_publications p where p.id = publication_id
    and public.xstudio_has_role(p.workspace_id, array['owner','editor'])
));

create policy "document tag visibility follows document" on public.xstudio_document_tags
for select to anon, authenticated using (exists (
  select 1 from public.xstudio_documents d where d.id = document_id
));
create policy "authors can manage document tags" on public.xstudio_document_tags
for all to authenticated using (exists (
  select 1 from public.xstudio_documents d
  join public.xstudio_publications p on p.id = d.publication_id
  where d.id = document_id and public.xstudio_has_role(p.workspace_id, array['owner','editor','author'])
)) with check (exists (
  select 1 from public.xstudio_documents d
  join public.xstudio_publications p on p.id = d.publication_id
  where d.id = document_id and public.xstudio_has_role(p.workspace_id, array['owner','editor','author'])
));

create policy "members can read revisions" on public.xstudio_revisions
for select to authenticated using (exists (
  select 1 from public.xstudio_documents d
  join public.xstudio_publications p on p.id = d.publication_id
  where d.id = document_id and public.xstudio_has_role(p.workspace_id, array['owner','editor','author','viewer'])
));
create policy "authors can create revisions" on public.xstudio_revisions
for insert to authenticated with check (actor_id = (select auth.uid()) and exists (
  select 1 from public.xstudio_documents d
  join public.xstudio_publications p on p.id = d.publication_id
  where d.id = document_id and public.xstudio_has_role(p.workspace_id, array['owner','editor','author'])
));

create policy "members can read metrics" on public.xstudio_metrics_daily
for select to authenticated using (exists (
  select 1 from public.xstudio_documents d
  join public.xstudio_publications p on p.id = d.publication_id
  where d.id = document_id and public.xstudio_has_role(p.workspace_id, array['owner','editor','author','viewer'])
));

create policy "members can read publish jobs" on public.xstudio_publish_jobs
for select to authenticated using (exists (
  select 1 from public.xstudio_documents d
  join public.xstudio_publications p on p.id = d.publication_id
  where d.id = document_id and public.xstudio_has_role(p.workspace_id, array['owner','editor','author','viewer'])
));
create policy "authors can enqueue publish jobs" on public.xstudio_publish_jobs
for insert to authenticated with check (requested_by = (select auth.uid()) and exists (
  select 1 from public.xstudio_documents d
  join public.xstudio_publications p on p.id = d.publication_id
  where d.id = document_id and public.xstudio_has_role(p.workspace_id, array['owner','editor','author'])
));

create policy "users manage their saved views" on public.xstudio_saved_views
for all to authenticated using (user_id = (select auth.uid()) and public.xstudio_has_role(workspace_id, array['owner','editor','author','viewer']))
with check (user_id = (select auth.uid()) and public.xstudio_has_role(workspace_id, array['owner','editor','author','viewer']));

revoke all on public.xstudio_workspaces, public.xstudio_memberships,
  public.xstudio_publications, public.xstudio_series, public.xstudio_tags,
  public.xstudio_documents, public.xstudio_document_tags, public.xstudio_revisions,
  public.xstudio_metrics_daily, public.xstudio_publish_jobs, public.xstudio_saved_views
  from anon, authenticated;
grant select on public.xstudio_publications, public.xstudio_series, public.xstudio_tags,
  public.xstudio_documents, public.xstudio_document_tags to anon;
grant select, insert, update, delete on public.xstudio_workspaces, public.xstudio_memberships,
  public.xstudio_publications, public.xstudio_series, public.xstudio_tags,
  public.xstudio_document_tags, public.xstudio_saved_views to authenticated;
grant select, insert, delete on public.xstudio_documents to authenticated;
grant update (publication_id, series_id, kind, title, subtitle, slug, excerpt, cover_url,
  status, visibility, canonical_json, mdx, schema_version, current_revision,
  scheduled_at, published_at, git_commit_sha, deleted_at) on public.xstudio_documents to authenticated;
grant select, insert on public.xstudio_revisions, public.xstudio_publish_jobs to authenticated;
grant select on public.xstudio_metrics_daily to authenticated;
grant usage, select on sequence public.xstudio_revisions_id_seq to authenticated;

create or replace view public.xstudio_published_catalog
with (security_invoker = true)
as
select
  d.id,
  d.publication_id,
  d.series_id,
  s.title as series_title,
  s.slug as series_slug,
  d.author_id,
  d.kind,
  d.title,
  d.subtitle,
  d.slug,
  d.excerpt,
  d.cover_url,
  d.published_at,
  d.updated_at,
  d.view_count,
  d.popularity_score,
  coalesce((
    select jsonb_agg(jsonb_build_object('name', t.name, 'slug', t.slug, 'color', t.color) order by t.name)
    from public.xstudio_document_tags dt
    join public.xstudio_tags t on t.id = dt.tag_id
    where dt.document_id = d.id
  ), '[]'::jsonb) as tags
from public.xstudio_documents d
left join public.xstudio_series s on s.id = d.series_id
where d.status = 'published' and d.visibility = 'public';

grant select on public.xstudio_published_catalog to anon, authenticated;

comment on table public.xstudio_documents is 'Canonical XStudio draft/workflow state. Git remains the source of published MDX history.';
comment on table public.xstudio_metrics_daily is 'Server-written daily aggregates; browser roles are read-only to prevent view-count manipulation.';
comment on table public.xstudio_publish_jobs is 'User-enqueued publishing requests. A trusted worker owns status transitions and external delivery.';
