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
 * AvailabilityTab — mostra per-date la disponibilità dei partecipanti e, dentro ogni data,
 * quali slot (creati dall'amministratore) ciascun partecipante ha segnato come "voglio giocare".
 *
 * Aggiornamento richiesto:
 * - nelle celle della tabella mostra SOLO l'orario di inizio (es. "8.00", "9.30") in verde, senza contorno né sfondo.
 * - nella lista "Slot futuri creati dall'amministratore" mostra la data, l'orario di inizio (verde) e poi location/campo.
 *
 * Non modifica altro del progetto.
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

// Format start time as requested: "8.00", "9.30", etc.
// Use no leading zero for hour (so 08 -> "8.00"), show minutes with two digits after dot.
function formatHourDotFromIso(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const h = String(d.getHours()); // no pad
  const m = pad2(d.getMinutes());
  return `${h}.${m}`;
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
    // sort each date's slots by start
    Object.keys(m).forEach(k => {
      m[k].sort((a, b) => {
        const ta = new Date((a as any).start ?? (a as any).time).getTime();
        const tb = new Date((b as any).start ?? (b as any).time).getTime();
        return ta - tb;
      });
    });
    return m;
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
                        // find slots for this date
                        const slotsForDate = dateSlotsMap[dk] ?? [];
                        // find which of these slots participant selected
                        const selectedSlotIds = Array.from(slotPrefMap[p.id] ?? new Set<string>());
                        const selectedSlotsOnDate = slotsForDate.filter(s => {
                          const sid = (s as any).id ?? (s as any).time ?? JSON.stringify(s);
                          return selectedSlotIds.includes(sid);
                        });
                        return (
                          <td key={dk} className="px-3 py-2 align-top">
                            {unavailable ? (
                              <div className="text-red-600 font-semibold">Non disponibile</div>
                            ) : (
                              <>
                                {selectedSlotsOnDate.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {selectedSlotsOnDate.map(s => {
                                      const startIso = (s as any).start ?? (s as any).time ?? "";
                                      const hourDot = formatHourDotFromIso(startIso); // e.g. "8.00"
                                      return (
                                        <div key={(s as any).id ?? startIso} className="">
                                          {/* Time text in green, no outline or background, single hour only */}
                                          <span className="font-semibold text-xs text-green-600">{hourDot}</span>
                                        </div>
                                      );
                                    })}
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

          {/* Slots list (below table) - SHOW FULL DETAILS: date, start time (green), location, field */}
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
                  const hourDot = formatHourDotFromIso(startIso); // e.g. "8.00"
                  const location = (slot as any).location ?? "";
                  const field = (slot as any).field ?? "";
                  return (
                    <div key={slotId} className="bg-primary p-3 rounded-lg border border-tertiary flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        {/* Date small */}
                        <div className="text-sm text-text-secondary mb-1">{formatDisplayDateKey(slotDateKey)}</div>
                        {/* Start time in green (prominent), single hour */}
                        <div className="font-semibold text-green-600 mb-1">{hourDot}</div>
                        {/* FULL details: location and field */}
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
