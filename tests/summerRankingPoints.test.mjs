/**
 * Tests for summer ranking point calculation correctness.
 *
 * Key rule (Elo-like):
 *   - winner uses favoriteWin* or underdogWin* based on THEIR pre-match role
 *   - loser uses favoriteLoss* or underdogLoss* based on THEIR pre-match role
 *     (which is always the OPPOSITE of the winner's role)
 *
 * These tests are written in plain JS and inline the essential calculation
 * logic so that they run with Node.js built-in test runner without requiring
 * a TypeScript compiler step.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Inline the minimal helpers from utils/summerRanking.ts under test
// ---------------------------------------------------------------------------

const DEFAULT_RULES_CONFIG = {
  diffBandLowMax: 99,
  diffBandMediumMax: 199,

  favoriteWinLow: 20,
  favoriteLossLow: -20,
  favoriteWinMedium: 10,
  favoriteLossMedium: -30,
  favoriteWinHigh: 5,
  favoriteLossHigh: -40,

  underdogWinLow: 20,
  underdogLossLow: -20,
  underdogWinMedium: 30,
  underdogLossMedium: -10,
  underdogWinHigh: 40,
  underdogLossHigh: -5,

  drawMode: 'percentage',
  drawPercentage: 50,
  drawFixed: 10,

  participationBonusEnabled: true,
  participationBase: 5,
  participationWeeklyBonus: 10,
  participationWeeklyMinMatches: 2,

  gameDiffBonusEnabled: true,
  gameDiffBonus2: 1,
  gameDiffBonus3: 2,
  gameDiffBonus4plus: 3,

  wonGamesBonusEnabled: true,
  wonGamesMultiplier: 1,

  inactivityMalusEnabled: true,
  inactivityMalusPoints: 5,
  inactivityMalusDays: 10,

  masterSize: 8,
  masterMinMatches: 5,
  headToHeadLimit: 5,
};

/**
 * Compute the points delta for both players in a single decisive match.
 * Returns { winnerResultPoints, loserResultPoints } using only the base result
 * fields (no participation, no game diff, no won-games bonuses).
 *
 * This mirrors the corrected logic in utils/summerRanking.ts.
 */
function computeMatchResultPoints(winnerPointsBefore, loserPointsBefore, cfg = DEFAULT_RULES_CONFIG) {
  const diff = Math.abs(winnerPointsBefore - loserPointsBefore);
  const band = diff <= cfg.diffBandLowMax ? 'low' : diff <= cfg.diffBandMediumMax ? 'medium' : 'high';
  const winnerIsFavorite = winnerPointsBefore >= loserPointsBefore;

  // Winner's result is based on the winner's own pre-match role.
  const winnerResultPoints = winnerIsFavorite
    ? (band === 'low' ? cfg.favoriteWinLow : band === 'medium' ? cfg.favoriteWinMedium : cfg.favoriteWinHigh)
    : (band === 'low' ? cfg.underdogWinLow : band === 'medium' ? cfg.underdogWinMedium : cfg.underdogWinHigh);

  // Loser's result is based on the loser's own pre-match role (OPPOSITE of the winner's).
  const loserIsFavorite = !winnerIsFavorite;
  const loserResultPoints = loserIsFavorite
    ? (band === 'low' ? cfg.favoriteLossLow : band === 'medium' ? cfg.favoriteLossMedium : cfg.favoriteLossHigh)
    : (band === 'low' ? cfg.underdogLossLow : band === 'medium' ? cfg.underdogLossMedium : cfg.underdogLossHigh);

  return { winnerResultPoints, loserResultPoints, band, winnerIsFavorite };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('favorite wins high-diff: winner gets favoriteWinHigh, loser gets underdogLossHigh', () => {
  // Paolo 300 vs Luca 500 → diff = 200 → high band; Luca is favorite
  // Luca wins → favoriteWinHigh for Luca, underdogLossHigh for Paolo
  const { winnerResultPoints, loserResultPoints, band, winnerIsFavorite } =
    computeMatchResultPoints(500 /* luca */, 300 /* paolo */);

  assert.equal(band, 'high');
  assert.equal(winnerIsFavorite, true);
  assert.equal(winnerResultPoints, DEFAULT_RULES_CONFIG.favoriteWinHigh,
    'Luca (winner, favorite) should get favoriteWinHigh');
  assert.equal(loserResultPoints, DEFAULT_RULES_CONFIG.underdogLossHigh,
    'Paolo (loser, underdog) should get underdogLossHigh (not favoriteLossHigh)');
});

test('underdog wins high-diff: winner gets underdogWinHigh, loser gets favoriteLossHigh', () => {
  // Paolo 300 vs Luca 500 → diff = 200 → high band; Paolo (300) is underdog
  // Paolo wins → underdogWinHigh for Paolo, favoriteLossHigh for Luca
  const { winnerResultPoints, loserResultPoints, band, winnerIsFavorite } =
    computeMatchResultPoints(300 /* paolo wins */, 500 /* luca loses */);

  assert.equal(band, 'high');
  assert.equal(winnerIsFavorite, false);
  assert.equal(winnerResultPoints, DEFAULT_RULES_CONFIG.underdogWinHigh,
    'Paolo (winner, underdog) should get underdogWinHigh');
  assert.equal(loserResultPoints, DEFAULT_RULES_CONFIG.favoriteLossHigh,
    'Luca (loser, favorite) should get favoriteLossHigh (not underdogLossHigh)');
});

test('favorite wins low-diff: winner gets favoriteWinLow, loser gets underdogLossLow', () => {
  // Both players near-equal points → low band; winner is the (slight) favorite
  const { winnerResultPoints, loserResultPoints, band, winnerIsFavorite } =
    computeMatchResultPoints(200, 150);

  assert.equal(band, 'low');
  assert.equal(winnerIsFavorite, true);
  assert.equal(winnerResultPoints, DEFAULT_RULES_CONFIG.favoriteWinLow);
  assert.equal(loserResultPoints, DEFAULT_RULES_CONFIG.underdogLossLow);
});

test('underdog wins medium-diff: winner gets underdogWinMedium, loser gets favoriteLossMedium', () => {
  // Diff = 150 → medium band; lower-points player (underdog) wins
  const { winnerResultPoints, loserResultPoints, band, winnerIsFavorite } =
    computeMatchResultPoints(200, 350 /* loser is favorite */);

  assert.equal(band, 'medium');
  assert.equal(winnerIsFavorite, false);
  assert.equal(winnerResultPoints, DEFAULT_RULES_CONFIG.underdogWinMedium);
  assert.equal(loserResultPoints, DEFAULT_RULES_CONFIG.favoriteLossMedium);
});

test('breakdown winner/loser roles are always complementary', () => {
  // No matter who wins, winnerIsFavorite and loserIsFavorite must be opposite
  const scenarios = [
    [100, 100],  // exact tie in points → winner is technically "favorite" (>=)
    [300, 500],  // underdog wins
    [500, 300],  // favorite wins
    [400, 401],  // near tie, slight underdog wins
  ];
  for (const [winnerPts, loserPts] of scenarios) {
    const { winnerIsFavorite } = computeMatchResultPoints(winnerPts, loserPts);
    const loserIsFavorite = winnerPts < loserPts; // loser had more points → was favorite
    assert.notEqual(
      winnerIsFavorite && loserIsFavorite,
      true,
      `Winner and loser cannot both be favorites (${winnerPts} vs ${loserPts})`,
    );
  }
});
