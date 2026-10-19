import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '../i18n/ui';
import type { GardenScene, GardenStudy } from '../lib/garden-scene';
import type { GardenGrowthStage } from '../lib/garden-growth';
// GARDEN_DEBUG：恢复调试时，取消本文件所有 GARDEN_DEBUG 代码块的注释。
// import { GARDEN_GROWTH_STAGES } from '../lib/garden-growth';
import { growthStageForWaterings } from '../lib/garden-progress';
import GardenWatering from './GardenWatering';

const copy = {
  zh: {
    descriptions: {
      growing: '一棵树干较细、枝条短小、叶冠疏朗的小树。',
      medium: '一棵树干渐粗、侧枝伸展、叶冠逐渐丰满的中树。',
      mature: '一棵树干微弯、树冠向两侧舒展的小乔木，浅绿叶簇之间露出细枝。',
    },
    growth: '成长阶段', stages: { growing: '小树', medium: '中树', mature: '大树' },
    previewNote: '阶段按钮仅用于预览，不改变浇水次数；小树 → 中树、中树 → 大树均可预览生长过渡。浇水后回到实际成长阶段。',
    leafDescription: '放大的单片叶子，叶柄固定，叶片向叶尖逐渐弯曲，两侧叶缘轻微起伏。',
    twigDescription: '放大的一根细枝，随上级小枝轻柔摆动，枝梢弯曲，叶子保持连接。',
    loading: '正在展开枝叶…',
    unavailable: '暂时无法显示 3D 树，请启用 WebGL 后重试。',
    retry: '重新加载',
    views: '观察方向',
    front: '正面', side: '侧面', back: '背面',
    debug: '生长与风动调试', layers: '运动层', edges: '叶缘', blades: '叶片主体', branches: '细枝',
    travel: '风力流动',
    freeze: '定格风动', resume: '继续风动', timeline: '时间轴', seconds: '秒',
    timelineNote: '拖动时间轴会定格枝叶，可切换运动层对比同一时刻。播放仍遵循页面顶部的暂停设置。',
    study: '单叶检查', twigStudy: '单枝检查', tree: '返回整树',
    motionNote: '细枝层包含小枝带动叶簇的摆动与末端弯曲。相邻叶簇错开，主干和粗主枝固定。风力流动调节强弱；三层全部关闭恢复静态。',
    studyNote: '当前放大一片叶子，摆幅比例不变。叶柄固定，主体弯曲向叶尖逐渐增加。',
    twigNote: '当前放大一根细枝，摆幅比例不变。其根部随上级小枝移动；关闭两层叶片动效，可观察枝梢弯曲与叶柄连接。',
    reduced: '系统已开启减少动态效果，枝叶保持静止。',
  },
  en: {
    descriptions: {
      growing: 'A small tree with a slender trunk, short branches and a sparse crown.',
      medium: 'A medium tree with a thickening trunk, extending branches and a fuller crown.',
      mature: 'A gently curved tree with an irregular spreading crown, small green leaves and visible fine branches.',
    },
    growth: 'Growth stage', stages: { growing: 'Small', medium: 'Medium', mature: 'Large' },
    previewNote: 'Stage buttons preview the shape without changing your count. Preview growth from Small to Medium or Medium to Large. Watering returns to your actual stage.',
    leafDescription: 'An enlarged leaf with an anchored base, a gently bending blade and flexing edges.',
    twigDescription: 'An enlarged twig following its parent branch, with a gently bending tip and connected leaves.',
    loading: 'Unfolding the branches…',
    unavailable: 'The 3D tree could not be displayed. Please enable WebGL and try again.',
    retry: 'Try again',
    views: 'Viewing direction',
    front: 'Front', side: 'Side', back: 'Back',
    debug: 'Growth & wind study', layers: 'Motion layers', edges: 'Leaf edges', blades: 'Leaf blades', branches: 'Twigs',
    travel: 'Traveling breeze',
    freeze: 'Freeze wind', resume: 'Resume wind', timeline: 'Timeline', seconds: 'seconds',
    timelineNote: 'Scrub to freeze the leaves and compare layers at the same instant. Playback also respects the page’s pause control.',
    study: 'Inspect one leaf', twigStudy: 'Inspect one twig', tree: 'Return to tree',
    motionNote: 'Twigs includes leaf-cluster sway and terminal flex. Neighbouring clusters alternate; the trunk and thick limbs stay fixed. Traveling breeze varies strength. Turn all three layers off for a static tree.',
    studyNote: 'One leaf is enlarged without amplifying its motion. Its base stays fixed; blade bending increases toward the tip.',
    twigNote: 'One twig is enlarged at the same relative amplitude. Its root follows its parent branch. Turn off both leaf layers to inspect the tip and leaf attachments.',
    reduced: 'Reduced motion is enabled. Branches and leaves remain still.',
  },
};

export default function TreeStudy({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<GardenScene | null>(null);
  const savedStage = useRef<GardenGrowthStage>('growing');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<GardenGrowthStage>('growing');
  const [growing, setGrowing] = useState(false);
  const [study, setStudy] = useState<GardenStudy>('tree');
  /* GARDEN_DEBUG：保留视角与面板状态，当前只展示正面整树。
  const debugOpen = useRef(false);
  const [view, setView] = useState(0);
  const [edges, setEdges] = useState(true);
  const [blades, setBlades] = useState(true);
  const [twigs, setTwigs] = useState(true);
  const [travel, setTravel] = useState(true);
  const [windPaused, setWindPaused] = useState(false);
  const [windTime, setWindTime] = useState(0);
  const timelineTime = Math.round(windTime * 20) / 20;
  const [reduced, setReduced] = useState(false);
  const changeStudy = (mode: GardenStudy) => { setStudy(mode); scene.current?.setStudy(mode); };
  */
  const description = study === 'leaf' ? t.leafDescription : study === 'twig' ? t.twigDescription : t.descriptions[stage];
  const applyProgress = useCallback((count: number, source: 'restore' | 'water') => {
    const next = growthStageForWaterings(count);
    savedStage.current = next;
    setStage(next);
    setStudy('tree');
    scene.current?.setStage(next, { animate: source === 'water', afterWater: true });
    scene.current?.setStudy('tree');
  }, []);

  /* GARDEN_DEBUG：调试面板的减少动态效果提示；场景本身仍正常遵循系统偏好。
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(preference.matches);
    sync();
    preference.addEventListener('change', sync);
    return () => preference.removeEventListener('change', sync);
  }, []);
  */

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setStage(savedStage.current);
    setGrowing(false);
    /* GARDEN_DEBUG：重新初始化调试面板。
    setView(0);
    setEdges(true);
    setBlades(true);
    setTwigs(true);
    setTravel(true);
    setWindPaused(false);
    setWindTime(0);
    debugOpen.current = false;
    */
    setStudy('tree');
    import('../lib/garden-scene').then(({ createGardenScene }) => {
      if (cancelled || !host.current) return;
      const onWindTime = undefined;
      /* GARDEN_DEBUG：恢复此回调时，移除上方的 const onWindTime = undefined。
      const onWindTime = import.meta.env.DEV ? (seconds: number) => {
        if (!cancelled && debugOpen.current) setWindTime(seconds);
      } : undefined;
      */
      scene.current = createGardenScene(host.current, () => {
        if (!cancelled) setStatus('error');
      }, onWindTime, savedStage.current, active => {
        if (!cancelled) setGrowing(active);
      });
      setStatus('ready');
    }).catch(() => { if (!cancelled) setStatus('error'); });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [attempt]);

  return (
    <section className="tree-study" aria-label={description}>
      <div className="tree-study-canvas">
        <div ref={host} className="tree-study-renderer" role="img" aria-label={description} hidden={status === 'error'} />
        {status !== 'ready' && <p className="tree-study-fallback" role="status">
          {status === 'loading' ? t.loading : t.unavailable}
        </p>}
      </div>
      <GardenWatering locale={locale} ready={status === 'ready'} growing={growing} onProgress={applyProgress} onWater={() => scene.current?.water()} />
      {/* GARDEN_DEBUG：视角切换与调试面板暂不渲染，保留全部控件以便恢复。
      {status === 'ready' && <div className="tree-study-controls">
        <div className="tree-study-views" role="group" aria-label={t.views}>
          {[t.front, t.side, t.back].map((label, index) => <button key={index} type="button"
            aria-pressed={view === index} disabled={study !== 'tree'} onClick={() => { setView(index); scene.current?.setView(index); }}>
            {label}
          </button>)}
        </div>
      </div>}
      {import.meta.env.DEV && status === 'ready' && <details className="tree-study-debug" onToggle={event => {
        debugOpen.current = event.currentTarget.open;
        if (debugOpen.current) setWindTime(scene.current?.windTime ?? 0);
      }}>
        <summary>{t.debug}</summary>
        <div className="tree-study-controls tree-study-growth" role="group" aria-label={t.growth}>
          <span>{t.growth}</span>
          {GARDEN_GROWTH_STAGES.map(next => <button key={next} type="button" aria-pressed={stage === next} onClick={() => {
            if (next === stage) return;
            scene.current?.setStage(next, { animate: true }); setStage(next); setStudy('tree');
          }}>{t.stages[next]}</button>)}
        </div>
        <p className="tree-study-note">{t.previewNote}</p>
        <div className="tree-study-controls" role="group" aria-label={t.layers}>
          <button type="button" aria-pressed={edges && !reduced} disabled={reduced} onClick={() => {
            setEdges(!edges); scene.current?.setLeafEdges(!edges);
          }}>{t.edges}</button>
          <button type="button" aria-pressed={blades && !reduced} disabled={reduced} onClick={() => {
            setBlades(!blades); scene.current?.setLeafBlades(!blades);
          }}>{t.blades}</button>
          <button type="button" aria-pressed={twigs && !reduced && study !== 'leaf'} disabled={reduced || study === 'leaf'} onClick={() => {
            setTwigs(!twigs); scene.current?.setTwigs(!twigs);
          }}>{t.branches}</button>
          <button type="button" aria-pressed={travel && !reduced} disabled={reduced} onClick={() => {
            setTravel(!travel); scene.current?.setWindTravel(!travel);
          }}>{t.travel}</button>
          <button type="button" aria-pressed={study === 'leaf'} onClick={() => changeStudy(study === 'leaf' ? 'tree' : 'leaf')}>
            {study === 'leaf' ? t.tree : t.study}
          </button>
          <button type="button" aria-pressed={study === 'twig'} onClick={() => changeStudy(study === 'twig' ? 'tree' : 'twig')}>
            {study === 'twig' ? t.tree : t.twigStudy}
          </button>
        </div>
        <div className="tree-study-controls tree-study-timeline">
          <button type="button" disabled={reduced} onClick={() => {
            setWindPaused(!windPaused); scene.current?.setWindPaused(!windPaused);
          }}>{windPaused ? t.resume : t.freeze}</button>
          <label className="tree-study-scrubber">
            <span>{t.timeline}</span>
            <input type="range" min="0" max="8" step="0.05" value={timelineTime} disabled={reduced}
              aria-valuetext={`${timelineTime.toFixed(2)} ${t.seconds}`} onChange={event => {
                const seconds = Number(event.currentTarget.value);
                setWindPaused(true); setWindTime(seconds); scene.current?.seekWind(seconds);
              }} />
          </label>
          <span className="tree-study-time">{timelineTime.toFixed(2)} / 8.00 s</span>
        </div>
        {!reduced && <p className="tree-study-note">{t.timelineNote}</p>}
        <p className="tree-study-note">{reduced ? t.reduced : study === 'leaf' ? t.studyNote : study === 'twig' ? t.twigNote : t.motionNote}</p>
      </details>}
      */}
      {status === 'error' && <div className="tree-study-controls">
        <button type="button" onClick={() => setAttempt(attempt + 1)}>{t.retry}</button>
      </div>}
    </section>
  );
}
