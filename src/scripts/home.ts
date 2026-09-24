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
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let manuallyPaused = false;
try { manuallyPaused = sessionStorage.getItem('fine-motion-paused') === 'true'; } catch { /* Motion controls work without storage. */ }

const syncMotion = () => {
  document.documentElement.classList.toggle('motion-running', !reducedMotion.matches && !manuallyPaused && !document.hidden);
  if (motionControl) {
    motionControl.hidden = reducedMotion.matches;
    motionControl.textContent = manuallyPaused ? '播放柔光' : '暂停柔光';
    motionControl.setAttribute('aria-label', manuallyPaused ? '播放背景柔光动效' : '暂停背景柔光动效');
  }
};
motionControl?.addEventListener('click', () => {
  manuallyPaused = !manuallyPaused;
  try { sessionStorage.setItem('fine-motion-paused', String(manuallyPaused)); } catch { /* Keep the in-memory preference. */ }
  syncMotion();
});
reducedMotion.addEventListener('change', syncMotion);
document.addEventListener('visibilitychange', syncMotion);
syncMotion();
