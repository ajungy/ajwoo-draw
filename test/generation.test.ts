import { generateImage, validateRequest, type GenerationRequest } from '../src/generation/provider';
import { selectionPage } from '../src/generation/selection';
import { line, shape } from './factories';

const request: GenerationRequest = { provider: 'openai', model: 'gpt-image-2', apiKey: 'test-key', prompt: 'Two people arguing in a forest', reference: 'data:image/png;base64,aGVsbG8=' };
const signal = new AbortController().signal;

describe('reference generation', () => {
  it('only exports selected objects and freezes connections to unselected shapes', () => {
    const target = shape({ id: 'target', frame: { x: 200, y: 100, w: 80, h: 60 } });
    const connector = line({ id: 'line', startBinding: { objectId: target.id, anchor: 'bottom' } });
    const page = { id: 'p', name: 'Page', objects: [target, connector] };
    const captured = selectionPage(page, new Set(['line']));
    expect(captured.objects).toHaveLength(1);
    expect(captured.objects[0]).toMatchObject({ a: { x: 240, y: 160 }, startBinding: undefined });
    expect(connector.startBinding).toBeDefined();
  });
  it('sends a reference file with the prompt to OpenAI using the user key', async () => {
    const send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }] })));
    expect(await generateImage(request, signal, send)).toBe('data:image/png;base64,aW1hZ2U=');
    const [url, init] = send.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/images/edits');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    expect(init.body.get('image[]').type).toBe('image/png');
    expect(init.body.get('prompt')).toContain(request.prompt);
    expect(init.signal).toBe(signal);
  });
  it('sends Gemini inline image data and ignores thought images', async () => {
    const send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [
      { thought: true, inlineData: { mimeType: 'image/png', data: 'dGhvdWdodA==' } },
      { inlineData: { mimeType: 'image/jpeg', data: 'aW1hZ2U=' } },
    ] } }] })));
    expect(await generateImage({ ...request, provider: 'gemini', model: 'gemini-2.5-flash-image' }, signal, send)).toBe('data:image/jpeg;base64,aW1hZ2U=');
    const [url, init] = send.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).not.toContain('test-key');
    expect(JSON.parse(init.body).contents[0].parts[1].inlineData.data).toBe('aGVsbG8=');
  });
  it.each([401, 403, 429, 500])('handles %s without echoing provider content or retrying charges', async status => {
    const send = vi.fn().mockResolvedValue(new Response('secret-key echoed by provider', { status }));
    await expect(generateImage(request, signal, send)).rejects.toThrow(String(status));
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('explains blocked or text-only responses', async () => {
    const send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'refused' }] } }] })));
    await expect(generateImage({ ...request, provider: 'gemini' }, signal, send)).rejects.toThrow('no usable image');
  });
  it.each([{ provider: 'claude' }, { model: '../other?key=x' }, { prompt: ' ' }, { reference: 'https://example.com/private.png' }, { apiKey: 'key\r\nheader' }])('rejects invalid requests before sending', patch => {
    expect(() => validateRequest({ ...request, ...patch })).toThrow();
  });
});

it('does not expose raw malformed provider responses', async () => {
  const send = vi.fn().mockResolvedValue(new Response('private provider response'));
  await expect(generateImage(request, signal, send)).rejects.toThrow('unreadable response');
});
