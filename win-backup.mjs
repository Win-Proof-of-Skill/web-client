// Passwords are exact strings: backup creation preserves leading/trailing spaces.
export function decodeBackup(content, password, decrypt, parse) {
  if (typeof content !== 'string' || content.length > 64 * 1024 * 1024)
    throw new Error('Backup file is empty or exceeds 64 MB.');
  let decoded = content;
  if (!content.trimStart().startsWith('{')) {
    if (!password) throw new Error('Enter the backup file password.');
    decoded = decrypt(content, password);
    if (typeof decoded !== 'string' || !decoded)
      throw new Error('Backup password is incorrect or the file is damaged.');
  }
  let data;
  try {
    data = parse(decoded);
  } catch {
    throw new Error('The file is not a valid WIN account backup.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('The file is not a WIN account backup.');
  return data;
}
export function backupAccountKey(key) {
  if (typeof key !== 'string') return null;
  const separator = key.lastIndexOf('_');
  if (separator < 1) return null;
  const username = key.slice(0, separator),
    netid = key.slice(separator + 1);
  if (!/^[a-f0-9]{64}$/.test(netid) || ['__proto__', 'constructor', 'prototype'].includes(username)) return null;
  return { username, netid };
}
