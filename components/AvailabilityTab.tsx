// components/AvailabilityTab.tsx
import React, { useEffect, useMemo, useState } from "react";
import { type Event, type Tournament, type Group, type Player, type TimeSlot } from "../types";
import {
  setSlotPreference,
  removeSlotPreference,
  setDateUnavailability,
  removeDateUnavailability,
} from "../services/availabilityService";
import { db } from "../firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

/**
 * AvailabilityTab (persistent + realtime)
 *
 * - Salva le preferenze usando i servizi (setSlotPreference / removeSlotPreference, setDateUnavailability / removeDateUnavailability).
 * - Sostituisce il fetch one-shot con listener realtime (onSnapshot) su:
 *     - collection "slot_preferences"
 *     - collection "date_unavailabilities"
 *   per i player del girone (chunking fino a 10 ids per query).
 *
 * Questo assicura che dopo che una scrittura è stata effettuata essa sia vista immediatamente dalla UI e sopravviva al reload.
 */

type Props = {
  event: Event;
  tournament: Tournament;
  selectedGroup: Group;
  loggedInPlayerId?: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

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

function formatHHMMFromIso(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const h = pad2(d.getHours());
  const m = pad2(d.getMinutes());
  return `${h}:${m}`;
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

  // Build date -> slots map for quick lookup (slots on a date)
  const dateSlotsMap = useMemo(() => {
    const m: Record<string, TimeSlot[]> = {};
    futureSlots.forEach(s => {
      const startIso = (s as any).start ?? (s as any).time ?? null;
      if (!startIso) return;
      const key = formatDateKeyFromIso(startIso);
      if (!m[key]) m[key] = [];
      m[key].push(s);
    });
    Object.keys(m).forEach(k => {
      m[k].sort((a, b) => {
        const ta = new Date((a as any).start ?? (a as any).time).getTime();
        const tb = new Date((b as any).start ?? (b as any).time).getTime();
        return ta - tb;
      });
    });
    return m;
  }, [futureSlots]);

  // local ui state for prefs / date-unavailabilities
  const [loading, setLoading] = useState(true);
  const [slotPrefMap, setSlotPrefMap] = useState<Record<string, Set<string>>>({});
  const [dateUnavailMap, setDateUnavailMap] = useState<Record<string, Set<string>>>({});

  // --- realtime listeners for slot_preferences and date_unavailabilities ---
  useEffect(() => {
    if (!participantIds || participantIds.length === 0) {
      setSlotPrefMap({});
      setDateUnavailMap({});
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribes: (() => void)[] = [];

    // Firestore 'in' supports up to 10 values — chunk participantIds
    const CHUNK = 10;
    for (let i = 0; i < participantIds.length; i += CHUNK) {
      const chunk = participantIds.slice(i, i + CHUNK);

      // slot preferences listener
      const prefCol = collection(db, "slot_preferences");
      const prefQ = query(prefCol, where("playerId", "in", chunk));
      const unsubPref = onSnapshot(prefQ, snap => {
        // rebuild entire map merging across chunks
        setSlotPrefMap(prevMap => {
          // start from prevMap but we'll recreate global for all participants from all active snapshots
          // to ensure correctness, collect from all subscriptions by reading from each snapshot result
          // Simpler: we will gather current docs across all active prefQ snapshots by storing them externally.
          // Because we are in a multi-snapshot environment, easiest approach is to rebuild from all docs in DB each time:
          // But to avoid extra reads, we merge per-snapshot into previous — acceptable here:
          const copy = { ...(prevMap || {}) };
          // remove entries for players present in this chunk (we'll recalc)
          chunk.forEach(pid => { copy[pid] = new Set<string>(); });
          snap.docs.forEach(d => {
            const data = d.data() as any;
            const pid = data.playerId as string;
            const slotId = data.slotId as string;
            const isPreferred = data.isPreferred === true;
            if (!copy[pid]) copy[pid] = new Set<string>();
            if (isPreferred) copy[pid].add(slotId);
            else copy[pid].delete(slotId);
          });
          return copy;
        });
      });
      unsubscribes.push(unsubPref);

      // date unavailability listener
      const dateCol = collection(db, "date_unavailabilities");
      const dateQ = query(dateCol, where("playerId", "in", chunk));
      const unsubDate = onSnapshot(dateQ, snap => {
        setDateUnavailMap(prevMap => {
          const copy = { ...(prevMap || {}) };
          // reset chunk players
          chunk.forEach(pid => { copy[pid] = new Set<string>(); });
          snap.docs.forEach(d => {
            const data = d.data() as any;
            const pid = data.playerId as string;
            const date = data.date as string;
            const unavailable = data.unavailable === true;
            if (!copy[pid]) copy[pid] = new Set<string>();
            if (unavailable) copy[pid].add(date);
            else copy[pid].delete(date);
          });
          return copy;
        });
      });
      unsubscribes.push(unsubDate);
    }

    // when at least one listener attached mark loading false after a tick
    const id = setTimeout(() => setLoading(false), 200);
    return () => {
      clearTimeout(id);
      unsubscribes.forEach(u => u());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantIds.join(",")]); // re-run if participants change

  // Toggle slot preference: write then local snapshot will update from listener
  async function toggleMySlot(slotId: string) {
    if (!loggedInPlayerId) return;
    const mySet = slotPrefMap[loggedInPlayerId] ?? new Set<string>();
    const has = mySet.has(slotId);
    try {
      if (!has) {
        await setSlotPreference(loggedInPlayerId, slotId, true);
      } else {
        await removeSlotPreference(loggedInPlayerId, slotId);
      }
      // don't update local map here; listener will reflect DB change
    } catch (err) {
      console.error("Errore salvataggio preferenza slot:", err);
    }
  }

  // Toggle date unavailability: write then listener updates state
  async function toggleMyDateUnavail(dateKey: string) {
    if (!loggedInPlayerId) return;
    const mySet = dateUnavailMap[loggedInPlayerId] ?? new Set<string>();
    const has = mySet.has(dateKey);
    try {
      if (!has) {
        await setDateUnavailability(loggedInPlayerId, dateKey, true);
      } else {
        await removeDateUnavailability(loggedInPlayerId, dateKey);
      }
    } catch (err) {
      console.error("Errore salvataggio non-disponibilità per data:", err);
    }
  }

  if (loading) return <div>Caricamento disponibilità…</div>;

  function isParticipantUnavailableOn(pId: string, dateKey: string) {
    return !!(dateUnavailMap[pId]?.has(dateKey));
  }

  // helper: sort hh:mm strings
  function sortHHMMArray(arr: string[]) {
    return arr.slice().sort((a, b) => {
      const [ah, am] = a.split(":").map(Number);
      const [bh, bm] = b.split(":").map(Number);
      return ah !== bh ? ah - bh : am - bm;
    });
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

        {/* Middle/right: participants x dates availability table + slots list */}
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
                        const slotsForDate = dateSlotsMap[dk] ?? [];
                        const selectedSlotIds = Array.from(slotPrefMap[p.id] ?? new Set<string>());
                        const selectedSlotsOnDate = slotsForDate.filter(s => {
                          const sid = (s as any).id ?? (s as any).time ?? JSON.stringify(s);
                          return selectedSlotIds.includes(sid);
                        });

                        // Create unique hh:mm list so same start times across fields are shown only once
                        const uniqueTimes = Array.from(new Set(selectedSlotsOnDate.map(s => formatHHMMFromIso((s as any).start ?? (s as any).time ?? ""))));
                        const sortedTimes = sortHHMMArray(uniqueTimes.filter(Boolean));

                        return (
                          <td key={dk} className="px-3 py-2 align-top">
                            {unavailable ? (
                              <div className="text-red-600 font-semibold">Non disponibile</div>
                            ) : (
                              <>
                                {sortedTimes.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {sortedTimes.map(time => (
                                      <div key={time}>
                                        <span className="font-semibold text-xs text-green-600">{time}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-green-600 font-semibold">Disponibile</div>
                                )}
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Slots list (below table) - SHOW FULL DETAILS */}
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
                  const startIso = (slot as any).start ?? (slot as any).time ?? "";
                  const hhmm = formatHHMMFromIso(startIso); // e.g. "08:00"
                  const location = (slot as any).location ?? "";
                  const field = (slot as any).field ?? "";
                  return (
                    <div key={slotId} className="bg-primary p-3 rounded-lg border border-tertiary flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <div className="text-sm text-text-secondary mb-1">{formatDisplayDateKey(slotDateKey)}</div>
                        <div className="font-semibold text-green-600 mb-1">{hhmm}</div>
                        <div className="text-sm text-text-secondary">
                          {location}{location && field ? " - " : ""}{field}
                        </div>
                        <div className="text-xs text-text-secondary mt-1">
                          {interested.length > 0 ? `${interested.length} interessati: ${interested.slice(0,5).join(', ')}${interested.length>5?'...':''}` : 'Nessuno interessato'}
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
