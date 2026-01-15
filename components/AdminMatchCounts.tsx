import React, { useMemo, useState } from "react";
import { type Event, type Player } from "../types";

/**
 * AdminMatchCounts
 *
 * - Usa i dati già presenti in `event` (players + tournaments[].groups[].matches)
 * - Conta per ogni giocatore:
 *    played   = numero di match con status === 'completed' a cui partecipa
 *    scheduled = numero di match non-completed a cui partecipa
 *    remaining = maxMatches - played (min 0)
 * - Mostra gruppi 0..maxMatches in ordine crescente; esclude chi ha played > maxMatches
 *
 * Nota: questa versione lavora sugli oggetti in memoria (event). Se il tuo modello usa collezioni
 * Firestore esterne, è possibile adattare la logica a query remote.
 */

type Row = {
  playerId: string;
  name: string;
  played: number;
  scheduled: number;
  remaining: number;
};

export default function AdminMatchCounts({
  event,
  defaultMax = 4,
}: {
  event: Event;
  defaultMax?: number;
}) {
  const [maxMatches, setMaxMatches] = useState<number>(defaultMax);

  const rows: Row[] = useMemo(() => {
    const playerMap = new Map<string, { name: string; played: number; scheduled: number }>();

    (Array.isArray(event.players) ? event.players : []).forEach((p: Player) => {
      playerMap.set(p.id, { name: p.name ?? p.nickname ?? p.id, played: 0, scheduled: 0 });
    });

    // Iterate tournaments -> groups -> matches
    (Array.isArray(event.tournaments) ? event.tournaments : []).forEach((t) => {
      (Array.isArray(t.groups) ? t.groups : []).forEach((g) => {
        (Array.isArray(g.matches) ? g.matches : []).forEach((m: any) => {
          // Safely read players
          const p1: string | undefined = m?.player1Id;
          const p2: string | undefined = m?.player2Id;
          const status: string | undefined = m?.status;

          const isCompleted = status === "completed" || status === "finished";
          // If completed increment played for involved players
          if (p1 && playerMap.has(p1)) {
            const rec = playerMap.get(p1)!;
            if (isCompleted) rec.played += 1;
            else rec.scheduled += 1;
          }
          if (p2 && playerMap.has(p2)) {
            const rec = playerMap.get(p2)!;
            if (isCompleted) rec.played += 1;
            else rec.scheduled += 1;
          }
        });
      });
    });

    const out: Row[] = [];
    for (const [playerId, data] of playerMap.entries()) {
      out.push({
        playerId,
        name: data.name,
        played: data.played,
        scheduled: data.scheduled,
        remaining: Math.max(0, maxMatches - data.played),
      });
    }

    return out
      .filter((r) => r.played <= maxMatches) // esclude chi ha giocato > maxMatches
      .sort((a, b) => a.played - b.played || a.name.localeCompare(b.name));
  }, [event, maxMatches]);

  // Build groups 0..maxMatches
  const groups: Record<number, Row[]> = {};
  for (let i = 0; i <= maxMatches; i++) groups[i] = [];
  rows.forEach((r) => {
    if (r.played <= maxMatches) groups[r.played]?.push(r);
  });

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
              <option key={n} value={n}>
                {n}
              </option>
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
                      <th className="pr-6">Giocate</th>
                      <th className="pr-6">In programma</th>
                      <th className="pr-6">Rimanenti</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups[i].map((r) => (
                      <tr key={r.playerId} className="border-t border-tertiary/40">
                        <td className="py-2">{r.name}</td>
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
