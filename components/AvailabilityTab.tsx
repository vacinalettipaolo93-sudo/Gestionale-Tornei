// components/AvailabilityTab.tsx
import React, { useEffect, useMemo, useState } from "react";
import AvailabilityRow from "./AvailabilityRow";
import { getAvailabilitiesForPlayers, getUserAvailabilities } from "../services/availabilityService";
import { type Event, type Tournament, type Group } from "../types";

/**
 * Props:
 * - event, tournament: da passare come in TournamentView
 * - selectedGroup: il girone attualmente selezionato (da TournamentView)
 * - loggedInPlayerId: id del giocatore loggato (player.id), può essere undefined se non loggato
 *
 * Questo componente mostra per i prossimi N giorni le disponibilità dei partecipanti del girone
 * e permette al giocatore loggato (se presente) di modificare le proprie.
 */
type Props = {
  event: Event;
  tournament: Tournament;
  selectedGroup: Group;
  loggedInPlayerId?: string;
  rangeDays?: number;
};

function formatDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`; // YYYY-MM-DD per storage/lookup
}

function formatDisplayDate(isoDate: string) {
  // isoDate atteso: YYYY-MM-DD -> ritorna DD-MM-YYYY
  const parts = isoDate.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  const d = new Date(isoDate);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

export default function AvailabilityTab({ event, tournament, selectedGroup, loggedInPlayerId, rangeDays = 14 }: Props) {
  const [today] = useState(() => new Date());
  const dates = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      arr.push(formatDateKey(d));
    }
    return arr;
  }, [today, rangeDays]);

  const participantIds = selectedGroup.playerIds ?? [];
  const [availMap, setAvailMap] = useState<Record<string, Record<string, Record<string, boolean>>>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const recs = await getAvailabilitiesForPlayers(participantIds, dates[0], dates[dates.length - 1]);
        // map: availMap[playerId][date][slot] = isAvailable
        const m: Record<string, Record<string, Record<string, boolean>>> = {};
        recs.forEach(r => {
          if (!m[r.playerId]) m[r.playerId] = {};
          if (!m[r.playerId][r.date]) m[r.playerId][r.date] = {};
          m[r.playerId][r.date][r.slot] = r.isAvailable;
        });
        if (mounted) setAvailMap(m);
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [participantIds, dates]);

  if (loading) return <div>Caricamento disponibilità…</div>;

  return (
    <div className="max-w-4xl mx-auto bg-secondary rounded-xl p-6 shadow space-y-6">
      <h3 className="text-xl font-bold text-accent">Disponibilità del Girone — Prossimi {dates.length} giorni</h3>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonna: le tue disponibilità (editable) */}
        <div>
          <h4 className="font-semibold mb-3">Le tue disponibilità</h4>
          {loggedInPlayerId ? (
            <div className="bg-primary p-3 rounded-lg border border-tertiary space-y-2">
              {dates.map(date => (
                <AvailabilityRow
                  key={date}
                  playerId={loggedInPlayerId}
                  date={date} // YYYY-MM-DD internamente
                  editable={true}
                  initial={availMap[loggedInPlayerId]?.[date]}
                  onChange={async () => {
                    const recs = await getUserAvailabilities(loggedInPlayerId, dates[0], dates[dates.length - 1]);
                    const m: Record<string, Record<string, Record<string, boolean>>> = {};
                    recs.forEach(r => {
                      if (!m[r.playerId]) m[r.playerId] = {};
                      if (!m[r.playerId][r.date]) m[r.playerId][r.date] = {};
                      m[r.playerId][r.date][r.slot] = r.isAvailable;
                    });
                    setAvailMap(prev => ({ ...prev, ...m }));
                  }}
                />
              ))}
            </div>
          ) : (
            <div>Per modificare le disponibilità esegui il login.</div>
          )}
        </div>

        {/* Colonna: elenco partecipanti e disponibilità (visualizzazione) */}
        <div className="lg:col-span-2">
          <h4 className="font-semibold mb-3">Partecipanti — Disponibilità</h4>
          <div className="bg-primary p-4 rounded-lg border border-tertiary space-y-3 max-h-[520px] overflow-auto">
            {participantIds.map(pid => {
              const player = event.players.find(p => p.id === pid);
              return (
                <div key={pid} className="mb-4">
                  <div className="font-semibold">{player ? player.name : pid}</div>
                  <div className="mt-2 space-y-1">
                    {dates.map(date => (
                      <div key={date} className="flex items-center gap-3">
                        <div className="w-36 text-sm">{formatDisplayDate(date)}</div>
                        {(["MORNING","AFTERNOON","EVENING"] as const).map(s => {
                          const val = availMap[pid]?.[date]?.[s];
                          const label = val === undefined ? "Disponibile" : (val ? "Disponibile" : "Non disponibile");
                          const bg = val === false ? "bg-red-100" : "bg-green-50";
                          return (
                            <div key={s} className={`${bg} border border-tertiary/30 rounded-md px-3 py-2 min-w-[140px]`}>
                              <div className="font-semibold text-sm">{s === "MORNING" ? "Mattina" : s === "AFTERNOON" ? "Pomeriggio" : "Sera"}</div>
                              <div className="text-xs text-text-secondary">{label}</div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
