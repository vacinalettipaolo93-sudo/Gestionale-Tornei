// services/availabilityService.ts
import { collection, query, where, getDocs, setDoc, doc, deleteDoc, serverTimestamp, orderBy } from "firebase/firestore";
import { db } from "../firebase";

export type Slot = "MORNING" | "AFTERNOON" | "EVENING";

export interface AvailabilityRecord {
  id?: string;
  playerId: string; // usiamo playerId (corrisponde al player.id nel tuo progetto)
  date: string; // YYYY-MM-DD
  slot: Slot;
  isAvailable: boolean; // se presente, override; tipicamente userà false per indicare "non disponibile"
  createdAt?: any;
  updatedAt?: any;
}

const COL = "availabilities";

function docId(playerId: string, date: string, slot: Slot) {
  return `${playerId}_${date}_${slot}`;
}

export async function setAvailability(playerId: string, date: string, slot: Slot, isAvailable: boolean): Promise<void> {
  const id = docId(playerId, date, slot);
  const ref = doc(db, COL, id);
  await setDoc(ref, {
    playerId,
    date,
    slot,
    isAvailable,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  }, { merge: true });
}

export async function removeAvailability(playerId: string, date: string, slot: Slot): Promise<void> {
  const id = docId(playerId, date, slot);
  const ref = doc(db, COL, id);
  await deleteDoc(ref);
}

export async function getUserAvailabilities(playerId: string, startDate: string, endDate: string): Promise<AvailabilityRecord[]> {
  const c = collection(db, COL);
  const q = query(
    c,
    where("playerId", "==", playerId),
    where("date", ">=", startDate),
    where("date", "<=", endDate),
    orderBy("date", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as AvailabilityRecord) }));
}

// Firestore 'in' supports up to 10 items — se serve più utenti li chunkiamo
export async function getAvailabilitiesForPlayers(playerIds: string[], startDate: string, endDate: string): Promise<AvailabilityRecord[]> {
  const results: AvailabilityRecord[] = [];
  if (!playerIds || playerIds.length === 0) return results;
  const CHUNK = 10;
  for (let i = 0; i < playerIds.length; i += CHUNK) {
    const chunk = playerIds.slice(i, i + CHUNK);
    const c = collection(db, COL);
    const q = query(
      c,
      where("playerId", "in", chunk),
      where("date", ">=", startDate),
      where("date", "<=", endDate),
      orderBy("date", "asc")
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => results.push({ id: d.id, ...(d.data() as AvailabilityRecord) }));
  }
  return results;
}
