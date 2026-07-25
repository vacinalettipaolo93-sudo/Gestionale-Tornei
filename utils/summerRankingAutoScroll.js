export const SUMMER_RANKING_ROW_SCROLL_MARGIN = '7rem';

export const shouldAutoScrollToCurrentPlayer = ({ activeTab, loggedInPlayerId, isCurrentPlayerVisible }) =>
  activeTab === 'ranking' && typeof loggedInPlayerId === 'string' && loggedInPlayerId.length > 0 && isCurrentPlayerVisible;

const isConnectedElement = element => !!element && element.isConnected !== false;

const isVisibleElement = element => {
  if (!isConnectedElement(element)) return false;
  if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) return false;
  if (typeof getComputedStyle === 'function') {
    const computedStyle = getComputedStyle(element);
    if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') return false;
  }
  return true;
};

export const getSummerRankingScrollTarget = ({ mobileRow, desktopRow }) =>
  [mobileRow, desktopRow].find(isVisibleElement) ??
  [mobileRow, desktopRow].find(isConnectedElement) ??
  null;

const defaultScheduler = {
  requestAnimationFrame(callback) {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      return window.requestAnimationFrame(callback);
    }
    return setTimeout(() => callback(Date.now()), 16);
  },
  cancelAnimationFrame(handle) {
    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(handle);
      return;
    }
    clearTimeout(handle);
  },
};

export const waitForSummerRankingScrollTarget = ({
  getTarget,
  onTargetReady,
  maxFrames = 120,
  scheduler = defaultScheduler,
}) => {
  let cancelled = false;
  let frameId = null;
  let frames = 0;

  const tick = () => {
    if (cancelled) return;

    const target = getTarget();
    if (target) {
      onTargetReady(target);
      return;
    }

    frames += 1;
    if (frames >= maxFrames) return;

    frameId = scheduler.requestAnimationFrame(tick);
  };

  frameId = scheduler.requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    if (frameId !== null) {
      scheduler.cancelAnimationFrame(frameId);
    }
  };
};

export const scrollSummerRankingRowIntoView = element => {
  if (!isConnectedElement(element) || typeof element.scrollIntoView !== 'function') return false;

  element.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
    inline: 'nearest',
  });

  return true;
};
