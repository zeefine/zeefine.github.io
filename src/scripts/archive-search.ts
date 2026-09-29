export const normalizeSearch = (value: string) => value.normalize('NFKC').toLowerCase().trim();

export function matchesSearch(text: string, query: string): boolean {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const searchable = normalizeSearch(text);
  return terms.every((term) => searchable.includes(term));
}
