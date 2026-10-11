// randomUUID requires HTTPS on iOS. getRandomValues also works on trusted LAN HTTP previews.
export function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map((value) => value.toString(16).padStart(2, '0')).join('');
}
