import { documentLocale, message, ui } from '../i18n/ui';
import { loadCarbonResult } from '../lib/carbon';

const badge = document.querySelector<HTMLElement>('[data-carbon-badge]');
const value = badge?.querySelector<HTMLElement>('[data-carbon-value]');
const caption = badge?.querySelector<HTMLElement>('[data-carbon-caption]');
const pageUrl = badge?.dataset.pageUrl;

// Only measure the deployed page: localhost and preview hosts are not public results.
if (badge && value && caption && pageUrl && window.location.origin === new URL(pageUrl).origin) {
  const locale = documentLocale();
  const t = ui[locale];
  async function measure() {
    if (!badge || !value || !caption || !pageUrl) return;
    value.textContent = t.carbonLoading;
    badge.setAttribute('aria-busy', 'true');
    try {
      let storage: Storage | null = null;
      try { storage = window.localStorage; } catch { /* Measurement also works without storage. */ }
      const result = await loadCarbonResult(pageUrl, storage);
      const number = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const grams = result.grams > 0 && result.grams < 0.01 ? `<${number.format(0.01)}` : number.format(result.grams);
      value.textContent = `${grams} g CO₂ ${t.carbonPerView}`;
      caption.textContent = message(locale, 'carbonCleaner', { percent: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(result.cleaner) });
    } catch {
      value.textContent = t.carbonUnavailable;
      caption.textContent = t.carbonError;
    } finally {
      badge.removeAttribute('aria-busy');
    }
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void measure();
    }, { rootMargin: '200px' });
    observer.observe(badge);
  } else {
    void measure();
  }
}
