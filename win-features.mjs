// Messaging is retired in the WIN wallet. Historical data remains in backups.
export const MESSAGING_ENABLED = false;
export const EXTERNAL_ASSETS_ENABLED = false;
export const walletViews = Object.freeze(['profiles', 'contracts', 'contacts', 'wallet']);
const messagingTransactions = new Set([
  'message',
  'read',
  'update_chat_toll',
  'update_toll_required',
  'reclaim_toll',
  'toll',
]);
export function assertWalletTransaction(type) {
  if (messagingTransactions.has(type)) throw new Error('Chat is no longer available in the WIN wallet.');
}
export function walletView(view) {
  return walletViews.includes(view) ? view : 'profiles';
}
