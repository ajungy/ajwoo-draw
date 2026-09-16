import { referencePrompt } from './prompt';
export type Provider = 'openai' | 'gemini';
export interface GenerationRequest {
  provider: Provider;
  model: string;
  apiKey: string;
  prompt: string;
  reference: string;
}
export const DEFAULT_MODELS: Record<Provider, string> = {
  openai: 'gpt-image-2',
  gemini: 'gemini-2.5-flash-image',
};

export function validateRequest(value: unknown): GenerationRequest {
  const v = value as Partial<GenerationRequest> | null;
  if (!v || !['openai', 'gemini'].includes(v.provider ?? '')) throw new Error('Choose OpenAI or Gemini.');
  if (typeof v.apiKey !== 'string' || !v.apiKey.trim() || v.apiKey.length > 512 || /[\r\n]/.test(v.apiKey)) throw new Error('Enter a valid API key.');
  if (typeof v.model !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(v.model)) throw new Error('Enter a valid image model ID.');
  if (typeof v.prompt !== 'string' || !v.prompt.trim() || v.prompt.length > 8000) throw new Error('Enter a prompt of up to 8,000 characters.');
  if (typeof v.reference !== 'string' || v.reference.length > 8_000_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.reference)) throw new Error('The selection must be a PNG under 6 MB. Try a smaller selection.');
  return { ...v, apiKey: v.apiKey.trim(), prompt: v.prompt.trim() } as GenerationRequest;
}

/** Only fixed provider origins receive credentials; no third-party proxy or URL fetching. */
export async function generateImage(input: GenerationRequest, signal: AbortSignal, send: typeof fetch = fetch): Promise<string> {
  const request = validateRequest(input);
  const { provider, model, apiKey, reference } = request;
  const prompt = referencePrompt(request.prompt);
  let response: Response;
  if (provider === 'openai') {
    const form = new FormData();
    form.set('model', model);
    form.set('prompt', prompt);
    form.set('n', '1');
    form.set('size', 'auto');
    const bytes = Uint8Array.from(atob(reference.split(',')[1]), c => c.charCodeAt(0));
    form.append('image[]', new Blob([bytes], { type: 'image/png' }), 'drawing-reference.png');
    response = await send('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal, redirect: 'error',
    });
  } else {
    response = await send(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/png', data: reference.split(',')[1] } }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }),
      signal, redirect: 'error',
    });
  }
  if (!response.ok) {
    // Do not relay raw upstream messages: they may echo a key or prompt.
    const advice = response.status === 401 || response.status === 403 ? 'Check your API key and model access.'
      : response.status === 429 ? 'Check your provider billing, credits, and rate limits before trying again.'
      : response.status >= 500 ? 'The provider is unavailable. Try again later.'
      : 'Check the image model ID and prompt. Your provider may have rejected the request.';
    throw new Error(`${provider === 'openai' ? 'OpenAI' : 'Gemini'} returned ${response.status}. ${advice}`);
  }
  const data = await response.json().catch(() => {
    throw new Error('The provider returned an unreadable response. Try again later.');
  });
  let base64: unknown;
  let mime = 'image/png';
  if (provider === 'openai') base64 = data.data?.[0]?.b64_json;
  else {
    const part = data.candidates?.flatMap((c: { content?: { parts?: { thought?: boolean; inlineData?: { data: string; mimeType: string } }[] } }) => c.content?.parts ?? [])
      .find((p: { thought?: boolean; inlineData?: unknown }) => !p.thought && p.inlineData);
    base64 = part?.inlineData?.data;
    mime = part?.inlineData?.mimeType;
  }
  if (typeof base64 !== 'string' || !base64 || base64.length > 32_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || !['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
    throw new Error('The provider returned no usable image. Try changing the prompt or choosing another image model.');
  }
  return `data:${mime};base64,${base64}`;
}
