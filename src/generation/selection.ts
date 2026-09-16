import type { DrawingPage } from '../document/model/types';
import { resolveEndpoint } from '../document/model/objects';
import { exportPageToPng } from '../export/png/exportPng';
import { pageBounds } from '../export/svg/exportSvg';

/** Freeze visible connector positions before removing unselected objects. */
export function selectionPage(page: DrawingPage, ids: Set<string>): DrawingPage {
  const lookup = (id: string) => page.objects.find(o => o.id === id);
  return { ...page, objects: page.objects.filter(o => ids.has(o.id)).map(o => o.type === 'line'
    ? { ...o, a: resolveEndpoint(o, 'start', lookup), b: resolveEndpoint(o, 'end', lookup), startBinding: undefined, endBinding: undefined }
    : o) };
}

export async function selectionReference(page: DrawingPage, scrappy: boolean): Promise<string> {
  if (!page.objects.length) throw new Error('Select at least one object first.');
  const bounds = pageBounds(page, 32);
  const scale = Math.min(2, 2048 / Math.max(bounds.w, bounds.h));
  const blob = await exportPageToPng(page, { scrappy, scale, padding: 32 });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the selected drawing.'));
    reader.readAsDataURL(blob);
  });
}
