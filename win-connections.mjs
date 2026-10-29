const id = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const element = (tag, text, className) => {
  const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node;
};
const button = (text, action) => { const node = element('button', text, 'win-button secondary'); node.type = 'button'; node.addEventListener('click', action); return node; };
export function validateProfilePair(fromProfileId, toProfileId) {
  if (!id(fromProfileId) || !id(toProfileId)) throw new Error('Select your profile and enter the other person’s 64-character profile ID.');
  if (fromProfileId === toProfileId) throw new Error('Choose a different profile to connect with.');
  return { fromProfileId, toProfileId };
}
export function createConnectionsUI(api) {
  let container, search, dialog, form, error, source, target, sourceSelect, state, active = false, generation = 0, busy = false;
  const initialize = () => {
    if (container) return;
    container = document.getElementById('contactsList');
    search = document.getElementById('contactSearchInput'); search.readOnly = false;
    search.addEventListener('input', () => { void render(); });
    sourceSelect = document.createElement('select'); sourceSelect.setAttribute('aria-label', 'Your connection profile');
    const label = element('label', 'Connect as', 'win-field'); label.append(sourceSelect);
    const toolbar = element('div', null, 'win-connection-toolbar');
    toolbar.append(label, button('Refresh connections', () => void refresh()));
    container.before(toolbar);
    sourceSelect.addEventListener('change', () => { api.select(sourceSelect.value); state = null; void refresh(); });
    dialog = document.getElementById('winAddContactDialog'); form = dialog.querySelector('form');
    form.replaceChildren();
    source = document.createElement('select'); source.name = 'source'; source.required = true;
    const fromLabel = element('label', 'Your profile', 'win-field'); fromLabel.append(source);
    target = document.createElement('input'); target.name = 'profileId'; target.required = true; target.maxLength = 64; target.pattern = '[a-f0-9]{64}'; target.placeholder = 'The other person’s profile ID';
    const toLabel = element('label', 'Their profile ID', 'win-field'); toLabel.append(target);
    error = element('p'); error.setAttribute('role','alert');
    const submit = element('button', 'Review request', 'win-button'); submit.type = 'submit';
    form.append(fromLabel, toLabel, element('p','They must accept before you become connected. Requests and decisions are signed native WIN transactions, with the fee shown before confirmation.','win-help'),error,submit);
    dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
    document.getElementById('winAddContactTitle').textContent = 'Request a connection';
    document.getElementById('winAddContact').addEventListener('click', async()=> {
      try { await api.ensureProfile(); options(source); form.reset(); source.value = api.selected(); error.textContent=''; if (!source.value) throw new Error('Create a profile before requesting connections.'); dialog.showModal(); }
      catch(e) { api.notify(e.message); }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy) return;
      const session = api.session();
      try {
        const pair = validateProfilePair(source.value,target.value.trim().toLowerCase());
        if (!api.profiles().some(p=>p.id===pair.fromProfileId)) throw new Error('This profile is not controlled by your wallet.');
        busy=true; submit.disabled=true; error.textContent='Checking profile…';
        const peer=await api.read('/profiles/'+pair.toProfileId);
        if (!peer?.record || peer.record.id!==pair.toProfileId) throw new Error('The other profile could not be found.');
        if (api.session()!==session) throw new Error('Wallet changed. Reopen the request.');
        const outcome=await api.transact('create',null,pair,`Send a connection request to ${peer.record.displayName || 'this profile'}?`);
        if (api.session()!==session) return;
        api.select(pair.fromProfileId); api.changed(); dialog.close();
        api.notify(outcome.status==='confirmed' ? 'Request sent. Waiting for acceptance.' : 'Request submitted. Refresh connections after confirmation.');
        await refresh();
      } catch(e) { if (api.session()===session) error.textContent=e.message; }
      finally { busy=false; submit.disabled=false; }
    });
  };
  function options(select) {
    select.replaceChildren(...api.profiles().map(p=>{const option=element('option',p.displayName);option.value=p.id;return option;}));
    select.value=api.selected() || '';
  }
  async function run(action, record, label) {
    if (busy) return; const session=api.session(); busy=true;
    try {
      const result=await api.transact(action,record,undefined,label);
      if (api.session()!==session) return;
      api.changed(); api.notify(result.status==='confirmed'?'Connection updated.':'Submitted. Refresh after confirmation.'); await refresh();
    } catch(e) { if (api.session()===session) api.notify(e.message); }
    finally { busy=false; }
  }
  async function render() {
    if (!active || !state) return;
    const token=++generation, session=api.session(), current=api.selected(), filter=search.value.trim().toLowerCase();
    container.replaceChildren();
    const groups=[['accepted','Connections'],['incoming','Incoming requests'],['outgoing','Sent requests']];
    for (const [kind,title] of groups) {
      const records=state.filter(r=>kind==='accepted'?r.status==='accepted':r.status==='pending'&&(kind==='incoming'?r.toProfileId===current:r.fromProfileId===current));
      if (!records.length) continue;
      const section=element('li',null,'win-connection-section'); section.append(element('h2',title));
      for(const record of records) {
        const peerId=record.fromProfileId===current?record.toProfileId:record.fromProfileId;
        let peer;
        try { peer=(await api.read('/profiles/'+peerId))?.record; } catch {}
        if (!active || token!==generation || api.session()!==session || current!==api.selected()) return;
        const name=peer?.displayName || `${peerId.slice(0,10)}…${peerId.slice(-6)}`;
        if (filter && !`${name} ${peerId}`.toLowerCase().includes(filter)) continue;
        const card=element('article',null,'win-feed-post');card.append(element('h3',name),element('p',peerId,'win-feed-author'));
        const actions=element('div',null,'win-feed-tabs'); actions.append(button('View profile',()=>api.navigate('profile',peerId)));
        if(kind==='incoming') actions.append(button('Accept',()=>void run('accept',record,`Accept the connection with ${name}?`)),button('Decline',()=>void run('decline',record,`Decline the request from ${name}?`)));
        else if(kind==='outgoing') actions.append(element('span','Waiting for acceptance'),button('Cancel request',()=>void run('cancel',record,`Cancel your request to ${name}?`)));
        else {
          if(peer) { try { api.remember(peer); } catch(e) { api.notify(e.message); } actions.append(button('Wallet details',()=>api.details(peer))); }
          actions.append(button('Remove connection',()=>void run('remove',record,`Remove the connection with ${name}? This stops future feed access between these profiles.`)));
        }
        card.append(actions);section.append(card);
      }
      if(section.children.length>1) container.append(section);
    }
    if (!container.children.length) container.append(element('li',filter?'No matching connections.':'No accepted connections or pending requests. Use + to request a connection.','empty-state'));
  }
  async function refresh() {
    initialize(); active=true; const token=++generation, initial=api.session();
    container.replaceChildren(element('li','Loading connections…','empty-state'));
    try {
      await api.ensureProfile(); if (!active || token!==generation || api.session()!==initial) return;
      options(sourceSelect);
      if(!api.selected()) {container.replaceChildren(element('li','Create a profile first, then request connections with other profiles.','empty-state'));return;}
      const records=[];let cursor='';const seen=new Set();let revision;
      do {
        const page=await api.request('connections',{profileId:api.selected(),...(cursor?{cursor}:{})});
        if(!active || token!==generation || api.session()!==initial)return;
        if(!Array.isArray(page.records) || page.records.some(r=>!id(r.id)||!id(r.fromProfileId)||!id(r.toProfileId)) || (revision!==undefined && page.registryRevision!==revision)) throw new Error('Connections changed or returned an invalid response. Refresh again.');
        revision=page.registryRevision;records.push(...page.records);cursor=page.nextCursor;
        if(cursor && (seen.has(cursor)||records.length>10000))throw new Error('Too many connection records.');seen.add(cursor);
      }while(cursor);
      state=records; await render();
    }catch(e){if(active && token===generation){state=null;container.replaceChildren(element('li',e.message,'empty-state'),button('Try again',()=>void refresh()));}}
  }
  return {refresh,close(){active=false;generation++;dialog?.close();},reset(){this.close();state=null;busy=false;container?.replaceChildren();form?.reset();source?.replaceChildren();sourceSelect?.replaceChildren();}};
}
