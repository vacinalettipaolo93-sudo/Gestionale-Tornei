import React, { useState, useMemo, useEffect } from 'react';
import { type Event, type Tournament, type Player, type PlayoffBracket, type PlayoffMatch, type Match } from '../types';
import { calculateStandings } from '../utils/standings';
import { db } from "../firebase";
import { updateDoc, doc } from "firebase/firestore";

interface PlayoffsProps {
  event: Event;
  tournament: Tournament;
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  isOrganizer: boolean;
  loggedInPlayerId?: string;
}

function playoffMatchToLeagueMatchId(playoffMatchId: string) {
  return `po-${playoffMatchId}`;
}

function buildLeagueMatchFromPlayoffMatch(pm: PlayoffMatch): Match | null {
  if (!pm.player1Id || !pm.player2Id) return null;
  return {
    id: playoffMatchToLeagueMatchId(pm.id),
    player1Id: pm.player1Id,
    player2Id: pm.player2Id,
    score1: pm.score1,
    score2: pm.score2,
    status: pm.score1 != null && pm.score2 != null ? 'completed' : 'pending',
  };
}

function isMatchCompleted(pm: PlayoffMatch) {
  return pm.score1 != null && pm.score2 != null;
}

const Playoffs: React.FC<PlayoffsProps> = ({ event, tournament, setEvents, isOrganizer, loggedInPlayerId }) => {
  const [view, setView] = useState<'setup' | 'bracket'>(tournament.playoffs?.isGenerated ? 'bracket' : 'setup');

  const qualifiers = useMemo(() => {
    const allQualifiers: { playerId: string, rank: number, fromGroup: string, groupName: string }[] = [];
    tournament.groups.forEach(group => {
      const setting = tournament.settings.playoffSettings.find(s => s.groupId === group.id);
      if (setting && setting.numQualifiers > 0) {
        const standings = calculateStandings(group, event.players, tournament.settings);
        const groupQualifiers = standings.slice(0, setting.numQualifiers).map((entry, index) => ({
          playerId: entry.playerId,
          rank: index + 1,
          fromGroup: group.id,
          groupName: group.name,
        }));
        allQualifiers.push(...groupQualifiers);
      }
    });
    return allQualifiers;
  }, [tournament, event.players]);

  const bracketSize = useMemo(() => {
    const numPlayers = qualifiers.length;
    if (numPlayers < 2) return 0;
    return 2 ** Math.ceil(Math.log2(numPlayers));
  }, [qualifiers]);

  const [firstRoundAssignments, setFirstRoundAssignments] = useState<(string | null)[]>([]);
  const [editingMatch, setEditingMatch] = useState<PlayoffMatch | null>(null);
  const [score1, setScore1] = useState('');
  const [score2, setScore2] = useState('');
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // --- Replacement (withdrawal) modal state ---
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
  const [replaceOutPlayerId, setReplaceOutPlayerId] = useState<string>('');
  const [replaceInPlayerId, setReplaceInPlayerId] = useState<string>('');
  const [replaceError, setReplaceError] = useState<string>('');

  useEffect(() => {
    if (view === 'setup') {
      setFirstRoundAssignments(Array(bracketSize).fill(null));
    }
  }, [qualifiers, view, bracketSize]);

  const getPlayer = (id: string | null): Player | null => id ? event.players.find(p => p.id === id) ?? null : null;

  const handleAssignmentChange = (slotIndex: number, value: string) => {
    setFirstRoundAssignments(prev => {
      const newAssignments = [...prev];
      const existingIndex = newAssignments.findIndex(v => v === value);
      if (existingIndex !== -1 && value !== 'BYE') {
        newAssignments[existingIndex] = null;
      }
      newAssignments[slotIndex] = value === '' ? null : value;
      return newAssignments;
    });
  };

  const handleGenerateBracket = async () => {
    if (firstRoundAssignments.some(a => a === null)) {
      alert("Per favore, riempi tutti gli slot del primo turno.");
      return;
    }

    const newMatches: PlayoffMatch[] = [];
    const numRounds = Math.log2(bracketSize);
    let matchCounter = 0;

    for (let round = 1; round <= numRounds; round++) {
      const matchesInRound = bracketSize / (2 ** round);
      for (let i = 0; i < matchesInRound; i++) {
        newMatches.push({
          id: `plm-${matchCounter}`, round, matchIndex: matchCounter,
          player1Id: null, player2Id: null, score1: null, score2: null,
          winnerId: null, nextMatchId: null,
          loserGoesToBronzeFinal: round === numRounds - 1,
        });
        matchCounter++;
      }
    }

    newMatches.forEach(match => {
      if (match.round < numRounds) {
        const roundMatches = newMatches.filter(m => m.round === match.round);
        const matchIndexInRound = roundMatches.findIndex(m => m.id === match.id);
        const nextRoundMatches = newMatches.filter(m => m.round === match.round + 1);
        const nextMatch = nextRoundMatches[Math.floor(matchIndexInRound / 2)];
        if (nextMatch) match.nextMatchId = nextMatch.id;
      }
    });

    let bronzeFinalId: string | null = null;
    if (bracketSize > 2 && tournament.settings.hasBronzeFinal) {
      const bronzeMatch: PlayoffMatch = {
        id: `plm-bronze`, isBronzeFinal: true, round: numRounds, matchIndex: 999,
        player1Id: null, player2Id: null, score1: null, score2: null, winnerId: null, nextMatchId: null
      };
      newMatches.push(bronzeMatch);
      bronzeFinalId = bronzeMatch.id;
    }

    const firstRoundMatches = newMatches.filter(m => m.round === 1 && !m.isBronzeFinal);
    firstRoundMatches.forEach((match, i) => {
      const p1Id = firstRoundAssignments[i * 2];
      const p2Id = firstRoundAssignments[i * 2 + 1];
      const isP1Bye = p1Id === 'BYE';
      const isP2Bye = p2Id === 'BYE';

      match.player1Id = isP1Bye ? null : p1Id;
      match.player2Id = isP2Bye ? null : p2Id;

      let winnerId: string | null = null;
      if (!isP1Bye && isP2Bye) winnerId = p1Id;
      if (isP1Bye && !isP2Bye) winnerId = p2Id;

      if (winnerId) {
        match.winnerId = winnerId;
        const nextMatch = newMatches.find(m => m.id === match.nextMatchId);
        if (nextMatch) {
          const matchIndexInRound = firstRoundMatches.findIndex(m => m.id === match.id);
          if (matchIndexInRound % 2 === 0) nextMatch.player1Id = winnerId;
          else nextMatch.player2Id = winnerId;
        }
      }
    });

    const finalBracket: PlayoffBracket = {
      matches: newMatches, isGenerated: true,
      finalId: newMatches.find(m => m.round === numRounds && !m.isBronzeFinal)?.id ?? null,
      bronzeFinalId: bronzeFinalId,
    };

    // Create "league" matches (Match[]) for tab Partite
    const playoffMatches: Match[] = [];
    for (const pm of newMatches) {
      if (pm.isBronzeFinal) continue;
      const m = buildLeagueMatchFromPlayoffMatch(pm);
      if (m) playoffMatches.push(m);
    }

    const updatedTournaments = event.tournaments.map(t =>
      t.id === tournament.id
        ? { ...t, playoffs: finalBracket, playoffMatches }
        : t
    );

    setEvents(prev =>
      prev.map(e =>
        e.id === event.id ? { ...e, tournaments: updatedTournaments } : e
      )
    );

    await updateDoc(doc(db, "events", event.id), { tournaments: updatedTournaments });

    setView('bracket');
  };

  const handleResetBracket = async () => {
    const resetBracket: PlayoffBracket = {
      ...(tournament.playoffs ?? { matches: [], isGenerated: false, finalId: null, bronzeFinalId: null }),
      isGenerated: false,
      matches: [],
      finalId: null,
      bronzeFinalId: null,
    };

    const updatedTournaments = event.tournaments.map(t =>
      t.id === tournament.id
        ? { ...t, playoffs: resetBracket, playoffMatches: [] }
        : t
    );

    setEvents(prev => prev.map(e => e.id === event.id ? { ...e, tournaments: updatedTournaments } : e));
    await updateDoc(doc(db, "events", event.id), { tournaments: updatedTournaments });

    setView('setup');
    setIsResetModalOpen(false);
  };

  const handleSaveResult = async () => {
    if (!editingMatch) return;

    const s1 = parseInt(score1, 10);
    const s2 = parseInt(score2, 10);
    if (isNaN(s1) || isNaN(s2)) return;

    const currentBracket = tournament.playoffs;
    if (!currentBracket) return;

    const bracketCopy: PlayoffBracket = JSON.parse(JSON.stringify(currentBracket));
    const match = bracketCopy.matches.find((m: PlayoffMatch) => m.id === editingMatch.id);
    if (!match) return;

    match.score1 = s1;
    match.score2 = s2;

    if (s1 === s2) {
      alert("Pareggio non valido nei playoff. Inserisci un vincitore.");
      return;
    }

    const winnerId = s1 > s2 ? match.player1Id : match.player2Id;
    const loserId = s1 > s2 ? match.player2Id : match.player1Id;
    if (!winnerId || !loserId) return;

    match.winnerId = winnerId;

    if (match.nextMatchId) {
      const nextMatch = bracketCopy.matches.find((m: PlayoffMatch) => m.id === match.nextMatchId);
      if (nextMatch) {
        const allMatchesInRound = bracketCopy.matches
          .filter((m: PlayoffMatch) => m.round === match.round && !m.isBronzeFinal)
          .sort((a: PlayoffMatch, b: PlayoffMatch) => a.matchIndex - b.matchIndex);

        const matchIndexInRound = allMatchesInRound.findIndex((m: PlayoffMatch) => m.id === match.id);

        if (matchIndexInRound % 2 === 0) nextMatch.player1Id = winnerId;
        else nextMatch.player2Id = winnerId;
      }
    }

    if (match.loserGoesToBronzeFinal && bracketCopy.bronzeFinalId && tournament.settings.hasBronzeFinal) {
      const bronzeMatch = bracketCopy.matches.find((m: PlayoffMatch) => m.id === bracketCopy.bronzeFinalId);
      if (bronzeMatch) {
        if (bronzeMatch.player1Id === null) bronzeMatch.player1Id = loserId;
        else if (bronzeMatch.player2Id === null) bronzeMatch.player2Id = loserId;
      }
    }

    const playoffMatches = Array.isArray((tournament as any).playoffMatches)
      ? JSON.parse(JSON.stringify((tournament as any).playoffMatches)) as Match[]
      : [];

    // update current league match
    const leagueMatchId = playoffMatchToLeagueMatchId(match.id);
    const idx = playoffMatches.findIndex(m => m.id === leagueMatchId);
    if (idx !== -1) {
      playoffMatches[idx] = { ...playoffMatches[idx], score1: s1, score2: s2, status: 'completed' };
    } else {
      const built = buildLeagueMatchFromPlayoffMatch(match);
      if (built) playoffMatches.push({ ...built, score1: s1, score2: s2, status: 'completed' });
    }

    // if next match is now ready, ensure it exists
    if (match.nextMatchId) {
      const nextMatch = bracketCopy.matches.find(m => m.id === match.nextMatchId);
      const builtNext = nextMatch ? buildLeagueMatchFromPlayoffMatch(nextMatch) : null;
      if (builtNext) {
        const nidx = playoffMatches.findIndex(m => m.id === builtNext.id);
        if (nidx === -1) playoffMatches.push(builtNext);
        else playoffMatches[nidx] = { ...playoffMatches[nidx], ...builtNext, score1: playoffMatches[nidx].score1 ?? null, score2: playoffMatches[nidx].score2 ?? null };
      }
    }

    // bronze final ready
    if (bracketCopy.bronzeFinalId && tournament.settings.hasBronzeFinal) {
      const bronze = bracketCopy.matches.find(m => m.id === bracketCopy.bronzeFinalId);
      const builtBronze = bronze ? buildLeagueMatchFromPlayoffMatch(bronze) : null;
      if (builtBronze) {
        const bidx = playoffMatches.findIndex(m => m.id === builtBronze.id);
        if (bidx === -1) playoffMatches.push(builtBronze);
        else playoffMatches[bidx] = { ...playoffMatches[bidx], ...builtBronze, score1: playoffMatches[bidx].score1 ?? null, score2: playoffMatches[bidx].score2 ?? null };
      }
    }

    const updatedTournaments = event.tournaments.map(t =>
      t.id === tournament.id
        ? { ...t, playoffs: bracketCopy, playoffMatches }
        : t
    );

    setEvents(prev => prev.map(e => e.id === event.id ? { ...e, tournaments: updatedTournaments } : e));
    await updateDoc(doc(db, "events", event.id), { tournaments: updatedTournaments });

    setEditingMatch(null);
    setScore1('');
    setScore2('');
  };

  // -------------------------
  // Replacement (withdrawal) - INTERNAL REPESCAGGIO ONLY (same group)
  // -------------------------
  const allPlayersInBracket = useMemo(() => {
    const ids = new Set<string>();
    const bracket = tournament.playoffs;
    if (!bracket?.matches) return [];
    for (const m of bracket.matches) {
      if (m.player1Id) ids.add(m.player1Id);
      if (m.player2Id) ids.add(m.player2Id);
    }
    return Array.from(ids);
  }, [tournament.playoffs]);

  const replaceOutGroup = useMemo(() => {
    if (!replaceOutPlayerId) return null;
    const q = qualifiers.find(x => x.playerId === replaceOutPlayerId);
    if (!q) return null;
    return { groupId: q.fromGroup, groupName: q.groupName };
  }, [replaceOutPlayerId, qualifiers]);

  const replacementCandidates = useMemo(() => {
    // Internal repescaggio: only from same group of the OUT player.
    if (!replaceOutGroup?.groupId) return [];

    const g = tournament.groups.find(gr => gr.id === replaceOutGroup.groupId);
    if (!g) return [];

    const standings = calculateStandings(g, event.players, tournament.settings);

    // exclude out player and players already in bracket (to avoid duplicates)
    const bracketIds = new Set(allPlayersInBracket);

    const ids = standings
      .map(s => s.playerId)
      .filter(pid => pid && pid !== replaceOutPlayerId && !bracketIds.has(pid));

    // sort by rank (already in standings order)
    return ids;
  }, [
    replaceOutGroup?.groupId,
    tournament.groups,
    tournament.settings,
    event.players,
    replaceOutPlayerId,
    allPlayersInBracket
  ]);

  const handleOpenReplaceModal = () => {
    setReplaceError('');
    setReplaceOutPlayerId('');
    setReplaceInPlayerId('');
    setIsReplaceModalOpen(true);
  };

  const handleApplyReplacement = async () => {
    setReplaceError('');

    if (!tournament.playoffs?.isGenerated) {
      setReplaceError('Il tabellone non è stato generato.');
      return;
    }
    if (!replaceOutPlayerId || !replaceInPlayerId) {
      setReplaceError('Seleziona sia il giocatore ritirato che il sostituto.');
      return;
    }
    if (replaceOutPlayerId === replaceInPlayerId) {
      setReplaceError('Il sostituto deve essere diverso dal giocatore ritirato.');
      return;
    }

    const bracketCopy: PlayoffBracket = JSON.parse(JSON.stringify(tournament.playoffs));

    // Safety: do not allow replacement if out player already played a completed match
    const outPlayedCompleted = bracketCopy.matches.some(m =>
      isMatchCompleted(m) && (m.player1Id === replaceOutPlayerId || m.player2Id === replaceOutPlayerId)
    );
    if (outPlayedCompleted) {
      setReplaceError('Sostituzione non permessa: il giocatore ha già una partita playoff completata.');
      return;
    }

    // Apply only on NOT completed matches
    bracketCopy.matches = bracketCopy.matches.map(m => {
      if (isMatchCompleted(m)) return m;

      const next = { ...m };

      if (next.player1Id === replaceOutPlayerId) next.player1Id = replaceInPlayerId;
      if (next.player2Id === replaceOutPlayerId) next.player2Id = replaceInPlayerId;

      if (next.winnerId === replaceOutPlayerId) next.winnerId = null;

      return next;
    });

    // Sync tournament.playoffMatches (tab Partite)
    const currentLeagueMatches: Match[] = Array.isArray((tournament as any).playoffMatches)
      ? JSON.parse(JSON.stringify((tournament as any).playoffMatches)) as Match[]
      : [];

    const updatedLeagueMatches: Match[] = currentLeagueMatches.map(lm => {
      const next = { ...lm };
      if (next.player1Id === replaceOutPlayerId) next.player1Id = replaceInPlayerId;
      if (next.player2Id === replaceOutPlayerId) next.player2Id = replaceInPlayerId;
      return next;
    });

    const updatedTournaments = event.tournaments.map(t =>
      t.id === tournament.id
        ? { ...t, playoffs: bracketCopy, playoffMatches: updatedLeagueMatches }
        : t
    );

    setEvents(prev => prev.map(e => e.id === event.id ? { ...e, tournaments: updatedTournaments } : e));
    await updateDoc(doc(db, "events", event.id), { tournaments: updatedTournaments });

    setIsReplaceModalOpen(false);
  };

  if (view === 'setup') {
    if (!isOrganizer) return <p className="text-text-secondary text-center">Il tabellone dei playoff non è stato ancora generato.</p>;

    const unassignedPlayers = qualifiers.filter(q => !firstRoundAssignments.includes(q.playerId));
    const numByesAvailable = bracketSize - qualifiers.length;
    const byesAssigned = firstRoundAssignments.filter(a => a === 'BYE').length;

    const AssignmentSlot = ({ slotIndex }: { slotIndex: number }) => {
      const currentValue = firstRoundAssignments[slotIndex];
      const currentPlayer = getPlayer(currentValue);
      return (
        <select
          value={currentValue ?? ''}
          onChange={(e) => handleAssignmentChange(slotIndex, e.target.value)}
          className="w-full bg-primary border border-tertiary rounded-lg p-2 text-text-primary focus:ring-2 focus:ring-accent"
        >
          <option value="">-- Seleziona --</option>
          {currentValue && currentValue !== 'BYE' && <option value={currentValue}>{currentPlayer?.name}</option>}
          {unassignedPlayers.map(p => (
            <option key={p.playerId} value={p.playerId}>{getPlayer(p.playerId)?.name}</option>
          ))}
          {(byesAssigned < numByesAvailable || currentValue === 'BYE') && <option value="BYE">-- BYE --</option>}
        </select>
      );
    };

    return (
      <div className="bg-secondary p-6 rounded-xl shadow-lg max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <h3 className="text-xl font-bold mb-2 text-accent">Costruttore Tabellone Playoff</h3>
          <p className="text-text-secondary mb-6">Assegna manualmente i giocatori o i "bye" agli slot del primo turno.</p>

          <div className="space-y-4">
            {bracketSize > 0 ? Array.from({ length: bracketSize / 2 }).map((_, index) => (
              <div key={index} className="bg-primary/50 p-4 rounded-lg flex items-center gap-4">
                <span className="font-bold text-text-secondary">M{index + 1}</span>
                <div className="flex-1"><AssignmentSlot slotIndex={index * 2} /></div>
                <span className="text-tertiary">vs</span>
                <div className="flex-1"><AssignmentSlot slotIndex={index * 2 + 1} /></div>
              </div>
            )) : <p className="text-text-secondary">Non ci sono abbastanza qualificati per un playoff.</p>}
          </div>

          <div className="mt-8">
            <button
              onClick={handleGenerateBracket}
              disabled={firstRoundAssignments.some(a => a === null) || qualifiers.length < 2}
              className="w-full bg-highlight hover:bg-highlight/90 text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:bg-tertiary disabled:cursor-not-allowed shadow-lg shadow-highlight/20"
            >
              Genera Tabellone
            </button>
          </div>
        </div>

        <div className="sticky top-4">
          <h4 className="font-semibold text-xl mb-4 text-accent">Riepilogo</h4>
          <div className="bg-primary/50 p-4 rounded-lg mb-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div><div className="text-2xl font-bold">{qualifiers.length}</div><div className="text-sm text-text-secondary">Qualificati</div></div>
              <div><div className="text-2xl font-bold">{bracketSize}</div><div className="text-sm text-text-secondary">Posti</div></div>
              <div><div className="text-2xl font-bold">{numByesAvailable}</div><div className="text-sm text-text-secondary">Bye</div></div>
            </div>
          </div>
          <h4 className="font-semibold text-lg mb-3">Giocatori da Assegnare</h4>
          <div className="space-y-2">
            {unassignedPlayers.length > 0 ? unassignedPlayers.map(q => {
              const player = getPlayer(q.playerId);
              return (
                <div key={q.playerId} className="bg-tertiary/50 p-2 rounded-lg flex items-center gap-3">
                  <img src={player?.avatar} alt={player?.name} className="w-8 h-8 rounded-full" />
                  <div>
                    <div className="font-semibold text-sm">{player?.name}</div>
                    <div className="text-xs text-text-secondary">{q.rank}° class. {q.groupName}</div>
                  </div>
                </div>
              );
            }) : <p className="text-text-secondary text-sm italic">Tutti i giocatori sono stati assegnati.</p>}
          </div>
        </div>
      </div>
    );
  }

  // RENDER BRACKET
  const { matches, bronzeFinalId } = tournament.playoffs!;
  const maxRound = Math.max(0, ...matches.filter(m => !m.isBronzeFinal).map(m => m.round));

  const getRoundName = (round: number) => {
    const totalRounds = maxRound;
    if (round === totalRounds) return "Finale";
    if (round === totalRounds - 1) return "Semifinali";
    if (round === totalRounds - 2) return "Quarti di Finale";
    return `Turno ${round}`;
  };

  const PlayerInMatch = ({ player, winnerId }: { player: Player | null; winnerId: string | null }) => {
    if (!player) return <span className="text-text-secondary">TBD</span>;
    const isWinner = winnerId === player.id;
    const isLoser = winnerId !== null && !isWinner;
    const isLoggedUser = player.id === loggedInPlayerId;

    return (
      <span className={`truncate ${isWinner ? 'font-bold text-text-primary' : isLoser ? 'text-text-secondary/70 line-through' : 'text-text-secondary'} ${isLoggedUser ? 'text-accent font-bold' : ''}`}>
        {player.name}
      </span>
    );
  };

  const MatchCard = ({ match }: { match: PlayoffMatch }) => {
    const p1 = getPlayer(match.player1Id);
    const p2 = getPlayer(match.player2Id);
    const canEdit = isOrganizer && match.player1Id && match.player2Id && match.winnerId === null;

    return (
      <div className={`bg-secondary p-2 rounded-lg w-full`}>
        <div className="flex justify-between items-center text-sm">
          <PlayerInMatch player={p1} winnerId={match.winnerId} />
          {match.score1 !== null && <span className={`font-bold ${match.winnerId === p1?.id ? 'text-accent' : 'text-text-primary'}`}>{match.score1}</span>}
        </div>
        <div className="border-t border-tertiary/50 my-1"></div>
        <div className="flex justify-between items-center text-sm">
          <PlayerInMatch player={p2} winnerId={match.winnerId} />
          {match.score2 !== null && <span className={`font-bold ${match.winnerId === p2?.id ? 'text-accent' : 'text-text-primary'}`}>{match.score2}</span>}
        </div>
        {canEdit && (
          <div className="text-center mt-2">
            <button
              onClick={() => { setEditingMatch(match); setScore1(match.score1?.toString() ?? ''); setScore2(match.score2?.toString() ?? ''); }}
              className="text-xs bg-highlight/80 hover:bg-highlight px-2 py-1 rounded-md text-white transition-colors"
            >
              Risultato
            </button>
          </div>
        )}
      </div>
    );
  };

  const finalMatch = matches.find(m => m.round === maxRound && !m.isBronzeFinal);
  const winner = finalMatch?.winnerId ? getPlayer(finalMatch.winnerId) : null;

  return (
    <div className="bg-secondary p-2 md:p-6 rounded-xl shadow-lg">
      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold text-accent">Tabellone Playoff</h3>
        {winner && <div className="mt-2 text-lg text-yellow-400 font-bold animate-subtlePulse">🏆 Vincitore: {winner.name} 🏆</div>}

        {isOrganizer && (
          <div className="mt-3 flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={() => setIsResetModalOpen(true)}
              className="text-sm text-yellow-500 hover:text-yellow-400 underline"
            >
              Modifica Tabellone
            </button>

            <button
              onClick={handleOpenReplaceModal}
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg transition-colors"
            >
              Sostituisci giocatore (ripescaggio interno)
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-start items-stretch gap-4 md:gap-10 overflow-x-auto pb-4 px-2">
        {Array.from({ length: maxRound }).map((_, i) => {
          const roundNum = i + 1;
          const roundMatches = matches.filter(m => m.round === roundNum && !m.isBronzeFinal).sort((a, b) => a.matchIndex - b.matchIndex);
          if (roundMatches.length === 0) return null;
          return (
            <div key={i} className="flex flex-col w-60 flex-shrink-0 justify-around">
              <h4 className="text-lg font-semibold text-center text-text-secondary mb-4">{getRoundName(roundNum)}</h4>
              <div className="space-y-10">
                {roundMatches.map(match => (
                  <div key={match.id} className="relative">
                    <MatchCard match={match} />
                    {match.nextMatchId && (
                      <div className="absolute top-1/2 -right-5 md:-right-8 w-5 md:w-8 h-px bg-tertiary z-0">
                        <div className="absolute top-1/2 -right-px w-px h-10 md:h-12 bg-tertiary" style={{ transform: `translateY(${match.matchIndex % 2 === 0 ? '-100%' : '0'})` }}></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        <div className="flex flex-col w-60 flex-shrink-0 justify-center items-center">
          <h4 className="text-lg font-semibold text-center text-text-secondary mb-4">Campione</h4>
          {finalMatch ? <MatchCard match={finalMatch} /> : null}
        </div>
      </div>

      {bronzeFinalId && tournament.settings.hasBronzeFinal && (
        <div className="mt-8 pt-6 border-t border-tertiary/50">
          <h4 className="text-lg font-semibold text-center text-text-secondary mb-4">Finale 3° Posto</h4>
          <div className="max-w-xs mx-auto">
            <MatchCard match={matches.find(m => m.id === bronzeFinalId)!} />
          </div>
        </div>
      )}
      {(!bronzeFinalId || !tournament.settings.hasBronzeFinal) && (
        <p className="text-center text-xs text-text-secondary/50 mt-4">Finale 3° Posto disabilitata nelle impostazioni.</p>
      )}

      {/* Modal risultato */}
      {isOrganizer && editingMatch && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-secondary rounded-xl shadow-2xl p-6 w-full max-w-sm border border-tertiary">
            <h4 className="text-lg font-bold mb-4">Risultato Playoff</h4>
            <div className="flex items-center justify-between gap-4">
              <span className="font-semibold">{getPlayer(editingMatch.player1Id)?.name}</span>
              <div className="flex gap-2">
                <input type="number" value={score1} onChange={e => setScore1(e.target.value)} className="w-16 text-center bg-primary p-2 rounded-lg" />
                <span>-</span>
                <input type="number" value={score2} onChange={e => setScore2(e.target.value)} className="w-16 text-center bg-primary p-2 rounded-lg" />
              </div>
              <span className="font-semibold">{getPlayer(editingMatch.player2Id)?.name}</span>
            </div>
            <div className="flex justify-end gap-4 mt-6">
              <button onClick={() => setEditingMatch(null)} className="bg-tertiary hover:bg-tertiary/80 text-text-primary font-bold py-2 px-4 rounded-lg transition-colors">Annulla</button>
              <button onClick={handleSaveResult} className="bg-highlight hover:bg-highlight/80 text-white font-bold py-2 px-4 rounded-lg transition-colors">Salva</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal reset */}
      {isOrganizer && isResetModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-secondary rounded-xl shadow-2xl p-6 w-full max-w-md border border-tertiary">
            <h4 className="text-lg font-bold mb-4">Conferma Reset</h4>
            <p className="text-text-secondary">Sei sicuro di voler resettare il tabellone? Tutti i risultati dei playoff verranno persi e tornerai alla fase di costruzione manuale.</p>
            <div className="flex justify-end gap-4 mt-6">
              <button onClick={() => setIsResetModalOpen(false)} className="bg-tertiary hover:bg-tertiary/80 text-text-primary font-bold py-2 px-4 rounded-lg transition-colors">Annulla</button>
              <button onClick={handleResetBracket} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">Resetta Tabellone</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal sostituzione (ripescaggio interno) */}
      {isOrganizer && isReplaceModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-secondary rounded-xl shadow-2xl p-6 w-full max-w-md border border-tertiary">
            <h4 className="text-lg font-bold mb-4 text-accent">Sostituisci giocatore (ripescaggio interno)</h4>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">Giocatore ritirato (nel tabellone)</label>
                <select
                  value={replaceOutPlayerId}
                  onChange={(e) => { setReplaceOutPlayerId(e.target.value); setReplaceInPlayerId(''); setReplaceError(''); }}
                  className="w-full bg-primary border border-tertiary rounded-lg p-2 text-text-primary"
                >
                  <option value="">-- seleziona --</option>
                  {allPlayersInBracket
                    .slice()
                    .sort((a, b) => (getPlayer(a)?.name || '').localeCompare(getPlayer(b)?.name || ''))
                    .map(pid => (
                      <option key={pid} value={pid}>{getPlayer(pid)?.name ?? pid}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Sostituto (stesso girone)
                  {replaceOutGroup?.groupName ? `: ${replaceOutGroup.groupName}` : ''}
                </label>
                <select
                  value={replaceInPlayerId}
                  onChange={(e) => { setReplaceInPlayerId(e.target.value); setReplaceError(''); }}
                  className="w-full bg-primary border border-tertiary rounded-lg p-2 text-text-primary"
                  disabled={!replaceOutPlayerId}
                >
                  <option value="">-- seleziona --</option>
                  {replacementCandidates.map(pid => {
                    const g = replaceOutGroup?.groupId ? tournament.groups.find(gr => gr.id === replaceOutGroup.groupId) : null;
                    let labelExtra = '';
                    if (g) {
                      const standings = calculateStandings(g, event.players, tournament.settings);
                      const pos = standings.findIndex(s => s.playerId === pid);
                      if (pos !== -1) labelExtra = ` (${pos + 1}°)`;
                    }
                    return (
                      <option key={pid} value={pid}>
                        {getPlayer(pid)?.name ?? pid}{labelExtra}
                      </option>
                    );
                  })}
                </select>
                {replaceOutPlayerId && replacementCandidates.length === 0 && (
                  <div className="text-xs text-yellow-400 mt-1">
                    Nessun candidato disponibile nello stesso girone (tutti già nel tabellone oppure non presenti).
                  </div>
                )}
              </div>

              {replaceError && (
                <div className="text-red-500 font-bold">{replaceError}</div>
              )}

              <div className="text-xs text-text-secondary">
                Nota: la sostituzione è permessa solo se il giocatore ritirato non ha match playoff completati.
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsReplaceModalOpen(false)}
                  className="bg-tertiary hover:bg-tertiary/80 text-text-primary font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={handleApplyReplacement}
                  disabled={!replaceOutPlayerId || !replaceInPlayerId}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-tertiary disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  Applica sostituzione
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Playoffs;
