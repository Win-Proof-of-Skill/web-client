import { assertWinResponse } from './win-security.mjs';
import {
  WIN_TOKEN,
  controls,
  formatUnits,
  parseAmount,
  isId,
  profileContent,
  contractContent,
} from './win-domain.mjs';
import { tokenBalance, connectBnb, fundBnb, checkDeposit } from './win-bnb.mjs';
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
const short = (value) => (value ? `${value.slice(0, 10)}…${value.slice(-6)}` : '—');
const date = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';
const score = (value) => (value == null ? 'Unavailable' : formatUnits(value, 6));
const button = (action, label, id = '', secondary = false) =>
  `<button type="button" class="win-button${
    secondary ? ' secondary' : ''
  }" data-win-action="${action}" data-id="${escape(id)}">${label}</button>`;
const input = (name, label, value = '', attrs = '') =>
  `<label class="win-field">${label}<input name="${name}" value="${escape(value)}" ${attrs}></label>`;
const area = (name, label, value = '', attrs = '') =>
  `<label class="win-field">${label}<textarea name="${name}" rows="4" maxlength="4000" ${attrs}>${escape(
    value
  )}</textarea></label>`;
const select = (name, label, entries, value, attrs = '') =>
  `<label class="win-field">${label}<select name="${name}" ${attrs}>${entries
    .map(
      ([id, text]) =>
        `<option value="${escape(id)}" ${value === id ? 'selected' : ''}>${escape(text)}</option>`
    )
    .join('')}</select></label>`;
const badge = (value) => `<span class="win-badge">${escape(String(value || '').replaceAll('_', ' '))}</span>`;
const empty = (title, text, action = '') =>
  `<div class="win-empty"><span class="win-empty-mark" aria-hidden="true">◎</span><h3>${title}</h3><p>${text}</p>${action}</div>`;
const allText = (value) =>
  typeof value === 'object' && value !== null
    ? Array.isArray(value)
      ? value.map(allText).join(' · ')
      : Object.entries(value)
          .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1')}: ${allText(v)}`)
          .join('\n')
    : String(value ?? '');

export function createWinWorkspace(api) {
  let owned = [],
    skills = [],
    profiles = [],
    contracts = [],
    cursor = null,
    mine = false,
    generation = 0,
    editing = null,
    context = null,
    busy = false;
  const dialog = document.getElementById('winDialog');
  const body = dialog.querySelector('.win-dialog-body');
  const status = document.getElementById('winStatus');
  const session = () => api.session();
  const sameSession = (initial) =>
    session()?.address === initial?.address && session()?.networkId === initial?.networkId;
  const note = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  };
  const skillName = (id) => skills.find((s) => s.id === id)?.name || short(id);
  async function read(path) {
    const value = await api.read(path);
    if (!value || value.error)
      throw new Error(
        typeof value?.error === 'string'
          ? value.error
          : 'The WIN network is unavailable. Check your connection and gateway, then retry.'
      );
    return assertWinResponse(path, value);
  }
  async function all(kind, query = '') {
    const records = [];
    let next = '';
    do {
      const page = await read(`/${kind}?limit=100${query}${next ? '&cursor=' + next : ''}`);
      if (!Array.isArray(page.records))
        throw new Error('Update the WIN server to enable the profile directory.');
      records.push(...page.records);
      next = page.nextCursor;
      if (records.length > 10000) throw new Error('Directory is too large. Use a narrower search.');
    } while (next);
    return records;
  }
  async function loadIdentity() {
    const initial = session();
    if (!initial) throw new Error('Sign in to a WIN wallet to continue.');
    const result = await Promise.all([all('profiles', '&owner=' + initial.address), all('skills')]);
    if (!sameSession(initial)) throw new Error('Wallet changed. Open this screen again.');
    [owned, skills] = result;
  }
  function modal(title, html) {
    dialog.querySelector('h2').textContent = title;
    body.innerHTML = html;
    dialog.querySelector('.win-dialog-error').textContent = '';
    updateProfileFields();
    dialog.scrollTop = 0;
    if (!dialog.open) dialog.showModal();
  }
  function closeModal() {
    if (!busy) {
      dialog.close();
      editing = null;
      context = null;
    }
  }
  dialog.querySelector('[data-close]').addEventListener('click', closeModal);
  dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  function form(kind, contents, label = 'Review & sign') {
    return `<form data-win-form="${kind}">${contents}<p class="win-help">Published profile and work records are public. A native WIN network fee applies.</p><div class="win-form-footer"><button class="win-button" type="submit">${label}</button></div></form>`;
  }
  async function review(type, action, record, payload, extra = {}) {
    const initial = session();
    const prepared = await api.prepare(type, action, record, payload, extra);
    if (!sameSession(initial)) throw new Error('Wallet changed. Review the action again.');
    const summary = `${action.replaceAll('_', ' ')} ${type}`;
    context = { prepared, initial };
    modal(
      'Review your signature',
      `<div class="win-review"><span class="win-kicker">${escape(summary)}</span><h3>${escape(
        payload?.displayName || payload?.title || payload?.name || record?.title || 'Public skill endorsement'
      )}</h3><dl><dt>Network fee</dt><dd>${formatUnits(
        prepared.fee
      )} native WIN</dd><dt>Signing wallet</dt><dd class="win-address">${escape(
        initial.address
      )}</dd><dt>Record</dt><dd class="win-address">${escape(
        prepared.objectId
      )}</dd></dl><details open><summary>Review complete record</summary><pre>${escape(
        JSON.stringify(payload || { action, ...extra, record }, null, 2)
      )}</pre></details><p class="win-help">Your signature authorizes this action and its fee. Changes appear after network confirmation.</p></div>${button(
        'submit',
        'Sign & submit'
      )}`
    );
  }
  async function publish() {
    const pending = context;
    if (!pending?.prepared || !sameSession(pending.initial))
      throw new Error('Wallet changed. Review the action again.');
    const result = await api.submit(pending.prepared);
    if (!sameSession(pending.initial)) return;
    modal(
      result.status === 'confirmed' ? 'Confirmed on WIN' : 'Submitted to WIN',
      `<div class="win-review"><h3>${
        result.status === 'confirmed' ? 'Your record is published.' : 'Waiting for confirmation'
      }</h3><p>${
        result.status === 'confirmed'
          ? 'The network has confirmed your signature.'
          : 'The transaction has been accepted for processing. Refresh to check the committed record before trying again.'
      }</p><p class="win-address">${escape(result.txId)}</p>${button(
        'refresh-close',
        'Back to workspace'
      )}</div>`
    );
    note(
      result.status === 'confirmed'
        ? 'Transaction confirmed.'
        : 'Transaction submitted. Confirmation is still pending.'
    );
  }
  async function profileList(append = false) {
    const initial = session(),
      token = ++generation;
    const q = document.getElementById('winSearch').value.trim();
    const target = document.getElementById('winProfiles');
    if (!append) target.innerHTML = '<p class="win-loading">Loading profiles…</p>';
    const page = await read(
      `/profiles?limit=24&q=${encodeURIComponent(q)}${mine ? '&owner=' + initial.address : ''}${
        append && cursor ? '&cursor=' + cursor : ''
      }`
    );
    if (token !== generation || !sameSession(initial)) return;
    if (!Array.isArray(page.records)) throw new Error('Profile search requires the updated WIN server.');
    profiles = append ? [...profiles, ...page.records] : page.records;
    cursor = page.nextCursor;
    document.getElementById('winResultCount').textContent = `${page.total} ${
      page.total === 1 ? 'profile' : 'profiles'
    }`;
    document.getElementById('winMore').hidden = !cursor;
    target.innerHTML = profiles.length
      ? profiles
          .map(
            (p) =>
              `<article class="win-profile-card"><div class="win-card-top"><span class="win-avatar">${escape(
                p.displayName.slice(0, 2).toUpperCase()
              )}</span>${badge(p.type)}</div><h3>${escape(p.displayName)}</h3><p class="win-role">${escape(
                p.details?.headline || p.details?.industry || p.details?.legalName || 'WIN member'
              )}</p><p class="win-card-summary">${escape(
                p.summary || 'This profile is ready to build its proof of skill.'
              )}</p><div class="win-tags">${(p.details?.skills || [])
                .slice(0, 4)
                .map((s) => `<span>${escape(skillName(s.skillId))}</span>`)
                .join(
                  ''
                )}</div><div class="win-card-bottom"><div><span class="win-small">PROOF SCORE</span><strong>${escape(
                score(p.score)
              )}</strong></div>${button('profile', 'View profile ↗', p.id, true)}</div></article>`
          )
          .join('')
      : empty(
          q ? 'No profiles found' : mine ? 'Your story starts here' : 'Be the first to make your mark',
          q
            ? 'Try a different title, name, or skill.'
            : 'Create your profile, add your skills, and build a record of your work.',
          button('create-profile', '+ Create profile')
        );
  }
  async function showProfile(id) {
    const initial = session();
    modal('Profile', '<p class="win-loading">Loading profile…</p>');
    const [{ record: p }, { record: points }, endorsements, work] = await Promise.all([
      read('/profiles/' + id),
      read('/scores/' + id),
      all('endorsements', '&profileId=' + id),
      all('contracts', '&profileId=' + id),
    ]);
    if (!sameSession(initial)) return;
    editing = p;
    context = { profile: p, score: points, endorsements, work };
    modal(
      p.displayName,
      `<div class="win-profile-banner"><span class="win-avatar large">${escape(
        p.displayName.slice(0, 2).toUpperCase()
      )}</span><div>${badge(p.type)}<h3>${escape(
        p.details?.headline || p.details?.legalName || 'WIN member'
      )}</h3><p>${escape(
        [p.contact?.location?.city, p.contact?.location?.countryCode].filter(Boolean).join(', ')
      )}</p></div><div class="win-score"><strong>${escape(
        score(points)
      )}</strong><span>Proof score</span></div></div><div class="win-actions">${
        controls(p, initial.address)
          ? button('edit-profile', 'Edit profile', id, true)
          : button('endorse', 'Endorse a skill', id)
      }${button('pdf', '↓ Export PDF', id, true)}${button(
        'copy-profile',
        'Copy profile ID',
        id,
        true
      )}</div><h3>About</h3><p class="win-prose">${escape(
        p.summary || 'No summary added.'
      )}</p><h3>Skills</h3><div class="win-tags">${
        (p.details?.skills || [])
          .map(
            (s) =>
              `<span>${escape(skillName(s.skillId))}${
                s.selfAssessedLevel ? ' · ' + escape(s.selfAssessedLevel) : ''
              }</span>`
          )
          .join('') || '<p>No skills added.</p>'
      }</div>${Object.entries(p.details || {})
        .filter(([key]) => !['headline', 'firstName', 'lastName', 'skills'].includes(key))
        .map(
          ([key, value]) =>
            `<h3>${escape(key.replace(/([A-Z])/g, ' $1'))}</h3><p class="win-prose">${escape(
              allText(value)
            )}</p>`
        )
        .join('')}${
        p.contact ? `<h3>Contact</h3><p class="win-prose">${escape(allText(p.contact))}</p>` : ''
      }<h3>Work records <span class="win-count">${work.length}</span></h3>${
        work
          .map(
            (c) =>
              `<div class="win-row"><div><strong>${escape(c.title)}</strong><p>${escape(
                c.workStatus
              )} · ${escape(c.effectiveApprovalStatus)}</p></div>${button(
                'contract',
                'Review',
                c.id,
                true
              )}</div>`
          )
          .join('') || '<p>No contracts yet.</p>'
      }<h3>Skill endorsements</h3><p class="win-help">Endorsements are signed attestations. The proof score currently reflects the network’s contract-outcome rules.</p>${
        endorsements
          .filter((e) => e.subjectProfileId === p.id)
          .map(
            (e) =>
              `<div class="win-endorsement"><strong>${escape(skillName(e.skillId))}</strong> ${badge(
                e.effectiveStatus
              )}<p class="win-prose">${escape(e.statement)}</p><small>${escape(
                e.relationship
              )} · Valid until ${date(e.validUntil)}</small><p class="win-address">Signed by ${escape(
                e.endorserProfileId
              )}</p></div>`
          )
          .join('') || '<p>No endorsements yet.</p>'
      }<h3>Public identity</h3><p class="win-address">${escape(p.id)}</p><p class="win-help">Revision ${
        escape(p.revision)
      } · Updated ${date(p.updatedAt)}</p>`
    );
  }
  async function profileForm(record = null) {
    await loadIdentity();
    editing = record;
    const p = record || { type: 'person', details: {} };
    const selected = new Set((p.details.skills || []).map((s) => s.skillId));
    modal(
      record ? 'Edit profile' : 'Create your profile',
      form(
        'profile',
        `<p class="win-help">Tell the network what you do and the skills behind your work.</p><div class="win-form-grid">${select(
          'type',
          'Profile type',
          ['person', 'company', 'organization', 'university', 'school', 'government'].map((x) => [
            x,
            x[0].toUpperCase() + x.slice(1),
          ]),
          p.type,
          record ? 'disabled' : ''
        )}${input(
          'displayName',
          'Display name',
          p.displayName,
          'required maxlength="250" autocomplete="name"'
        )}${input(
          'headline',
          'Professional title / industry',
          p.details.headline || p.details.industry,
          'maxlength="250" placeholder="e.g. Product designer"'
        )}${input('legalName', 'Legal name (entities)', p.details.legalName, 'maxlength="250"')}${input(
          'jurisdiction',
          'Jurisdiction (government)',
          p.details.jurisdiction,
          'maxlength="250"'
        )}${input('email', 'Public contact email', p.contact?.email, 'type="email" maxlength="250"')}${input(
          'city',
          'City',
          p.contact?.location?.city,
          'maxlength="250"'
        )}${input(
          'countryCode',
          'Country code',
          p.contact?.location?.countryCode,
          'pattern="[A-Za-z]{2}" maxlength="2" placeholder="TN"'
        )}</div>${area(
          'summary',
          'About your work',
          p.summary
        )}<fieldset><legend>Skills (person profiles)</legend><div class="win-skill-picker">${
          skills
            .map(
              (s) =>
                `<label><input type="checkbox" name="skills" value="${escape(s.id)}" ${
                  selected.has(s.id) ? 'checked' : ''
                }>${escape(s.name)}</label>`
            )
            .join('') ||
          '<p>No skills registered yet. Save your profile, then register a skill from the directory.</p>'
        }</div></fieldset>`
      )
    );
  }
  function updateProfileFields() {
    const form = dialog.querySelector('[data-win-form="profile"]');
    if (!form) return;
    const type = editing?.type || form.elements.type.value;
    for (const [name, visible] of Object.entries({
      legalName: type !== 'person',
      jurisdiction: type === 'government',
      headline: ['person', 'company'].includes(type),
    })) {
      form.elements[name].closest('label').hidden = !visible;
    }
    form.querySelector('fieldset').hidden = type !== 'person';
  }
  dialog.addEventListener('change', (event) => {
    if (event.target.name === 'type') updateProfileFields();
  });
  async function profileSubmit(data) {
    const p = editing ? profileContent(editing) : { type: data.get('type'), details: {} };
    p.displayName = data.get('displayName').trim();
    if (!p.displayName) throw new Error('Enter a display name.');
    p.summary = data.get('summary').trim();
    p.contact = {
      ...p.contact,
      email: data.get('email').trim(),
      location: { ...p.contact?.location, city: data.get('city').trim() },
    };
    if (data.get('countryCode')) p.contact.location.countryCode = data.get('countryCode').toUpperCase();
    else delete p.contact.location.countryCode;
    if (p.type === 'person') {
      p.details.headline = data.get('headline').trim();
      p.details.skills = data
        .getAll('skills')
        .map((id) => p.details.skills?.find((s) => s.skillId === id) || { skillId: id });
    } else {
      p.details.legalName = data.get('legalName').trim() || p.displayName;
      if (p.type === 'company') p.details.industry = data.get('headline').trim();
      if (p.type === 'government') {
        p.details.jurisdiction = data.get('jurisdiction').trim();
        if (!p.details.jurisdiction) throw new Error('Enter the government jurisdiction.');
      }
    }
    await review('profile', editing ? 'update' : 'create', editing, p);
  }
  async function loadContracts() {
    const initial = session();
    const values = await Promise.all(owned.map((p) => all('contracts', '&profileId=' + p.id)));
    if (!sameSession(initial)) return;
    contracts = [...new Map(values.flat().map((c) => [c.id, c])).values()].sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
    document.getElementById('winContracts').innerHTML = contracts.length
      ? contracts
          .map(
            (c) =>
              `<article class="win-contract-card"><div class="win-card-top">${badge(
                c.effectiveApprovalStatus
              )}<small>${date(c.updatedAt)}</small></div><h3>${escape(c.title)}</h3><p>${escape(
                c.publicDescription || 'Work agreement'
              )}</p><div class="win-tags"><span>${escape(c.workStatus)}</span><span>${
                escape(c.terms.durationMonths)
              } months</span><span>${c.approvals.length}/${
                c.hiringProfileIds.length
              } approvals</span></div><div class="win-card-bottom"><small>${
                c.workerProfileId && owned.some((p) => p.id === c.workerProfileId)
                  ? 'Your work record'
                  : 'Your signature requested'
              }</small>${button('contract', 'Review contract ↗', c.id, true)}</div></article>`
          )
          .join('')
      : empty(
          'Good work deserves a record',
          'Create a work contract, define the terms, and invite your client or employer to sign.',
          button('create-contract', '+ Create contract')
        );
  }
  async function contractForm(record = null) {
    await loadIdentity();
    if (!owned.length) throw new Error('Create a profile before creating a contract.');
    editing = record;
    const c = record || { terms: {}, hiringProfileIds: [], skillIds: [], periodOutcomes: [] };
    modal(
      record ? 'Edit contract' : 'Create a work contract',
      form(
        'contract',
        `<div class="win-form-grid">${input(
          'title',
          'Contract title',
          c.title,
          'required maxlength="250"'
        )}${select(
          'workerProfileId',
          'Your worker profile',
          owned.map((p) => [p.id, p.displayName]),
          c.workerProfileId,
          record ? 'disabled' : ''
        )}${select(
          'origin',
          'Work record',
          [
            ['new', 'New work'],
            ['historical', 'Past work'],
          ],
          c.origin || 'new',
          record ? 'disabled' : ''
        )}${select(
          'workStatus',
          'Work status',
          ['planned', 'active', 'completed', 'canceled', 'disputed'].map((x) => [x, x]),
          c.workStatus || 'planned'
        )}${input('startDate', 'Start date', c.terms.startDate, 'type="date" required')}${input(
          'endDate',
          'End date',
          c.terms.endDate,
          'type="date"'
        )}${input(
          'durationMonths',
          'Duration in months',
          c.terms.durationMonths || 1,
          'type="number" min="1" max="1200" required'
        )}${select(
          'workMode',
          'Work mode',
          [
            ['remote', 'Remote'],
            ['hybrid', 'Hybrid'],
            ['onsite', 'On site'],
          ],
          c.terms.workMode || 'remote'
        )}</div><label class="win-field">Find a client or employer<input id="winHiringSearch" placeholder="Search profiles by name or title" autocomplete="off"></label><div id="winHiringResults"></div>${area(
          'hiringProfileIds',
          'Hiring profile IDs (one per line)',
          c.hiringProfileIds.join('\n'),
          'required placeholder="Choose a profile above, or paste its public profile ID."'
        )}${area('publicDescription', 'Public description', c.publicDescription, 'required')}${area(
          'responsibilities',
          'Responsibilities (one per line)',
          c.terms.responsibilities?.join('\n')
        )}${area(
          'acceptanceCriteria',
          'Acceptance criteria (one per line)',
          c.terms.acceptanceCriteria?.join('\n')
        )}<div class="win-form-grid">${input(
          'amount',
          'Compensation amount (optional)',
          c.compensation?.amount,
          'inputmode="decimal"'
        )}${input('currency', 'Currency', c.compensation?.currency || 'WIN', 'maxlength="250"')}${select(
          'frequency',
          'Payment frequency',
          [
            ['once', 'Once'],
            ['hourly', 'Hourly'],
            ['monthly', 'Monthly'],
            ['milestone', 'Per milestone'],
          ],
          c.compensation?.frequency || 'monthly'
        )}</div><p class="win-help">Compensation records agreed terms. This signature does not send salary or create escrow.</p><fieldset><legend>Skills used</legend><div class="win-skill-picker">${skills
          .map(
            (s) =>
              `<label><input name="skills" type="checkbox" value="${escape(s.id)}" ${
                c.skillIds.includes(s.id) ? 'checked' : ''
              }>${escape(s.name)}</label>`
          )
          .join('')}</div></fieldset>${area(
          'periodOutcomes',
          'Completed months: month number, success or failure',
          c.periodOutcomes.map((p) => `${p.month}, ${p.outcome}`).join('\n'),
          'placeholder="1, success\n2, success"'
        )}<p class="win-help">Only finished calendar months may be attested. Completed contracts require an end date and an outcome for every month.</p>`
      )
    );
  }
  async function contractSubmit(data) {
    const lines = (value) =>
      value
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    const c = editing
      ? contractContent(editing)
      : { origin: data.get('origin'), workerProfileId: data.get('workerProfileId'), evidence: [] };
    const ids = [...new Set(lines(data.get('hiringProfileIds')))];
    if (!ids.length || ids.some((id) => !isId(id)))
      throw new Error('Choose valid hiring profiles from the search results.');
    c.title = data.get('title').trim();
    if (!c.title) throw new Error('Enter a contract title.');
    c.publicDescription = data.get('publicDescription').trim();
    c.hiringProfileIds = ids;
    c.skillIds = data.getAll('skills');
    c.workStatus = data.get('workStatus');
    c.terms = {
      ...c.terms,
      startDate: data.get('startDate'),
      durationMonths: Number(data.get('durationMonths')),
      workMode: data.get('workMode'),
      responsibilities: lines(data.get('responsibilities')),
      acceptanceCriteria: lines(data.get('acceptanceCriteria')),
    };
    if (data.get('endDate')) c.terms.endDate = data.get('endDate');
    else delete c.terms.endDate;
    c.periodOutcomes = lines(data.get('periodOutcomes')).map((line) => {
      const match = line.match(/^(\d+)\s*,\s*(success|failure)$/);
      if (!match)
        throw new Error(
          'Enter each outcome as a month number followed by success or failure, e.g. 1, success.'
        );
      return { month: Number(match[1]), outcome: match[2] };
    });
    if (data.get('amount')) {
      if (!/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(data.get('amount')))
        throw new Error('Enter an exact compensation amount with up to 18 decimals.');
      c.compensation = {
        amount: data.get('amount'),
        currency: data.get('currency'),
        frequency: data.get('frequency'),
      };
    } else delete c.compensation;
    await review('contract', editing ? 'update' : 'create', editing, c);
  }
  async function showContract(id) {
    await loadIdentity();
    const { record: c, effectiveApprovalStatus } = await read('/contracts/' + id);
    editing = c;
    context = { contract: c };
    const initial = session(),
      worker = owned.find((p) => p.id === c.workerProfileId);
    const eligible = owned.filter(
      (p) =>
        c.hiringProfileIds.includes(p.id) &&
        c.approvalRequest?.authorities?.[p.id]?.includes(initial.address) &&
        !c.approvals.some((a) => a.profileId === p.id)
    );
    modal(
      c.title,
      `${badge(effectiveApprovalStatus)}<p class="win-prose">${escape(
        c.publicDescription
      )}</p><dl class="win-details"><dt>Worker profile</dt><dd class="win-address">${escape(
        c.workerProfileId
      )}</dd><dt>Hiring profiles</dt><dd class="win-address">${c.hiringProfileIds
        .map(escape)
        .join('<br>')}</dd><dt>Work period</dt><dd>${escape(c.terms.startDate)} → ${escape(
        c.terms.endDate || 'Ongoing'
      )} · ${escape(c.terms.durationMonths)} months</dd><dt>Work status</dt><dd>${escape(
        c.workStatus
      )}</dd><dt>Responsibilities</dt><dd class="win-prose">${escape(
        c.terms.responsibilities.join('\n') || 'None listed'
      )}</dd><dt>Acceptance criteria</dt><dd class="win-prose">${escape(
        c.terms.acceptanceCriteria.join('\n') || 'None listed'
      )}</dd><dt>Compensation</dt><dd>${
        c.compensation
          ? escape(`${c.compensation.amount} ${c.compensation.currency} · ${c.compensation.frequency}`)
          : 'Not specified'
      }</dd><dt>Attested outcomes</dt><dd>${escape(
        c.periodOutcomes.map((p) => `Month ${p.month}: ${p.outcome}`).join(' · ') || 'None'
      )}</dd><dt>Skills</dt><dd>${escape(
        c.skillIds.map(skillName).join(', ') || 'None listed'
      )}</dd><dt>Approvals</dt><dd>${c.approvals.length} of ${
        c.hiringProfileIds.length
      }</dd></dl><details><summary>Complete signed terms & evidence</summary><pre>${escape(
        JSON.stringify(contractContent(c), null, 2)
      )}</pre></details><p class="win-help">Revision ${escape(c.revision)} · Terms revision ${escape(c.termsRevision)}${
        c.approvalRequest ? ' · Approval deadline ' + date(c.approvalRequest.expiresAt) : ''
      }</p>${
        c.rejection ? `<p class="win-message">Rejected: ${escape(c.rejection.reason)}</p>` : ''
      }<div class="win-actions">${
        worker && controls(c, initial.address) && !c.creditedMonths.length
          ? button('edit-contract', 'Edit terms', c.id, true)
          : ''
      }${
        worker &&
        controls(c, initial.address) &&
        !['pending', 'approved'].includes(effectiveApprovalStatus) &&
        !c.creditedMonths.length
          ? button('request-approval', 'Sign & request approval', c.id)
          : ''
      }</div>${
        effectiveApprovalStatus === 'pending' && eligible.length && !worker
          ? form(
              'approval',
              `${select(
                'hiringProfileId',
                'Sign as',
                eligible.map((p) => [p.id, p.displayName]),
                eligible[0].id
              )}${select(
                'decision',
                'Decision',
                [
                  ['approve', 'Approve these exact terms'],
                  ['reject', 'Reject this contract'],
                ],
                'approve'
              )}${area('reason', 'Reason (required for rejection)')}`,
              'Review signature'
            )
          : ''
      }`
    );
  }
  async function endorseForm(id) {
    await loadIdentity();
    const { record: p } = await read('/profiles/' + id);
    const options = (p.details?.skills || []).map((s) => [s.skillId, skillName(s.skillId)]);
    if (!owned.length) throw new Error('Create your own profile before endorsing someone.');
    if (!options.length) throw new Error('This person needs to add skills before you can endorse them.');
    editing = p;
    modal(
      'Endorse a skill',
      form(
        'endorsement',
        `<p>Sign an endorsement for <strong>${escape(p.displayName)}</strong>.</p>${select(
          'endorserProfileId',
          'Endorse as',
          owned.map((x) => [x.id, x.displayName]),
          owned[0].id
        )}${select('skillId', 'Skill', options, options[0][0])}${select(
          'relationship',
          'Your working relationship',
          ['employer', 'colleague', 'client', 'teacher', 'mentor', 'collaborator', 'other'].map((x) => [
            x,
            x,
          ]),
          'colleague'
        )}${area('statement', 'What can you attest to?', '', 'required')}${input(
          'durationMonths',
          'Valid for (months)',
          12,
          'type="number" min="1" max="12" required'
        )}<p class="win-help">Endorsements are public, signed evidence. You cannot endorse yourself.</p>`
      )
    );
  }
  async function exportPdf() {
    const initial = session();
    const snapshot = { ...context, skills: structuredClone(skills), networkId: initial.networkId };
    const { downloadProfilePdf } = await import('./win-pdf.mjs');
    await downloadProfilePdf(snapshot);
    note('Profile PDF downloaded.');
  }
  function deposits() {
    try {
      return JSON.parse(localStorage.getItem('win-bnb-deposits:' + session().address) || '[]');
    } catch {
      return [];
    }
  }
  async function refreshBnb() {
    const initial = session();
    if (!initial) return;
    const target = document.getElementById('winBnbBalance');
    target.textContent = 'Loading…';
    const amount = await tokenBalance(initial.evmAddress);
    if (!sameSession(initial)) return;
    target.textContent = formatUnits(amount) + ' WIN';
    const history = deposits();
    await Promise.all(
      history
        .filter((d) => ['pending', 'unverified'].includes(d.status))
        .map(async (d) => {
          try {
            d.status = await checkDeposit(d);
          } catch {
            /* Keep pending for the next explicit refresh. */
          }
        })
    );
    if (!sameSession(initial)) return;
    localStorage.setItem('win-bnb-deposits:' + initial.address, JSON.stringify(history));
    renderDeposits(history);
  }
  function renderDeposits(history) {
    document.getElementById('winBnbHistory').innerHTML = history
      .map(
        (d) =>
          `<div class="win-row"><div><strong>${escape(formatUnits(d.amount))} WIN</strong><p>${escape(
            d.status
          )} · ${date(d.createdAt)}</p></div><a href="https://bscscan.com/tx/${escape(
            d.hash
          )}" target="_blank" rel="noopener noreferrer">View transaction ↗</a></div>`
      )
      .join('');
  }
  async function fundingForm() {
    const initial = session();
    modal(
      'Fund with WIN on BNB Chain',
      form(
        'funding',
        `<div class="win-funding-network">${badge(
          'BNB Chain · Mainnet'
        )}<h3>Real WIN. Your wallet.</h3><p>Transfer WIN from your browser wallet to your WIN wallet’s BNB address.</p></div><dl><dt>Receiving address</dt><dd class="win-address">${escape(
          initial.evmAddress
        )}</dd><dt>WIN token contract</dt><dd class="win-address">${WIN_TOKEN.address}</dd></dl>${input(
          'amount',
          'Amount in WIN',
          '',
          'inputmode="decimal" required placeholder="0.00"'
        )}<p class="win-help">The sending wallet needs WIN and BNB for gas. Your wallet will display the final transaction for approval. BNB-chain WIN cannot yet pay native WIN network fees.</p>`,
        'Connect source wallet & review'
      ).replace(
        '<p class="win-help">Published profile and work records are public. A native WIN network fee applies.</p>',
        ''
      )
    );
  }
  async function fundingReview(data) {
    const initial = session();
    const amount = parseAmount(data.get('amount'));
    const provider = window.ethereum;
    const from = await connectBnb(provider);
    if (!sameSession(initial)) throw new Error('Receiving wallet changed. Start again.');
    context = { funding: { provider, from, to: initial.evmAddress, amount, initial } };
    modal(
      'Review BNB Chain deposit',
      `<h3>${escape(formatUnits(amount))} WIN</h3><dl><dt>From</dt><dd class="win-address">${escape(
        from
      )}</dd><dt>To your wallet</dt><dd class="win-address">${escape(
        initial.evmAddress
      )}</dd><dt>Network</dt><dd>BNB Chain mainnet (56)</dd><dt>Token contract</dt><dd class="win-address">${
        WIN_TOKEN.address
      }</dd></dl><p class="win-help">Your browser wallet will ask you to approve the token transfer and BNB gas fee.</p>${button(
        'fund-submit',
        'Continue in wallet'
      )}`
    );
  }
  async function submitFunding() {
    const f = context.funding;
    if (!sameSession(f.initial)) throw new Error('Receiving wallet changed. Start again.');
    const deposit = await fundBnb(f.provider, f.from, f.to, f.amount, () => sameSession(f.initial));
    const key = 'win-bnb-deposits:' + f.initial.address;
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem(key) || '[]');
    } catch {}
    localStorage.setItem(key, JSON.stringify([deposit, ...history].slice(0, 100)));
    if (!sameSession(f.initial)) return;
    modal(
      'Deposit submitted',
      `<h3>Waiting for BNB Chain confirmation</h3><p>${escape(
        formatUnits(f.amount)
      )} WIN is being sent to your wallet. Refresh the balance to check confirmation.</p><p class="win-address">${escape(
        deposit.hash
      )}</p><a class="win-button" href="https://bscscan.com/tx/${
        deposit.hash
      }" target="_blank" rel="noopener noreferrer">View on BscScan ↗</a>`
    );
    if (sameSession(f.initial)) renderDeposits([deposit, ...history]);
  }
  async function act(action, id) {
    if (action === 'create-profile') await profileForm();
    else if (action === 'profile') await showProfile(id);
    else if (action === 'edit-profile') await profileForm(editing);
    else if (action === 'copy-profile') {
      await navigator.clipboard.writeText(id);
      note('Profile ID copied.');
    } else if (action === 'pdf') await exportPdf();
    else if (action === 'create-contract') await contractForm();
    else if (action === 'edit-contract') await contractForm(editing);
    else if (action === 'contract') await showContract(id);
    else if (action === 'request-approval') await review('contract', 'request_approval', editing);
    else if (action === 'endorse') await endorseForm(id);
    else if (action === 'submit') await publish();
    else if (action === 'refresh-close') {
      dialog.close();
      await open(document.querySelector('.win-screen.active')?.dataset.view || 'profiles');
    } else if (action === 'refresh')
      await open(document.querySelector('.win-screen.active')?.dataset.view || 'profiles');
    else if (action === 'more') await profileList(true);
    else if (action === 'all' || action === 'mine') {
      mine = action === 'mine';
      document
        .querySelectorAll('[data-win-action="mine"], [data-win-action="all"]')
        .forEach((b) => b.classList.toggle('selected', b.dataset.winAction === action));
      await profileList();
    } else if (action === 'register-skill')
      modal(
        'Register a skill',
        form(
          'skill',
          `${input(
            'name',
            'Skill name',
            '',
            'required maxlength="250" placeholder="e.g. Product design"'
          )}${input('category', 'Category', '', 'maxlength="250"')}${select(
            'kind',
            'Kind',
            ['technical', 'interpersonal', 'language', 'other'].map((x) => [x, x]),
            'technical'
          )}${area('description', 'Description')}`
        )
      );
    else if (action === 'fund') await fundingForm();
    else if (action === 'fund-submit') await submitFunding();
    else if (action === 'bnb-refresh') await refreshBnb();
    else if (action === 'copy-native' || action === 'copy-bnb') {
      await navigator.clipboard.writeText(
        action === 'copy-native' ? session().address : session().evmAddress
      );
      note('Public wallet address copied.');
    }
  }
  async function guarded(fn) {
    if (busy) return;
    busy = true;
    dialog.setAttribute('aria-busy', 'true');
    const disabled = [...dialog.querySelectorAll('button,input,textarea,select')].filter((e) => !e.disabled);
    disabled.forEach((e) => (e.disabled = true));
    try {
      dialog.querySelector('.win-dialog-error').textContent = '';
      await fn();
    } catch (error) {
      const message =
        error.code === 4001
          ? 'You canceled the wallet request. No new transaction was submitted.'
          : error.message;
      if (dialog.open) dialog.querySelector('.win-dialog-error').textContent = message;
      note(message, true);
    } finally {
      busy = false;
      disabled.forEach((e) => (e.disabled = false));
      dialog.removeAttribute('aria-busy');
    }
  }
  document.addEventListener('click', (event) => {
    const b = event.target.closest('[data-win-action]');
    if (b) {
      event.preventDefault();
      guarded(() => act(b.dataset.winAction, b.dataset.id));
    }
  });
  dialog.addEventListener('submit', (event) => {
    const f = event.target.closest('[data-win-form]');
    if (!f) return;
    event.preventDefault();
    const data = new FormData(f);
    guarded(async () => {
      if (f.dataset.winForm === 'profile') await profileSubmit(data);
      else if (f.dataset.winForm === 'contract') await contractSubmit(data);
      else if (f.dataset.winForm === 'approval') {
        const action = data.get('decision');
        if (action === 'reject' && !data.get('reason').trim())
          throw new Error('Enter a reason for rejection.');
        await review('contract', action, editing, undefined, {
          hiringProfileId: data.get('hiringProfileId'),
          requestHash: editing.approvalRequest.hash,
          ...(action === 'reject' ? { reason: data.get('reason').trim() } : {}),
        });
      } else if (f.dataset.winForm === 'endorsement')
        await review('endorsement', 'create', null, {
          endorserProfileId: data.get('endorserProfileId'),
          subjectProfileId: editing.id,
          skillId: data.get('skillId'),
          relationship: data.get('relationship'),
          statement: data.get('statement').trim(),
          durationMonths: Number(data.get('durationMonths')),
        });
      else if (f.dataset.winForm === 'skill')
        await review('skill', 'create', null, {
          name: data.get('name').trim(),
          category: data.get('category').trim(),
          kind: data.get('kind'),
          description: data.get('description').trim(),
        });
      else if (f.dataset.winForm === 'funding') await fundingReview(data);
    });
  });
  let timer,
    hiringGeneration = 0;
  document.getElementById('winSearchForm').addEventListener('submit', (event) => {
    event.preventDefault();
    guarded(() => profileList());
  });
  document.getElementById('winSearch').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => profileList().catch((error) => note(error.message, true)), 300);
  });
  dialog.addEventListener('input', (event) => {
    if (event.target.id !== 'winHiringSearch') return;
    const q = event.target.value.trim(),
      token = ++hiringGeneration;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const page = await read('/profiles?limit=12&q=' + encodeURIComponent(q));
        if (token !== hiringGeneration || !dialog.open) return;
        const target = document.getElementById('winHiringResults');
        if (!target) return;
        target.innerHTML =
          page.records
            .filter((p) => !controls(p, session().address))
            .map(
              (p) =>
                `<button type="button" class="win-pick-profile" data-pick-profile="${escape(p.id)}">${escape(
                  p.displayName
                )} <small>${escape(p.details?.headline || p.type)}</small></button>`
            )
            .join('') || '<p>No matching hiring profiles.</p>';
      } catch (error) {
        dialog.querySelector('.win-dialog-error').textContent = error.message;
      }
    }, 300);
  });
  dialog.addEventListener('click', (event) => {
    const b = event.target.closest('[data-pick-profile]');
    if (!b) return;
    const field = dialog.querySelector('[name="hiringProfileIds"]');
    field.value = [...new Set([...field.value.split('\n').filter(Boolean), b.dataset.pickProfile])].join(
      '\n'
    );
    b.textContent = 'Added ✓';
  });
  async function open(view) {
    const initial = session();
    if (!initial) return;
    if (view === 'wallet') {
      document.getElementById('winNativeAddress').textContent = initial.address;
      document.getElementById('winBnbAddress').textContent = initial.evmAddress;
      renderDeposits(deposits());
      refreshBnb().catch((error) => {
        if (!sameSession(initial)) return;
        document.getElementById('winBnbBalance').textContent = 'Unavailable';
        note(error.message, true);
      });
      return;
    }
    const screen = document.getElementById(view + 'Screen');
    screen.classList.add('active');
    note('Loading network records…');
    const target = document.getElementById(view === 'profiles' ? 'winProfiles' : 'winContracts');
    target.innerHTML = '<p class="win-loading">Loading records from WIN…</p>';
    try {
      await loadIdentity();
      if (!sameSession(initial)) return;
      document.getElementById('winOwnedCount').textContent = owned.length;
      document.getElementById('winSkillCount').textContent = skills.length;
      if (view === 'profiles') await profileList();
      else await loadContracts();
      note('Public records from the WIN network.');
    } catch (error) {
      if (!sameSession(initial)) return;
      note(error.message, true);
      target.innerHTML = empty(
        'Unable to load network records',
        escape(error.message),
        button('refresh', 'Try again')
      );
    }
  }
  return {
    open,
    reset() {
      ++generation;
      ++hiringGeneration;
      clearTimeout(timer);
      note('');
      owned = [];
      skills = [];
      profiles = [];
      contracts = [];
      editing = null;
      context = null;
      dialog.close();
      document.querySelectorAll('.win-screen').forEach((el) => el.classList.remove('active'));
    },
  };
}
