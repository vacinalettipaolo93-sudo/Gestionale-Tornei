import React from 'react';
import { type Match, type Player } from '../types';
import { ArrowDownIcon, ArrowUpIcon, TrophyIcon } from './Icons';
import { SUMMER_RANKING_NAME, calculateSummerRanking } from '../utils/summerRanking';

interface SummerRankingPreviewProps {
  players: Player[];
  matches: Match[];
  onOpen: () => void;
}

const SummerRankingPreview: React.FC<SummerRankingPreviewProps> = ({ players, matches, onOpen }) => {
  const ranking = calculateSummerRanking(players, matches).slice(0, 10);

  return (
    <section className="bg-secondary rounded-xl shadow-lg p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-accent">
            <TrophyIcon className="w-6 h-6" />
            <h2 className="text-2xl font-bold">{SUMMER_RANKING_NAME}</h2>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Top 10 globale con accesso diretto alla classifica completa.
          </p>
        </div>

        <button
          onClick={onOpen}
          className="bg-highlight hover:bg-highlight/90 text-white font-bold py-2 px-4 rounded-lg transition-colors"
        >
          Apri ranking completo
        </button>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-text-secondary border-b border-tertiary">
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Giocatore</th>
              <th className="py-2 pr-3">Punti</th>
              <th className="py-2 pr-3">Forma</th>
            </tr>
          </thead>
          <tbody>
            {ranking.length > 0 ? ranking.map(entry => (
              <tr key={entry.player.id} className="border-b border-tertiary/40 last:border-b-0">
                <td className="py-3 pr-3 font-bold text-accent">{entry.rank}</td>
                <td className="py-3 pr-3 font-semibold">{entry.player.name}</td>
                <td className="py-3 pr-3 font-bold">{entry.points}</td>
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2">
                    {entry.trend === 'up' && <ArrowUpIcon className="w-4 h-4 text-green-400" />}
                    {entry.trend === 'down' && <ArrowDownIcon className="w-4 h-4 text-red-400" />}
                    {entry.trend === 'steady' && <span className="text-text-secondary">•</span>}
                    <span className="font-mono text-xs tracking-wide">
                      {entry.recentForm.length > 0 ? entry.recentForm.join(' ') : '—'}
                    </span>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4} className="py-6 text-center text-text-secondary">
                  Nessun giocatore confermato nel ranking.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default SummerRankingPreview;
