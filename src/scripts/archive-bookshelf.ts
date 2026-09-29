// Keep the Astro search/timeline as the source of truth. Dataset values also let
// the React island pick up searches made before it finishes hydrating.
export function createArchiveBookshelf(root: HTMLElement) {
  let revision = 0;
  const notify = () => root.dispatchEvent(new Event('archive:change'));
  return {
    setItems(ids: Set<string>) {
      root.dataset.ids = JSON.stringify([...ids]);
      root.dataset.revision = String(++revision);
      notify();
    },
    setActive(active: boolean) {
      root.dataset.active = String(active);
      notify();
    },
  };
}
