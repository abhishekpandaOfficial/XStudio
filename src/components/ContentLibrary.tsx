import { useEffect, useMemo, useState } from 'react';
import {
  loadContent,
  type ContentFilters,
  type ContentItem,
  type DateRange,
  type DisplayMode,
  type SortMode,
  type WorkflowStatus,
} from '../lib/content-repository';
import { demoContent } from '../lib/demo-content';
import { isSupabaseConfigured } from '../lib/supabase';

const workflowTabs: Array<{ id: WorkflowStatus | 'all'; label: string }> = [
  { id: 'all', label: 'All content' },
  { id: 'draft', label: 'Drafts' },
  { id: 'review', label: 'In review' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'published', label: 'Published' },
  { id: 'trash', label: 'Trash' },
];

const defaultFilters: ContentFilters = {
  status: 'all', series: '', tag: '', dateRange: 'all', sort: 'updated', search: '',
};

const relativeDate = (iso: string): string => {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
};

const formatCount = (value: number): string => value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k` : String(value);

const applyDemoFilters = (items: ContentItem[], filters: ContentFilters): ContentItem[] => {
  const earliest = filters.dateRange === 'all' ? 0 : Date.now() - Number(filters.dateRange.slice(0, -1)) * 86_400_000;
  return items
    .filter((item) => filters.status === 'all' || item.status === filters.status)
    .filter((item) => !filters.series || item.seriesSlug === filters.series)
    .filter((item) => !filters.tag || item.tags.some((tag) => tag.slug === filters.tag))
    .filter((item) => !filters.search || `${item.title} ${item.excerpt}`.toLowerCase().includes(filters.search.toLowerCase()))
    .filter((item) => !earliest || new Date(item.updatedAt).getTime() >= earliest)
    .sort((a, b) => {
      if (filters.sort === 'most_viewed') return b.viewCount - a.viewCount;
      if (filters.sort === 'popular') return b.popularityScore - a.popularityScore;
      if (filters.sort === 'newest') return new Date(b.publishedAt ?? b.updatedAt).getTime() - new Date(a.publishedAt ?? a.updatedAt).getTime();
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
};

const Status = ({ value }: { value: WorkflowStatus }) => <span className={`content-status ${value}`}><i />{value === 'review' ? 'In review' : value}</span>;

export default function ContentLibrary() {
  const [filters, setFilters] = useState<ContentFilters>(defaultFilters);
  const [display, setDisplay] = useState<DisplayMode>('cards');
  const [remoteItems, setRemoteItems] = useState<ContentItem[] | null>(null);
  const [facetItems, setFacetItems] = useState<ContentItem[] | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured());
  const [notice, setNotice] = useState(isSupabaseConfigured() ? 'Connecting to your workspace…' : 'Demo data · add Supabase environment variables to connect');

  useEffect(() => {
    let active = true;
    setLoading(isSupabaseConfigured());
    loadContent(filters)
      .then((items) => {
        if (!active) return;
        setRemoteItems(items);
        if (items && facetItems === null && filters.status === 'all' && !filters.series && !filters.tag && filters.dateRange === 'all' && !filters.search) setFacetItems(items);
        setNotice(items === null ? 'Sign in or create an XStudio workspace to sync content' : 'Live workspace · protected by row-level security');
      })
      .catch(() => {
        if (!active) return;
        setRemoteItems(null);
        setNotice('Supabase is configured, but the XStudio migration or session is not ready');
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [filters, facetItems]);

  const items = useMemo(
    () => remoteItems ?? applyDemoFilters(demoContent, filters),
    [remoteItems, filters],
  );
  const sourceForFacets = facetItems ?? demoContent;
  const series = useMemo(() => Array.from(new Map(sourceForFacets.filter((item) => item.seriesSlug).map((item) => [item.seriesSlug!, item.series!])).entries()), [sourceForFacets]);
  const tags = useMemo(() => Array.from(new Map(sourceForFacets.flatMap((item) => item.tags).map((tag) => [tag.slug, tag.name])).entries()), [sourceForFacets]);
  const countFor = (status: WorkflowStatus | 'all') => sourceForFacets.filter((item) => status === 'all' || item.status === status).length;
  const setFilter = <K extends keyof ContentFilters>(key: K, value: ContentFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <section className="content-library">
      <header className="library-heading">
        <div><span className="kicker">EDITORIAL WORKSPACE</span><h1>Content</h1><p>Draft, review, schedule, publish, and learn from every piece in one calm workspace.</p></div>
        <div className="library-actions"><button className="import-action">Import</button><a className="new-document" href="/studio/">＋ New document</a></div>
      </header>

      <div className="workspace-notice"><i className={loading ? 'loading' : remoteItems ? 'live' : ''} /><span>{notice}</span><a href="/studio/">Open editor →</a></div>

      <nav className="workflow-tabs" aria-label="Content workflow">
        {workflowTabs.map((tab) => <button key={tab.id} className={filters.status === tab.id ? 'active' : ''} onClick={() => setFilter('status', tab.id)}>{tab.label}<span>{countFor(tab.id)}</span></button>)}
      </nav>

      <div className="library-commandbar">
        <label className="content-search"><span>⌕</span><input value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder="Search titles and descriptions" /></label>
        <select aria-label="Filter by series" value={filters.series} onChange={(event) => setFilter('series', event.target.value)}><option value="">All series</option>{series.map(([slug, name]) => <option value={slug} key={slug}>{name}</option>)}</select>
        <select aria-label="Filter by tag" value={filters.tag} onChange={(event) => setFilter('tag', event.target.value)}><option value="">All tags</option>{tags.map(([slug, name]) => <option value={slug} key={slug}>{name}</option>)}</select>
        <select aria-label="Filter by date" value={filters.dateRange} onChange={(event) => setFilter('dateRange', event.target.value as DateRange)}><option value="all">Any date</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select>
        <select aria-label="Sort content" value={filters.sort} onChange={(event) => setFilter('sort', event.target.value as SortMode)}><option value="updated">Recently updated</option><option value="newest">Newest published</option><option value="popular">Popular now</option><option value="most_viewed">Most viewed</option></select>
        <div className="display-toggle"><button className={display === 'cards' ? 'active' : ''} onClick={() => setDisplay('cards')} aria-label="Card view">▦</button><button className={display === 'list' ? 'active' : ''} onClick={() => setDisplay('list')} aria-label="List view">☷</button></div>
      </div>

      <div className="result-summary"><span>{items.length} {items.length === 1 ? 'piece' : 'pieces'}</span><button onClick={() => setFilters(defaultFilters)}>Reset filters</button></div>

      {items.length === 0 ? <div className="library-empty"><span>◇</span><h2>No content matches this view.</h2><p>Reset the filters or start a new draft.</p><button onClick={() => setFilters(defaultFilters)}>Show all content</button></div> :
        <div className={`content-results ${display}`}>{items.map((item) => <article className="content-item" key={item.id}>
          <div className="content-cover"><span>{item.kind === 'post' ? 'POST' : item.series?.slice(0, 2).toUpperCase() ?? 'XS'}</span><i /></div>
          <div className="content-copy">
            <div className="content-item-top"><Status value={item.status} /><span>{item.kind}</span>{item.series && <span className="series-chip">▤ {item.series}</span>}</div>
            <h2><a href="/studio/">{item.title}</a></h2><p>{item.excerpt}</p>
            <div className="content-tags">{item.tags.map((tag) => <span style={{ '--tag-color': tag.color } as React.CSSProperties} key={tag.slug}>#{tag.name}</span>)}</div>
          </div>
          <div className="content-metrics">
            {item.status === 'published' ? <><span><b>{formatCount(item.viewCount)}</b> views</span><span><b>{Math.round(item.popularityScore)}</b> score</span></> : item.status === 'scheduled' ? <span><b>{new Date(item.scheduledAt!).toLocaleDateString([], { month:'short', day:'numeric' })}</b> scheduled</span> : <span><b>{relativeDate(item.updatedAt)}</b> edited</span>}
          </div>
          <button className="content-menu" aria-label={`Actions for ${item.title}`}>•••</button>
        </article>)}</div>}
    </section>
  );
}
