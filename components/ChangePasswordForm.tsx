import React, { useState } from "react";
import { getAuth } from "firebase/auth";
import { changeUserPassword } from "../utils/auth";

interface ChangePasswordFormProps {
  onSuccess?: () => void;
}

const ChangePasswordForm: React.FC<ChangePasswordFormProps> = ({ onSuccess }) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const auth = getAuth();

  const clearLocalSensitive = () => {
    try {
      // rimuovi chiavi sospette usate precedentemente (modifica le chiavi se usavi nomi diversi)
      localStorage.removeItem("password");
      localStorage.removeItem("app_password");
      sessionStorage.removeItem("password");
    } catch (e) {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError("La nuova password e la conferma non corrispondono.");
      return;
    }
    if (newPassword.length < 6) {
      setError("La password deve essere di almeno 6 caratteri.");
      return;
    }

    setLoading(true);
    try {
      await changeUserPassword(auth.currentUser, currentPassword, newPassword);

      // rimuovi eventuali memorizzazioni locali (NON salvare password in locale)
      clearLocalSensitive();

      setSuccess("Password aggiornata correttamente.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err?.message || "Errore durante il cambio password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-semibold">Password corrente</label>
        <input
          type="password"
          value={currentPassword}
          onChange={e => setCurrentPassword(e.target.value)}
          required
          className="w-full p-2 rounded bg-primary border border-tertiary text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold">Nuova password</label>
        <input
          type="password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          required
          className="w-full p-2 rounded bg-primary border border-tertiary text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold">Conferma nuova password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          required
          className="w-full p-2 rounded bg-primary border border-tertiary text-white"
        />
      </div>

      {error && <div className="text-red-500 font-semibold">{error}</div>}
      {success && <div className="text-green-500 font-semibold">{success}</div>}

      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="bg-highlight text-white px-4 py-2 rounded">
          {loading ? "Salvataggio..." : "Cambia password"}
        </button>
      </div>
    </form>
  );
};

export default ChangePasswordForm;
