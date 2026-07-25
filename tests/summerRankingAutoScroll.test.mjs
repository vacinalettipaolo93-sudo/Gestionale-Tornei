import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSummerRankingScrollTarget,
  shouldAutoScrollToCurrentPlayer,
  waitForSummerRankingScrollTarget,
} from '../utils/summerRankingAutoScroll.js';

const createFakeRow = ({ visible = true } = {}) => ({
  isConnected: true,
  getClientRects: () => (visible ? [{ width: 100, height: 24 }] : []),
});

const createFrameScheduler = () => {
  let nextId = 1;
  const queue = [];
  const cancelled = new Set();

  return {
    scheduler: {
      requestAnimationFrame(callback) {
        const id = nextId += 1;
        queue.push({ id, callback });
        return id;
      },
      cancelAnimationFrame(id) {
        cancelled.add(id);
      },
    },
    flushNextFrame() {
      const next = queue.shift();
      if (!next || cancelled.has(next.id)) return false;
      next.callback(0);
      return true;
    },
    flushAllFrames(limit = 20) {
      let count = 0;
      while (count < limit && this.flushNextFrame()) {
        count += 1;
      }
      return count;
    },
  };
};

test('authenticated users wait for the personal Summer Ranking row and scroll when it appears', () => {
  const frames = createFrameScheduler();
  const mobileRow = createFakeRow({ visible: true });
  let currentTarget = null;
  const scrolledTargets = [];

  waitForSummerRankingScrollTarget({
    getTarget: () => currentTarget,
    onTargetReady: target => scrolledTargets.push(target),
    scheduler: frames.scheduler,
    maxFrames: 5,
  });

  assert.equal(scrolledTargets.length, 0);
  assert.equal(frames.flushNextFrame(), true);
  assert.equal(scrolledTargets.length, 0);

  currentTarget = getSummerRankingScrollTarget({ mobileRow, desktopRow: null });
  assert.equal(frames.flushNextFrame(), true);
  assert.deepEqual(scrolledTargets, [mobileRow]);
});

test('anonymous users do not trigger the Summer Ranking auto-scroll attempt', () => {
  assert.equal(
    shouldAutoScrollToCurrentPlayer({
      activeTab: 'ranking',
      loggedInPlayerId: undefined,
      isCurrentPlayerVisible: true,
    }),
    false,
  );
});

test('missing users do not throw and stop retrying when no Summer Ranking row is found', () => {
  const frames = createFrameScheduler();
  const scrolledTargets = [];

  assert.doesNotThrow(() => {
    waitForSummerRankingScrollTarget({
      getTarget: () => null,
      onTargetReady: target => scrolledTargets.push(target),
      scheduler: frames.scheduler,
      maxFrames: 3,
    });

    frames.flushAllFrames();
  });

  assert.deepEqual(scrolledTargets, []);
});
