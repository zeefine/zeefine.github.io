import type { Locale } from './ui.ts';

interface PostEntry {
  id: string;
  data: { locale: Locale; translationOf?: string; pubDate: Date };
}

export interface LocalizedPost<T> {
  id: string;
  entry: T;
  pubDate: Date;
  contentLocale: Locale;
  hasTranslation: boolean;
  previousId?: string;
  nextId?: string;
}

/** Resolve translations without duplicating originals in lists or changing public IDs. */
export function selectLocalizedPosts<T extends PostEntry>(entries: T[], locale: Locale): LocalizedPost<T>[] {
  const originals = entries.filter((post) => post.data.locale === 'zh');
  const originalIds = new Set(originals.map((post) => post.id));
  const translations = new Map<string, T>();
  for (const post of entries.filter((post) => post.data.locale === 'en')) {
    const source = post.data.translationOf;
    if (!source || !originalIds.has(source)) throw new Error(`Translation ${post.id} has no Chinese original: ${source}`);
    if (translations.has(source)) throw new Error(`Duplicate English translations for ${source}`);
    translations.set(source, post);
  }
  return originals.sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime()).map((original, index) => {
    const translation = translations.get(original.id);
    const entry = locale === 'en' && translation ? translation : original;
    return {
      id: original.id, entry, pubDate: original.data.pubDate,
      contentLocale: entry.data.locale, hasTranslation: Boolean(translation),
      previousId: originals[index - 1]?.id, nextId: originals[index + 1]?.id,
    };
  });
}
