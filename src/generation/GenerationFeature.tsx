import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEditor } from '../app/useStore';
import { ContextBar } from '../components/ContextBar';
import { boundsOfObjects } from '../document/model/objects';
import { insertGeneratedImage } from './insertImage';
import { DEFAULT_MODELS, type Provider } from './provider';
import { selectionPage, selectionReference } from './selection';
import { copyHandoff, handoffImage } from './handoff';
import { downloadBlob } from '../export/files';
import './generation.css';

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return createPortal(<dialog ref={ref} className="generation-modal" aria-label={title}
    onCancel={e => { e.preventDefault(); close(); }} onKeyDown={e => e.stopPropagation()}>
    <div className="generation-modal__heading"><h2>{title}</h2><button className="button button--secondary" onClick={close}>Close</button></div>
    {children}
  </dialog>, document.body);
}

export function GenerationFeature() {
  const store = useEditor();
  const count = store.selectedObjects().length;
  const [prompt, setPrompt] = useState('');
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [handoff, setHandoff] = useState<Blob | null>(null);
  const copyingRef = useRef(false);
  const [provider, setProvider] = useState<Provider>('openai');
  const [model, setModel] = useState(DEFAULT_MODELS.openai);
  const [apiKey, setApiKey] = useState('');
  const [connection, setConnection] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ reference: string; image: string; prompt: string } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const active = useRef<AbortController | null>(null);
  const local = import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => { setCopied(false); setHandoff(null); }, [store.selection.join(','), prompt]);

  const copy = () => {
    if (copyingRef.current || !count) return;
    copyingRef.current = true;
    setCopying(true); setCopied(false); setError(''); setHandoff(null);
    const page = selectionPage(store.page, new Set(store.selection));
    const image = handoffImage(page, store.scrappy, prompt);
    // Keep a download fallback even if clipboard permission is denied.
    void image.then(setHandoff, () => undefined);
    let write: Promise<void>;
    try { write = copyHandoff(image, prompt); }
    catch { write = Promise.reject(new Error('Clipboard unavailable.')); }
    void write.then(() => setCopied(true), () => {
      setError('Could not copy to the clipboard. Download the selection and attach it in your chat instead.');
    }).finally(() => { copyingRef.current = false; setCopying(false); });
  };

  const generate = async () => {
    if (active.current || !count) return;
    if (!apiKey.trim() || !model.trim()) { setConnection(true); return; }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setError('');
    // Capture the selection, prompt, and rendering style at the click, before any asynchronous work.
    const page = selectionPage(store.page, new Set(store.selection));
    const description = prompt.trim() || 'Polish the selected drawing while matching the reference closely.';
    const documentId = store.doc.id;
    const pageId = store.page.id;
    const bounds = boundsOfObjects(page.objects)!;
    const scrappy = store.scrappy;
    try {
      const reference = await selectionReference(page, scrappy);
      controller.signal.throwIfAborted();
      const response = await fetch('/api/generate-image', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model, apiKey, prompt: description, reference }), signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Generation failed. Try again.');
      if (typeof body.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(body.image)) throw new Error('The provider returned an invalid image.');
      setResult({ reference, image: body.image, prompt: description });
      const inserted = await insertGeneratedImage(store, body.image, description, documentId, pageId, bounds, controller.signal);
      const stage = document.querySelector('.stage')?.getBoundingClientRect();
      if (stage && store.currentPageId === pageId) {
        const zoom = Math.max(0.1, Math.min(1, (stage.width - 64) / inserted.frame.w, (stage.height - 64) / inserted.frame.h));
        store.setCamera({ x: inserted.frame.x + inserted.frame.w / 2 - stage.width / (2 * zoom),
          y: inserted.frame.y + inserted.frame.h / 2 - stage.height / (2 * zoom), zoom });
      }
    } catch (e) {
      setError(controller.signal.aborted ? 'Stopped waiting. The provider may still charge for this request.'
        : e instanceof TypeError ? 'Could not reach the local image service. Check that the development server is running.'
        : (e as Error).message);
    } finally { active.current = null; setBusy(false); }
  };
  const selected = local && count > 0;
  return <>
    <ContextBar
      promptToggle={selected && <button type="button" className="generation-toggle" aria-pressed={promptOpen}
        aria-controls="selection-prompt" onClick={() => setPromptOpen(open => !open)}>Prompt</button>}
      promptControls={selected && promptOpen ? <form id="selection-prompt" className="generation-prompt-row"
        onSubmit={e => { e.preventDefault(); if (apiKey.trim()) void generate(); else copy(); }}>
        <input aria-label="Describe the generated image" placeholder="Describe the finish or changes…" value={prompt}
          maxLength={8000} onChange={e => setPrompt(e.target.value)} disabled={busy || copying} />
        <button className="generation-action" disabled={busy || copying} type="submit" aria-live="polite"
          title={apiKey.trim() ? 'Generate on the canvas using your API credits' : 'Copy the selected drawing and prompt to paste into your chat'}>
          {busy ? 'Generating…' : copying ? 'Copying…' : apiKey.trim() ? 'Generate' : copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="generation-link" disabled={busy} onClick={() => setConnection(true)}
          title={apiKey.trim() ? 'API key supplied. Change provider or disconnect.' : 'Enter your provider API key'}>Connect</button>
      </form> : undefined}
    />
    {(busy || error || result) && local && <div className="generation-status" aria-live="polite">
      <span className={error ? 'generation-error' : ''}>{error || (busy ? 'Generating your image. This may take a few minutes.' : '')}</span>
      {handoff && !copied && <button className="generation-link" onClick={() => downloadBlob(handoff, 'drawing-prompt.png')}>Download selection</button>}
      {busy && <button className="generation-link" onClick={() => active.current?.abort()}>Stop waiting</button>}
      {error && <button className="generation-link" onClick={() => setError('')}>Dismiss</button>}
      {result && <button className="generation-link" onClick={() => setShowResult(true)}>View last image</button>}
    </div>}
    {connection && <Modal title="Connect an image model" close={() => setConnection(false)}>
      <p>Use your own API key. Requests are billed to your provider account. Chat-app subscriptions do not automatically include API credits.</p>
      <div className="generation-fields">
        <label>Provider<select value={provider} onChange={e => { const value = e.target.value as Provider; setProvider(value); setModel(DEFAULT_MODELS[value]); setApiKey(''); }}>
          <option value="openai">OpenAI</option><option value="gemini">Google Gemini</option>
        </select></label>
        <label>Image model<input value={model} onChange={e => setModel(e.target.value)} placeholder={DEFAULT_MODELS[provider]} /></label>
        <label>API key<input type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste your API key" /></label>
      </div>
      <p className="generation-note">Your key stays in memory until you reload or disconnect. It is never saved in your drawing. Generation sends the selected drawing and prompt through this local app to {provider === 'openai' ? 'OpenAI' : 'Google'}.</p>
      <p><a href={provider === 'openai' ? 'https://platform.openai.com/api-keys' : 'https://aistudio.google.com/apikey'} target="_blank" rel="noreferrer">Get an API key</a></p>
      <div className="generation-modal__actions"><button className="button button--secondary" onClick={() => { setApiKey(''); setConnection(false); }}>Disconnect</button>
        <button className="button button--primary" disabled={!apiKey.trim() || !/^[a-zA-Z0-9._-]{1,100}$/.test(model)} onClick={() => setConnection(false)}>Use this model</button></div>
      <p className="generation-note">The key is checked by the provider when you generate. This prototype supports OpenAI and Gemini image APIs.</p>
    </Modal>}
    {showResult && result && <Modal title="Generated image" close={() => setShowResult(false)}>
      <p>{result.prompt}</p>
      <div className="generation-comparison"><figure><figcaption>Selected drawing</figcaption><img src={result.reference} alt="Selected drawing reference" /></figure>
        <figure><figcaption>Generated image</figcaption><img src={result.image} alt={result.prompt} /></figure></div>
      <div className="generation-modal__actions"><button className="button button--secondary" onClick={() => { setResult(null); setShowResult(false); }}>Close preview</button>
        <a className="button button--primary" href={result.image} download={`generated-image.${result.image.startsWith('data:image/jpeg') ? 'jpg' : result.image.startsWith('data:image/webp') ? 'webp' : 'png'}`}>Download image</a></div>
      <p className="generation-note">Generated images are added beside the reference on the canvas and saved with your drawing. This preview is cleared when you reload.</p>
    </Modal>}
  </>;
}
