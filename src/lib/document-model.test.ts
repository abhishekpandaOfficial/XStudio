import { describe, expect, it } from 'vitest';
import {
  canonicalToMdx,
  canonicalToTiptap,
  defaultMetadata,
  mdxToCanonical,
  tiptapToCanonical,
  validateDocument,
  type TiptapDocument,
} from './document-model';

const fixture: TiptapDocument = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Portable knowledge' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Write once and render anywhere.', marks: [{ type: 'bold' }] }] },
    { type: 'codeBlock', attrs: { language: 'typescript' }, content: [{ type: 'text', text: 'const portable = true;' }] },
  ],
};

describe('canonical document pipeline', () => {
  it('serializes deterministic MDX with normalized frontmatter', () => {
    const canonical = tiptapToCanonical(fixture, { ...defaultMetadata(), title: 'Portable knowledge', slug: 'portable-knowledge' });
    const first = canonicalToMdx(canonical);
    const second = canonicalToMdx(canonical);
    expect(first).toBe(second);
    expect(first).toContain('title: "Portable knowledge"');
    expect(first).toContain('```typescript');
  });

  it('round-trips supported blocks through MDX', () => {
    const canonical = tiptapToCanonical(fixture, { ...defaultMetadata(), title: 'Portable knowledge', slug: 'portable-knowledge' });
    const imported = mdxToCanonical(canonicalToMdx(canonical), canonical.metadata);
    const tiptap = canonicalToTiptap(imported);
    expect(tiptap.content.map((node) => node.type)).toEqual(['heading', 'paragraph', 'codeBlock']);
    expect(validateDocument(imported)).toEqual([]);
  });

  it('preserves unsupported MDX explicitly', () => {
    const imported = mdxToCanonical('# Custom\n\n<ArchitectureDiagram source="system" />', defaultMetadata());
    expect(imported.content.some((node) => node.type === 'raw-mdx')).toBe(true);
    expect(validateDocument(imported)).toContain('Review preserved raw MDX blocks before publishing.');
  });
});

