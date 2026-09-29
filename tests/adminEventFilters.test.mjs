import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'admin-event-filters-'));
execFileSync('npx', [
  'tsc', '--outDir', tempDir, '--module', 'ESNext', '--target', 'ES2022',
  '--moduleResolution', 'bundler', '--skipLibCheck', '--lib', 'ES2022,DOM,DOM.Iterable',
  'types.ts', 'utils/eventStatus.ts', 'utils/adminEventFilters.ts',
], { cwd: process.cwd(), stdio: 'pipe' });

for (const file of ['adminEventFilters.js', 'eventStatus.js']) {
  const filePath = path.join(tempDir, 'utils', file);
  writeFileSync(filePath, readFileSync(filePath, 'utf8')
    .replaceAll("'./eventStatus'", "'./eventStatus.js'"));
}
const { filterAdminEvents, getConcludedYears, getEventYear } =
  await import(pathToFileURL(path.join(tempDir, 'utils/adminEventFilters.js')).href);

const completed = (completedAt) => ({
  id: 'm', player1Id: 'a', player2Id: 'b', status: 'completed',
  score1: 2, score2: 0, completedAt,
});
const tournament = (match) => ({
  id: 't', groups: [{ id: 'g', matches: [match] }], playoffs: null, consolationBracket: null,
});
const event = (id, eventType, match) => ({
  id, name: id, eventType, players: [], tournaments: match ? [tournament(match)] : [],
});
const events = [
  event('tennis-active', 'tournament_singolare'),
  event('tennis-2024', 'tournament_singolare', completed('2024-06-01T12:00:00Z')),
  event('tennis-2025', 'tournament_singolare', completed('2025-09-01T12:00:00Z')),
  event('legacy', undefined, completed(undefined)),
  event('padel-active', 'tournament_padel'),
  event('padel-2023', 'tournament_padel', completed('2023-07-01T12:00:00Z')),
  { ...event('summer-ranking', 'ranking_singolare'), rankingData: { master: { matches: [{
    ...completed('2025-08-01T12:00:00Z'), round: 1, stage: 'final',
  }] } } },
  { ...event('padel-ranking', 'ranking_padel_individuale'), rankingData: { padelIndividualMaster: { matches: [{
    ...completed('2024-08-01T12:00:00Z'), round: 1, stage: 'final',
  }] } } },
];

test('sport, status and category filters retain legacy tennis events', () => {
  assert.deepEqual(filterAdminEvents(events, 'tennis', 'all', 'ongoing').map(e => e.id), ['tennis-active']);
  assert.deepEqual(filterAdminEvents(events, 'padel', 'all', 'ongoing').map(e => e.id), ['padel-active']);
  assert.deepEqual(filterAdminEvents(events, 'tennis', 'ranking', 'concluded').map(e => e.id), ['summer-ranking']);
  assert.deepEqual(filterAdminEvents(events, 'padel', 'ranking', 'concluded').map(e => e.id), ['padel-ranking']);
  assert.deepEqual(filterAdminEvents(events, 'tennis', 'tournament', 'concluded').map(e => e.id),
    ['tennis-2024', 'tennis-2025', 'legacy']);
});

test('historic years sort newest first and unknown years remain accessible', () => {
  const concluded = filterAdminEvents(events, 'tennis', 'all', 'concluded');
  assert.deepEqual(getConcludedYears(concluded), [2025, 2024]);
  assert.deepEqual(filterAdminEvents(concluded, 'tennis', 'all', 'concluded', 2024).map(e => e.id), ['tennis-2024']);
  assert.equal(getEventYear(concluded.find(e => e.id === 'legacy')), null);
  assert.equal(getEventYear(event('invalid', 'tournament_singolare', completed('not-a-date'))), null);
  assert.equal(getEventYear({ ...event('incomplete', undefined), tournaments: [{ id: 't', groups: null }] }), null);
  assert.equal(getEventYear(event('scheduled-legacy', 'tournament_singolare', {
    ...completed(undefined), scheduledTime: '2022-07-01T18:00:00Z',
  })), 2022);
  assert.equal(getEventYear(event('unplayed', 'tournament_singolare', {
    ...completed(undefined), status: 'pending', scheduledTime: '2022-07-01T18:00:00Z',
  })), null);
  assert.equal(getEventYear({
    ...event('multiple', 'tournament_singolare'),
    tournaments: [tournament(completed('2023-01-01T00:00:00Z')), tournament(completed('2025-12-01T00:00:00Z'))],
  }), 2025);
});
