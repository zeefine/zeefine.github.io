import { matchesSearch } from './archive-search';
import { createArchiveBookshelf } from './archive-bookshelf';

const form = document.querySelector<HTMLFormElement>('[data-archive-search]');
const input = form?.querySelector<HTMLInputElement>('input');
const clear = form?.querySelector<HTMLButtonElement>('[data-search-clear]');
const status = document.querySelector<HTMLElement>('[data-search-status]');
const empty = document.querySelector<HTMLElement>('[data-search-empty]');
const groups = Array.from(document.querySelectorAll<HTMLElement>('[data-timeline-year]'));
const entries = groups.map((group) => ({
  group,
  articles: Array.from(group.querySelectorAll<HTMLElement>('[data-search]')),
}));
const total = entries.reduce((sum, entry) => sum + entry.articles.length, 0);
const timeline = document.querySelector<HTMLElement>('#archive-timeline');
const bookshelfRoot = document.querySelector<HTMLElement>('#archive-bookshelf');
const viewSwitch = document.querySelector<HTMLElement>('.archive-view-switch');
const viewButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-archive-view]'));
const reducedNote = document.querySelector<HTMLElement>('.reduced-view-note');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const bookshelf = bookshelfRoot ? createArchiveBookshelf(bookshelfRoot) : null;

if (form && input && clear && status && empty) {
  let composing = false;
  let count = total;
  let view = new URLSearchParams(location.search).get('view') === 'timeline' ? 'timeline' : 'bookshelf';
  const syncView = () => {
    const showBookshelf = view === 'bookshelf' && !reducedMotion.matches;
    if (timeline) timeline.hidden = showBookshelf || count === 0;
    if (bookshelfRoot) bookshelfRoot.hidden = !showBookshelf || count === 0;
    if (viewSwitch) viewSwitch.hidden = reducedMotion.matches;
    if (reducedNote) reducedNote.hidden = !reducedMotion.matches;
    viewButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.archiveView === (showBookshelf ? 'bookshelf' : 'timeline'))));
    bookshelf?.setActive(showBookshelf && count > 0);
  };
  const filter = () => {
    count = 0;
    const ids = new Set<string>();
    for (const { group, articles } of entries) {
      let yearCount = 0;
      for (const article of articles) {
        const matched = matchesSearch(article.dataset.search ?? '', input.value);
        article.hidden = !matched;
        if (matched) { yearCount++; ids.add(article.dataset.articleId ?? ''); }
      }
      group.hidden = yearCount === 0;
      count += yearCount;
    }
    clear.hidden = input.value.length === 0;
    empty.hidden = count > 0 || total === 0;
    status.textContent = input.value.trim()
      ? `找到 ${count} 篇文章，共 ${total} 篇`
      : `共 ${total} 篇文章，按时间倒序`;
    bookshelf?.setItems(ids);
    syncView();
  };
  const reset = () => {
    input.value = '';
    filter();
    input.focus();
  };
  form.hidden = false;
  form.addEventListener('submit', (event) => { event.preventDefault(); filter(); });
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; filter(); });
  input.addEventListener('input', () => { if (!composing) filter(); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); reset(); }
  });
  clear.addEventListener('click', reset);
  viewButtons.forEach((button) => button.addEventListener('click', () => {
    view = button.dataset.archiveView === 'bookshelf' ? 'bookshelf' : 'timeline';
    syncView();
  }));
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      if (bookshelfRoot?.contains(document.activeElement) || viewSwitch?.contains(document.activeElement)) input.focus({ preventScroll: true });
      view = 'timeline';
    }
    syncView();
  });
  // Also handles a browser-restored search value after navigating back.
  window.addEventListener('pageshow', filter);
  filter();
}
