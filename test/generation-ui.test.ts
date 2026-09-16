import { EditorStore } from '../src/app/store';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { GenerationFeature } from '../src/generation/GenerationFeature';
import { shape } from './factories';
const state = vi.hoisted(() => ({ store: null as unknown, exportReference: vi.fn(), copy: vi.fn(), handoffImage: vi.fn() }));
vi.mock('../src/generation/handoff', () => ({ copyHandoff: state.copy, handoffImage: state.handoffImage }));
vi.mock('../src/app/useStore', () => ({ useEditor: () => state.store }));
vi.mock('../src/generation/selection', async importOriginal => ({ ...await importOriginal<typeof import('../src/generation/selection')>(), selectionReference: state.exportReference }));

it('completes selection → key → prompt → result → download, retaining the original drawing', async () => {
  const original = [shape(), shape()];
  const store = new EditorStore();
  original.forEach(o => store.addObject(o));
  store.selectAll();
  state.store = store;
  state.exportReference.mockResolvedValue('data:image/png;base64,cmVm');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('location', { hostname: '127.0.0.1' });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  const send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ image: 'data:image/png;base64,aW1hZ2U=' })));
  vi.stubGlobal('fetch', send);
  vi.stubGlobal('Image', class { src = ''; naturalWidth = 512; naturalHeight = 512; decode() { return Promise.resolve(); } });
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent === text)!;
  const input = async (selector: string, value: string) => {
    await act(async () => {
      const el = document.querySelector<HTMLInputElement>(selector)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(createElement(GenerationFeature)));
    await act(async () => button('Prompt').click());
    expect(document.querySelector('#selection-prompt')).not.toBeNull();
    await act(async () => button('Connect').click());
    await input('input[type="password"]', 'user-test-key');
    await act(async () => button('Use this model').click());
    await input('input[aria-label="Describe the generated image"]', 'A man and a woman arguing in a forest');
    await act(async () => button('Generate').click());
    expect(store.page.objects.at(-1)).toMatchObject({ type: 'image', src: 'data:image/png;base64,aW1hZ2U=' });
    expect(document.querySelector('dialog')).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(send.mock.calls[0][1].body);
    expect(payload.reference).toBe('data:image/png;base64,cmVm');
    expect(payload.apiKey).toBe('user-test-key');
    expect(store.page.objects.slice(0, 2)).toEqual(original);
    store.undo();
    expect(store.page.objects).toEqual(original);
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
  }
});


it('copies the selected drawing and prompt without a key or a provider request', async () => {
  const original = [shape(), shape()];
  const store = new EditorStore();
  original.forEach(o => store.addObject(o));
  store.selectAll();
  state.store = store;
  const blob = new Blob(['image'], { type: 'image/png' });
  state.handoffImage.mockResolvedValue(blob);
  state.copy.mockResolvedValue(undefined);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('location', { hostname: '127.0.0.1' });
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(GenerationFeature)));
    expect(document.querySelector('#selection-prompt')).toBeNull();
    await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Prompt')!.click());
    await act(async () => document.querySelector<HTMLButtonElement>('#selection-prompt button[type=submit]')!.click());
    expect(state.handoffImage).toHaveBeenCalledWith(expect.objectContaining({ objects: original }), false, '');
    expect(state.copy).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Copied');
    expect(document.querySelector('a[href="https://chatgpt.com/"]')).toBeNull();
    expect(document.querySelector('a[href="https://gemini.google.com/app"]')).toBeNull();
    expect(document.querySelector('dialog')).toBeNull();
    await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Prompt')!.click());
    expect(document.querySelector('#selection-prompt')).toBeNull();
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
  }
});
