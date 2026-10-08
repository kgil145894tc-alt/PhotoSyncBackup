export type ScrollMetrics = { offsetY: number; contentHeight: number; viewportHeight: number };

const HIDE_DISTANCE = 32;
const SHOW_DISTANCE = 12;
const TOP_ZONE = 12;

// One controller per client layout. Only visibility transitions notify React;
// scroll positions and direction tracking stay outside component state.
export function createScrollNavigation() {
  let activeOwner: object | null = null;
  let hidden = false;
  let lastY = 0;
  let direction = 0;
  let distance = 0;
  const listeners = new Set<() => void>();
  const setHidden = (next: boolean) => {
    if (next === hidden) return;
    hidden = next;
    listeners.forEach((listener) => listener());
  };
  const bounds = (metrics: ScrollMetrics) => {
    if (!Number.isFinite(metrics.offsetY) || !Number.isFinite(metrics.contentHeight) ||
      !Number.isFinite(metrics.viewportHeight) || metrics.viewportHeight <= 0 || metrics.contentHeight < 0) return null;
    const maxY = Math.max(0, metrics.contentHeight - metrics.viewportHeight);
    return { maxY, y: Math.max(0, Math.min(metrics.offsetY, maxY)) };
  };
  const resetPosition = (metrics: ScrollMetrics) => {
    lastY = bounds(metrics)?.y ?? Math.max(0, metrics.offsetY || 0);
    direction = 0;
    distance = 0;
  };

  return {
    getSnapshot: () => hidden,
    getServerSnapshot: () => false,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    activate(owner: object, metrics: ScrollMetrics) {
      activeOwner = owner;
      resetPosition(metrics);
      setHidden(false);
    },
    deactivate(owner: object) {
      if (activeOwner !== owner) return;
      activeOwner = null;
      direction = 0;
      distance = 0;
      setHidden(false);
    },
    resize(owner: object, metrics: ScrollMetrics) {
      if (activeOwner !== owner) return;
      const position = bounds(metrics);
      if (!position) return;
      resetPosition(metrics);
      if (position.maxY <= HIDE_DISTANCE || position.y <= TOP_ZONE) setHidden(false);
    },
    scroll(owner: object, metrics: ScrollMetrics) {
      if (activeOwner !== owner) return;
      const position = bounds(metrics);
      if (!position) return;
      const delta = position.y - lastY;
      if (position.maxY <= HIDE_DISTANCE || position.y <= TOP_ZONE) {
        lastY = position.y;
        direction = 0;
        distance = 0;
        setHidden(false);
        return;
      }
      // Clamping to the real scroll range ignores pull-to-refresh and bottom
      // overscroll bounce, which otherwise look like a direction reversal.
      if (Math.abs(delta) < 1) return;
      lastY = position.y;
      const nextDirection = Math.sign(delta);
      distance = Math.min(HIDE_DISTANCE, nextDirection === direction ? distance + Math.abs(delta) : Math.abs(delta));
      direction = nextDirection;
      if ((!hidden && direction > 0 && distance >= HIDE_DISTANCE) ||
        (hidden && direction < 0 && distance >= SHOW_DISTANCE)) {
        setHidden(direction > 0);
        distance = 0;
      }
    },
  };
}

export type ScrollNavigation = ReturnType<typeof createScrollNavigation>;
