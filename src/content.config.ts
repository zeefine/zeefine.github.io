import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    locale: z.enum(['zh', 'en']).default('zh'),
    translationOf: z.string().optional(),
  }).superRefine((post, ctx) => {
    if (post.locale === 'en' && !post.translationOf) {
      ctx.addIssue({ code: 'custom', message: 'English articles must specify translationOf.' });
    }
    if (post.locale === 'zh' && post.translationOf) {
      ctx.addIssue({ code: 'custom', message: 'translationOf belongs on the English translation.' });
    }
  }),
});

export const collections = { blog };
