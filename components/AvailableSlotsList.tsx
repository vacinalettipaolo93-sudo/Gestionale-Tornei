// (updated) components/AvailableSlotsList.tsx
import React from 'react';
import { type Event, type Tournament, type TimeSlot, type Match } from '../types';

interface Props {
  event: Event;
  tournament?: Tournament;
  userId?: string;
  // pass triggerRect so parent can anchor modal precisely
  onClickBook?: (slot: TimeSlot, triggerRect?: DOMRect | null) => void; // solo nel torneo, permette la prenotazione
  matchesPending?: Match[];
}

const formatSlot = (slot: TimeSlot) => {
  const d = new Date(slot.start);
  const date = d.toLocaleDateString('it-IT');
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return `${date} — ${time}`;
};

const AvailableSlotsList: React.FC<Props> = ({
  event,
  tournament,
  userId,
  onClickBook,
  matchesPending = [],
}) => {
  // compute booked slots (valgono in tutto l'evento)
  const bookedIds = event.tournaments
    .flatMap(t => t.groups || [])
    .flatMap(g => g.matches || [])
    .filter(m => m.slotId && (m.status === 'scheduled' || m.status === 'completed'))
    .map(m => m.slotId!);

  const availableSlots = (event.globalTimeSlots || []).filter(
    slot => !bookedIds.includes(slot.id)
  );

  // Se siamo nel TournamentView:
  // prenota solo se c'è almeno una partita pending dell'utente
  // Altrimenti lista solo
  return (
    <div className="bg-secondary p-5 rounded-xl shadow-lg max-w-2xl mx-auto my-8">
      <h3 className="text-lg font-bold mb-4 text-accent">Slot Disponibili</h3>
      {availableSlots.length === 0 ? (
        <p className="text-text-secondary font-semibold">Nessuno slot disponibile.</p>
      ) : (
        <ul className="divide-y divide-tertiary">
          {availableSlots.map(slot => (
            <li key={slot.id} className="flex items-center justify-between py-3">
              <div>
                <span className="font-bold">{formatSlot(slot)}</span>
                {slot.location && <span className="ml-2 text-accent">{slot.location}</span>}
                {slot.field && <span className="ml-2 text-red-500">{slot.field}</span>}
              </div>
              {onClickBook && matchesPending?.length > 0 ? (
                <button
                  className="bg-accent hover:bg-highlight text-white px-4 py-2 rounded font-bold transition"
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    // provide the exact trigger rect to parent so modal can anchor properly
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    (e.currentTarget as HTMLElement).focus();
                    e.stopPropagation();
                    onClickBook(slot, rect);
                  }}
                >
                  Prenota
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {onClickBook && (!matchesPending || matchesPending.length === 0) && (
        <div className="text-xs mt-3 text-text-secondary">
          <span>Non hai partite prenotabili al momento.</span>
        </div>
      )}
    </div>
  );
};

export default AvailableSlotsList;
