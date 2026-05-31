import React, { useState } from 'react';
import { type User } from '../types';

interface LoginProps {
  users: User[];
  onLoginSuccess: (user: User) => void;
}

const NextTsLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 360 120" className={className} aria-label="NEXT TS logo" role="img">
    <text x="0" y="78" fill="#9B1C12" fontSize="76" fontWeight="700" fontFamily="Arial, Helvetica, sans-serif">
      NEXT
    </text>
    <polygon points="208,34 246,54 208,74" fill="#9B1C12" />
    <circle cx="286" cy="64" r="32" fill="none" stroke="#3E4148" strokeWidth="7" />
    <text x="263" y="75" fill="#3E4148" fontSize="28" fontWeight="700" fontFamily="Arial, Helvetica, sans-serif">
      TS
    </text>
  </svg>
);

const PaitoneArenaLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 900 260" className={className} aria-label="Paitone Arena Tennis & Padel Club logo" role="img">
    <circle cx="110" cy="120" r="78" fill="none" stroke="#9FD98A" strokeWidth="12" />
    <path d="M42 120a78 78 0 0 1 156 0" fill="none" stroke="#9FD98A" strokeWidth="12" strokeLinecap="round" opacity="0.9" />
    <path d="M112 198c0-56 45-101 101-101" fill="none" stroke="#5A669B" strokeWidth="12" strokeLinecap="round" />

    <text x="250" y="102" fill="#5A669B" fontSize="54" fontWeight="700" fontFamily="Arial, Helvetica, sans-serif">
      PAITONE ARENA
    </text>
    <text x="250" y="156" fill="#9FD98A" fontSize="34" fontWeight="400" fontFamily="Arial, Helvetica, sans-serif">
      Tennis & Padel Club
    </text>

    <text x="635" y="210" fill="#5A669B" fontSize="28" fontFamily="Brush Script MT, cursive">
      by
    </text>
    <g transform="translate(675 166) scale(0.52)">
      <text x="0" y="78" fill="#5A669B" fontSize="76" fontWeight="700" fontFamily="Arial, Helvetica, sans-serif">
        NEXT
      </text>
      <polygon points="208,34 246,54 208,74" fill="#5A669B" />
      <circle cx="286" cy="64" r="32" fill="none" stroke="#5A669B" strokeWidth="7" />
      <text x="263" y="75" fill="#5A669B" fontSize="28" fontWeight="700" fontFamily="Arial, Helvetica, sans-serif">
        TS
      </text>
    </g>
  </svg>
);

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
      <div className="w-full max-w-4xl flex flex-col items-center">
        <div className="flex flex-col items-center mb-8 text-center w-full">
          <NextTsLogo className="w-52 sm:w-64 h-auto mb-3" />
          <PaitoneArenaLogo className="w-full max-w-3xl h-auto mb-3" />
          <p className="text-text-secondary text-lg">Accedi per continuare</p>
        </div>

        <div className="w-full max-w-sm sm:max-w-md md:max-w-lg bg-secondary p-8 rounded-xl shadow-2xl border border-tertiary/50">
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
