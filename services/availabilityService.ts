// services/availabilityService.ts
import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Questo servizio gestisce:
 * - override di disponibilità per date/slot (funzionalità precedente, lasciata per compatibilità)
 * - impostazione globale della disponibilità per un giocatore (collection "availability_settings")
 * - preferenze per slot creati dall'amministratore (collection "slot_preferences")
 */

// --- tipi ---
export type Slot = "MORNING" | "AFTERNOON" | "EVENING";

export interface AvailabilityRecord {
  id?: string;
  playerId: string;
  date: string; // YYYY-MM-DD
  slot: string; // enum o slot id
  isAvailable: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface SlotPreference {
  id?: string; // doc id playerId_slotId
  playerId: string;
  slotId: string;
  isPreferred: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface GlobalAvailability {
  id?: string; // doc id = playerId
  playerId: string;
  available: boolean; // true = available override, false = explicitly not available
  createdAt?: any;
  updatedAt?: any;
}

// --- collections ---
const AVAIL_COL = "availabilities"; // legacy/compat
const GLOBAL_COL = "availability_settings";
const SLOT_PREF_COL = "slot_preferences";

// --- legacy: per-date availabilities (lasciamo le funzioni se servono) ---
function docIdAvail(playerId: string, date: string, slot: string) {
  return `${playerId}_${date}_${slot}`;
}

export async function setAvailability(playerId: string, date: string, slot: string, isAvailable: boolean): Promise<void> {
  const id = docIdAvail(playerId, date, slot);
  const ref = doc(db, AVAIL_COL, id);
  await setDoc(ref, { playerId, date, slot, isAvailable, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
}

export async function removeAvailability(playerId: string, date: string, slot: string): Promise<void> {
  const id = docIdAvail(playerId, date, slot);
  const ref = doc(db, AVAIL_COL, id);
  await deleteDoc(ref);
}

export async function getUserAvailabilities(playerId: string, startDate: string, endDate: string): Promise<AvailabilityRecord[]> {
  const c = collection(db, AVAIL_COL);
  const q = query(c, where("playerId", "==", playerId), where("date", ">=", startDate), where("date", "<=", endDate), orderBy("date", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as AvailabilityRecord) }));
}

// --- GLOBAL availability (simple on/off per player) ---
export async function setGlobalAvailability(playerId: string, available: boolean): Promise<void> {
  const ref = doc(db, GLOBAL_COL, playerId);
  await setDoc(ref, { playerId, available, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
}

export async function removeGlobalAvailability(playerId: string): Promise<void> {
  const ref = doc(db, GLOBAL_COL, playerId);
  await deleteDoc(ref);
}

export async function getGlobalAvailability(playerId: string): Promise<GlobalAvailability | null> {
  const ref = doc(db, GLOBAL_COL, playerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as GlobalAvailability) };
}

export async function getGlobalAvailabilitiesForPlayers(playerIds: string[]): Promise<GlobalAvailability[]> {
  const results: GlobalAvailability[] = [];
  if (!playerIds || playerIds.length === 0) return results;
  // Firestore 'in' supports up to 10 items
  const CHUNK = 10;
  for (let i = 0; i < playerIds.length; i += CHUNK) {
    const chunk = playerIds.slice(i, i + CHUNK);
    const c = collection(db, GLOBAL_COL);
    const q = query(c, where("playerId", "in", chunk));
    const snap = await getDocs(q);
    snap.docs.forEach(d => results.push({ id: d.id, ...(d.data() as GlobalAvailability) }));
  }
  return results;
}

// --- SLOT preferences (per slot created by admin) ---
function docIdSlotPref(playerId: string, slotId: string) {
  return `${playerId}_${slotId}`;
}

export async function setSlotPreference(playerId: string, slotId: string, isPreferred: boolean): Promise<void> {
  const id = docIdSlotPref(playerId, slotId);
  const ref = doc(db, SLOT_PREF_COL, id);
  await setDoc(ref, { playerId, slotId, isPreferred, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
}

export async function removeSlotPreference(playerId: string, slotId: string): Promise<void> {
  const id = docIdSlotPref(playerId, slotId);
  const ref = doc(db, SLOT_PREF_COL, id);
  await deleteDoc(ref);
}

export async function getSlotPreferencesForPlayers(playerIds: string[]): Promise<SlotPreference[]> {
  const results: SlotPreference[] = [];
  if (!playerIds || playerIds.length === 0) return results;
  const CHUNK = 10;
  for (let i = 0; i < playerIds.length; i += CHUNK) {
    const chunk = playerIds.slice(i, i + CHUNK);
    const c = collection(db, SLOT_PREF_COL);
    const q = query(c, where("playerId", "in", chunk));
    const snap = await getDocs(q);
    snap.docs.forEach(d => results.push({ id: d.id, ...(d.data() as SlotPreference) }));
  }
  return results;
}
