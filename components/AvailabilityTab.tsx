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
} from "../services/availabilityService";

/**
 * Disponibilità semplificata (mostra solo slot futuri):
 * - titolo: "Disponibilità di gioco"
 * - stato globale: disponibile (default) / non disponibile (override persisted)
 * - lista slots creati dall'amministratore: l'utente può marcarsi come "voglio giocare" su uno slot (toggle)
 *
 * Props:
 * - event, tournament: per reperire lista slot e lista partecipanti
 * - selectedGroup: il girone corrente
 * - loggedInPlayerId: id del giocatore loggato (player.id)
 */

type Props = {
  event: Event;
  tournament: Tournament;
  selectedGroup: Group;
  loggedInPlayerId?: string;
};

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

  const [globalMap, setGlobalMap] = useState<Record<string, boolean | undefined>>({});
  const [slotPrefMap, setSlotPrefMap] = useState<Record<string, Set<string>>>({}); // playerId -> set(slotId)

  const [loading, setLoading] = useState(true);

  // filter only future slots (strictly greater than now)
  const now = useMemo(() => new Date(), []);
  const slots = useMemo(() => {
    return allSlots.filter(s => {
      const startIso = (s as any).start ?? (s as any).time ?? null;
      if (!startIso) return false;
      const t = new Date(startIso);
      return !isNaN(t.getTime()) && t.getTime() > now.getTime();
    });
  }, [allSlots, now]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        // globals
        const globals = await getGlobalAvailabilitiesForPlayers(participantIds);
        const gMap: Record<string, boolean | undefined> = {};
        globals.forEach(g => { gMap[g.playerId] = g.available; });
        // slot prefs
        const prefs = await getSlotPreferencesForPlayers(participantIds);
        const sMap: Record<string, Set<string>> = {};
        prefs.forEach(p => {
          if (!sMap[p.playerId]) sMap[p.playerId] = new Set<string>();
          if (p.isPreferred) sMap[p.playerId].add(p.slotId);
        });
        if (mounted) {
          setGlobalMap(gMap);
          setSlotPrefMap(sMap);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [participantIds, tournament.id, event.id]);

  // helper: toggle global for logged in player
  async function toggleMyGlobal() {
    if (!loggedInPlayerId) return;
    const current = globalMap[loggedInPlayerId];
    try {
      if (current === undefined) {
        // default available -> mark non available
        await setGlobalAvailability(loggedInPlayerId, false);
        setGlobalMap(m => ({ ...m, [loggedInPlayerId]: false }));
      } else {
        // if exists -> remove setting to revert to default (available)
        await removeGlobalAvailability(loggedInPlayerId);
        const next = { ...globalMap };
        delete next[loggedInPlayerId];
        setGlobalMap(next);
      }
    } catch (err) {
      console.error(err);
    }
  }

  // helper: toggle slot pref for logged in player
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

  if (loading) return <div>Caricamento disponibilità…</div>;

  return (
    <div className="max-w-5xl mx-auto bg-secondary rounded-xl p-6 shadow space-y-6">
      <h3 className="text-xl font-bold text-accent">Disponibilità di gioco</h3>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonna sinistra: stato globale utente */}
        <div className="bg-primary p-4 rounded-lg border border-tertiary">
          <h4 className="font-semibold mb-3">Stato generale</h4>
          {loggedInPlayerId ? (
            <>
              <div className="mb-3">
                <div className="text-sm text-text-secondary mb-1">Il tuo stato corrente</div>
                <div className={`inline-block px-3 py-2 rounded ${globalMap[loggedInPlayerId] === false ? 'bg-red-100' : 'bg-green-50'} border border-tertiary/30`}>
                  {globalMap[loggedInPlayerId] === false ? 'Non disponibile' : 'Disponibile (default)'}
                </div>
              </div>
              <button
                onClick={toggleMyGlobal}
                className="bg-accent hover:bg-highlight text-white px-4 py-2 rounded"
              >
                {globalMap[loggedInPlayerId] === false ? 'Rendi Disponibile (rimuovi non disponibile)' : 'Segna Non disponibile'}
              </button>
            </>
          ) : (
            <div>Effettua il login per impostare il tuo stato.</div>
          )}

          <div className="mt-6">
            <h5 className="font-semibold">Partecipanti — stato veloce</h5>
            <ul className="mt-2 space-y-2">
              {participants.map(p => (
                <li key={p.id} className="flex items-center justify-between">
                  <div>{p.name}</div>
                  <div className={`${globalMap[p.id] === false ? 'text-red-600' : 'text-green-600'} font-semibold`}>
                    {globalMap[p.id] === false ? 'Non disponibile' : 'Disponibile'}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Colonna centrale: lista slot e toggle preferenza */}
        <div className="lg:col-span-2">
          <h4 className="font-semibold mb-3">Slot futuri creati dall'amministratore</h4>
          {slots.length === 0 ? (
            <div className="bg-primary p-4 rounded-lg border border-tertiary">Nessuno slot futuro creato dall'amministratore per questo torneo.</div>
          ) : (
            <div className="space-y-4">
              {slots.map(slot => {
                const slotId = (slot as any).id ?? (slot as any).time ?? JSON.stringify(slot);
                // count interested players
                const interested = participants.filter(p => slotPrefMap[p.id]?.has(slotId)).map(p => p.name);
                const myPref = loggedInPlayerId ? (slotPrefMap[loggedInPlayerId]?.has(slotId) ?? false) : false;
                return (
                  <div key={slotId} className="bg-primary p-3 rounded-lg border border-tertiary flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <div className="font-semibold">{formatDateTime((slot as any).start ?? (slot as any).time)}</div>
                      <div className="text-sm text-text-secondary">
                        {(slot as any).location ? `${(slot as any).location}${(slot as any).field ? ` - ${(slot as any).field}` : ''}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-sm text-text-secondary mr-2">
                        {interested.length > 0 ? `${interested.length} interessati` : 'Nessuno interessato'}
                        {interested.length > 0 && <div className="text-xs mt-1 text-text-secondary/80">{interested.slice(0,5).join(', ')}{interested.length>5? '...' : ''}</div>}
                      </div>

                      {loggedInPlayerId ? (
                        <button
                          onClick={() => toggleMySlot(slotId)}
                          className={`px-3 py-2 rounded font-semibold ${myPref ? 'bg-green-600 text-white' : 'bg-tertiary text-text-primary'}`}
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
