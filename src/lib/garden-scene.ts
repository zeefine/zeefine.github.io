import * as THREE from 'three';
import { createGardenTree } from './garden-tree';
import { createGardenGrass } from './garden-grass';
import { createGardenFlowers } from './garden-flowers';
import { createGardenMotion, createGardenWindClock } from './garden-motion';
import { GARDEN_REFERENCE_FRAME, type GardenGrowthStage } from './garden-growth';
import { createWaterDrops } from './garden-water-drops';
import { createWateringClock, wateringDrops } from './garden-watering-motion';
import { createGrowthClock, growthTransitionSeconds } from './garden-growth-transition';

export type GardenStudy = 'tree' | 'leaf' | 'twig';

export interface GardenScene {
  readonly windTime: number;
  water: () => void;
  setStage: (stage: GardenGrowthStage, options?: { animate?: boolean; afterWater?: boolean }) => void;
  setView: (view: number) => void;
  setLeafEdges: (enabled: boolean) => void;
  setLeafBlades: (enabled: boolean) => void;
  setTwigs: (enabled: boolean) => void;
  setWindTravel: (enabled: boolean) => void;
  setWindPaused: (paused: boolean) => void;
  seekWind: (seconds: number) => void;
  setStudy: (study: GardenStudy) => void;
  dispose: () => void;
}

/** A self-contained renderer, loaded only when the tree enters the viewport. */
export function createGardenScene(host: HTMLElement, onError: () => void, onWindTime?: (seconds: number) => void,
  initialStage: GardenGrowthStage = 'growing', onGrowthChange?: (growing: boolean) => void): GardenScene {
  let disposed = false;
  let initializing = true;
  let frame = 0;
  const cleanups: Array<() => void> = [];

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    frame = 0;
    for (const cleanup of cleanups.reverse()) {
      try { cleanup(); }
      catch { /* Keep releasing resources if an individual cleanup fails. */ }
    }
    cleanups.length = 0;
  }
  function fail() {
    if (disposed) return;
    dispose();
    onError();
  }
  function guard<Args extends unknown[]>(callback: (...args: Args) => void) {
    return (...args: Args) => {
      if (disposed) return;
      try { callback(...args); }
      catch (error) {
        fail();
        // The caller must not mark an unsuccessfully initialized scene ready.
        if (initializing) throw error;
      }
    };
  }

  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    cleanups.push(() => renderer.domElement.remove(), () => renderer.dispose());
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);

    let tree = createGardenTree(initialStage);
    cleanups.push(() => tree.dispose());

    const scene = new THREE.Scene();
    scene.add(tree.group);
    const meadow = createGardenGrass();
    scene.add(meadow.group);
    cleanups.push(() => meadow.dispose());
    const flowers = createGardenFlowers();
    scene.add(flowers.group);
    cleanups.push(() => flowers.dispose());
    let waterDrops = createWaterDrops(tree.wateringTargets);
    scene.add(waterDrops.mesh);
    cleanups.push(() => waterDrops.dispose());
    const watering = createWateringClock();
    let dropTargets = tree.wateringTargets;
    let growth: { clock: ReturnType<typeof createGrowthClock>; transition: ReturnType<typeof tree.growFrom> } | undefined;
    cleanups.push(() => { growth = undefined; onGrowthChange?.(false); });
    function finishGrowth() {
      if (!growth) return;
      growth.transition.finish();
      growth = undefined;
      onGrowthChange?.(false);
    }
    function replaceDrops(targets: typeof dropTargets) {
      waterDrops.dispose();
      dropTargets = targets;
      waterDrops = createWaterDrops(targets);
      scene.add(waterDrops.mesh);
      tree.setWateringTargets(targets);
    }
    function stopWatering() {
      watering.stop();
      waterDrops.update(-1);
      tree.setWateringTime(-1);
    }
    // Keep the mature frame across stages so actual structural growth stays visible.
    const size = new THREE.Vector3(GARDEN_REFERENCE_FRAME.width, GARDEN_REFERENCE_FRAME.height, GARDEN_REFERENCE_FRAME.depth);
    const center = new THREE.Vector3(0, GARDEN_REFERENCE_FRAME.centerY, 0);
    const camera = new THREE.OrthographicCamera(-5, 5, 4, -4, .1, 100);
    // A slight downward view reveals the meadow while retaining the front silhouette.
    const gardenCameraLift = 3.2;
    camera.position.set(0, center.y + gardenCameraLift, 18);
    camera.lookAt(0, center.y, 0);

    const sky = new THREE.HemisphereLight(0xf5f7e7, 0x566150, 0.85);
    const sunlight = new THREE.DirectionalLight(0xf4f7e6, 3.2);
    cleanups.push(() => sunlight.shadow.map?.dispose());
    sunlight.position.set(-6, 10, 8);
    sunlight.target.position.set(0, 3, 0);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    Object.assign(sunlight.shadow.camera, { left: -7, right: 7, top: 8, bottom: -7, near: .1, far: 30 });
    sunlight.shadow.bias = -.0002;
    sunlight.shadow.normalBias = .035;
    sunlight.shadow.radius = 2;
    const rim = new THREE.DirectionalLight(0xc9dec0, 0.3);
    rim.position.set(4, 7, -5);
    scene.add(sky, sunlight, sunlight.target, rim);

    const groundGeometry = new THREE.PlaneGeometry(30, 30);
    cleanups.push(() => groundGeometry.dispose());
    const groundMaterial = new THREE.ShadowMaterial({ color: 0x354731, opacity: .07 });
    cleanups.push(() => groundMaterial.dispose());
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -.025;
    ground.receiveShadow = true;
    scene.add(ground);

    const motion = createGardenMotion();
    const windClock = createGardenWindClock();
    let lastTime: number | null = null;
    let windPaused = false;
    let lastWindNotice = -Infinity;
    let leafEdges = true;
    let leafBlades = true;
    let twigs = true;
    let windTravel = true;
    let study: GardenStudy = 'tree';
    let leafStudy: ReturnType<typeof tree.createLeafStudy> | undefined;
    let twigStudy: ReturnType<typeof tree.createTwigStudy> | undefined;
    function releaseStudies() {
      leafStudy?.dispose();
      twigStudy?.dispose();
      leafStudy = undefined;
      twigStudy = undefined;
    }
    cleanups.push(releaseStudies);
    let visible = true;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const systemDark = matchMedia('(prefers-color-scheme: dark)');
    const motionControl = document.querySelector('.motion-control');
    // Use the shared control's rendered state; it also works when storage is blocked.
    const manuallyPaused = () => motionControl?.querySelector<HTMLElement>('[data-motion-icon="play"]')?.hidden === false;
    const motionAllowed = () => !reduced.matches && !manuallyPaused();
    const hasWind = () => study === 'tree' || leafEdges || leafBlades || (twigs && study !== 'leaf');
    const windPlaying = () => hasWind() && !windPaused;
    const shouldAnimate = () => motionAllowed() && (windPlaying() || motion.turning || watering.active || !!growth);

    function render() {
      if (disposed) return;
      if (study === 'tree') tree.sortLeaves(camera);
      if (study === 'twig') twigStudy?.sortLeaves(camera);
      renderer.render(scene, camera);
    }
    const tick: FrameRequestCallback = guard((now: number) => {
      frame = 0;
      if (document.hidden || !visible) return;
      const delta = lastTime === null ? 0 : (now - lastTime) / 1000;
      lastTime = now;
      if (motionAllowed()) {
        const changingView = motion.turning;
        motion.advance(delta);
        if (growth) {
          growth.clock.advance(delta);
          growth.transition.update(growth.clock.seconds);
          if (!growth.clock.active) {
            growth = undefined;
            onGrowthChange?.(false);
          }
        }
        if (watering.active) {
          watering.advance(delta);
          waterDrops.update(watering.seconds);
          tree.setWateringTime(watering.seconds);
        }
        if (windPlaying()) {
          tree.updateMotion(windClock.tick(now));
          meadow.update(windClock.seconds);
          flowers.update(windClock.seconds);
          // The development timeline needs only four updates per second.
          if (import.meta.env.DEV && onWindTime && now - lastWindNotice >= 250) {
            lastWindNotice = now;
            onWindTime(windClock.seconds);
          }
        }
        // Only an explicit, finite view change writes the tree's viewing angle.
        if (changingView) tree.group.rotation.y = motion.rotation;
        waterDrops.mesh.rotation.y = motion.rotation;
      }
      render();
      if (!disposed && shouldAnimate()) frame = requestAnimationFrame(tick);
    });
    const sync = guard(() => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = null;
      windClock.suspend();
      if (import.meta.env.DEV) onWindTime?.(windClock.seconds);
      tree.setLeafEdges(leafEdges && !reduced.matches);
      tree.setLeafBlades(leafBlades && !reduced.matches);
      tree.setTwigs(twigs && !reduced.matches && study !== 'leaf');
      tree.setWindTravel(windTravel);
      meadow.setMotion(!reduced.matches);
      flowers.setMotion(!reduced.matches);
      if (!motionAllowed()) {
        // Never queue a shower to play later when motion is re-enabled.
        stopWatering();
        finishGrowth();
        motion.finishView();
        tree.group.rotation.y = motion.rotation;
      }
      if (!document.hidden && visible) {
        render();
        if (!disposed && shouldAnimate()) frame = requestAnimationFrame(tick);
      }
    });
    const resize = guard(() => {
      const { width, height } = host.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height);
      const aspect = width / height;
      // Leave some breathing room around the canopy and keep every view in frame.
      const twigBounds = study === 'twig' && twigStudy ? new THREE.Box3().setFromObject(twigStudy.group) : undefined;
      const twigSize = twigBounds?.getSize(new THREE.Vector3());
      const focus = twigBounds?.getCenter(new THREE.Vector3()) ?? (study === 'leaf' ? new THREE.Vector3(0, .5, 0) : center);
      const halfHeight = twigSize ? Math.max(twigSize.y * .65, twigSize.x * .65 / aspect, .25)
        : study === 'leaf' ? Math.max(.65, .4 / aspect)
        : Math.max(size.y * .56, Math.max(size.x, size.z) * .58 / aspect);
      camera.position.set(study === 'twig' ? focus.x : 0, focus.y + (study === 'tree' ? gardenCameraLift : .025), study === 'twig' ? focus.z + 18 : 18);
      camera.lookAt(study === 'twig' ? focus.x : 0, focus.y, study === 'twig' ? focus.z : 0);
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      sync();
    });
    const theme = guard(() => {
      const explicit = document.documentElement.dataset.theme;
      const dark = explicit === 'dark' || (!explicit && systemDark.matches);
      renderer.toneMappingExposure = dark ? 0.98 : 1.05;
      sky.intensity = dark ? 0.7 : 0.85;
      sunlight.intensity = dark ? 2.8 : 3.2;
      groundMaterial.opacity = dark ? .12 : .07;
      sync();
    });
    const resizeObserver = new ResizeObserver(resize);
    cleanups.push(() => resizeObserver.disconnect());
    resizeObserver.observe(host);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    cleanups.push(() => visibilityObserver.disconnect());
    visibilityObserver.observe(host);
    const themeObserver = new MutationObserver(theme);
    cleanups.push(() => themeObserver.disconnect());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const pauseObserver = new MutationObserver(sync);
    cleanups.push(() => pauseObserver.disconnect());
    if (motionControl) pauseObserver.observe(motionControl, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    const contextLost = (event: Event) => {
      event.preventDefault();
      fail();
    };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    cleanups.push(() => renderer.domElement.removeEventListener('webglcontextlost', contextLost));
    reduced.addEventListener('change', sync);
    cleanups.push(() => reduced.removeEventListener('change', sync));
    systemDark.addEventListener('change', theme);
    cleanups.push(() => systemDark.removeEventListener('change', theme));
    document.addEventListener('visibilitychange', sync);
    cleanups.push(() => document.removeEventListener('visibilitychange', sync));
    theme();
    resize();
    if (disposed) throw new Error('Garden scene failed during initialization.');
    initializing = false;

    return {
      get windTime() { return windClock.seconds; },
      water: guard(() => {
        if (!motionAllowed() || document.hidden || !visible || study !== 'tree') return;
        // Let the first shower start growth; later input must not cut it short.
        if (growth && growth.clock.seconds > 0) return;
        if (!growth && dropTargets !== tree.wateringTargets) replaceDrops(tree.wateringTargets);
        watering.start();
        waterDrops.mesh.rotation.y = motion.rotation;
        waterDrops.update(0);
        tree.setWateringTime(0);
        sync();
      }),
      setStage: guard((stage: GardenGrowthStage, options: { animate?: boolean; afterWater?: boolean } = {}) => {
        if (stage === tree.stage) {
          if (!options.animate && growth) { finishGrowth(); sync(); }
          return;
        }
        finishGrowth();
        const next = createGardenTree(stage);
        const previous = tree;
        const duration = growthTransitionSeconds(previous.stage, stage);
        const animate = options.animate && duration > 0
          && study === 'tree' && motionAllowed() && !document.hidden && visible;
        if (animate) {
          const delay = options.afterWater
            ? Math.min(...wateringDrops(previous.wateringTargets).map(drop => drop.delay + drop.duration)) : 0;
          growth = { clock: createGrowthClock(delay, duration), transition: next.growFrom(previous, duration) };
          growth.transition.update(0);
          onGrowthChange?.(true);
        }
        stopWatering();
        next.group.rotation.y = motion.rotation;
        next.updateMotion(windClock.seconds);
        releaseStudies();
        study = 'tree';
        ground.visible = true;
        meadow.group.visible = true;
        flowers.group.visible = true;
        tree = next;
        replaceDrops(animate && options.afterWater ? previous.wateringTargets : next.wateringTargets);
        scene.add(tree.group);
        previous.group.removeFromParent();
        previous.dispose();
        resize();
      }),
      setView(view) {
        motion.setView(view, motionAllowed());
        tree.group.rotation.y = motion.rotation;
        sync();
      },
      setLeafEdges(enabled) { leafEdges = enabled; sync(); },
      setLeafBlades(enabled) { leafBlades = enabled; sync(); },
      setTwigs(enabled) { twigs = enabled; sync(); },
      setWindTravel(enabled) { windTravel = enabled; sync(); },
      setWindPaused(paused) {
        if (!import.meta.env.DEV) return;
        windPaused = paused;
        sync();
      },
      seekWind(seconds) {
        if (!import.meta.env.DEV || reduced.matches) return;
        windPaused = true;
        windClock.seek(seconds);
        tree.updateMotion(windClock.seconds);
        meadow.update(windClock.seconds);
        flowers.update(windClock.seconds);
        sync();
      },
      setStudy(mode) {
        if (!import.meta.env.DEV || mode === study) return;
        finishGrowth();
        stopWatering();
        if (mode === 'leaf' && !leafStudy) {
          leafStudy = tree.createLeafStudy();
          scene.add(leafStudy.mesh);
        }
        if (mode === 'twig' && !twigStudy) {
          twigStudy = tree.createTwigStudy();
          scene.add(twigStudy.group);
        }
        study = mode;
        if (leafStudy) leafStudy.mesh.visible = mode === 'leaf';
        if (twigStudy) twigStudy.group.visible = mode === 'twig';
        tree.group.visible = mode === 'tree';
        ground.visible = mode === 'tree';
        meadow.group.visible = mode === 'tree';
        flowers.group.visible = mode === 'tree';
        motion.finishView();
        tree.group.rotation.y = motion.rotation;
        resize();
      },
      dispose,
    };
  } catch (error) {
    fail();
    throw error;
  }
}
