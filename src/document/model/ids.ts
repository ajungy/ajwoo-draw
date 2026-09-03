const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Short, collision-resistant, URL-safe id. Not a UUID: share links pay per byte. */
export function newId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
