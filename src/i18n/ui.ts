export type Locale = 'zh' | 'en';

const zh = {
  home: '首页', blog: '文章', archive: '归档', mainNav: '主导航',
  homeLabel: 'Fine 博客首页', language: '切换为英文', skip: '跳到正文',
  openMenu: '打开导航', closeMenu: '关闭导航',
  lightTheme: '切换为浅色外观', darkTheme: '切换为深色外观',
  pauseMotion: '暂停页面动效', playMotion: '播放页面动效',
  description: '关于 AI、技术与创造的个人博客。', email: '邮箱',
  happy: '开心最重要...', startReading: '开始阅读', browsePosts: '浏览文章',
  latest: '最新文章', more: '阅读更多', emptyPosts: '第一篇记录正在酝酿中。',
  blogTitle: '思考与记录', blogIntro: '把每一次探索，留在这里。', allPosts: '全部文章',
  articleNavigation: '文章翻页', previousPost: '上一篇文章', nextPost: '下一篇文章',
  archiveTitle: '文章归档', archiveIntro: '按时间回看每一次记录，找到想继续阅读的文章。',
  archiveDescription: '按时间浏览 Fine 的全部文章，搜索关于 AI、技术与创造的记录。',
  search: '搜索文章', searchPlaceholder: '搜索标题或摘要', clear: '清空',
  view: '文章展示方式', bookshelf: '书架', timeline: '时间线',
  reducedNote: '已根据“减少动态效果”偏好显示静态时间线。',
  noResults: '没有找到相关文章', noResultsHelp: '试试更短的关键词，或清空搜索查看全部文章。',
  noPosts: '还没有文章', original: '中文原文',
  translationNote: '这篇文章暂时没有英文译文，以下保留中文原文。',
  shelfFallback: '书架暂时无法显示，可以直接阅读以下文章，或切换到时间线。',
  shelfLoading: '正在整理书架…', shelfPrompt: '点选一本，翻看这篇记录。', readFull: '阅读全文',
  count: '{count} 篇文章', total: '共 {count} 篇文章，按时间倒序',
  results: '找到 {count} 篇文章，共 {total} 篇',
  shelfLabel: '文章书架，共 {count} 本。左右方向键浏览，回车展开。',
  selectedBook: '{title}，已展开。拖动旋转，再次点击或按回车阅读。',
};

const en: Record<keyof typeof zh, string> = {
  home: 'Home', blog: 'Writing', archive: 'Archive', mainNav: 'Main navigation',
  homeLabel: 'Fine blog home', language: 'Switch to Chinese', skip: 'Skip to content',
  openMenu: 'Open navigation', closeMenu: 'Close navigation',
  lightTheme: 'Switch to light appearance', darkTheme: 'Switch to dark appearance',
  pauseMotion: 'Pause page animations', playMotion: 'Play page animations',
  description: 'A personal blog about AI, technology, and making things.', email: 'Email',
  happy: 'Happiness comes first...', startReading: 'Start reading', browsePosts: 'Browse writing',
  latest: 'Latest writing', more: 'Read more', emptyPosts: 'The first story is on its way.',
  blogTitle: 'Thoughts & notes', blogIntro: 'A place for every exploration.', allPosts: 'All writing',
  articleNavigation: 'Article navigation', previousPost: 'Previous article', nextPost: 'Next article',
  archiveTitle: 'Writing archive', archiveIntro: 'Look back through the years and find something to read again.',
  archiveDescription: 'Browse all of Fine’s writing by date, or search notes on AI, technology, and making things.',
  search: 'Search writing', searchPlaceholder: 'Search titles or summaries', clear: 'Clear',
  view: 'Article view', bookshelf: 'Bookshelf', timeline: 'Timeline',
  reducedNote: 'Showing the static timeline to respect your reduced motion preference.',
  noResults: 'No matching articles', noResultsHelp: 'Try a shorter keyword, or clear the search to see all writing.',
  noPosts: 'No articles yet', original: 'Chinese original',
  translationNote: 'An English translation is not available yet. The original Chinese text is shown below.',
  shelfFallback: 'The bookshelf is unavailable. Read an article below, or switch to the timeline.',
  shelfLoading: 'Arranging the bookshelf…', shelfPrompt: 'Choose a book to explore a story.', readFull: 'Read article',
  count: '{count} articles', total: '{count} articles, newest first',
  results: 'Found {count} articles out of {total}',
  shelfLabel: 'Article bookshelf, {count} books. Use the arrow keys to browse and Enter to open.',
  selectedBook: '{title}, open. Drag to rotate; click again or press Enter to read.',
};

export const ui = { zh, en };
export const htmlLang = (locale: Locale) => locale === 'en' ? 'en' : 'zh-CN';
export const documentLocale = (): Locale => document.documentElement.lang === 'en' ? 'en' : 'zh';

/** Chinese keeps its existing URL; both versions share the same article ID. */
export function localePath(path: string, locale: Locale): string {
  const unprefixed = path.replace(/^\/en(?=\/|$)/, '') || '/';
  return locale === 'en' ? `/en${unprefixed}` : unprefixed;
}

export function message(locale: Locale, key: keyof typeof zh, values: Record<string, string | number>): string {
  let text = ui[locale][key];
  if (locale === 'en' && values.count === 1) text = text.replace(/articles\b/g, 'article').replace(/books\b/g, 'book');
  return text.replace(/\{(\w+)\}/g, (token, name: string) => String(values[name] ?? token));
}
