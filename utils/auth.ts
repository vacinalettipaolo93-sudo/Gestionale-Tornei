import { getAuth, EmailAuthProvider, reauthenticateWithCredential, updatePassword, User } from "firebase/auth";

/**
 * Reauth + update password per l'utente corrente.
 * - Se l'utente non è tipo email/password lancia un errore.
 * - Lancia errori dettagliati se qualcosa fallisce (es. wrong-password, weak-password, requires-recent-login).
 */
export async function changeUserPassword(user: User | null, currentPassword: string, newPassword: string): Promise<void> {
  if (!user) throw new Error("Utente non autenticato.");

  // Verifica che l'utente abbia provider email/password
  const hasPasswordProvider = (user.providerData || []).some(pd => pd.providerId === 'password') || user.providerId?.includes('password');
  if (!hasPasswordProvider) {
    throw new Error("Cambio password non supportato per questo account (non è un account email/password).");
  }

  // Re-authenticate required by Firebase to change password
  try {
    const email = user.email ?? "";
    if (!email) throw new Error("Email utente non disponibile per la re-autenticazione.");
    const cred = EmailAuthProvider.credential(email, currentPassword);
    await reauthenticateWithCredential(user, cred);
  } catch (err: any) {
    // Rilancia con messaggio utile
    const msg = err?.code ? `${err.code}: ${err?.message ?? 'Errore re-autenticazione'}` : (err?.message || "Errore durante la re-autenticazione.");
    throw new Error(msg);
  }

  // Aggiorna la password
  try {
    await updatePassword(user, newPassword);
  } catch (err: any) {
    const msg = err?.code ? `${err.code}: ${err?.message ?? 'Errore updatePassword'}` : (err?.message || "Errore durante l'aggiornamento della password.");
    throw new Error(msg);
  }
}

/**
 * Helper che prende l'utente corrente da getAuth().currentUser e chiama changeUserPassword.
 */
export async function changeCurrentUserPassword(currentPassword: string, newPassword: string) {
  const auth = getAuth();
  return changeUserPassword(auth.currentUser, currentPassword, newPassword);
}
