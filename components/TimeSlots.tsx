import React, { useState } from 'react';
import { updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { type Event, type Tournament, type TimeSlot, type Match, type Group } from '../types';

interface TimeSlotsProps {
  event: Event;
  tournament?: Tournament;
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  isOrganizer: boolean;
  loggedInPlayerId?: string;
  selectedGroupId?: string;
  globalTimeSlots: TimeSlot[];
}

function generateSlotId() {
  return 'slot_' + Math.random().toString(36).slice(2, 10);
}

// Helper: Mappa slot prenotati in tutto l'evento (scheduled e completed)
function getBookedSlotsData(event: Event) {
  const booked: Record<string, { match: Match; group: Group; tournament: Tournament }> = {};
  (event.tournaments || []).forEach(t => {
    (t.groups || []).forEach(g => {
      (g.matches || []).forEach(m => {
        if (m.slotId && (m.status === "scheduled" || m.status === "completed")) {
          booked[m.slotId] = { match: m, group: g, tournament: t };
        }
      });
    });
  });
  return booked;
}

// Formatting: da ISO -> "gg/mm/aaaa, hh:mm"
function formatDateTime(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const gg = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const aaaa = d.getFullYear();
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${gg}/${mm}/${aaaa}, ${h}:${min}`;
}

// Nuovo helper: mostra SOLO le partite programmate (status === "scheduled") nello spazio slot prenotati
function getScheduledSlotsData(event: Event) {
  const scheduled: Record<string, { match: Match; group: Group; tournament: Tournament }> = {};
  (event.tournaments || []).forEach(t => {
    (t.groups || []).forEach(g => {
      (g.matches || []).forEach(m => {
        if (m.slotId && m.status === "scheduled") {
          scheduled[m.slotId] = { match: m, group: g, tournament: t };
        }
      });
    });
  });
  return scheduled;
}

const TimeSlots: React.FC<TimeSlotsProps> = ({
  event,
  tournament,
  setEvents,
  isOrganizer,
  loggedInPlayerId,
  selectedGroupId,
  globalTimeSlots = [],
}) => {
  const [slotInput, setSlotInput] = useState<{
    start: string;
    location: string;
    field: string;
  }>({ start: "", location: "", field: "" });
  const [slotError, setSlotError] = useState("");
  const [modalSlotId, setModalSlotId] = useState<string | null>(null);
  const [modalMatchId, setModalMatchId] = useState<string>("");
  const [modalBookError, setModalBookError] = useState("");

  // ===============================
  // 1. HOMEPAGE SEZIONE "Slot Orari Globali"
  // ===============================
  if (!tournament) {
    const bookedSlotsData = getBookedSlotsData(event);
    const scheduledSlotsData = getScheduledSlotsData(event); // Solo "scheduled"
    const availableSlots = globalTimeSlots.filter(slot => !bookedSlotsData[slot.id]);

    const handleAddSlot = async () => {
      setSlotError("");
      if (!slotInput.start || isNaN(Date.parse(slotInput.start))) {
        setSlotError("Inserisci una data e ora valida (ISO oppure YY-MM-DD HH:mm:ss).");
        return;
      }
      if (!slotInput.location) {
        setSlotError("Inserisci il campo/luogo.");
        return;
      }
      const slotToAdd: TimeSlot = {
        id: generateSlotId(),
        start: slotInput.start,
        location: slotInput.location,
        field: slotInput.field,
      };
      const updatedGlobalSlots = [...(event.globalTimeSlots || []), slotToAdd];

      setEvents(prevEvents =>
        prevEvents.map(ev =>
          ev.id === event.id
            ? { ...ev, globalTimeSlots: updatedGlobalSlots }
            : ev
        )
      );
      await updateDoc(doc(db, "events", event.id), {
        globalTimeSlots: updatedGlobalSlots,
      });
      // NON svuotare gli input dopo aggiunta.
    };

    const handleDeleteSlot = async (slotId: string) => {
      const updatedGlobalSlots = (event.globalTimeSlots || []).filter(s => s.id !== slotId);

      setEvents(prevEvents =>
        prevEvents.map(ev =>
          ev.id === event.id
            ? { ...ev, globalTimeSlots: updatedGlobalSlots }
            : ev
        )
      );
      await updateDoc(doc(db, "events", event.id), {
        globalTimeSlots: updatedGlobalSlots,
      });
    };

    return (
      <div>
        <h2 className="text-2xl font-bold mb-4 text-accent">Slot Orari Globali</h2>
        <h3 className="text-xl font-bold mb-6 text-accent">Gestione slot orari globali</h3>
        {/* BOX AGGIUNGI NUOVO SLOT */}
        {isOrganizer && (
          <div className="bg-[#212737] rounded-xl p-5 mb-6 shadow-lg w-full max-w-md flex flex-col gap-3">
            <h4 className="font-bold text-[#3AF2C5] text-lg mb-1">Aggiungi nuovo slot</h4>
            <input
              type="datetime-local"
              value={slotInput.start}
              onChange={e => setSlotInput({ ...slotInput, start: e.target.value })}
              placeholder="Data e ora"
              className="input mb-2 bg-[#22283A] text-white font-bold placeholder:text-white placeholder:font-bold"
            />
            <input
              type="text"
              value={slotInput.location}
              onChange={e => setSlotInput({ ...slotInput, location: e.target.value })}
              placeholder="Luogo"
              className="input mb-2 bg-[#22283A] text-white font-bold placeholder:text-white placeholder:font-bold"
            />
            <input
              type="text"
              value={slotInput.field}
              onChange={e => setSlotInput({ ...slotInput, field: e.target.value })}
              placeholder="Campo"
              className="input mb-2 bg-[#22283A] text-white font-bold placeholder:text-white placeholder:font-bold"
            />
            <button
              onClick={handleAddSlot}
              className="btn-accent self-start px-5 py-1 rounded font-semibold"
            >
              Aggiungi slot
            </button>
            {slotError && <span className="text-red-600 font-semibold">{slotError}</span>}
          </div>
        )}

        {/* BOX SLOT DISPONIBILI */}
        <div className="bg-[#212737] rounded-xl shadow-lg p-5 mb-6 w-full max-w-xl">
          <h4 className="font-bold text-[#3AF2C5] text-lg mb-3">Slot disponibili</h4>
          {availableSlots.length === 0 ? (
            <p className="text-gray-400 font-bold">Nessuno slot libero.</p>
          ) : (
            <ul className="space-y-2">
              {availableSlots.map(slot => (
                <li key={slot.id} className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <div>
                    <span className="font-bold text-white">{formatDateTime(slot.start)}</span>{" "}
                    <span className="text-white">-</span>{" "}
                    <span className="text-accent font-bold">{slot.location}</span>{" "}
                    <span className="text-white">-</span>{" "}
                    <span className="text-red-500 font-bold">{slot.field}</span>
                  </div>
                  <div>
                    {isOrganizer && (
                      <button
                        className="btn-tertiary px-3 py-1 rounded font-semibold"
                        onClick={() => handleDeleteSlot(slot.id)}
                      >
                        Elimina
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* SLOT PRENOTATI: SOLO PARTITE PROGRAMMATE (scheduled) */}
        <div className="bg-[#212737] rounded-xl shadow-lg p-5 mb-6 w-full max-w-xl">
          <h4 className="font-bold text-[#3AF2C5] text-lg mb-3">Slot prenotati</h4>
          {Object.keys(scheduledSlotsData).length === 0 ? (
            <p className="text-gray-400 font-bold">Nessuna partita programmata.</p>
          ) : (
            <ul className="space-y-2">
              {/*
                Costruiamo un array di entry { slot, match, group, tournament }
                e lo ordiniamo per slot.start (data/ora), così la visualizzazione è cronologica.
              */}
              {Object.entries(scheduledSlotsData)
                .map(([slotId, payload]) => {
                  const slot = globalTimeSlots.find(s => s.id === slotId);
                  if (!slot) return null;
                  return { slot, ...payload };
                })
                .filter(Boolean)
                .sort((a, b) => {
                  const ta = a.slot?.start ? new Date(a.slot.start).getTime() : 0;
                  const tb = b.slot?.start ? new Date(b.slot.start).getTime() : 0;
                  return ta - tb;
                })
                .map(({ slot, match, group, tournament }) => {
                  const player1 = event.players.find(p => p.id === match.player1Id)?.name || match.player1Id;
                  const player2 = event.players.find(p => p.id === match.player2Id)?.name || match.player2Id;
                  return (
                    <li key={slot.id} className="flex flex-col px-2 py-2 rounded bg-[#22283A] mb-2">
                      <span className="font-bold text-white">
                        {formatDateTime(slot.start)} - {slot.location} - {slot.field}
                      </span>
                      <span className="font-bold text-accent">
                        Partita programmata:
                      </span>
                      <span className="text-white font-bold">
                        {player1} vs {player2}
                        {" "}({tournament.name}, girone: {group.name})
                      </span>
                      <span className="text-sm text-gray-300">
                        Stato: Programmata
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ================================
  // 2. Prenotazione slot inside torneo/girone (resto invariato)
  // ================================

  const myPendingMatches: Match[] = tournament?.groups
    ? tournament.groups.flatMap(g =>
        g.matches.filter(m =>
          m.status === "pending" &&
          (m.player1Id === loggedInPlayerId || m.player2Id === loggedInPlayerId)
        )
      )
    : [];

  const allBookedSlotIds: string[] = event.tournaments
    .flatMap(tournament =>
      tournament.groups
        ? tournament.groups.flatMap(group =>
            group.matches
              .filter(match => match.slotId && (match.status === "scheduled" || match.status === "completed"))
              .map(match => match.slotId!)
          )
        : []
    );
  const availableSlots = globalTimeSlots.filter(slot => !allBookedSlotIds.includes(slot.id));

  const handleAddSlot = async () => {
    setSlotError("");
    if (!slotInput.start || isNaN(Date.parse(slotInput.start))) {
      setSlotError("Inserisci una data e ora valida (ISO oppure YY-MM-DD HH:mm:ss).");
      return;
    }
    if (!slotInput.location) {
      setSlotError("Inserisci il campo/luogo.");
      return;
    }
    const slotToAdd: TimeSlot = {
      id: generateSlotId(),
      start: slotInput.start,
      location: slotInput.location,
      field: slotInput.field,
    };
    const updatedGlobalSlots = [...(event.globalTimeSlots || []), slotToAdd];

    setEvents(prevEvents =>
      prevEvents.map(ev =>
        ev.id === event.id
          ? { ...ev, globalTimeSlots: updatedGlobalSlots }
          : ev
      )
    );
    await updateDoc(doc(db, "events", event.id), {
      globalTimeSlots: updatedGlobalSlots,
    });
    setSlotInput({ start: "", location: "", field: "" });
  };

  const handleDeleteSlot = async (slotId: string) => {
    const updatedGlobalSlots = (event.globalTimeSlots || []).filter(s => s.id !== slotId);

    setEvents(prevEvents =>
      prevEvents.map(ev =>
        ev.id === event.id
          ? { ...ev, globalTimeSlots: updatedGlobalSlots }
          : ev
      )
    );
    await updateDoc(doc(db, "events", event.id), {
      globalTimeSlots: updatedGlobalSlots,
    });
  };

  const handleBookPendingMatchOnSlot = async () => {
    setModalBookError("");
    const slot = (event.globalTimeSlots || []).find(s => s.id === modalSlotId);
    const match = myPendingMatches.find(m => m.id === modalMatchId);
    if (!slot || !match) {
      setModalBookError("Devi selezionare una partita.");
      return;
    }
    if (allBookedSlotIds.includes(slot.id)) {
      setModalBookError("Questo slot è già prenotato in qualche torneo/girone.");
      return;
    }
    const updatedMatch: Match = {
      ...match,
      status: "scheduled",
      scheduledTime: new Date(slot.start).toISOString(),
      location: slot.location ?? "",
      field: slot.field ?? (slot.location ?? ""),
      slotId: slot.id
    };
    const updatedGroups = tournament.groups.map(g =>
      g.matches.some(m => m.id === match.id)
        ? { ...g, matches: g.matches.map(m => m.id === match.id ? updatedMatch : m) }
        : g
    );
    setEvents(prevEvents =>
      prevEvents.map(ev =>
        ev.id === event.id
          ? {
              ...ev,
              tournaments: ev.tournaments.map(t =>
                t.id === tournament.id ? { ...t, groups: updatedGroups } : t
              ),
            }
          : ev
      )
    );
    await updateDoc(doc(db, "events", event.id), {
      tournaments: event.tournaments.map(t =>
        t.id === tournament.id ? { ...t, groups: updatedGroups } : t
      )
    });
    setModalSlotId(null);
    setModalMatchId("");
    setModalBookError("");
  };

  const handleCancelMatchBooking = async (matchId: string) => {
    // Trova la partita e il gruppo
    const updatedGroups = tournament.groups.map(g =>
      g.matches.some(m => m.id === matchId)
        ? {
            ...g,
            matches: g.matches.map(m =>
              m.id === matchId
                ? {
                    ...m,
                    status: "pending",
                    scheduledTime: null,
                    location: "",
                    field: "",
                    slotId: undefined
                  }
                : m
            ),
          }
        : g
    );
    setEvents(prevEvents =>
      prevEvents.map(ev =>
        ev.id === event.id
          ? {
              ...ev,
              tournaments: ev.tournaments.map(t =>
                t.id === tournament.id ? { ...t, groups: updatedGroups } : t
              ),
            }
          : ev
      )
    );
    await updateDoc(doc(db, "events", event.id), {
      tournaments: event.tournaments.map(t =>
        t.id === tournament.id ? { ...t, groups: updatedGroups } : t
      )
    });
  };

  return (
    <div>
      {/* ...SEZIONE TORNEO/GIRONE invariata... */}
    </div>
  );
};

export default TimeSlots;
