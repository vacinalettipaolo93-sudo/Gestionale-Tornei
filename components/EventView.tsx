import React, { useState, useEffect } from 'react';
import { type Event, type Tournament, type TimeSlot, type Match } from '../types';
import RegolamentoGironiPanel from './RegolamentoGironiPanel';
import TimeSlots from './TimeSlots';
import { db } from "../firebase";
import { updateDoc, doc } from "firebase/firestore";
import { TrashIcon, PlusIcon } from './Icons';

interface EventViewProps {
  event: Event;
  // accept optional initial tab and groupId when invoked
  onSelectTournament: (
    tournament: Tournament,
    initialTab?: 'standings' | 'matches' | 'slot' | 'participants' | 'playoffs' | 'consolation' | 'groups' | 'settings' | 'rules' | 'players',
    initialGroupId?: string
  ) => void;
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  isOrganizer: boolean;
  loggedInPlayerId?: string;
}

const makeId = () => `${Date.now()}${Math.floor(Math.random() * 10000)}`;

const generateSlotId = () => 'slot_' + Math.random().toString(36).slice(2, 10);

const EventView: React.FC<EventViewProps> = ({
  event,
  onSelectTournament,
  setEvents,
  isOrganizer,
  loggedInPlayerId,
}) => {
  const [rulesDraft, setRulesDraft] = useState(event.rules ?? "");
  const [rulesEdit, setRulesEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // state per "Aggiungi Torneo"
  const [isAddTournamentOpen, setIsAddTournamentOpen] = useState(false);
  const [newTournamentName, setNewTournamentName] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // state per "Modifica Torneo"
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [editTournamentName, setEditTournamentName] = useState<string>('');
  const [editTournamentLoading, setEditTournamentLoading] = useState<boolean>(false);

  useEffect(() => {
    setRulesDraft(event.rules ?? "");
  }, [event]);

  const handleSaveRules = async () => {
    setLoading(true);
    try {
      setEvents(prev =>
        prev.map(ev =>
          ev.id === event.id ? { ...ev, rules: rulesDraft } : ev
        )
      );
      await updateDoc(doc(db, "events", event.id), {
        rules: rulesDraft
      });
      setSuccessMsg("Regolamento salvato!");
      setRulesEdit(false);
      setTimeout(() => setSuccessMsg(""), 2500);
    } catch (err) {
      console.error("Errore salvataggio regolamento", err);
    } finally {
      setLoading(false);
    }
  };

  // default settings used when creating new tournament (kept minimal)
  const defaultTournamentSettings = {
    pointsPerDraw: 1,
    pointRules: [],
    tieBreakers: ['wins', 'goalDifference', 'headToHead', 'goalsFor'],
    playoffSettings: [],
    consolationSettings: [],
    hasBronzeFinal: false,
  };

  const openAddTournament = () => {
    setAddError(null);
    setNewTournamentName("");
    setIsAddTournamentOpen(true);
  };

  const cancelAddTournament = () => {
    setIsAddTournamentOpen(false);
    setNewTournamentName("");
    setAddError(null);
  };

  const handleAddTournament = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAddError(null);
    if (!newTournamentName.trim()) {
      setAddError("Inserisci il nome del torneo.");
      return;
    }

    setAddLoading(true);
    try {
      const newTournament: Tournament = {
        id: makeId(),
        name: newTournamentName.trim(),
        groups: [],
        matches: [],
        settings: { ...defaultTournamentSettings } as any,
      } as any;

      // update local state immediately
      setEvents(prevEvents =>
        prevEvents.map(ev =>
          ev.id === event.id
            ? { ...ev, tournaments: [...(ev.tournaments ?? []), newTournament] }
            : ev
        )
      );

      // save to Firestore
      await updateDoc(doc(db, "events", event.id), {
        tournaments: (event.tournaments ?? []).concat(newTournament)
      });

      setIsAddTournamentOpen(false);
      setNewTournamentName("");
    } catch (err: any) {
      console.error("Errore creazione torneo", err);
      setAddError(err?.message || "Errore durante la creazione del torneo");
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteTournament = async (tournamentId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo torneo?")) return;
    try {
      const updatedTournaments = (event.tournaments ?? []).filter(t => t.id !== tournamentId);
      setEvents(prevEvents =>
        prevEvents.map(ev =>
          ev.id === event.id ? { ...ev, tournaments: updatedTournaments } : ev
        )
      );
      await updateDoc(doc(db, "events", event.id), {
        tournaments: updatedTournaments
      });
    } catch (err) {
      console.error("Errore eliminazione torneo", err);
    }
  };

  // --- NEW: edit tournament handlers ---
  const openEditTournament = (t: Tournament) => {
    setEditingTournament(t);
    setEditTournamentName(t.name);
  };

  const closeEditTournamentModal = () => {
    setEditingTournament(null);
    setEditTournamentName('');
    setEditTournamentLoading(false);
  };

  const handleSaveEditTournament = async () => {
    if (!editingTournament) return;
    setEditTournamentLoading(true);
    try {
      const updatedTournaments = (event.tournaments ?? []).map(t =>
        t.id === editingTournament.id ? { ...t, name: editTournamentName.trim() } : t
      );

      // update local state
      setEvents(prevEvents =>
        prevEvents.map(ev => ev.id === event.id ? { ...ev, tournaments: updatedTournaments } : ev)
      );

      // persist on Firestore
      await updateDoc(doc(db, "events", event.id), {
        tournaments: updatedTournaments
      });

      closeEditTournamentModal();
    } catch (err) {
      console.error('Errore salvataggio nome torneo', err);
      setEditTournamentLoading(false);
      alert('Errore durante il salvataggio del torneo.');
    }
  };

  // Helper: count total and completed matches inside a tournament by scanning its groups
  const countMatchesForTournament = (t: Tournament) => {
    let total = 0;
    let completed = 0;
    (t.groups ?? []).forEach(group => {
      (group.matches ?? []).forEach((m: any) => {
        total++;
        // consider match completed if both scores are present or status indicates finished
        const isComplete = (m.score1 != null && m.score2 != null) || m.status === 'finished' || m.status === 'completed';
        if (isComplete) completed++;
      });
    });
    return { total, completed };
  };

  // helper: find player's group id in a tournament (if any)
  const getPlayerGroupId = (t: Tournament, playerId?: string) => {
    if (!playerId) return undefined;
    const g = (t.groups || []).find(gr => (gr.playerIds || []).includes(playerId));
    return g?.id;
  };

  // Ordina gli slot globali per data/ora (campo `start`) prima di passarli al componente TimeSlots
  const sortedGlobalTimeSlots = (event.globalTimeSlots ?? []).slice().sort((a, b) => {
    const ta = a?.start ? new Date(a.start).getTime() : 0;
    const tb = b?.start ? new Date(b.start).getTime() : 0;
    return ta - tb;
  });

  // ----------------------------
  // BOOKED SLOTS: helper + handlers
  // ----------------------------
  const getBookedSlotsEntries = () => {
    const slots = event.globalTimeSlots ?? [];
    const entries: { slot?: TimeSlot; match: Match; tournament: Tournament; groupName?: string }[] = [];

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    (event.tournaments || []).forEach(t => {
      (t.groups || []).forEach(g => {
        (g.matches || []).forEach((m: Match) => {
          if (m.status === 'scheduled' && m.scheduledTime) {
            const s = new Date(m.scheduledTime);
            if (isNaN(s.getTime())) return;
            if (s.getTime() >= todayStart.getTime()) {
              const slot = slots.find(slt => slt.id === m.slotId);
              entries.push({ slot, match: m, tournament: t, groupName: g.name });
            }
          }
        });
      });
    });

    entries.sort((a, b) => {
      const ta = a.match.scheduledTime ? new Date(a.match.scheduledTime).getTime() : 0;
      const tb = b.match.scheduledTime ? new Date(b.match.scheduledTime).getTime() : 0;
      return ta - tb;
    });

    return entries;
  };

  const handleCancelBookedMatch = async (matchId: string, tournamentId: string) => {
    if (!confirm("Sei sicuro di voler annullare la prenotazione di questa partita?")) return;

    const updatedTournaments = (event.tournaments || []).map(t => {
      if (t.id !== tournamentId) return t;
      return {
        ...t,
        groups: (t.groups || []).map(g => ({
          ...g,
          matches: (g.matches || []).map(m => {
            if (m.id !== matchId) return m;
            return { ...m, status: 'pending', scheduledTime: undefined, slotId: undefined, location: undefined, field: undefined };
          })
        }))
      };
    });

    // update local UI
    setEvents(prev => prev.map(ev => ev.id === event.id ? { ...ev, tournaments: updatedTournaments } : ev));

    // persist
    try {
      await updateDoc(doc(db, "events", event.id), {
        tournaments: updatedTournaments
      });
    } catch (err) {
      console.error("Errore annullamento prenotazione", err);
    }
  };
  // ----------------------------

  return (
    <div>
      <div className="bg-primary p-6 rounded-xl shadow-lg mb-8">
        <div className="flex justify-between items-start gap-6">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white mb-1">{event.name}</h1>
            <div className="text-sm text-text-secondary">
              Codice Invito: <span className="font-bold text-accent">{event.invitationCode}</span>
            </div>
          </div>

          {isOrganizer && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={openAddTournament}
                className="bg-accent px-5 py-2 rounded-lg text-white font-bold hover:bg-accent/80 shadow transition-all flex items-center gap-2"
              >
                <PlusIcon className="w-4 h-4" />
                + Aggiungi Torneo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CARD TORNEI */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-4">Tornei</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(event.tournaments ?? []).map(tournament => {
            const { total, completed } = countMatchesForTournament(tournament);
            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

            // Determina se il giocatore loggato è assegnato a questo torneo (in uno dei suoi gironi)
            const isMyTournament = !!(loggedInPlayerId && (tournament.groups || []).some(g => (g.playerIds || []).includes(loggedInPlayerId)));
            const myGroupId = getPlayerGroupId(tournament, loggedInPlayerId);

            // conditional classes for highlight
            const cardBase = 'p-4 rounded-xl flex flex-col justify-between transition-all duration-300';
            const highlightClasses = 'bg-gradient-to-br from-indigo-700 to-indigo-600 ring-2 ring-accent transform scale-[1.01]';
            const normalClasses = 'bg-secondary';
            const cardClasses = `${cardBase} ${isMyTournament ? highlightClasses : normalClasses}`;

            const titleClass = `text-xl font-bold mb-2 ${isMyTournament ? 'text-white' : 'text-accent'}`;

            return (
              <div key={tournament.id} className={cardClasses}>
                <div>
                  <div className="flex justify-between items-start">
                    <h3 className={titleClass}>{tournament.name}</h3>
                    {isOrganizer && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditTournament(tournament)}
                          className="text-text-secondary/80 hover:text-text-primary p-1 rounded"
                          title="Modifica nome torneo"
                        >
                          Modifica
                        </button>
                        <button
                          onClick={() => handleDeleteTournament(tournament.id)}
                          className="text-text-secondary/60 hover:text-red-500 p-1 rounded"
                          title="Elimina torneo"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* quick buttons: open tournament directly on specific tab (pass optional groupId when relevant) */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => onSelectTournament(tournament, 'matches', myGroupId)}
                      className="text-sm bg-tertiary/60 text-white px-3 py-1 rounded hover:bg-tertiary transition"
                      title="Apri il tab Partite"
                    >
                      Partite
                    </button>
                    <button
                      onClick={() => onSelectTournament(tournament, 'standings', myGroupId)}
                      className="text-sm bg-tertiary/60 text-white px-3 py-1 rounded hover:bg-tertiary transition"
                      title="Apri il tab Classifica"
                    >
                      Classifica
                    </button>
                    <button
                      onClick={() => onSelectTournament(tournament, 'participants')}
                      className="text-sm bg-tertiary/60 text-white px-3 py-1 rounded hover:bg-tertiary transition"
                      title="Apri il tab Partecipanti"
                    >
                      Partecipanti
                    </button>
                    <button
                      onClick={() => onSelectTournament(tournament, 'playoffs')}
                      className="text-sm bg-tertiary/60 text-white px-3 py-1 rounded hover:bg-tertiary transition"
                      title="Apri il tab Playoff"
                    >
                      Playoff
                    </button>
                    <button
                      onClick={() => onSelectTournament(tournament, 'consolation')}
                      className="text-sm bg-tertiary/60 text-white px-3 py-1 rounded hover:bg-tertiary transition"
                      title="Apri il tab Consolazione"
                    >
                      Consolazione
                    </button>
                    <button
                      onClick={() => onSelectTournament(tournament, 'slot', myGroupId)}
                      className="text-sm bg-tertiary/60 text-white px-3 py-1 rounded hover:bg-tertiary transition"
                      title="Apri il tab Slot Disponibili"
                    >
                      Slot Disponibili
                    </button>
                  </div>

                  <div className="flex items-center gap-3 mb-2 mt-4">
                    <span className="text-sm text-text-secondary">
                      {tournament.groups?.length ?? 0} gironi
                    </span>
                  </div>
                  <div className="text-sm text-text-secondary mb-2">
                    Progresso
                  </div>
                  <div className="w-full bg-tertiary/30 h-2 rounded-full mb-2">
                    <div className="bg-accent h-2 rounded-full transition-all duration-300" style={{ width: `${percent}%` }}></div>
                  </div>
                  <div className="text-xs text-text-secondary mb-2 flex items-center justify-between">
                    <span>{completed} / {total} partite</span>
                    <span>{percent}% Completato</span>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onSelectTournament(tournament)}
                    className={`text-white py-2 px-4 rounded-lg font-bold ${isMyTournament ? 'bg-highlight/90 hover:bg-highlight' : 'bg-accent'}`}
                  >
                    Visualizza Torneo
                  </button>
                  {isMyTournament && (
                    <span className="ml-auto inline-block bg-green-600 text-white text-xs font-semibold px-2 py-1 rounded">
                      Il mio torneo
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SLOT ORARI GLOBALI (solo organizzatore) */}
      {isOrganizer && event.globalTimeSlots && (
        <div className="mb-10">
          <h2 className="text-2xl font-bold mb-4 text-white">Slot Orari Globali</h2>
          <TimeSlots
            event={event}
            tournament={undefined}
            setEvents={setEvents}
            isOrganizer={isOrganizer}
            loggedInPlayerId={loggedInPlayerId}
            selectedGroupId={undefined}
            globalTimeSlots={sortedGlobalTimeSlots}
          />
        </div>
      )}

      {/* ---------------------- */}
      {/* Sezione: Partite prenotate (organizzatore) */}
      {/* aggiunta: mostra lista partite prenotate (future) con due bottoni:
          - Vai al torneo (onSelectTournament con 'matches')
          - Annulla pren. (reimposta match a pending e aggiorna Firestore)
      */}
      {isOrganizer && (
        <div className="mb-10">
          <h2 className="text-2xl font-bold mb-4 text-white">Partite Prenotate (future)</h2>
          <div className="bg-tertiary rounded-xl p-5">
            {(() => {
              const entries = getBookedSlotsEntries();
              if (!entries.length) {
                return <p className="text-text-secondary">Nessuna partita prenotata futura.</p>;
              }
              return (
                <ul className="space-y-3">
                  {entries.map((entry, idx) => {
                    const m = entry.match;
                    const slot = entry.slot;
                    const displayTime = m.scheduledTime
                      ? new Date(m.scheduledTime).toLocaleString('it-IT', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : '';
                    const p1 = event.players?.find(p => p.id === m.player1Id)?.name ?? m.player1Id;
                    const p2 = event.players?.find(p => p.id === m.player2Id)?.name ?? m.player2Id;
                    return (
                      <li key={`${m.id}-${idx}`} className="flex items-center justify-between border-b border-gray-700 pb-2">
                        <div>
                          <div className="font-bold text-white">{displayTime}</div>
                          <div className="text-sm text-text-secondary">
                            <span className="text-accent font-semibold">{entry.tournament.name}</span>
                            {entry.groupName && <span className="mx-2">|</span>}
                            {entry.groupName && <span>{entry.groupName}</span>}
                          </div>
                          <div className="text-white mt-1">{p1} vs {p2}</div>
                          {/* Cambiato solo il colore di questa scritta da grigio a rosso */}
                          <div className="text-sm text-red-500">{slot ? `${slot.location}${slot.field ? ' — ' + slot.field : ''}` : (m.location || '')}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => onSelectTournament(entry.tournament, 'matches', undefined)}
                            className="px-3 py-1 rounded bg-tertiary text-white"
                          >
                            Vai al torneo
                          </button>
                          <button
                            onClick={() => handleCancelBookedMatch(m.id, entry.tournament.id)}
                            className="px-3 py-1 rounded bg-red-600 text-white"
                          >
                            Annulla pren.
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </div>
        </div>
      )}
      {/* ---------------------- */}

      {/* REGOLAMENTO (solo organizzatore) */}
      {isOrganizer && (
        <div className="bg-tertiary p-6 rounded-xl shadow-lg mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xl font-bold text-accent">Regolamento Torneo</h3>
            {!rulesEdit && (
              <button
                onClick={() => setRulesEdit(true)}
                className="py-1 px-4 bg-highlight text-white rounded-lg font-semibold"
              >
                Modifica
              </button>
            )}
          </div>
          {rulesEdit ? (
            <div>
              <textarea
                value={rulesDraft}
                onChange={(e) => setRulesDraft(e.target.value)}
                className="w-full rounded bg-primary border p-3 min-h-[120px] mb-3"
                placeholder="Scrivi qui il regolamento per il girone selezionato..."
                disabled={loading}
              />
              <div className="flex items-center gap-3">
                <button onClick={handleSaveRules} disabled={loading} className="bg-highlight text-white px-4 py-2 rounded font-bold">
                  {loading ? "Salvando..." : "Salva regolamento per girone"}
                </button>
                <button onClick={() => { setRulesEdit(false); setRulesDraft(event.rules ?? ""); }} className="bg-tertiary px-4 py-2 rounded">
                  Annulla
                </button>
              </div>
              {successMsg && <div className="text-green-600 mt-3 font-semibold">{successMsg}</div>}
            </div>
          ) : (
            <div className="bg-primary p-4 rounded-lg border border-tertiary mt-2 whitespace-pre-line">
              {event.rules?.trim() ? event.rules : <span className="text-text-secondary">Nessun regolamento inserito dall'organizzatore.</span>}
            </div>
          )}
        </div>
      )}

      {/* REGOLAMENTO PER OGNI GIRONE - SOLO ORGANIZZATORE */}
      {isOrganizer && (event.tournaments ?? []).length > 0 &&
        (event.tournaments ?? []).map(tournament => (
          <RegolamentoGironiPanel
            key={tournament.id}
            event={event}
            tournament={tournament}
            setEvents={setEvents}
          />
        ))
      }

      {/* ----------------- MODAL: AGGIUNGI TORNEO ----------------- */}
      {isAddTournamentOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify_center z-50">
          <div className="bg-secondary rounded-xl shadow-2xl p-6 w-full max-w-md border border-tertiary">
            <h4 className="text-lg font-bold mb-4 text-accent">Aggiungi Nuovo Torneo</h4>
            <form onSubmit={handleAddTournament} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Nome Torneo</label>
                <input
                  autoFocus
                  value={newTournamentName}
                  onChange={e => setNewTournamentName(e.target.value)}
                  className="w-full bg-primary border border-tertiary rounded-lg p-2"
                  placeholder="Esempio: Torneo Primavera"
                />
              </div>

              {addError && <div className="text-red-400">{addError}</div>}

              <div className="flex justify-end gap-3">
                <button onClick={cancelAddTournament} className="bg-tertiary px-4 py-2 rounded">Annulla</button>
                <button type="submit" disabled={addLoading} className="bg-highlight text-white px-4 py-2 rounded font-bold">
                  {addLoading ? 'Creazione...' : 'Crea Torneo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ----------------- /MODAL: AGGIUNGI TORNEO ----------------- */}

    </div>
  );
};

export default EventView;
