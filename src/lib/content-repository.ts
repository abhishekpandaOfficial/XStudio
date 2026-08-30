import type { CanonicalDocument } from './document-model';
import { getSupabase } from './supabase';

export type WorkflowStatus = 'draft' | 'review' | 'scheduled' | 'published' | 'archived' | 'trash';
export type DisplayMode = 'cards' | 'list';
export type SortMode = 'updated' | 'newest' | 'popular' | 'most_viewed';
export type DateRange = 'all' | '7d' | '30d' | '90d';

export interface ContentTag { name: string; slug: string; color: string }

export interface ContentItem {
  id: string;
  title: string;
  excerpt: string;
  kind: 'article' | 'post' | 'page';
  status: WorkflowStatus;
  series: string | null;
  seriesSlug: string | null;
  tags: ContentTag[];
  updatedAt: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  viewCount: number;
  popularityScore: number;
  coverUrl: string | null;
}

export interface ContentFilters {
  status: WorkflowStatus | 'all';
  series: string;
  tag: string;
  dateRange: DateRange;
  sort: SortMode;
  search: string;
}

const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString();

const mapRow = (row: any): ContentItem => ({
  id: row.id,
  title: row.title,
  excerpt: row.excerpt ?? '',
  kind: row.kind,
  status: row.status,
  series: row.series?.title ?? null,
  seriesSlug: row.series?.slug ?? null,
  tags: (row.document_tags ?? []).map((entry: any) => entry.tag).filter(Boolean),
  updatedAt: row.updated_at,
  publishedAt: row.published_at,
  scheduledAt: row.scheduled_at,
  viewCount: Number(row.view_count ?? 0),
  popularityScore: Number(row.popularity_score ?? 0),
  coverUrl: row.cover_url,
});

export const loadContent = async (filters: ContentFilters): Promise<ContentItem[] | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: membership, error: membershipError } = await supabase
    .from('xstudio_memberships')
    .select('workspace_id')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) return null;

  const { data: publications, error: publicationError } = await supabase
    .from('xstudio_publications')
    .select('id')
    .eq('workspace_id', membership.workspace_id);
  if (publicationError || !publications?.length) return [];

  let seriesId: string | null = null;
  if (filters.series) {
    const { data: matchedSeries } = await supabase
      .from('xstudio_series')
      .select('id')
      .in('publication_id', publications.map((publication) => publication.id))
      .eq('slug', filters.series)
      .maybeSingle();
    if (!matchedSeries) return [];
    seriesId = matchedSeries.id;
  }

  let taggedDocumentIds: string[] | null = null;
  if (filters.tag) {
    const { data: matchedTag } = await supabase
      .from('xstudio_tags')
      .select('id')
      .eq('workspace_id', membership.workspace_id)
      .eq('slug', filters.tag)
      .maybeSingle();
    if (!matchedTag) return [];
    const { data: links } = await supabase.from('xstudio_document_tags').select('document_id').eq('tag_id', matchedTag.id);
    taggedDocumentIds = (links ?? []).map((link) => link.document_id);
    if (!taggedDocumentIds.length) return [];
  }

  let query = supabase
    .from('xstudio_documents')
    .select('id,title,excerpt,kind,status,updated_at,published_at,scheduled_at,view_count,popularity_score,cover_url,series:xstudio_series(title,slug),document_tags:xstudio_document_tags(tag:xstudio_tags(name,slug,color))')
    .in('publication_id', publications.map((publication) => publication.id));

  if (filters.status !== 'all') query = query.eq('status', filters.status);
  if (seriesId) query = query.eq('series_id', seriesId);
  if (taggedDocumentIds) query = query.in('id', taggedDocumentIds);
  if (filters.search.trim()) query = query.ilike('title', `%${filters.search.trim()}%`);
  if (filters.dateRange !== 'all') query = query.gte('updated_at', daysAgo(Number(filters.dateRange.slice(0, -1))));

  const order = filters.sort === 'popular'
    ? ['popularity_score', false]
    : filters.sort === 'most_viewed'
      ? ['view_count', false]
      : filters.sort === 'newest'
        ? ['published_at', false]
        : ['updated_at', false];
  query = query.order(order[0] as string, { ascending: order[1] as boolean, nullsFirst: false }).limit(100);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapRow);
};

const findPublication = async (): Promise<{ publicationId: string; userId: string } | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data: membership } = await supabase.from('xstudio_memberships').select('workspace_id').eq('user_id', userData.user.id).limit(1).maybeSingle();
  if (!membership) return null;
  const { data: publication } = await supabase.from('xstudio_publications').select('id').eq('workspace_id', membership.workspace_id).limit(1).maybeSingle();
  return publication ? { publicationId: publication.id, userId: userData.user.id } : null;
};

export type DraftSyncResult = 'remote' | 'local' | 'needs-auth' | 'needs-workspace';

export const saveDraft = async (document: CanonicalDocument, mdx: string): Promise<DraftSyncResult> => {
  const supabase = getSupabase();
  if (!supabase) return 'local';
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return 'needs-auth';
  const destination = await findPublication();
  if (!destination) return 'needs-workspace';

  const storageKey = `xstudio:remote-document:${document.metadata.id}`;
  const existingId = localStorage.getItem(storageKey);
  const payload = {
    publication_id: destination.publicationId,
    author_id: destination.userId,
    title: document.metadata.title,
    subtitle: document.metadata.subtitle,
    slug: document.metadata.slug,
    excerpt: document.metadata.excerpt,
    status: document.metadata.status,
    visibility: document.metadata.visibility,
    canonical_json: document,
    mdx,
    schema_version: document.schemaVersion,
    current_revision: document.metadata.revision,
  };

  if (existingId) {
    const { error } = await supabase.from('xstudio_documents').update(payload).eq('id', existingId);
    if (error) throw error;
    return 'remote';
  }

  const { data: existing } = await supabase
    .from('xstudio_documents')
    .select('id')
    .eq('publication_id', destination.publicationId)
    .eq('slug', document.metadata.slug)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase.from('xstudio_documents').update(payload).eq('id', existing.id);
    if (error) throw error;
    localStorage.setItem(storageKey, existing.id);
    return 'remote';
  }

  const { data, error } = await supabase.from('xstudio_documents').insert(payload).select('id').single();
  if (error) throw error;
  localStorage.setItem(storageKey, data.id);
  return 'remote';
};
