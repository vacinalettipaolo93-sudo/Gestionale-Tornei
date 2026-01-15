import React, { useMemo, useState } from "react";
import { type Event, type Player, type Tournament } from "../types";

/**
 * AdminMatchCounts
 *
 * - Mostra solo i giocatori assegnati ad almeno un torneo/girone.
 * - Conta per ogni giocatore:
 *    played   = numero di match con status === 'completed' o 'finished' a cui partecipa
 *    scheduled = numero di match NON completed ma effettivamente prenotati/assegnati a uno slot
 *    remaining = maxMatches - played (min 0)
 * - Mostra gruppi 0..maxMatches in ordine crescente; esclude chi ha fatto > maxMatches
 * - Mostra in quale torneo/girone è il giocatore e permette di cliccare per aprire quel torneo
 *
 * Definizione di "prenotata":
 *   - match.id è referenziato in tournament.timeSlots[*].matchId oppure in event.globalTimeSlots[*].matchId
 *   - oppure match contiene campi come timeSlotId, matchId (non-null) o date/start
 */

type Row = {
  playerId: string;
  name: string;
  played: number;
  scheduled: number;
  remaining: number;
  tournamentId?: string;
  tournamentName?: string;
  groupId?: string;
  groupName?: string;
};

export default function AdminMatchCounts({
  event,
  defaultMax = 4,
  onSelectTournament,
}: {
  event: Event;
  defaultMax?: number;
  onSelectTournament?: (t: Tournament, initialTab?: string, initialGroupId?: string) => void;
}) {
  const [maxMatches, setMaxMatches] = useState<number>(defaultMax);

  const rows: Row[] = useMemo(() => {
    // Build placement map: first tournament/group where player appears
    const placement = new Map<string, { tournamentId: string; tournamentName?: string; groupId: string; groupName?: string }>();
    (Array.isArray(event.tournaments) ? event.tournaments : []).forEach(t => {
      (Array.isArray(t.groups) ? t.groups : []).forEach((g: any) => {
        (Array.isArray(g.playerIds) ? g.playerIds : []).forEach((pid: string) => {
          if (!placement.has(pid)) {
            placement.set(pid, { tournamentId: t.id, tournamentName: t.name, groupId: g.id, groupName: g.name });
          }
        });
      });
    });

    // If no placements, return empty
    if (placement.size === 0) return [];

    // Build map of players that are assigned (only these will be considered)
    const playerMap = new Map<string, { name: string; played: number; scheduled: number }>();
    (Array.isArray(event.players) ? event.players : []).forEach((p: Player) => {
      if (placement.has(p.id)) {
        playerMap.set(p.id, { name: p.name ?? p.nickname ?? p.id, played: 0, scheduled: 0 });
      }
    });

    // Build set of booked match ids by scanning tournament.timeSlots and event.globalTimeSlots
    const bookedMatchIds = new Set<string>();
    (Array.isArray(event.tournaments) ? event.tournaments : []).forEach(t => {
      if (Array.isArray((t as any).timeSlots)) {
        (t as any).timeSlots.forEach((ts: any) => {
          if (ts && ts.matchId) bookedMatchIds.add(String(ts.matchId));
        });
      }
    });
    if (Array.isArray((event as any).globalTimeSlots)) {
      (event as any).globalTimeSlots.forEach((ts: any) => {
        if (ts && ts.matchId) bookedMatchIds.add(String(ts.matchId));
      });
    }

    // Iterate tournaments -> groups -> matches to count played/scheduled (scheduled only if booked)
    (Array.isArray(event.tournaments) ? event.tournaments : []).forEach((t) => {
      (Array.isArray(t.groups) ? t.groups : []).forEach((g) => {
        (Array.isArray(g.matches) ? g.matches : []).forEach((m: any) => {
          const matchId = m?.id ?? m?.matchId ?? null;
          const p1: string | undefined = m?.player1Id;
          const p2: string | undefined = m?.player2Id;
          const status: string | undefined = m?.status;
          const isCompleted = status === "completed" || status === "finished";

          // Determine if this match is actually booked:
          const hasDate = !!(m?.date || m?.start || m?.time);
          const hasTimeSlotField = !!(m?.timeSlotId || m?.slotId || m?.matchId);
          const isBooked = (matchId && bookedMatchIds.has(String(matchId))) || hasDate || hasTimeSlotField;

          if (p1 && playerMap.has(p1)) {
            const rec = playerMap.get(p1)!;
            if (isCompleted) rec.played += 1;
            else if (isBooked) rec.scheduled += 1;
          }
          if (p2 && playerMap.has(p2)) {
            const rec = playerMap.get(p2)!;
            if (isCompleted) rec.played += 1;
            else if (isBooked) rec.scheduled += 1;
          }
        });
      });
    });

    const out: Row[] = [];
    for (const [playerId, data] of playerMap.entries()) {
      const place = placement.get(playerId);
      out.push({
        playerId,
        name: data.name,
        played: data.played,
        scheduled: data.scheduled,
        remaining: Math.max(0, maxMatches - data.played),
        tournamentId: place?.tournamentId,
        tournamentName: place?.tournamentName,
        groupId: place?.groupId,
        groupName: place?.groupName,
      });
    }

    return out
      .filter((r) => r.played <= maxMatches) // exclude who played > maxMatches
      .sort((a, b) => a.played - b.played || a.name.localeCompare(b.name));
  }, [event, maxMatches]);

  // Build groups 0..maxMatches
  const groups: Record<number, Row[]> = {};
  for (let i = 0; i <= maxMatches; i++) groups[i] = [];
  rows.forEach((r) => {
    if (r.played <= maxMatches) groups[r.played]?.push(r);
  });

  function handlePlayerClick(row: Row) {
    if (!onSelectTournament) return;
    if (!row.tournamentId) return;
    const t = (event.tournaments ?? []).find(tt => tt.id === row.tournamentId);
    if (!t) return;
    onSelectTournament(t, 'participants', row.groupId);
  }

  return (
    <div className="bg-secondary/90 p-4 rounded-xl mb-6 border border-tertiary">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-accent">Controllo partite giocatori (Admin)</h3>
        <div className="flex items-center gap-2">
          <label className="text-sm text-text-secondary mr-2">Mostra fino a:</label>
          <select
            value={maxMatches}
            onChange={(e) => setMaxMatches(parseInt(e.target.value, 10))}
            className="bg-primary border border-tertiary text-text-primary rounded px-2 py-1"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        {Array.from({ length: maxMatches + 1 }, (_, i) => i).map((i) => (
          <section key={i} className="mb-4">
            <h4 className="text-sm font-semibold text-text-secondary mb-2">{i} partite</h4>
            {groups[i] && groups[i].length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full table-auto text-sm">
                  <thead>
                    <tr className="text-left text-text-secondary">
                      <th className="pr-6">Giocatore</th>
                      <th className="pr-6">Torneo / Girone</th>
                      <th className="pr-6">Giocate</th>
                      <th className="pr-6">In programma</th>
                      <th className="pr-6">Rimanenti</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups[i].map((r) => (
                      <tr key={r.playerId} className="border-t border-tertiary/40">
                        <td
                          className={`py-2 ${r.tournamentId ? 'cursor-pointer text-accent hover:underline' : ''}`}
                          onClick={() => r.tournamentId && handlePlayerClick(r)}
                          title={r.tournamentId ? 'Vai al torneo e al girone del giocatore' : 'Giocatore non assegnato a nessun torneo'}
                        >
                          {r.name}
                        </td>
                        <td className="py-2 text-text-secondary text-sm">
                          {r.tournamentName ? (
                            <>
                              <span className="font-semibold text-text-primary">{r.tournamentName}</span>
                              {r.groupName ? <span className="ml-2">/ <span className="font-medium">{r.groupName}</span></span> : null}
                            </>
                          ) : (
                            <span className="text-text-secondary">—</span>
                          )}
                        </td>
                        <td className="py-2">{r.played}</td>
                        <td className="py-2">{r.scheduled}</td>
                        <td className="py-2">{r.remaining}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-text-secondary text-sm">Nessun giocatore con {i} partite</div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
