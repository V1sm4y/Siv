export function slugify(input: string): string {
  const s = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return s.length >= 2 ? s : `org-${s || 'x'}`;
}

export function withSuffix(base: string, attempt: number): string {
  if (attempt === 0) return base;
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base.slice(0, 43)}-${suffix}`;
}
