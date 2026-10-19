import { useEffect, useRef, useState } from 'react';
import type { Locale } from '../i18n/ui';
import { createGardenProgress, GARDEN_WATERING_KEY, type GardenProgress } from '../lib/garden-progress';
import { WATERING_SECONDS } from '../lib/garden-watering-motion';

const copy = {
  zh: { water: '浇水', watering: '浇水中…', growing: '生长中…', total: '累计浇水', unit: '次',
    unsaved: '当前浏览器无法保存进度，关闭或刷新页面后可能丢失。' },
  en: { water: 'Water', watering: 'Watering…', growing: 'Growing…', total: 'Total waterings', unit: '',
    unsaved: 'This browser cannot save progress. It may be lost when you close or reload the page.' },
};

export default function GardenWatering({ locale, ready, growing, onProgress, onWater }: {
  locale: Locale; ready: boolean; growing: boolean; onProgress: (count: number, source: 'restore' | 'water') => void; onWater: () => void;
}) {
  const t = copy[locale];
  const store = useRef<ReturnType<typeof createGardenProgress> | null>(null);
  const waterTimer = useRef<number | null>(null);
  const [progress, setProgress] = useState<GardenProgress | null>(null);
  const [watering, setWatering] = useState(false);

  useEffect(() => {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* Continue with this visit's in-memory count. */ }
    const controller = createGardenProgress(storage);
    store.current = controller;
    const restore = () => {
      const saved = controller.read();
      setProgress(saved);
      onProgress(saved.count, 'restore');
    };
    const receive = (event: StorageEvent) => {
      if (storage && event.storageArea === storage && (event.key === GARDEN_WATERING_KEY || event.key === null)) restore();
    };
    restore();
    window.addEventListener('storage', receive);
    return () => {
      window.removeEventListener('storage', receive);
      if (waterTimer.current !== null) window.clearTimeout(waterTimer.current);
      waterTimer.current = null;
      store.current = null;
    };
  }, [onProgress]);

  function water() {
    if (!ready || growing || !store.current || waterTimer.current !== null) return;
    setWatering(true);
    waterTimer.current = window.setTimeout(() => {
      waterTimer.current = null;
      setWatering(false);
    }, WATERING_SECONDS * 1000);
    const next = store.current.water();
    setProgress(next);
    onProgress(next.count, 'water');
    onWater();
  }

  // Stay mounted while the renderer loads so it can start at the saved growth stage.
  if (!ready || !progress) return null;
  return <div className="garden-watering">
    <button type="button" className="garden-water-button" disabled={watering || growing} data-watering={watering} onClick={water}>
      <svg className="garden-water-drop" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3S5.5 10.3 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10.3 12 3 12 3Z" />
        <path d="M9 15a3 3 0 0 0 3 3" />
      </svg>
      <span>{watering ? t.watering : growing ? t.growing : t.water}</span>
    </button>
    <p className="garden-water-count" role="status" aria-live="polite" aria-atomic="true">
      {t.total} <strong>{progress.count.toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')}</strong>{t.unit && ` ${t.unit}`}
    </p>
    {!progress.persisted && <p className="garden-water-note">{t.unsaved}</p>}
  </div>;
}
