// components/AvailabilityTab.tsx
import React, { useEffect, useMemo, useState } from "react";
import { type Event, type Tournament, type Group, type Player, type TimeSlot } from "../types";
import {
  getSlotPreferencesForPlayers,
  setSlotPreference,
  removeSlotPreference,
  getDateUnavailabilitiesForPlayers,
  setDateUnavailability,
  removeDateUnavailability,
} from "../services/availabilityService";

/**
 * Disponibilità di gioco (solo per-date, senza stato globale)
 *
 * - L'utente può marcare "Non disponibile" per singole date (YYYY-MM-DD) estratte dagli slot futuri.
 * - Se l'utente è non-disponibile per una data, non può segnare interesse sugli slot di quella data.
 * - Viene mostrata una visuale tabellare dei partecipanti vs date: per ogni cella "Disponibile" / "Non disponibile".
 * - Vengono mostrati anche gli slot futuri non prenotati e l'utente può segnare interesse (se non marcato non-disponibile per la data).
 *
 * Props:
 * - event, tournament: per reperire slots e matches (usati per escludere slot prenotati)
 * - selectedGroup: il girone corrente
 * - loggedInPlayerId: id del giocatore loggato (player.id)
 */

type Props = {
  event: Event;
  tournament: Tournament;
  selectedGroup: Group;
  loggedInPlayerId?: string;
};

function formatDateKeyFromIso(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`; // YYYY-MM-DD
}

function formatDisplayDateKey(key: string) {
  const parts = key.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`; // DD-MM-YYYY
  return key;
}

function formatDateTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

export default function AvailabilityTab({ event, tournament, selectedGroup, loggedInPlayerId }: Props) {
  const participantIds = selectedGroup.playerIds ?? [];
  const participants = participantIds.map(pid => event.players.find(p => p.id === pid)).filter(Boolean) as Player[];

  // pick slots: prefer tournament.timeSlots then event.globalTimeSlots
  const allSlots: TimeSlot[] = Array.isArray(tournament.timeSlots) && tournament.timeSlots.length > 0
    ? (tournament.timeSlots as any as TimeSlot[])
    : (Array.isArray(event.globalTimeSlots) ? (event.globalTimeSlots as any as TimeSlot[]) : []);

  // booked slot ids across the event (matches with slotId scheduled/completed)
  const bookedSlotIds = useMemo(() => {
    return new Set(
      event.tournaments.flatMap(t =>
        t.groups ? t.groups.flatMap(g =>
          g.matches
            .filter(m => m.slotId && (m.status === "scheduled" || m.status === "completed"))
            .map(m => m.slotId!)
        ) : []
      )
    );
  }, [event.tournaments]);

  // now and future slots (exclude booked)
  const now = useMemo(() => new Date(), []);
  const futureSlots = useMemo(() => {
    return allSlots.filter(s => {
      const startIso = (s as any).start ?? (s as any).time ?? null;
      if (!startIso) return false;
      const t = new Date(startIso);
      if (isNaN(t.getTime())) return false;
      if (t.getTime() <= now.getTime()) return false;
      const slotId = (s as any).id ?? (s as any).time ?? null;
      if (!slotId) return false;
      if (bookedSlotIds.has(slotId)) return false;
      return true;
    });
  }, [allSlots, now, bookedSlotIds]);

  // derive unique date keys (YYYY-MM-DD) from futureSlots, sorted
  const dateKeys = useMemo(() => {
    const set = new Set<string>();
    futureSlots.forEach(s => {
      const startIso = (s as any).start ?? (s as any).time ?? null;
      if (!startIso) return;
      const key = formatDateKeyFromIso(startIso);
      if (key) set.add(key);
    });
    return Array.from(set).sort();
  }, [futureSlots]);

  const [loading, setLoading] = useState(true);

  // maps:
  // slotPrefMap[playerId] = Set(slotId)
  // dateUnavailMap[playerId] = Set(dateKey)
  const [slotPrefMap, setSlotPrefMap] = useState<Record<string, Set<string>>>({});
  const [dateUnavailMap, setDateUnavailMap] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const [slotPrefs, dateUnavails] = await Promise.all([
          getSlotPreferencesForPlayers(participantIds),
          getDateUnavailabilitiesForPlayers(participantIds, dateKeys[0] ?? "", dateKeys[dateKeys.length - 1] ?? "")
        ]);

        const sMap: Record<string, Set<string>> = {};
        slotPrefs.forEach(p => {
          if (!sMap[p.playerId]) sMap[p.playerId] = new Set<string>();
          if (p.isPreferred) sMap[p.playerId].add(p.slotId);
        });

        const dMap: Record<string, Set<string>> = {};
        dateUnavails.forEach(d => {
          if (!dMap[d.playerId]) dMap[d.playerId] = new Set<string>();
          if (d.unavailable) dMap[d.playerId].add(d.date);
        });

        if (mounted) {
          setSlotPrefMap(sMap);
          setDateUnavailMap(dMap);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [participantIds, dateKeys.join(","), tournament.id, event.id]);

  // toggle slot preference
  async function toggleMySlot(slotId: string) {
    if (!loggedInPlayerId) return;
    const mySet = slotPrefMap[loggedInPlayerId] ?? new Set<string>();
    const has = mySet.has(slotId);
    try {
      if (!has) {
        await setSlotPreference(loggedInPlayerId, slotId, true);
        setSlotPrefMap(m => ({ ...m, [loggedInPlayerId]: new Set([...(m[loggedInPlayerId] ? Array.from(m[loggedInPlayerId]) : []), slotId]) }));
      } else {
        await removeSlotPreference(loggedInPlayerId, slotId);
        setSlotPrefMap(m => {
          const copy = { ...m };
          const s = new Set(copy[loggedInPlayerId] ? Array.from(copy[loggedInPlayerId]) : []);
          s.delete(slotId);
          copy[loggedInPlayerId] = s;
          return copy;
        });
      }
    } catch (err) {
      console.error(err);
    }
  }

  // toggle date unavailability
  async function toggleMyDateUnavail(dateKey: string) {
    if (!loggedInPlayerId) return;
    const mySet = dateUnavailMap[loggedInPlayerId] ?? new Set<string>();
    const has = mySet.has(dateKey);
    try {
      if (!has) {
        await setDateUnavailability(loggedInPlayerId, dateKey, true);
        setDateUnavailMap(m => ({ ...m, [loggedInPlayerId]: new Set([...(m[loggedInPlayerId] ? Array.from(m[loggedInPlayerId]) : []), dateKey]) }));
      } else {
        await removeDateUnavailability(loggedInPlayerId, dateKey);
        setDateUnavailMap(m => {
          const copy = { ...m };
          const s = new Set(copy[loggedInPlayerId] ? Array.from(copy[loggedInPlayerId]) : []);
          s.delete(dateKey);
          copy[loggedInPlayerId] = s;
          return copy;
        });
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) return <div>Caricamento disponibilità…</div>;

  // helper to check participant availability on a given dateKey
  function isParticipantUnavailableOn(pId: string, dateKey: string) {
    return !!(dateUnavailMap[pId]?.has(dateKey));
  }

  return (
    <div className="max-w-6xl mx-auto bg-secondary rounded-xl p-6 shadow space-y-6">
      <h3 className="text-xl font-bold text-accent">Disponibilità di gioco</h3>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: per-date toggles */}
        <div className="lg:col-span-1 bg-primary p-4 rounded-lg border border-tertiary space-y-4">
          <h4 className="font-semibold">Non disponibile per date</h4>
          {dateKeys.length === 0 ? (
            <div className="text-text-secondary text-sm">Nessuna data futura (gli slot futuri non sono presenti).</div>
          ) : (
            <div className="space-y-2 max-h-[52vh] overflow-auto pr-2">
              {dateKeys.map(dk => {
                const countUnavailable = participants.filter(p => isParticipantUnavailableOn(p.id, dk)).length;
                const myUnavail = loggedInPlayerId ? isParticipantUnavailableOn(loggedInPlayerId, dk) : false;
                return (
                  <div key={dk} className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{formatDisplayDateKey(dk)}</div>
                      <div className="text-xs text-text-secondary">{countUnavailable > 0 ? `${countUnavailable} non disponibili` : 'Tutti disponibili'}</div>
                    </div>
                    <div>
                      {loggedInPlayerId ? (
                        <button
                          onClick={() => toggleMyDateUnavail(dk)}
                          className={`px-3 py-2 rounded ${myUnavail ? 'bg-red-600 text-white' : 'bg-tertiary text-text-primary'}`}
                        >
                          {myUnavail ? 'Rimuovi: Non disponibile' : 'Segna Non disponibile'}
                        </button>
                      ) : (
                        <div className="text-sm text-text-secondary">Login per impostare</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Middle: participants x dates availability table */}
        <div className="lg:col-span-3">
          <h4 className="font-semibold mb-3">Disponibilità partecipanti per data</h4>

          {dateKeys.length === 0 ? (
            <div className="bg-primary p-4 rounded-lg border border-tertiary">Nessuna data futura disponibile.</div>
          ) : (
            <div className="overflow-auto bg-primary p-3 rounded-lg border border-tertiary">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="text-left pr-4 pb-2 font-semibold">Giocatore</th>
                    {dateKeys.map(dk => (
                      <th key={dk} className="text-left px-3 pb-2 font-semibold">{formatDisplayDateKey(dk)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {participants.map(p => (
                    <tr key={p.id} className="odd:bg-primary/60">
                      <td className="py-2 pr-4 font-medium">{p.name}</td>
                      {dateKeys.map(dk => {
                        const unavailable = isParticipantUnavailableOn(p.id, dk);
                        return (
                          <td key={dk} className="px-3 py-2">
                            <span className={unavailable ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                              {unavailable ? 'Non disponibile' : 'Disponibile'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Slots list (below table) */}
          <div className="mt-6">
            <h4 className="font-semibold mb-3">Slot futuri creati dall'amministratore</h4>
            {futureSlots.length === 0 ? (
              <div className="bg-primary p-4 rounded-lg border border-tertiary">Nessuno slot futuro disponibile creato dall'amministratore per questo torneo.</div>
            ) : (
              <div className="space-y-4">
                {futureSlots.map(slot => {
                  const slotId = (slot as any).id ?? (slot as any).time ?? JSON.stringify(slot);
                  const slotDateKey = formatDateKeyFromIso((slot as any).start ?? (slot as any).time ?? "");
                  const myDateUnavail = loggedInPlayerId ? isParticipantUnavailableOn(loggedInPlayerId, slotDateKey) : false;
                  const interested = participants.filter(p => slotPrefMap[p.id]?.has(slotId)).map(p => p.name);
                  const myPref = loggedInPlayerId ? (slotPrefMap[loggedInPlayerId]?.has(slotId) ?? false) : false;
                  return (
                    <div key={slotId} className="bg-primary p-3 rounded-lg border border-tertiary flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <div className="font-semibold">{formatDateTime((slot as any).start ?? (slot as any).time)}</div>
                        <div className="text-sm text-text-secondary">
                          {(slot as any).location ? `${(slot as any).location}${(slot as any).field ? ` - ${(slot as any).field}` : ''}` : ''}
                        </div>
                        <div className="text-xs text-text-secondary mt-1">
                          {interested.length > 0 ? `${interested.length} interessati` : 'Nessuno interessato'}
                        </div>
                        {myDateUnavail && <div className="text-xs text-red-600 mt-1">Hai segnato NON disponibile per questa data — non puoi segnare interesse qui.</div>}
                      </div>

                      <div className="flex items-center gap-3">
                        {loggedInPlayerId ? (
                          <button
                            onClick={() => toggleMySlot(slotId)}
                            disabled={myDateUnavail}
                            className={`px-3 py-2 rounded font-semibold ${myPref ? 'bg-green-600 text-white' : 'bg-tertiary text-text-primary'} ${myDateUnavail ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {myPref ? 'Segnato: Voglio giocare' : 'Segna: Voglio giocare'}
                          </button>
                        ) : (
                          <div className="text-sm text-text-secondary">Login per segnare interesse</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
