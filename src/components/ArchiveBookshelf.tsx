import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import arrowRight from '@phosphor-icons/core/assets/light/arrow-right-light.svg?raw';
import { htmlLang, ui, type Locale } from '../i18n/ui';

const NewsletterBookshelf = lazy(() => import('./ui/newsletter-bookshelf').then((module) => ({ default: module.NewsletterBookshelf })));
export interface ArchiveItem { id: string; title: string; description: string; date: string; href: string; contentLocale: Locale }

function FallbackList({ items, locale }: { items: ArchiveItem[]; locale: Locale }) {
  return <div className="bookshelf-fallback">
    <p>{ui[locale].shelfFallback}</p>
    <ul>{items.map((item) => <li key={item.id} lang={htmlLang(item.contentLocale)}><a href={item.href}>{item.title}</a><time>{item.date}</time></li>)}</ul>
  </div>;
}
class ShelfBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function ShelfView({ items, locale }: { items: ArchiveItem[]; locale: Locale }) {
  const t = ui[locale];
  const [selected, setSelected] = useState<ArchiveItem | null>(null);
  const [height, setHeight] = useState(520);
  const [ready, setReady] = useState(false);
  const [palette, setPalette] = useState(['#486450', '#e9eee6', '#b7cbae', '#f9faf7', '#29342d']);
  useEffect(() => {
    const small = matchMedia('(max-width: 767px)');
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      const css = getComputedStyle(document.documentElement);
      setPalette(['--accent', '--code-surface', '--sage-light', '--surface-raised', '--text'].map((name) => css.getPropertyValue(name).trim()));
      setHeight(small.matches ? 440 : 520);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    small.addEventListener('change', update);
    dark.addEventListener('change', update);
    let alive = true;
    document.fonts.ready.then(() => { if (alive) setReady(true); });
    return () => { alive = false; observer.disconnect(); small.removeEventListener('change', update); dark.removeEventListener('change', update); };
  }, []);
  const books = useMemo(() => items.map((item, index) => ({
    id: item.id, title: item.title, date: item.date.replaceAll('-', '.'),
    href: item.href, color: palette[index % 4], foil: index % 4 === 0 ? palette[3] : palette[4],
  })), [items, palette]);
  const loading = <div className="bookshelf-loading" style={{ height }} role="status">{t.shelfLoading}</div>;
  return <>
    <ShelfBoundary fallback={<FallbackList items={items} locale={locale} />}>
      <Suspense fallback={loading}>
        {ready ? <NewsletterBookshelf items={books} brand="FINE" height={height} locale={locale}
          onSelect={(book) => setSelected(items.find((item) => item.id === book.id) ?? null)} onClose={() => setSelected(null)} /> : loading}
      </Suspense>
    </ShelfBoundary>
    <div className="bookshelf-detail" aria-live="polite" aria-atomic="true">
      {selected ? <article>
        <div lang={htmlLang(selected.contentLocale)}><time dateTime={selected.date}>{selected.date.replaceAll('-', '.')}</time><h2>{selected.title}</h2><p>{selected.description}</p></div>
        <a className="text-link" href={selected.href}>{t.readFull}<span className="link-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: arrowRight }} /></a>
        {locale === 'en' && selected.contentLocale === 'zh' && <span className="original-label">{t.original}</span>}
      </article> : <p>{t.shelfPrompt}</p>}
    </div>
  </>;
}

export default function ArchiveBookshelf({ items, locale }: { items: ArchiveItem[]; locale: Locale }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ active: false, ids: items.map((item) => item.id), revision: '0' });
  useEffect(() => {
    const root = hostRef.current?.closest<HTMLElement>('#archive-bookshelf');
    if (!root) return;
    const sync = () => setState({ active: root.dataset.active === 'true', ids: JSON.parse(root.dataset.ids ?? '[]') as string[], revision: root.dataset.revision ?? '0' });
    sync();
    root.addEventListener('archive:change', sync);
    return () => root.removeEventListener('archive:change', sync);
  }, []);
  const visible = useMemo(() => items.filter((item) => state.ids.includes(item.id)), [items, state.ids]);
  return <div ref={hostRef}>{state.active && visible.length > 0 && <ShelfView key={state.revision} items={visible} locale={locale} />}</div>;
}
