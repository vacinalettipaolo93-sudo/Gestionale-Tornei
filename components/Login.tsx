import React, { useState } from 'react';
import { type User } from '../types';

interface LoginProps {
  users: User[];
  onLoginSuccess: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ users, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find(
      u => u.username.trim().toLowerCase() === username.trim().toLowerCase() && u.password === password
    );
    if (user) {
      onLoginSuccess(user);
    } else {
      setError('Username o password non validi.');
    }
  };

  return (
    <div className="min-h-screen bg-primary text-text-primary flex flex-col items-center justify-center p-4 animate-fadeIn">
      <div className="w-full max-w-xl">
        <div className="flex flex-col items-center mb-8 text-center">
          <img
            src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%201250%20300%22%20fill%3D%22none%22%3E%3Ctext%20x%3D%220%22%20y%3D%22205%22%20font-family%3D%22Arial%2C%20Helvetica%2C%20sans-serif%22%20font-size%3D%22210%22%20font-weight%3D%22700%22%20fill%3D%22%239B1C12%22%3ENEXT%3C/text%3E%3Cpolygon%20points%3D%22970%2C70%201090%2C125%20970%2C180%22%20fill%3D%22%239B1C12%22%20/%3E%3Ccircle%20cx%3D%221160%22%20cy%3D%22165%22%20r%3D%2280%22%20stroke%3D%22%232F3136%22%20stroke-width%3D%2218%22%20fill%3D%22none%22%20/%3E%3Ctext%20x%3D%221105%22%20y%3D%22195%22%20font-family%3D%22Arial%2C%20Helvetica%2C%20sans-serif%22%20font-size%3D%2270%22%20font-weight%3D%22700%22%20fill%3D%22%232F3136%22%3ETS%3C/text%3E%3C/svg%3E"
            alt="NEXT TS"
            className="h-16 sm:h-20 w-auto object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
          />

          <img
            src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%201600%20520%22%20fill%3D%22none%22%3E%3Ccircle%20cx%3D%22220%22%20cy%3D%22260%22%20r%3D%22170%22%20stroke%3D%22%2399D98C%22%20stroke-width%3D%2224%22%20fill%3D%22none%22%20/%3E%3Cpath%20d%3D%22M65%20260a155%20155%200%20011%200%22%20stroke%3D%22%2399D98C%22%20stroke-width%3D%2224%22%20stroke-linecap%3D%22round%22%20/%3E%3Cpath%20d%3D%22M210%20425c0-112%2091-203%20203-203%22%20stroke%3D%22%2357639A%22%20stroke-width%3D%2224%22%20stroke-linecap%3D%22round%22%20/%3E%3Ctext%20x%3D%22450%22%20y%3D%22205%22%20font-family%3D%22Arial%2C%20Helvetica%2C%20sans-serif%22%20font-size%3D%22110%22%20font-weight%3D%22700%22%20fill%3D%22%2357639A%22%3EPAITONE%20ARENA%3C/text%3E%3Ctext%20x%3D%22450%22%20y%3D%22315%22%20font-family%3D%22Arial%2C%20Helvetica%2C%20sans-serif%22%20font-size%3D%2270%22%20font-weight%3D%22400%22%20fill%3D%22%2399D98C%22%3ETennis%20%26%20Padel%20Club%3C/text%3E%3Ctext%20x%3D%221150%22%20y%3D%22395%22%20font-family%3D%22Brush%20Script%20MT%2C%20cursive%22%20font-size%3D%2256%22%20fill%3D%22%2357639A%22%3Eby%3C/text%3E%3Ctext%20x%3D%221230%22%20y%3D%22395%22%20font-family%3D%22Arial%2C%20Helvetica%2C%20sans-serif%22%20font-size%3D%2270%22%20font-weight%3D%22700%22%20fill%3D%22%2357639A%22%3ENEXT%3C/text%3E%3Cpolygon%20points%3D%221480%2C340%201535%2C372%201480%2C404%22%20fill%3D%22%2357639A%22%20/%3E%3Ccircle%20cx%3D%221540%22%20cy%3D%22395%22%20r%3D%2230%22%20stroke%3D%22%2357639A%22%20stroke-width%3D%228%22%20fill%3D%22none%22%20/%3E%3Ctext%20x%3D%221518%22%20y%3D%22408%22%20font-family%3D%22Arial%2C%20Helvetica%2C%20sans-serif%22%20font-size%3D%2226%22%20font-weight%3D%22700%22%20fill%3D%22%2357639A%22%3ETS%3C/text%3E%3C/svg%3E"
            alt="Paitone Arena Tennis & Padel Club"
            className="mt-5 w-full max-w-md sm:max-w-lg h-auto object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
          />

          <p className="text-text-secondary mt-4">Accedi per continuare</p>
        </div>

        <div className="bg-secondary p-8 rounded-xl shadow-2xl border border-tertiary/50">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-text-secondary">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="mt-1 block w-full bg-primary border border-tertiary rounded-lg p-3 text-text-primary focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-secondary">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="mt-1 block w-full bg-primary border border-tertiary rounded-lg p-3 text-text-primary focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-lg shadow-highlight/20 text-sm font-medium text-white bg-highlight hover:bg-highlight/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-secondary focus:ring-highlight transition-all"
              >
                Accedi
              </button>
            </div>
          </form>
        </div>

        <div className="text-center mt-4 text-xs text-text-secondary/50">
          <p>
            Partecipante: <strong>Nome Cognome</strong> / <strong>1234</strong>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
