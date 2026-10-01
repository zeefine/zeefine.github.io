import { createSoftlightMotion } from './softlight';

const header = document.querySelector<HTMLElement>('.home-header');
const menu = document.querySelector<HTMLElement>('#home-navigation');
const toggle = document.querySelector<HTMLButtonElement>('.menu-toggle');
const mobile = matchMedia('(max-width: 767px)');

if (header && menu && toggle) {
  header.classList.add('js-menu');
  const setOpen = (open: boolean, restoreFocus = false) => {
    header.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '关闭导航' : '打开导航');
    menu.inert = mobile.matches && !open;
    if (open) requestAnimationFrame(() => {
      if (toggle.getAttribute('aria-expanded') === 'true') menu.querySelector<HTMLAnchorElement>('a')?.focus();
    });
    else if (restoreFocus) toggle.focus();
  };
  const syncLayout = () => {
    const hadFocus = menu.contains(document.activeElement);
    toggle.hidden = !mobile.matches;
    setOpen(false, mobile.matches && hadFocus);
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') setOpen(false, true);
  });
  document.addEventListener('click', (event) => {
    if (event.target instanceof Node && !header.contains(event.target)) setOpen(false);
  });
  menu.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
  });
  header.addEventListener('focusout', (event) => {
    if (event.relatedTarget instanceof Node && !header.contains(event.relatedTarget)) setOpen(false);
  });
  mobile.addEventListener('change', syncLayout);
  syncLayout();
}

const motionControl = document.querySelector<HTMLButtonElement>('.motion-control');
const animatedCopy = document.querySelector<HTMLElement>('.text-shimmer');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const softlight = document.querySelector<HTMLElement>('.softlight');
const softlightMotion = createSoftlightMotion(softlight);
const lightLayers = Array.from(document.querySelectorAll<HTMLElement>('.light-follow'));
const followStrengths = [.65, .45, .8];
let following = false;
let followFrame = 0;
let lastFrameTime = 0;
let targetX = 0;
let targetY = 0;
let currentX = 0;
let currentY = 0;

const drawFollow = () => {
  lightLayers.forEach((layer, index) => {
    const strength = followStrengths[index] ?? .65;
    layer.style.transform = `translate3d(${currentX * strength}px, ${currentY * strength}px, 0)`;
  });
};
const animateFollow = (time: number) => {
  // Time-based damping keeps the same gentle response on different refresh rates.
  const easing = 1 - Math.exp(-Math.min(time - lastFrameTime, 64) / 420);
  lastFrameTime = time;
  currentX += (targetX - currentX) * easing;
  currentY += (targetY - currentY) * easing;
  const settled = Math.abs(targetX - currentX) < .1 && Math.abs(targetY - currentY) < .1;
  if (settled) { currentX = targetX; currentY = targetY; }
  drawFollow();
  followFrame = settled ? 0 : requestAnimationFrame(animateFollow);
};
const moveFollow = (x: number, y: number) => {
  if (!following) return;
  targetX = x;
  targetY = y;
  if (!followFrame) {
    lastFrameTime = performance.now();
    followFrame = requestAnimationFrame(animateFollow);
  }
};
document.addEventListener('pointermove', (event) => {
  if (!following || event.pointerType !== 'mouse' || !softlight) return;
  const bounds = softlight.getBoundingClientRect();
  if (event.clientY < bounds.top || event.clientY > bounds.bottom) {
    moveFollow(0, 0);
    return;
  }
  // Pull the existing upper-right light field toward the pointer in pixels.
  // A small normalized offset was imperceptible against these broad gradients.
  moveFollow(
    Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)) - bounds.width * .8,
    Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)) - bounds.height * .4,
  );
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => moveFollow(0, 0));
window.addEventListener('blur', () => moveFollow(0, 0));
window.addEventListener('resize', () => moveFollow(0, 0));

let manuallyPaused = false;
try { manuallyPaused = sessionStorage.getItem('fine-motion-paused') === 'true'; } catch { /* Motion controls work without storage. */ }

const syncMotion = () => {
  const running = !reducedMotion.matches && !manuallyPaused && !document.hidden;
  softlightMotion.sync(running, reducedMotion.matches);
  animatedCopy?.style.setProperty('--copy-motion-play-state', running ? 'running' : 'paused');
  following = running && finePointer.matches && lightLayers.length > 0;
  cancelAnimationFrame(followFrame);
  followFrame = 0;
  if (reducedMotion.matches || !finePointer.matches) {
    targetX = targetY = currentX = currentY = 0;
    drawFollow();
  } else if (following) {
    moveFollow(0, 0);
  }
  if (motionControl) {
    motionControl.hidden = reducedMotion.matches;
    const label = manuallyPaused ? '播放页面动效' : '暂停页面动效';
    motionControl.setAttribute('aria-label', label);
    motionControl.title = label;
    motionControl.querySelectorAll<HTMLElement>('[data-motion-icon]').forEach((icon) => {
      icon.hidden = icon.dataset.motionIcon !== (manuallyPaused ? 'play' : 'pause');
    });
  }
};
motionControl?.addEventListener('click', () => {
  manuallyPaused = !manuallyPaused;
  try { sessionStorage.setItem('fine-motion-paused', String(manuallyPaused)); } catch { /* Keep the in-memory preference. */ }
  syncMotion();
});
reducedMotion.addEventListener('change', syncMotion);
finePointer.addEventListener('change', syncMotion);
document.addEventListener('visibilitychange', syncMotion);
syncMotion();
