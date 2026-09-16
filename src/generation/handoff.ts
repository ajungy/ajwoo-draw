import type { DrawingPage } from '../document/model/types';
import { selectionReference } from './selection';

import { referencePrompt } from './prompt';

export function handoffPrompt(prompt: string): string {
  return referencePrompt(prompt) + '\n\nThe text beneath the reference is an instruction panel, not part of the drawing. Do not reproduce it in the finished image.';
}

/** Include the instructions in the image: chat composers may ignore clipboard text when an image is present. */
export async function handoffImage(page: DrawingPage, scrappy: boolean, prompt: string): Promise<Blob> {
  const reference = await selectionReference(page, scrappy);
  const img = new Image();
  img.src = reference;
  await img.decode();
  const canvas = document.createElement('canvas');
  const width = Math.max(1024, img.naturalWidth);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the selected drawing.');
  const font = '24px sans-serif';
  ctx.font = font;
  const lines: string[] = [];
  for (const paragraph of handoffPrompt(prompt).split('\n')) {
    let line = '';
    // Character wrapping handles long words and languages without spaces as well.
    for (const char of paragraph) {
      if (line && ctx.measureText(line + char).width > width - 64) { lines.push(line); line = ''; }
      line += char;
    }
    lines.push(line);
  }
  canvas.width = width;
  canvas.height = img.naturalHeight + 64 + lines.length * 32;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, (width - img.naturalWidth) / 2, 0);
  ctx.fillStyle = '#18181B';
  ctx.font = font;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, 32, img.naturalHeight + 32 + i * 32));
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not prepare the selected drawing.')), 'image/png'));
}

/** Invoke synchronously from the click: promise-valued ClipboardItems preserve browser user activation. */
export function copyHandoff(image: Promise<Blob>, prompt: string): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    return Promise.reject(new Error('Image copying is unavailable in this browser. Download the selection instead.'));
  }
  return navigator.clipboard.write([new ClipboardItem({
    'image/png': image,
    'text/plain': new Blob([handoffPrompt(prompt)], { type: 'text/plain' }),
  })]);
}
