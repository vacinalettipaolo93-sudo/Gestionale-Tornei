// components/AvailabilityRow.tsx
import React, { useState } from "react";
import { Slot } from "../services/availabilityService";
import { setAvailability, removeAvailability } from "../services/availabilityService";

type Props = {
  playerId: string;
  date: string; // YYYY-MM-DD (usato internamente per storage)
  initial?: Partial<Record<Slot, boolean>>; // override per slot; undefined = no override = default disponibile
  editable?: boolean; // se true il giocatore corrente può modificare (il tuo loggedInPlayerId)
  onChange?: () => void;
};

const slots: { key: Slot; label: string }[] = [
  { key: "MORNING", label: "Mattina 8-12" },
  { key: "AFTERNOON", label: "Pomeriggio 12-18" },
  { key: "EVENING", label: "Sera 18-22" },
];

function formatDisplayDate(isoDate: string) {
  // isoDate atteso: YYYY-MM-DD
  const parts = isoDate.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  // fallback
  const d = new Date(isoDate);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

export default function AvailabilityRow({ playerId, date, initial = {}, editable = false, onChange }: Props) {
  const [state, setState] = useState<Partial<Record<Slot, boolean>>>(initial);
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  async function toggleSlot(slot: Slot) {
    const current = state[slot];
    setLoading(l => ({ ...l, [slot]: true }));
    try {
      if (current === undefined) {
        // crea override: non disponibile (isAvailable = false)
        await setAvailability(playerId, date, slot, false);
        setState(s => ({ ...s, [slot]: false }));
      } else {
        // rimuove override -> torna al default disponibile
        await removeAvailability(playerId, date, slot);
        const copy = { ...state };
        delete copy[slot];
        setState(copy);
      }
      onChange?.();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(l => ({ ...l, [slot]: false }));
    }
  }

  return (
    <div className="flex items-center gap-4 py-2 border-b border-tertiary/30">
      <div className="w-36 font-semibold">{formatDisplayDate(date)}</div>
      <div className="flex gap-2 flex-wrap">
        {slots.map(s => {
          const val = state[s.key];
          const bg = val === false ? "bg-red-100" : "bg-green-50";
          return (
            <button
              key={s.key}
              onClick={() => editable && toggleSlot(s.key)}
              disabled={!editable || !!loading[s.key]}
              title={editable ? "Clic per alternare: segna NON disponibile / rimuovi eccezione" : undefined}
              className={`px-3 py-2 rounded-md border ${bg} border-tertiary/30 min-w-[140px] text-left`}
            >
              <div className="text-sm font-semibold">{s.label}</div>
              <div className="text-xs text-text-secondary">
                {val === undefined ? "Disponibile (default)" : (val ? "Disponibile (override)" : "Non disponibile (override)")}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
