// components/AvailabilityTab.tsx
import React, { useEffect, useMemo, useState } from "react";
import { type Event, type Tournament, type Group, type Player, type TimeSlot } from "../types";
import {
  getGlobalAvailabilitiesForPlayers,
  setGlobalAvailability,
  removeGlobalAvailability,
  getSlotPreferencesForPlayers,
  setSlotPreference,
  removeSlotPreference,
  getDateUnavailabilitiesForPlayers,
  setDateUnavailability,
  removeDateUnavailability,
} from "../services/availabilityService";

/**
 * Disponibilità di gioco estesa:
 * - mantiene il toggle globale (disponibile / non disponibile) se vuoi ancora usarlo
 * - aggiunge toggle "Non disponibile" per singole date (YYYY-MM-DD) prese dagli slot futuri
 * - lista slot futuri (esclude slot già prenotati) su cui segnare interesse
 *
 * Nota: le date visualizzate sono le date (YYYY-MM-DD) estratte dagli slot futuri creati dall'amministratore.
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

  // booked slot ids across event
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

  // now and future slots (exclude booked slots)
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
  // globalMap[playerId] = boolean | undefined
  // slotPrefMap[playerId] = Set(slotId)
  // dateUnavailMap[playerId] = Set(dateKey)
  const [globalMap, setGlobalMap] = useState<Record<string, boolean | undefined>>({});
  const [slotPrefMap, setSlotPrefMap] = useState<Record<string, Set<string>>>({});
  const [dateUnavailMap, setDateUnavailMap] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const [globals, slotPrefs, dateUnavails] = await Promise.all([
          getGlobalAvailabilitiesForPlayers(participantIds),
          getSlotPreferencesForPlayers(participantIds),
          // fetch date unavailabilities limited to dateKeys range if any
          getDateUnavailabilitiesForPlayers(participantIds, dateKeys[0] ?? "", dateKeys[dateKeys.length - 1] ?? "")
        ]);

        const gMap: Record<string, boolean | undefined> = {};
        globals.forEach(g => { gMap[g.playerId] = g.available; });

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
          setGlobalMap(gMap);
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

  // toggle global availability (unchanged)
  async function toggleMyGlobal() {
    if (!loggedInPlayerId) return;
    const current = globalMap[loggedInPlayerId];
    try {
      if (current === undefined) {
        await setGlobalAvailability(loggedInPlayerId, false);
        setGlobalMap(m => ({ ...m, [loggedInPlayerId]: false }));
      } else {
        await removeGlobalAvailability(loggedInPlayerId);
        const next = { ...globalMap };
        delete next[loggedInPlayerId];
        setGlobalMap(next);
      }
    } catch (err) {
      console.error(err);
    }
  }

  // toggle slot preference (unchanged)
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

  // toggle date unavailability (new)
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

  return (
    <div className="max-w-6xl mx-auto bg-secondary rounded-xl p-6 shadow space-y-6">
      <h3 className="text-xl font-bold text-accent">Disponibilità di gioco</h3>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: global + per-date controls */}
        <div className="bg-primary p-4 rounded-lg border border-tertiary space-y-4">
          <h4 className="font-semibold">Stato generale</h4>
          {loggedInPlayerId ? (
            <>
              <div className="mb-2">
                <div className="text-sm text-text-secondary mb-1">Il tuo stato globale</div>
                <div className={`inline-block px-3 py-2 rounded ${globalMap[loggedInPlayerId] === false ? 'bg-red-100' : 'bg-green-50'} border border-tertiary/30`}>
                  {globalMap[loggedInPlayerId] === false ? 'Non disponibile (globale)' : 'Disponibile (default)'}
                </div>
              </div>
              <button onClick={toggleMyGlobal} className="bg-accent hover:bg-highlight text-white px-4 py-2 rounded">
                {globalMap[loggedInPlayerId] === false ? 'Rendi Disponibile (rimuovi non disponibile)' : 'Segna Non disponibile (globale)'}
              </button>

              <div className="mt-4">
                <h5 className="font-semibold mb-2">Non disponibile per date</h5>
                {dateKeys.length === 0 ? (
                  <div className="text-text-secondary text-sm">Nessuna data futura disponibile (gli slot futuri non sono presenti).</div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-auto pr-2">
                    {dateKeys.map(dk => {
                      const countUnavailable = participants.filter(p => dateUnavailMap[p.id]?.has(dk)).length;
                      const myUnavail = loggedInPlayerId ? (dateUnavailMap[loggedInPlayerId]?.has(dk) ?? false) : false;
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
                                {myUnavail ? 'Rimosso: Non disponibile' : 'Segna Non disponibile'}
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
            </>
          ) : (
            <div>Effettua il login per impostare le tue disponibilità.</div>
          )}
        </div>

        {/* Right columns: slots list with interest toggles */}
        <div className="lg:col-span-2">
          <h4 className="font-semibold mb-3">Slot futuri creati dall'amministratore</h4>
          {futureSlots.length === 0 ? (
            <div className="bg-primary p-4 rounded-lg border border-tertiary">Nessuno slot futuro disponibile creato dall'amministratore per questo torneo.</div>
          ) : (
            <div className="space-y-4">
              {futureSlots.map(slot => {
                const slotId = (slot as any).id ?? (slot as any).time ?? JSON.stringify(slot);
                // if slot's date is marked by the user as unavailable, disable toggle for that user
                const slotDateKey = formatDateKeyFromIso((slot as any).start ?? (slot as any).time ?? "");
                const myDateUnavail = loggedInPlayerId ? (dateUnavailMap[loggedInPlayerId]?.has(slotDateKey) ?? false) : false;
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
  );
}
