/** Address-book entries are local labels, never claims of a verified username. */
export function contactInput(id, name) {
  const address = String(id || '')
    .trim()
    .replace(/^0x/i, '')
    .toLowerCase();
  if (!/^[0-9a-f]{40}(?:0{24})?$/.test(address))
    throw new Error('Enter a WIN wallet address (40 characters, or 64 with zero padding).');
  const label = String(name || '').trim();
  if (!label || label.length > 100) throw new Error('Enter a contact name of up to 100 characters.');
  return { address: address.slice(0, 40), name: label };
}
export function setupContactForm(api) {
  const dialog = document.getElementById('winAddContactDialog');
  const form = dialog.querySelector('form');
  const error = dialog.querySelector('[role="alert"]');
  let owner;
  document.getElementById('winAddContact').addEventListener('click', () => {
    owner = api.session();
    if (!owner) return;
    form.reset();
    error.textContent = '';
    dialog.showModal();
  });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (!owner || owner !== api.session()) throw new Error('Your wallet changed. Reopen Add contact.');
      const data = new FormData(form);
      api.add(contactInput(data.get('id'), data.get('name')));
      dialog.close();
    } catch (e) {
      error.textContent = e.message;
    }
  });
  return {
    close: () => {
      owner = null;
      dialog.close();
    },
  };
}
