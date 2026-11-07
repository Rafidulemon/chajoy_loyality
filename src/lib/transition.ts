import { flushSync } from 'react-dom';

type ViewTransitionLike = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void> };
type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => ViewTransitionLike };

/**
 * Run a theme/language change inside a View Transition so the whole page cross-fades.
 * Falls back to an instant update when the API is missing, the page is hidden (the browser
 * never paints, so the transition would stall), or the user prefers reduced motion.
 */
export function smoothTransition(update: () => void) {
  const doc = document as ViewTransitionDocument;
  if (
    !doc.startViewTransition ||
    doc.visibilityState !== 'visible' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    update();
    return;
  }
  const transition = doc.startViewTransition(() => flushSync(update));
  // A newer switch skips the running one; that rejection is expected, not an error.
  transition.ready.catch(() => {});
  transition.finished.catch(() => {});
  transition.updateCallbackDone.catch(() => {});
}
