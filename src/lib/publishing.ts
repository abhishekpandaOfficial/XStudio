import type { CanonicalDocument } from './document-model';
import { canonicalToMdx, validateDocument } from './document-model';

export type PublishTargetId = 'astro' | 'github' | 'gitbook';

export interface PublishTarget {
  id: PublishTargetId;
  name: string;
  mode: string;
  description: string;
  destination: string;
  direction: 'one-way' | 'two-way';
}

export interface PublishStep {
  label: string;
  status: 'ready' | 'blocked';
  detail: string;
}

export const publishTargets: PublishTarget[] = [
  {
    id: 'astro',
    name: 'XStudio / Astro',
    mode: 'Primary publication',
    description: 'Build the public article as fast static HTML with XStudio themes and clean routes.',
    destination: '/blog/designing-an-api-that-ages-well/',
    direction: 'one-way',
  },
  {
    id: 'github',
    name: 'GitHub MDX',
    mode: 'Publishing ledger',
    description: 'Commit deterministic MDX to a configured repository, branch, and content path.',
    destination: 'content/articles/designing-an-api-that-ages-well.mdx',
    direction: 'two-way',
  },
  {
    id: 'gitbook',
    name: 'GitBook',
    mode: 'Optional compatibility',
    description: 'Synchronize through Git while XStudio keeps ownership of the document model and renderer.',
    destination: 'Engineering handbook / API design',
    direction: 'two-way',
  },
];

export const createPublishPlan = (
  document: CanonicalDocument,
  targets: PublishTargetId[],
): PublishStep[] => {
  const errors = validateDocument(document);
  const mdx = canonicalToMdx(document);
  return [
    {
      label: 'Validate canonical document',
      status: errors.length ? 'blocked' : 'ready',
      detail: errors.length ? errors.join(' ') : `Schema v${document.schemaVersion} is valid.`,
    },
    {
      label: 'Serialize deterministic MDX',
      status: 'ready',
      detail: `${mdx.split('\n').length} lines prepared with normalized frontmatter.`,
    },
    {
      label: 'Create Git revision',
      status: targets.includes('github') || targets.includes('gitbook') ? 'ready' : 'blocked',
      detail: targets.includes('github') || targets.includes('gitbook')
        ? `Revision ${document.metadata.revision + 1} will be committed after provider authorization.`
        : 'Select GitHub or GitBook to include a Git revision.',
    },
    {
      label: 'Build Astro publication',
      status: targets.includes('astro') ? 'ready' : 'blocked',
      detail: targets.includes('astro')
        ? `Generate /blog/${document.metadata.slug}/ and invalidate its CDN path.`
        : 'Select XStudio / Astro to build the public route.',
    },
  ];
};

