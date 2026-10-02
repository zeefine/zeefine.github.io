import { documentLocale, ui } from '../i18n/ui';

const header = document.querySelector<HTMLElement>('[data-site-header]');
const menu = document.querySelector<HTMLElement>('[data-navigation]');
const toggle = document.querySelector<HTMLButtonElement>('.menu-toggle');
const mobile = matchMedia('(max-width: 767px)');
const t = ui[documentLocale()];

if (header && menu && toggle) {
  header.classList.add('js-menu');
  const setOpen = (open: boolean, restoreFocus = false) => {
    header.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? t.closeMenu : t.openMenu);
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
