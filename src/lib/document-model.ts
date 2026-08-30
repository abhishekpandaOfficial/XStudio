export const DOCUMENT_SCHEMA_VERSION = 1 as const;

export type TextMark = 'bold' | 'italic' | 'code' | 'strike';

export interface TextRun {
  text: string;
  marks?: TextMark[];
}

export type CanonicalNode =
  | { id: string; type: 'paragraph'; content: TextRun[] }
  | { id: string; type: 'heading'; level: 1 | 2 | 3; content: TextRun[] }
  | { id: string; type: 'blockquote'; content: CanonicalNode[] }
  | { id: string; type: 'code'; language: string; code: string }
  | { id: string; type: 'list'; ordered: boolean; items: CanonicalNode[][] }
  | { id: string; type: 'divider' }
  | { id: string; type: 'raw-mdx'; value: string; reason: string };

export interface DocumentMetadata {
  id: string;
  title: string;
  subtitle: string;
  slug: string;
  excerpt: string;
  locale: string;
  status: 'draft' | 'review' | 'scheduled' | 'published';
  visibility: 'public' | 'private';
  tags: string[];
  authors: string[];
  revision: number;
  updatedAt: string;
}

export interface CanonicalDocument {
  schemaVersion: typeof DOCUMENT_SCHEMA_VERSION;
  metadata: DocumentMetadata;
  content: CanonicalNode[];
}

export interface TiptapNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string }>;
  content?: TiptapNode[];
}

export interface TiptapDocument extends TiptapNode {
  type: 'doc';
  content: TiptapNode[];
}

const textRuns = (nodes: TiptapNode[] = []): TextRun[] =>
  nodes.filter((node) => node.type === 'text').map((node) => ({
    text: node.text ?? '',
    marks: node.marks?.map((mark) => mark.type).filter((mark): mark is TextMark =>
      ['bold', 'italic', 'code', 'strike'].includes(mark),
    ),
  }));

const plainText = (nodes: TiptapNode[] = []): string =>
  nodes.map((node) => node.text ?? plainText(node.content)).join('');

const stableId = (path: number[]): string => `block-${path.join('-') || 'root'}`;

const tiptapNodeToCanonical = (node: TiptapNode, path: number[]): CanonicalNode => {
  const id = stableId(path);
  switch (node.type) {
    case 'heading':
      return {
        id,
        type: 'heading',
        level: Math.min(3, Math.max(1, Number(node.attrs?.level ?? 2))) as 1 | 2 | 3,
        content: textRuns(node.content),
      };
    case 'paragraph':
      return { id, type: 'paragraph', content: textRuns(node.content) };
    case 'blockquote':
      return {
        id,
        type: 'blockquote',
        content: (node.content ?? []).map((child, index) => tiptapNodeToCanonical(child, [...path, index])),
      };
    case 'codeBlock':
      return {
        id,
        type: 'code',
        language: String(node.attrs?.language ?? 'text'),
        code: plainText(node.content),
      };
    case 'bulletList':
    case 'orderedList':
      return {
        id,
        type: 'list',
        ordered: node.type === 'orderedList',
        items: (node.content ?? []).map((item, itemIndex) =>
          (item.content ?? []).map((child, childIndex) =>
            tiptapNodeToCanonical(child, [...path, itemIndex, childIndex]),
          ),
        ),
      };
    case 'horizontalRule':
      return { id, type: 'divider' };
    default:
      return {
        id,
        type: 'raw-mdx',
        value: `<!-- Unsupported Tiptap node: ${node.type} -->`,
        reason: `The ${node.type} block is preserved but does not have a canonical mapping yet.`,
      };
  }
};

export const defaultMetadata = (): DocumentMetadata => ({
  id: 'designing-an-api-that-ages-well',
  title: 'Designing an API that ages well',
  subtitle: 'A practical field guide to contracts, change, and production-safe API evolution.',
  slug: 'designing-an-api-that-ages-well',
  excerpt: 'Build API boundaries that can evolve without surprising their consumers.',
  locale: 'en',
  status: 'draft',
  visibility: 'public',
  tags: ['architecture', 'api-design', 'dotnet'],
  authors: ['Abhishek Panda'],
  revision: 1,
  updatedAt: new Date().toISOString(),
});

export const tiptapToCanonical = (
  document: TiptapDocument,
  metadata: DocumentMetadata = defaultMetadata(),
): CanonicalDocument => ({
  schemaVersion: DOCUMENT_SCHEMA_VERSION,
  metadata: { ...metadata, updatedAt: new Date().toISOString() },
  content: (document.content ?? []).map((node, index) => tiptapNodeToCanonical(node, [index])),
});

const marksToTiptap = (marks: TextMark[] = []) => marks.map((type) => ({ type }));

const runsToTiptap = (runs: TextRun[]): TiptapNode[] => runs.map((run) => ({
  type: 'text',
  text: run.text,
  ...(run.marks?.length ? { marks: marksToTiptap(run.marks) } : {}),
}));

const canonicalNodeToTiptap = (node: CanonicalNode): TiptapNode => {
  switch (node.type) {
    case 'heading':
      return { type: 'heading', attrs: { level: node.level }, content: runsToTiptap(node.content) };
    case 'paragraph':
      return { type: 'paragraph', content: runsToTiptap(node.content) };
    case 'blockquote':
      return { type: 'blockquote', content: node.content.map(canonicalNodeToTiptap) };
    case 'code':
      return { type: 'codeBlock', attrs: { language: node.language }, content: [{ type: 'text', text: node.code }] };
    case 'list':
      return {
        type: node.ordered ? 'orderedList' : 'bulletList',
        content: node.items.map((item) => ({ type: 'listItem', content: item.map(canonicalNodeToTiptap) })),
      };
    case 'divider':
      return { type: 'horizontalRule' };
    case 'raw-mdx':
      return { type: 'paragraph', content: [{ type: 'text', text: node.value }] };
  }
};

export const canonicalToTiptap = (document: CanonicalDocument): TiptapDocument => ({
  type: 'doc',
  content: document.content.map(canonicalNodeToTiptap),
});

const escapeYaml = (value: string): string => JSON.stringify(value);

const renderRuns = (runs: TextRun[]): string => runs.map((run) => {
  let value = run.text.replace(/([\\`*_{}[\]<>])/g, '\\$1');
  for (const mark of run.marks ?? []) {
    if (mark === 'bold') value = `**${value}**`;
    if (mark === 'italic') value = `*${value}*`;
    if (mark === 'strike') value = `~~${value}~~`;
    if (mark === 'code') value = `\`${run.text.replace(/`/g, '\\`')}\``;
  }
  return value;
}).join('');

const renderNode = (node: CanonicalNode, depth = 0): string => {
  switch (node.type) {
    case 'heading': return `${'#'.repeat(node.level)} ${renderRuns(node.content)}`;
    case 'paragraph': return renderRuns(node.content);
    case 'blockquote': return node.content.map((child) => renderNode(child, depth)).join('\n\n').split('\n').map((line) => `> ${line}`).join('\n');
    case 'code': return `\`\`\`${node.language}\n${node.code}\n\`\`\``;
    case 'divider': return '---';
    case 'raw-mdx': return `${node.value}\n\n{/* ${node.reason} */}`;
    case 'list':
      return node.items.map((item, index) => {
        const prefix = node.ordered ? `${index + 1}.` : '-';
        const body = item.map((child) => renderNode(child, depth + 1)).join('\n');
        return `${'  '.repeat(depth)}${prefix} ${body}`;
      }).join('\n');
  }
};

export const canonicalToMdx = (document: CanonicalDocument): string => {
  const { metadata } = document;
  const frontmatter = [
    '---',
    `id: ${escapeYaml(metadata.id)}`,
    `title: ${escapeYaml(metadata.title)}`,
    `subtitle: ${escapeYaml(metadata.subtitle)}`,
    `slug: ${escapeYaml(metadata.slug)}`,
    `excerpt: ${escapeYaml(metadata.excerpt)}`,
    `locale: ${escapeYaml(metadata.locale)}`,
    `status: ${metadata.status}`,
    `visibility: ${metadata.visibility}`,
    `tags: [${metadata.tags.map(escapeYaml).join(', ')}]`,
    `authors: [${metadata.authors.map(escapeYaml).join(', ')}]`,
    `schemaVersion: ${document.schemaVersion}`,
    `revision: ${metadata.revision}`,
    '---',
  ];
  return `${frontmatter.join('\n')}\n\n${document.content.map((node) => renderNode(node)).join('\n\n').trim()}\n`;
};

const stripInlineMarkdown = (value: string): TextRun[] => [{ text: value.replace(/[*_~`]/g, '') }];

export const mdxToCanonical = (
  mdx: string,
  previousMetadata: DocumentMetadata = defaultMetadata(),
): CanonicalDocument => {
  const body = mdx.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  const lines = body.split('\n');
  const nodes: CanonicalNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      nodes.push({ id: stableId([nodes.length]), type: 'heading', level: heading[1].length as 1 | 2 | 3, content: stripInlineMarkdown(heading[2]) });
      index += 1; continue;
    }
    const fence = /^```([\w-]*)$/.exec(line);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && lines[index] !== '```') { code.push(lines[index]); index += 1; }
      nodes.push({ id: stableId([nodes.length]), type: 'code', language: fence[1] || 'text', code: code.join('\n') });
      index += 1; continue;
    }
    if (line === '---') {
      nodes.push({ id: stableId([nodes.length]), type: 'divider' }); index += 1; continue;
    }
    if (line.startsWith('> ')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].startsWith('> ')) { quote.push(lines[index].slice(2)); index += 1; }
      nodes.push({ id: stableId([nodes.length]), type: 'blockquote', content: [{ id: stableId([nodes.length, 0]), type: 'paragraph', content: stripInlineMarkdown(quote.join(' ')) }] });
      continue;
    }
    const listMatch = /^(\d+\.|-)\s+(.+)$/.exec(line);
    if (listMatch) {
      const ordered = listMatch[1] !== '-';
      const items: CanonicalNode[][] = [];
      while (index < lines.length) {
        const item = /^(\d+\.|-)\s+(.+)$/.exec(lines[index]);
        if (!item || (item[1] !== '-') !== ordered) break;
        items.push([{ id: stableId([nodes.length, items.length, 0]), type: 'paragraph', content: stripInlineMarkdown(item[2]) }]);
        index += 1;
      }
      nodes.push({ id: stableId([nodes.length]), type: 'list', ordered, items });
      continue;
    }
    if (/^<[^>]+>/.test(line) || line.startsWith('{')) {
      nodes.push({ id: stableId([nodes.length]), type: 'raw-mdx', value: line, reason: 'Custom MDX is preserved verbatim for the Astro renderer.' });
      index += 1; continue;
    }
    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s|^```|^>|^(\d+\.|-)\s/.test(lines[index])) {
      paragraph.push(lines[index]); index += 1;
    }
    nodes.push({ id: stableId([nodes.length]), type: 'paragraph', content: stripInlineMarkdown(paragraph.join(' ')) });
  }

  const title = nodes.find((node) => node.type === 'heading' && node.level === 1);
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    metadata: {
      ...previousMetadata,
      title: title && title.type === 'heading' ? title.content.map((run) => run.text).join('') : previousMetadata.title,
      updatedAt: new Date().toISOString(),
    },
    content: nodes,
  };
};

export const validateDocument = (document: CanonicalDocument): string[] => {
  const errors: string[] = [];
  if (!document.metadata.title.trim()) errors.push('A title is required.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(document.metadata.slug)) errors.push('The slug must be SEO-safe lowercase text.');
  if (!document.content.length) errors.push('The document cannot be empty.');
  if (document.content.some((node) => node.type === 'raw-mdx')) errors.push('Review preserved raw MDX blocks before publishing.');
  return errors;
};

