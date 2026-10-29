export const FEED_HOUR = 3600000;
export function feedContacts(contacts = {}) {
  const addresses = Object.keys(contacts).map(value => value.replace(/^0x/i, '').toLowerCase())
    .filter(value => /^[a-f0-9]{40}(?:0{24})?$/.test(value)).map(value => value.slice(0, 40));
  const unique = [...new Set(addresses)].sort();
  if (unique.length > 500) throw new Error('The feed currently supports up to 500 contacts.');
  return unique;
}
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
export async function feedSigningMessage(envelope) {
  const bytes = new TextEncoder().encode(JSON.stringify([
    envelope.address, envelope.networkId, envelope.origin, envelope.action, envelope.timestamp, envelope.nonce, envelope.data,
  ]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'WIN Feed v1\n' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export function createFeedTransport({ session, sign, fetcher = fetch, origin = location.origin }) {
  return async (action, data, signal) => {
    const initial = session();
    if (!initial) throw new Error('Sign in to your WIN wallet to use the feed.');
    const same = () => { if (session() !== initial) throw new Error('Wallet changed. Reopen the feed.'); };
    const envelope = { address: initial.address, networkId: initial.networkId, origin, action,
      timestamp: Date.now(), nonce: randomId(), data };
    envelope.signature = await sign(await feedSigningMessage(envelope), initial);
    same();
    const response = await fetcher('/feed-api/v1', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope), credentials: 'omit', cache: 'no-store', signal: signal || AbortSignal.timeout(20000) });
    same();
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || (response.status === 404 || response.status === 502 ? 'The feed service is not available yet.' : 'Could not reach the feed. Please try again.'));
    }
    const value = action === 'image' ? await response.blob() : await response.json();
    same();
    return value;
  };
}
const el = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const button = (label, action, secondary = true) => {
  const element = el('button', label, 'win-button' + (secondary ? ' secondary' : ''));
  element.type = 'button'; element.addEventListener('click', action); return element;
};
const fileData = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = () => reject(new Error('Unable to read this image.'));
  reader.readAsDataURL(file);
});

export function createContactFeed(api) {
  let root, form, text, files, preview, error, list, status, more, publish, feedTab, mineTab, profileSelect;
  let active = false, owner = null, scope = 'feed', generation = 0, timer, controller, cache = null;
  let urls = [], previewUrl = null, draftId = null, posting = false;
  const request = api.request;
  const message = value => { if (error) error.textContent = value; };
  const revoke = () => { urls.forEach(url => URL.revokeObjectURL(url)); urls = []; };
  const same = initial => active && owner === initial && api.session() === initial;
  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null; preview?.replaceChildren();
  }
  function initialize() {
    if (root) return;
    root = document.getElementById('winFeed');
    const heading = el('div', null, 'win-page-heading');
    const title = el('div'); title.append(el('span', 'YOUR PROFESSIONAL CIRCLE', 'win-kicker'), el('h1', 'Contact feed'),
      el('p', 'Updates from accepted profile connections, refreshed once an hour.'));
    heading.append(title); root.append(heading);
    profileSelect = el('select'); profileSelect.setAttribute('aria-label', 'Your feed profile');
    const profileLabel = el('label', 'Use feed as', 'win-field'); profileLabel.append(profileSelect); root.append(profileLabel);
    profileSelect.addEventListener('change', () => { api.select(profileSelect.value); void thisOpen(); });
    form = el('form', null, 'win-feed-composer');
    const label = el('label', 'Share an update', 'win-field');
    text = el('textarea'); text.name = 'post'; text.rows = 4; text.maxLength = 3000; text.placeholder = 'Share your work, an achievement, or something you learned…'; label.append(text);
    const imageLabel = el('label', 'Add one image (optional)', 'win-field');
    files = el('input'); files.type = 'file'; files.accept = 'image/jpeg,image/png,image/webp'; imageLabel.append(files);
    preview = el('div', null, 'win-feed-preview');
    publish = el('button', 'Publish post', 'win-button'); publish.type = 'submit';
    form.append(label, imageLabel, el('p', 'JPEG, PNG, or WebP · Up to 2 MB · No videos. Posts are available only to your accepted profile connections.', 'win-feed-hint'), preview, publish);
    error = el('p', '', 'win-feed-message'); error.setAttribute('role', 'status');
    const tabs = el('div', null, 'win-feed-tabs');
    const select = next => { scope = next; void load(); };
    feedTab = button('From contacts', () => select('feed')); mineTab = button('Your posts', () => select('mine'));
    tabs.append(feedTab, mineTab);
    status = el('p', '', 'win-feed-hint'); status.setAttribute('aria-live', 'polite');
    list = el('div', null, 'win-feed-list');
    more = button('Load more posts', () => void load(true)); more.hidden = true;
    root.append(form, error, tabs, status, list, more);
    text.addEventListener('input', () => { draftId = null; });
    files.addEventListener('change', () => {
      draftId = null; clearPreview(); message('');
      const file = files.files[0]; if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
        files.value = ''; message('Choose a JPEG, PNG, or WebP image of up to 2 MB. Videos are not supported.'); return;
      }
      previewUrl = URL.createObjectURL(file);
      const image = el('img'); image.src = previewUrl; image.alt = 'Selected post image';
      preview.append(image, button('Remove image', () => { files.value = ''; draftId = null; clearPreview(); }));
    });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (posting) return;
      const initial = owner;
      if (!same(initial)) return;
      const content = text.value.trim(), file = files.files[0];
      if (!content && !file) { message('Write an update or choose an image.'); return; }
      if (content.length > 3000 || (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024))) {
        message('Use up to 3,000 characters and one still image under 2 MB.'); return;
      }
      posting = true; publish.disabled = true; text.disabled = true; files.disabled = true;
      draftId ||= randomId();
      const requestId = draftId;
      message('Publishing your update…');
      try {
        const image = file ? await fileData(file) : null;
        if (!same(initial)) return;
        await request('publish', { text: content, image, requestId });
        if (!same(initial)) return;
        form.reset(); clearPreview(); draftId = null;
        message('Published. Your contacts will see this on their next hourly refresh.');
        scope = 'mine'; await load();
      } catch (e) { if (same(initial)) message(e.message + ' You can retry this post safely.'); }
      finally { if (owner === initial) { posting = false; publish.disabled = false; text.disabled = false; files.disabled = false; } }
    });
  }
  let page = null;
  async function render(posts, initial, token, signal) {
    revoke(); list.replaceChildren();
    if (!posts.length) list.append(el('div', scope === 'mine' ? 'You haven’t published any posts yet.' : 'No updates from accepted connections yet. Send a request in Contacts and wait for acceptance.', 'win-empty'));
    const images = [];
    for (const post of posts) {
      if (!/^[1-9][0-9]{0,15}$/.test(post.id) || !/^[a-f0-9]{64}$/.test(post.author)) continue;
      const article = el('article', null, 'win-feed-post');
      let profile; try { profile = await api.profile(post.author); } catch {}
      if (!same(initial) || token !== generation) return;
      article.append(el('h2', post.author === api.selected() ? 'You · ' + (profile?.displayName || 'Your profile') : profile?.displayName || `${post.author.slice(0, 8)}…${post.author.slice(-6)}`));
      const address = el('p', post.author, 'win-feed-author'); address.title = 'WIN profile ID'; article.append(address);
      const time = el('time', new Date(post.created).toLocaleString()); time.dateTime = new Date(post.created).toISOString(); article.append(time);
      article.append(el('p', post.text, 'win-feed-text'));
      if (post.hasImage) { const image = el('img'); image.alt = 'Image shared with this post'; image.loading = 'lazy'; article.append(image); images.push([post, image]); }
      if (post.author === api.selected()) article.append(button('Delete post', async () => {
        if (!window.confirm('Delete this post and its image?')) return;
        try { await request('delete', { id: post.id }); if (!same(initial)) return; message('Post deleted.'); cache = null; await load(); }
        catch (e) { if (same(initial)) message(e.message); }
      }));
      list.append(article);
    }
    // Limit concurrent protected image requests instead of opening one request per post at once.
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, images.length) }, async () => {
      while (next < images.length && same(initial) && token === generation) {
        const [post, image] = images[next++];
        try {
          const blob = await request('image', { id: post.id, profileId: api.selected() }, signal);
          if (!same(initial) || token !== generation) return;
          if (blob.type !== 'image/webp') throw new Error('Unexpected image format');
          const url = URL.createObjectURL(blob); urls.push(url); image.src = url;
        } catch { if (same(initial) && token === generation) image.replaceWith(el('p', 'Image unavailable.', 'win-feed-hint')); }
      }
    }));
  }
  async function load(append = false) {
    if (!active) return;
    clearTimeout(timer); controller?.abort(); controller = new AbortController();
    const initial = owner, token = ++generation, selected = scope;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]);
    more.disabled = true;
    feedTab.setAttribute('aria-pressed', String(scope === 'feed')); mineTab.setAttribute('aria-pressed', String(scope === 'mine'));
    try {
      const fingerprint = api.selected();
      let result;
      if (!append && scope === 'feed' && cache && cache.fingerprint === fingerprint && Date.now() < cache.nextRefreshAt) result = cache;
      else {
        status.textContent = 'Loading posts…';
        result = await request(selected, { profileId: api.selected(), ...(append && page?.nextCursor ? { before: page.nextCursor } : {}) }, signal);
        if (!Array.isArray(result.posts) || !Number.isFinite(result.nextRefreshAt) || !Number.isFinite(result.refreshedAt)) throw new Error('The feed returned an invalid response.');
        if (!same(initial) || token !== generation) return;
        if (append) result.posts = [...(page?.posts || []), ...result.posts].filter((p, i, a) => a.findIndex(x => x.id === p.id) === i);
        if (selected === 'feed') cache = { ...result, fingerprint };
      }
      if (!same(initial) || token !== generation) return;
      page = result; more.hidden = !result.nextCursor;
      status.textContent = selected === 'feed'
        ? `Last refreshed ${new Date(result.refreshedAt).toLocaleTimeString()}. Next update ${new Date(result.nextRefreshAt).toLocaleTimeString()}.`
        : 'Your published posts. Your contacts receive updates once an hour.';
      await render(result.posts, initial, token, signal);
      if (same(initial) && token === generation && selected === 'feed') timer = setTimeout(() => void load(), Math.max(1000, result.nextRefreshAt - Date.now()));
    } catch (e) {
      if (!same(initial) || token !== generation) return;
      status.textContent = e.name === 'TimeoutError' ? 'The feed timed out. Please try again.' : e.message;
      // Avoid displaying another tab's or removed contacts' stale content after a failed request.
      revoke(); list.replaceChildren(button('Try again', () => void load())); more.hidden = true;
    } finally { if (token === generation) more.disabled = false; }
  }
  async function thisOpen() {
    initialize();
    const initial = api.session();
    if (owner !== initial) result.reset();
    owner = initial; active = !!owner;
    if (!active) return;
    try {
      await api.ensureProfile();
      if (!same(initial)) return;
      profileSelect.replaceChildren(...api.profiles().map(profile => { const option = el('option', profile.displayName); option.value = profile.id; return option; }));
      profileSelect.value = api.selected() || '';
      form.hidden = !api.selected();
      if (!api.selected()) { status.textContent = 'Create a profile first, then connect with people in Contacts.'; return; }
      await load();
    } catch (e) { if (same(initial)) status.textContent = e.message; }
  }
  const result = {
    open: thisOpen,
    leave() { active = false; generation++; clearTimeout(timer); controller?.abort(); revoke(); list?.replaceChildren(); },
    reset() {
      this.leave(); owner = null; cache = null; page = null; scope = 'feed'; draftId = null; posting = false;
      form?.reset(); profileSelect?.replaceChildren(); clearPreview(); message('');
      if (publish) { publish.disabled = false; text.disabled = false; files.disabled = false; }
    },
  };
  return result;
}
