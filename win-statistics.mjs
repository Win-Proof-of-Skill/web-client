import { assertWinResponse, escapeText } from './win-security.mjs';

const PAGE_SIZE = 100;
const MAX_RECORDS = 10000;
const MAX_PAGES = MAX_RECORDS / PAGE_SIZE;
const DIRECTORIES = ['profiles', 'contracts', 'endorsements', 'skills'];
const LABELS = {
  profiles: 'Public profiles',
  contracts: 'Contracts',
  endorsements: 'Endorsements',
  skills: 'Registered skills',
};

function abortIfStale(isCurrent) {
  if (!isCurrent()) {
    const error = new Error('Statistics request is no longer current.');
    error.name = 'AbortError';
    throw error;
  }
}

/**
 * Read only the existing public directories. Their totals include every published
 * record, irrespective of contract or endorsement status. Only profiles and
 * skills need pagination; the other directories supply their own complete total.
 *
 * Available totals survive a failed scan. A failed or capped scan never becomes
 * a purported network-wide skill distribution. Callers should ignore AbortError
 * when navigation or a wallet/network change makes this request stale.
 */
export async function loadNetworkStatistics(read, { isCurrent = () => true, onProgress } = {}) {
  if (typeof read !== 'function') throw new TypeError('A public-directory reader is required.');
  const result = {
    totals: Object.fromEntries(DIRECTORIES.map((kind) => [kind, null])),
    profilesPerSkill: [],
    profilesScanned: 0,
    skillsScanned: 0,
    breakdownComplete: false,
    issues: [],
    status: 'unavailable',
    updatedAt: null,
  };

  async function directory(kind, scan) {
    let cursor = '',
      total = null,
      revision,
      pages = 0;
    const records = [],
      seenIds = new Set(),
      seenCursors = new Set();
    try {
      do {
        abortIfStale(isCurrent);
        const path = `/${kind}?limit=${PAGE_SIZE}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`;
        const response = await read(path);
        pages += 1;
        abortIfStale(isCurrent);
        if (!response || response.error) throw new Error('The public directory could not be loaded. Try refreshing.');
        const page = assertWinResponse(path, response);
        if (!Array.isArray(page.records)) throw new Error('The gateway did not return a public directory.');
        if (
          page.registryRevision !== undefined &&
          (!Number.isSafeInteger(page.registryRevision) || page.registryRevision < 0)
        ) {
          throw new Error('The public directory returned an invalid revision.');
        }
        if (total === null) {
          total = page.total;
          revision = page.registryRevision;
          result.totals[kind] = total;
        } else if (total !== page.total || revision !== page.registryRevision) {
          throw new Error('The directory changed while loading. Refresh to get a consistent skill distribution.');
        }
        if (!scan) {
          if (onProgress) onProgress({ directory: kind, loaded: page.records.length, total, complete: true });
          return null;
        }
        for (const record of page.records) {
          if (seenIds.has(record.id)) throw new Error('The directory repeated records. Refresh or check your gateway.');
          seenIds.add(record.id);
          records.push(record);
        }
        result[kind === 'profiles' ? 'profilesScanned' : 'skillsScanned'] = records.length;
        if (records.length > total) throw new Error('The directory count changed while loading. Please refresh.');
        const next = page.nextCursor || '';
        if (next && (seenCursors.has(next) || next === cursor || !page.records.length)) {
          throw new Error('The directory repeated a page. Refresh or check your gateway.');
        }
        if (onProgress) onProgress({ directory: kind, loaded: records.length, total, complete: !next });
        if (next && (records.length >= MAX_RECORDS || pages >= MAX_PAGES)) {
          throw new Error(
            `The skill distribution is limited to ${MAX_RECORDS.toLocaleString()} records per directory. Reported totals remain available.`
          );
        }
        if (next) seenCursors.add(next);
        cursor = next;
      } while (cursor);
      if (records.length !== total)
        throw new Error('The directory ended before all records were loaded. Please refresh.');
      return records;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      abortIfStale(isCurrent);
      result.issues.push({ directory: kind, message: error.message || 'This public directory is unavailable.' });
      return null;
    }
  }

  const [profiles, , , skills] = await Promise.all(
    DIRECTORIES.map((kind) => directory(kind, kind === 'profiles' || kind === 'skills'))
  );
  abortIfStale(isCurrent);
  if (profiles && skills) {
    const counts = new Map(skills.map((skill) => [skill.id, { id: skill.id, name: skill.name, profiles: 0 }]));
    let missingSkill = false;
    for (const profile of profiles) {
      // Repeated skills on one profile still count as one profile for that skill.
      for (const id of new Set((profile.details.skills || []).map((skill) => skill.skillId))) {
        if (!counts.has(id)) {
          missingSkill = true;
          continue;
        }
        counts.get(id).profiles += 1;
      }
    }
    if (missingSkill) {
      result.issues.push({
        directory: 'skills',
        message:
          'Some profile skills were not found in the current registry. Refresh to get a consistent skill distribution.',
      });
    } else {
      result.profilesPerSkill = [...counts.values()].sort(
        (a, b) => b.profiles - a.profiles || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
      );
      result.breakdownComplete = true;
    }
  }
  result.status =
    result.issues.length === 0
      ? 'complete'
      : DIRECTORIES.some((kind) => result.totals[kind] !== null)
      ? 'partial'
      : 'unavailable';
  result.updatedAt = new Date().toISOString();
  return result;
}

const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : 'Unavailable');

/** All record labels and diagnostics are escaped before insertion into the page. */
export function renderStatistics(data) {
  const totals = data?.totals || {};
  const rows = data?.breakdownComplete && Array.isArray(data.profilesPerSkill) ? data.profilesPerSkill : [];
  const max = Math.max(
    1,
    ...rows.map((row) => (Number.isSafeInteger(row.profiles) && row.profiles >= 0 ? row.profiles : 0))
  );
  const cards = DIRECTORIES.map(
    (kind) =>
      `<article class="win-stat-card"><span class="win-stat-label">${
        LABELS[kind]
      }</span><strong class="win-stat-value">${count(totals[kind])}</strong></article>`
  ).join('');
  const issues = Array.isArray(data?.issues) ? data.issues : [];
  const notice = issues.length
    ? `<div class="win-stat-notice" role="status"><h3>Some statistics are unavailable</h3><ul>${issues
        .map(
          (issue) =>
            `<li><strong>${escapeText(LABELS[issue.directory] || 'Directory')}:</strong> ${escapeText(
              issue.message
            )}</li>`
        )
        .join('')}</ul></div>`
    : '';
  const chart = !data?.breakdownComplete
    ? '<p class="win-stat-empty">The complete profiles-per-skill distribution could not be loaded. Refresh to try again. Partial scans are not shown as network totals.</p>'
    : !rows.length
    ? '<p class="win-stat-empty">No skills have been registered yet.</p>'
    : `<div class="win-stat-table-wrap"><table class="win-stat-table"><caption>Number of public profiles listing each registered skill</caption><thead><tr><th scope="col">Skill</th><th scope="col">Profiles</th></tr></thead><tbody>${rows
        .map((row) => {
          const value = Number.isSafeInteger(row.profiles) && row.profiles >= 0 ? row.profiles : 0;
          const width = Math.round((value / max) * 100);
          return `<tr><th scope="row"><span class="win-stat-skill-name">${escapeText(
            row.name
          )}</span><span class="win-stat-bar-track" aria-hidden="true"><span class="win-stat-bar" style="width:${width}%"></span></span></th><td>${count(
            value
          )}</td></tr>`;
        })
        .join('')}</tbody></table></div>`;
  const time =
    typeof data?.updatedAt === 'string' && !Number.isNaN(Date.parse(data.updatedAt))
      ? `<p class="win-stat-updated">Last refreshed <time datetime="${escapeText(data.updatedAt)}">${escapeText(
          new Date(data.updatedAt).toLocaleString()
        )}</time></p>`
      : '';
  return `<div class="win-stat-overview">${cards}</div><p class="win-stat-description">Totals cover all published public records, including completed contracts and expired or revoked endorsements. Each directory is read at refresh time; the counts are not a single network snapshot.</p>${notice}<section class="win-stat-distribution" aria-labelledby="win-stat-skills-title"><div class="win-stat-section-heading"><h3 id="win-stat-skills-title">Profiles by skill</h3><p>Each profile counts once per skill. A profile may have several skills.</p></div>${chart}</section>${time}`;
}
