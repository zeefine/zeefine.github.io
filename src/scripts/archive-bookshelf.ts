// Keep the Astro search/timeline as the source of truth. Dataset values also let
// the React island pick up searches made before it finishes hydrating.
export function createArchiveBookshelf(root: HTMLElement) {
  let revision = 0;
  let currentIds: Set<string> | null = null;
  const notify = () => root.dispatchEvent(new Event('archive:change'));
  return {
    setItems(ids: Set<string>) {
      // Display order comes from the articles; only membership changes reset the shelf.
      const previousIds = currentIds;
      if (previousIds && previousIds.size === ids.size && [...ids].every((id) => previousIds.has(id))) return;
      currentIds = new Set(ids);
      root.dataset.ids = JSON.stringify([...ids]);
      root.dataset.revision = String(++revision);
      notify();
    },
    setActive(active: boolean) {
      if (root.dataset.active === String(active)) return;
      root.dataset.active = String(active);
      notify();
    },
  };
}
