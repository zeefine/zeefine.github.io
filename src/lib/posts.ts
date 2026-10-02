import { getCollection, type CollectionEntry } from 'astro:content';
import { selectLocalizedPosts, type LocalizedPost } from '../i18n/posts';
import type { Locale } from '../i18n/ui';

export type BlogPost = LocalizedPost<CollectionEntry<'blog'>>;
export async function getPosts(locale: Locale): Promise<BlogPost[]> {
  return selectLocalizedPosts(await getCollection('blog'), locale);
}
