// Helpers at browser trust boundaries. None of these functions accept HTML.
export const escapeText = (value) => String(value ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

export function highlightText(value, query) {
  const text = String(value ?? '');
  if (!query) return escapeText(text);
  const expression = new RegExp(String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  let result = '', offset = 0;
  for (const match of text.matchAll(expression)) {
    result += escapeText(text.slice(offset, match.index)) + '<mark>' + escapeText(match[0]) + '</mark>';
    offset = match.index + match[0].length;
  }
  return result + escapeText(text.slice(offset));
}

const isLoopback = hostname => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
export function secureGateway(gateway, pageUrl) {
  const page = new URL(pageUrl);
  if (page.protocol !== 'https:' && !(page.protocol === 'http:' && isLoopback(page.hostname))) {
    throw new Error('Open WIN over HTTPS before using a wallet.');
  }
  const validate = (value, websocket) => {
    const url = new URL(value);
    const secure = websocket ? 'wss:' : 'https:';
    const insecure = websocket ? 'ws:' : 'http:';
    const local = isLoopback(page.hostname) && isLoopback(url.hostname);
    if (url.username || url.password || url.search || url.hash ||
        (url.protocol !== secure && !(local && url.protocol === insecure))) {
      throw new Error('The WIN gateway needs HTTPS/WSS. Update network.js with a secure gateway.');
    }
    return url.href.replace(/\/$/, '');
  };
  if (!gateway?.web) throw new Error('No WIN gateway is configured.');
  return { ...gateway, web: validate(gateway.web, false),
    ...(gateway.ws ? {ws:validate(gateway.ws, true)} : {}) };
}

export function protectAccount(data, lock, key, encrypt) {
  if (!lock || !key) throw new Error('Set and unlock your wallet password before saving account data.');
  const encrypted = encrypt(data, key, true);
  if (typeof encrypted !== 'string' || !encrypted || encrypted === data) {
    throw new Error('Wallet encryption failed. Account data was not saved.');
  }
  return encrypted;
}

// Prepare and verify every record before changing storage. Roll back successful
// writes on storage errors. This cannot make localStorage crash-atomic.
export function rekeyAccounts(storage, entries, oldKey, newKey, verifier, decrypt, encrypt) {
  if (!newKey || !verifier) throw new Error('A wallet password is required.');
  const writes = new Map();
  for (const [name, stored] of entries) {
    const plain = oldKey ? decrypt(stored, oldKey, true) : stored;
    if (typeof plain !== 'string' || !plain) throw new Error('Unable to unlock every account. Nothing was changed.');
    let parsed;
    try { parsed = JSON.parse(plain); } catch { throw new Error('Unreadable account data. Nothing was changed.'); }
    if (!parsed?.account?.keys?.secret) throw new Error('Invalid account data. Nothing was changed.');
    const cipher = protectAccount(plain, verifier, newKey, encrypt);
    if (decrypt(cipher, newKey, true) !== plain) throw new Error('Wallet encryption check failed. Nothing was changed.');
    writes.set(name, cipher);
  }
  writes.set('lock', verifier);
  const before = new Map([...writes.keys()].map(name => [name, storage.getItem(name)]));
  const committed = [];
  try {
    for (const [name, value] of writes) {
      storage.setItem(name, value);
      committed.push(name);
    }
  } catch (error) {
    for (const name of committed.reverse()) {
      const value = before.get(name);
      if (value === null) storage.removeItem(name); else storage.setItem(name, value);
    }
    throw error;
  }
}

export function assertWinResponse(path, response) {
  const kind = path.split('/')[1]?.split('?')[0];
  if (!['profiles','contracts','skills','endorsements','scores'].includes(kind)) return response;
  const fail = () => { throw new Error('The WIN server returned invalid records. Refresh or check your gateway.'); };
  const id = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const decimal = value => typeof value === 'number' ? integer(value) : typeof value === 'bigint' ? value >= 0n :
    (typeof value === 'string' && /^\d{1,100}$/.test(value));
  const record = r => {
    if (kind === 'scores') { if (r !== null && !decimal(r)) fail(); return; }
    if (!r || typeof r !== 'object' || !id(r.id)) fail();
    for (const field of ['revision','termsRevision','updatedAt','createdAt','validUntil','approvalExpiresAt']) {
      if (r[field] !== undefined && !integer(r[field])) fail();
    }
    if (r.owner !== undefined && !id(r.owner)) fail();
    if (r.managers !== undefined && (!Array.isArray(r.managers) || !r.managers.every(id))) fail();
    if (kind === 'profiles') {
      if (typeof r.displayName !== 'string' || !r.details || typeof r.details !== 'object') fail();
      if (r.score != null && !decimal(r.score)) fail();
      if (r.details.skills !== undefined && (!Array.isArray(r.details.skills) || !r.details.skills.every(s => id(s?.skillId)))) fail();
    }
    if (kind === 'skills' && typeof r.name !== 'string') fail();
    if (kind === 'contracts') {
      if (typeof r.title !== 'string' || !integer(r.terms?.durationMonths) ||
          !Array.isArray(r.approvals) || !Array.isArray(r.hiringProfileIds) || !r.hiringProfileIds.every(id) ||
          !id(r.workerProfileId) || !Array.isArray(r.periodOutcomes)) fail();
    }
  };
  if (Object.hasOwn(response, 'records')) {
    if (!Array.isArray(response.records) || response.records.length > 100 ||
        !integer(response.total) || (response.nextCursor != null && !id(response.nextCursor))) fail();
    response.records.forEach(record);
  } else if (Object.hasOwn(response, 'record')) record(response.record);
  else fail();
  return response;
}
