/**
 * Focus trap utility for modal dialogs and bottom sheets.
 *
 * Traps Tab and Shift+Tab within the container, closes on Escape,
 * and returns focus to the element that opened the dialog when closed.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface FocusTrapOptions {
  /** The container element to trap focus within */
  element: HTMLElement;
  /** Callback when Escape is pressed */
  onEscape?: () => void;
  /** Element to return focus to when trap is released */
  returnFocusTo?: HTMLElement | null;
  /** Whether to focus the first element on mount (default: true) */
  initialFocus?: boolean;
}

export interface FocusTrapReturn {
  /** Release the trap and return focus */
  release: () => void;
}

/**
 * Create a focus trap within the given element.
 *
 * @example
 * ```tsx
 * const triggerRef = useRef<HTMLButtonElement>(null);
 * const containerRef = useRef<HTMLDivElement>(null);
 *
 * useEffect(() => {
 *   if (!containerRef.current) return;
 *   const trap = focusTrap({
 *     element: containerRef.current,
 *     onEscape: () => setOpen(false),
 *     returnFocusTo: triggerRef.current,
 *   });
 *   return () => trap.release();
 * }, []);
 * ```
 */
export function focusTrap(options: FocusTrapOptions): FocusTrapReturn {
  const { element, onEscape, returnFocusTo, initialFocus = true } = options;

  const getFocusableElements = (): HTMLElement[] => {
    const nodes = element.querySelectorAll(FOCUSABLE_SELECTOR);
    return Array.from(nodes) as HTMLElement[];
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Handle Escape
    if (e.key === 'Escape' && onEscape) {
      e.preventDefault();
      e.stopPropagation();
      onEscape();
      return;
    }

    // Handle Tab
    if (e.key === 'Tab') {
      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement;

      if (e.shiftKey) {
        // Shift+Tab: if on first element or outside, move to last
        if (active === first || !element.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if on last element or outside, move to first
        if (active === last || !element.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  // Set up trap
  element.addEventListener('keydown', handleKeyDown);

  // Focus first element if requested
  if (initialFocus) {
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      // Small delay to ensure the element is visible
      requestAnimationFrame(() => {
        focusable[0].focus();
      });
    }
  }

  return {
    release: () => {
      element.removeEventListener('keydown', handleKeyDown);
      if (returnFocusTo && document.body.contains(returnFocusTo)) {
        returnFocusTo.focus();
      }
    },
  };
}
