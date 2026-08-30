import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';

const lowlight = createLowlight(common);

const initialContent = `
  <h1>Designing an API that ages well</h1>
  <p class="lead">A practical field guide to contracts, change, and the quiet decisions that keep production systems boring.</p>
  <h2>Start with the boundary</h2>
  <p>Your API is a promise. The implementation may move quickly, but the promise should change deliberately.</p>
  <pre><code class="language-csharp">public sealed record CreateInvoiceRequest(
    Guid CustomerId,
    IReadOnlyList&lt;InvoiceLine&gt; Lines);</code></pre>
`;

export default function StudioEditor() {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ codeBlock: false }), CodeBlockLowlight.configure({ lowlight })],
    content: initialContent,
    editorProps: { attributes: { class: 'editor-canvas', 'aria-label': 'Article editor' } },
  });

  if (!editor) return <div className="editor-loading">Preparing your document…</div>;

  const command = (label: string, active: boolean, action: () => void) => (
    <button type="button" className={active ? 'tool active' : 'tool'} onClick={action} aria-pressed={active}>
      {label}
    </button>
  );

  return (
    <section className="editor-shell">
      <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
        {command('H1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
        {command('H2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
        {command('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run())}
        {command('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run())}
        {command('Code', editor.isActive('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run())}
        {command('Quote', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run())}
        <span className="save-state"><span></span> Saved locally</span>
      </div>
      <EditorContent editor={editor} />
    </section>
  );
}

