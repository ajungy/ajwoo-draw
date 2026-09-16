import { copyHandoff, handoffPrompt } from '../src/generation/handoff';

afterEach(() => vi.unstubAllGlobals());

it('writes both an image promise and plain text during the click', async () => {
  const write = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { write } });
  class Item {
    constructor(public data: Record<string, Blob | Promise<Blob>>) {}
  }
  vi.stubGlobal('ClipboardItem', Item);
  const image = Promise.resolve(new Blob(['reference'], { type: 'image/png' }));
  const result = copyHandoff(image, 'A man and a woman arguing in the forest');
  expect(write).toHaveBeenCalledTimes(1);
  const item = write.mock.calls[0][0][0] as Item;
  expect(item.data['image/png']).toBe(image);
  expect((item.data['text/plain'] as Blob).type).toBe('text/plain');
  expect(handoffPrompt('Scene')).toContain('User instructions: Scene');
  await result;
});

it('offers a download fallback when clipboard image support is missing', async () => {
  vi.stubGlobal('navigator', {});
  await expect(copyHandoff(Promise.resolve(new Blob()), '')).rejects.toThrow('Download the selection');
});


it('keeps generation focused on the reference instead of inventing a storyboard scene', () => {
  const prompt = handoffPrompt('Use refined typography');
  expect(prompt).toContain('matches the attached drawing as closely as possible');
  expect(prompt).toContain('output only that interface');
  expect(prompt).toContain('output only that subject');
  expect(prompt).toContain('User instructions: Use refined typography');
  expect(prompt).not.toContain('storyboard');
});
