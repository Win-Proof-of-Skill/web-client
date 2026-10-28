const pages = new Set(['profiles', 'contracts', 'contacts', 'wallet', 'statistics']);
export function parseWinRoute(hash = '') {
  const match = String(hash).match(/^#\/(profiles|contracts)(?:\/([a-f0-9]{64}))?\/?$/i);
  if (match)
    return {
      view: match[2] ? (match[1].toLowerCase() === 'profiles' ? 'profile' : 'contract') : match[1].toLowerCase(),
      ...(match[2] ? { id: match[2].toLowerCase() } : {}),
    };
  const view = String(hash).replace(/^#\//, '').replace(/\/$/, '');
  return { view: pages.has(view) ? view : 'profiles' };
}
export function winRouteHash(view, id) {
  if (['profile', 'contract'].includes(view) && /^[a-f0-9]{64}$/i.test(id || ''))
    return `#/${view}s/${id.toLowerCase()}`;
  return '#/' + (pages.has(view) ? view : 'profiles');
}
export function createWinNavigation({ session, onNavigate }) {
  let disposed = false;
  const render = () =>
    !disposed && session() ? Promise.resolve(onNavigate(parseWinRoute(location.hash))) : Promise.resolve();
  const changed = () => {
    void render();
  };
  window.addEventListener('hashchange', changed);
  return {
    async navigate(view, id, { replace = false } = {}) {
      const hash = winRouteHash(view, id);
      if (location.hash !== hash) history[replace ? 'replaceState' : 'pushState'](null, '', hash);
      await render();
    },
    async resume() {
      const route = parseWinRoute(location.hash);
      const hash = winRouteHash(route.view, route.id);
      if (location.hash !== hash) history.replaceState(null, '', hash);
      await render();
    },
    dispose() {
      disposed = true;
      window.removeEventListener('hashchange', changed);
    },
  };
}
