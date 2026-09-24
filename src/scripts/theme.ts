const root = document.documentElement;
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
const controls = document.querySelectorAll<HTMLButtonElement>('.theme-toggle');
let preference: string | null = root.dataset.theme ?? null;

const updateTheme = () => {
  const dark = preference ? preference === 'dark' : systemTheme.matches;
  if (preference) root.dataset.theme = preference;
  else delete root.dataset.theme;
  controls.forEach((button) => {
    button.hidden = false;
    const label = dark ? '切换为浅色外观' : '切换为深色外观';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.querySelectorAll<HTMLElement>('[data-theme-icon]').forEach((icon) => {
      icon.hidden = icon.dataset.themeIcon !== (dark ? 'sun' : 'moon');
    });
  });
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#18221e' : '#f4f6f2');
};

controls.forEach((button) => button.addEventListener('click', () => {
  const dark = preference ? preference === 'dark' : systemTheme.matches;
  preference = dark ? 'light' : 'dark';
  try { localStorage.setItem('fine-theme', preference); } catch { /* The toggle still works for this page. */ }
  updateTheme();
}));
systemTheme.addEventListener('change', updateTheme);
window.addEventListener('storage', (event) => {
  if (event.key === 'fine-theme' || event.key === null) {
    preference = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : null;
    updateTheme();
  }
});
updateTheme();
