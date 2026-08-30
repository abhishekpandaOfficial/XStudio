import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import {
  canonicalToMdx,
  canonicalToTiptap,
  defaultMetadata,
  mdxToCanonical,
  tiptapToCanonical,
  validateDocument,
  type CanonicalDocument,
  type CanonicalNode,
  type TextRun,
  type TiptapDocument,
} from '../lib/document-model';
import { createPublishPlan, publishTargets, type PublishTargetId } from '../lib/publishing';
import { saveDraft as saveRemoteDraft, type WorkflowStatus } from '../lib/content-repository';

const lowlight = createLowlight(common);
const DRAFT_KEY = 'xstudio:draft:designing-an-api-that-ages-well';

const initialTiptap: TiptapDocument = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Designing an API that ages well' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'A practical field guide to contracts, change, and the quiet decisions that keep production systems boring.' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Start with the boundary' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Your API is a promise. The implementation may move quickly, but the promise should change deliberately.' }] },
    { type: 'codeBlock', attrs: { language: 'csharp' }, content: [{ type: 'text', text: 'public sealed record CreateInvoiceRequest(\n    Guid CustomerId,\n    IReadOnlyList<InvoiceLine> Lines);' }] },
  ],
};

const initialDocument = tiptapToCanonical(initialTiptap, defaultMetadata());
type EditorMode = 'visual' | 'mdx' | 'preview';
type SaveState = 'saved' | 'saving' | 'changed';

const runs = (content: TextRun[]): ReactNode => content.map((run, index) => {
  let value: ReactNode = run.text;
  for (const mark of run.marks ?? []) {
    if (mark === 'bold') value = <strong>{value}</strong>;
    if (mark === 'italic') value = <em>{value}</em>;
    if (mark === 'strike') value = <s>{value}</s>;
    if (mark === 'code') value = <code>{value}</code>;
  }
  return <span key={index}>{value}</span>;
});

const renderNode = (node: CanonicalNode): ReactNode => {
  switch (node.type) {
    case 'heading':
      if (node.level === 1) return <h1 key={node.id}>{runs(node.content)}</h1>;
      if (node.level === 2) return <h2 key={node.id}>{runs(node.content)}</h2>;
      return <h3 key={node.id}>{runs(node.content)}</h3>;
    case 'paragraph': return <p key={node.id}>{runs(node.content)}</p>;
    case 'blockquote': return <blockquote key={node.id}>{node.content.map(renderNode)}</blockquote>;
    case 'code': return <pre key={node.id}><code data-language={node.language}>{node.code}</code></pre>;
    case 'divider': return <hr key={node.id} />;
    case 'raw-mdx': return <div className="raw-mdx-warning" key={node.id}><b>Preserved MDX</b><code>{node.value}</code><small>{node.reason}</small></div>;
    case 'list': {
      const List = node.ordered ? 'ol' : 'ul';
      return <List key={node.id}>{node.items.map((item, index) => <li key={`${node.id}-${index}`}>{item.map(renderNode)}</li>)}</List>;
    }
  }
};

export default function StudioEditor() {
  const metadata = useMemo(() => defaultMetadata(), []);
  const [document, setDocument] = useState<CanonicalDocument>(initialDocument);
  const [mdx, setMdx] = useState(() => canonicalToMdx(initialDocument));
  const [mode, setModeState] = useState<EditorMode>('visual');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [lastSaved, setLastSaved] = useState('just now');
  const [showPublish, setShowPublish] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<PublishTargetId[]>(['astro', 'github']);
  const [planCreated, setPlanCreated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const documentRef = useRef(document);
  documentRef.current = document;

  const persistDraft = (nextDocument: CanonicalDocument, nextMdx: string) => {
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ document: nextDocument, mdx: nextMdx }));
      const savedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      try {
        const destination = await saveRemoteDraft(nextDocument, nextMdx);
        setLastSaved(destination === 'remote' ? `to Supabase ${savedAt}` : destination === 'needs-auth' ? 'locally · sign in to sync' : destination === 'needs-workspace' ? 'locally · create a workspace to sync' : `locally ${savedAt}`);
      } catch {
        setLastSaved(`locally ${savedAt} · remote retry needed`);
      }
      setSaveState('saved');
    }, 650);
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ codeBlock: false }), CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'text' })],
    content: initialTiptap,
    editorProps: { attributes: { class: 'editor-canvas', 'aria-label': 'Article visual editor' } },
    onUpdate: ({ editor: activeEditor }) => {
      const current = documentRef.current;
      const nextDocument = tiptapToCanonical(activeEditor.getJSON() as TiptapDocument, { ...metadata, revision: current.metadata.revision });
      const nextMdx = canonicalToMdx(nextDocument);
      setDocument(nextDocument);
      setMdx(nextMdx);
      setSaveState('changed');
      setPlanCreated(false);
      persistDraft(nextDocument, nextMdx);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const stored = localStorage.getItem(DRAFT_KEY);
    if (!stored) return;
    try {
      const draft = JSON.parse(stored) as { document: CanonicalDocument; mdx: string };
      setDocument(draft.document);
      setMdx(draft.mdx);
      editor.commands.setContent(canonicalToTiptap(draft.document));
      setLastSaved('restored from this device');
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [editor]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);
  if (!editor) return <div className="editor-loading">Preparing your document…</div>;

  const setMode = (nextMode: EditorMode) => {
    if (nextMode === mode) return;
    if (mode === 'mdx') {
      const nextDocument = mdxToCanonical(mdx, document.metadata);
      setDocument(nextDocument);
      editor.commands.setContent(canonicalToTiptap(nextDocument));
      persistDraft(nextDocument, canonicalToMdx(nextDocument));
    } else {
      const nextDocument = tiptapToCanonical(editor.getJSON() as TiptapDocument, document.metadata);
      setDocument(nextDocument);
      setMdx(canonicalToMdx(nextDocument));
    }
    setModeState(nextMode);
  };

  const updateMdx = (value: string) => {
    setMdx(value);
    setSaveState('changed');
    setPlanCreated(false);
    const nextDocument = mdxToCanonical(value, document.metadata);
    setDocument(nextDocument);
    persistDraft(nextDocument, value);
  };

  const updateStatus = (status: WorkflowStatus) => {
    const nextDocument: CanonicalDocument = {
      ...document,
      metadata: { ...document.metadata, status: status as CanonicalDocument['metadata']['status'], updatedAt: new Date().toISOString() },
    };
    setDocument(nextDocument);
    setMdx(canonicalToMdx(nextDocument));
    persistDraft(nextDocument, canonicalToMdx(nextDocument));
  };

  const toggleTarget = (target: PublishTargetId) => {
    setSelectedTargets((current) => current.includes(target) ? current.filter((item) => item !== target) : [...current, target]);
    setPlanCreated(false);
  };

  const validationErrors = validateDocument(document);
  const publishPlan = createPublishPlan(document, selectedTargets);
  const wordCount = document.content.reduce((count, node) => {
    if ('content' in node && Array.isArray(node.content)) {
      return count + node.content.reduce((total, child) => total + ('text' in child ? child.text.split(/\s+/).filter(Boolean).length : 0), 0);
    }
    return count;
  }, 0);

  const command = (label: string, active: boolean, action: () => void, title?: string) => (
    <button type="button" title={title ?? label} className={active ? 'tool active' : 'tool'} onClick={action} aria-pressed={active}>{label}</button>
  );

  return (
    <section className="studio-core">
      <div className="mode-commandbar">
        <div className="editor-modes" role="tablist" aria-label="Editing mode">
          {(['visual', 'mdx', 'preview'] as EditorMode[]).map((item) => (
            <button key={item} role="tab" aria-selected={mode === item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>
              {item === 'visual' ? '✦ Visual' : item === 'mdx' ? '</> MDX' : '◉ Preview'}
            </button>
          ))}
        </div>
        <div className="document-health"><label className="workflow-select"><i className={document.metadata.status}></i><select aria-label="Workflow status" value={document.metadata.status} onChange={(event) => updateStatus(event.target.value as WorkflowStatus)}><option value="draft">Draft</option><option value="review">In review</option><option value="scheduled" disabled>Scheduled via release</option><option value="published" disabled>Published via release</option></select></label><span>{wordCount} words</span><span>Revision {document.metadata.revision}</span><span className={`save-state ${saveState}`}><i></i>{saveState === 'saved' ? `Saved ${lastSaved}` : saveState}</span></div>
        <button className="open-publish" onClick={() => setShowPublish(true)}>Publish <span>↗</span></button>
      </div>

      {mode === 'visual' && <section className="editor-shell">
        <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
          {command('H1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
          {command('H2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
          {command('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold')}
          {command('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic')}
          {command('• List', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run())}
          {command('1. List', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run())}
          {command('Code', editor.isActive('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run())}
          {command('Quote', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run())}
          <span className="toolbar-separator"></span>
          <button className="tool" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>↶</button>
          <button className="tool" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>↷</button>
        </div>
        <EditorContent editor={editor} />
      </section>}

      {mode === 'mdx' && <section className="source-editor">
        <header><div><b>Portable MDX source</b><span>Deterministic output · UTF-8 · normalized frontmatter</span></div><button onClick={() => navigator.clipboard.writeText(mdx)}>Copy MDX</button></header>
        <div className="source-body"><div className="line-numbers" aria-hidden="true">{mdx.split('\n').map((_, index) => <span key={index}>{index + 1}</span>)}</div><textarea aria-label="MDX source" value={mdx} onChange={(event) => updateMdx(event.target.value)} spellCheck={false} /></div>
        <footer><span>Changes are parsed into XStudio’s canonical schema.</span><span>{validationErrors.length ? `${validationErrors.length} review item` : 'Schema valid'}</span></footer>
      </section>}

      {mode === 'preview' && <section className="publication-preview">
        <header><span>PUBLICATION PREVIEW</span><div><button className="active">Desktop</button><button>Tablet</button><button>Mobile</button></div><a href="/blog/generate-pdf-invoices-aspnet-core/" target="_blank">Open reader ↗</a></header>
        <article><div className="preview-tags">{document.metadata.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>{document.content.map(renderNode)}</article>
      </section>}

      {showPublish && <div className="publish-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowPublish(false)}>
        <section className="publish-panel" role="dialog" aria-modal="true" aria-labelledby="publish-title">
          <header><div><span>RELEASE WORKFLOW</span><h2 id="publish-title">Publish from one source.</h2><p>Select destinations. XStudio validates once, then creates a target-aware release plan.</p></div><button aria-label="Close publishing" onClick={() => setShowPublish(false)}>×</button></header>
          <div className="publish-targets">{publishTargets.map((target) => {
            const selected = selectedTargets.includes(target.id);
            return <button key={target.id} className={selected ? 'publish-target selected' : 'publish-target'} onClick={() => toggleTarget(target.id)}>
              <span className="target-check">{selected ? '✓' : ''}</span><span className={`target-logo ${target.id}`}>{target.id === 'astro' ? 'A' : target.id === 'github' ? 'GH' : 'GB'}</span>
              <span className="target-copy"><small>{target.mode}</small><b>{target.name}</b><em>{target.description}</em><code>{target.destination}</code></span><span className="direction">{target.direction}</span>
            </button>;
          })}</div>
          <div className="release-plan"><div className="plan-heading"><b>Release plan</b><span>{selectedTargets.length} destinations</span></div>{publishPlan.map((step, index) => <div className="plan-step" key={step.label}><span className={step.status}>{step.status === 'ready' ? '✓' : '!'}</span><div><b>{index + 1}. {step.label}</b><small>{step.detail}</small></div></div>)}</div>
          {planCreated && <div className="plan-notice"><b>Release manifest prepared.</b><span>Provider authorization is the next boundary. No external system was changed.</span></div>}
          <footer><div><span className={validationErrors.length ? 'validation-dot blocked' : 'validation-dot'}></span>{validationErrors.length ? 'Review required before release' : 'Document ready for release'}</div><button className="secondary-action" onClick={() => setShowPublish(false)}>Keep editing</button><button className="primary-action" disabled={!selectedTargets.length || validationErrors.length > 0} onClick={() => setPlanCreated(true)}>Prepare release manifest <span>→</span></button></footer>
        </section>
      </div>}
    </section>
  );
}
