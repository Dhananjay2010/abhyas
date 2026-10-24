"use client";

import { createContext, useContext, useState, ReactNode } from "react";

/**
 * Context to track when the app is showing an offline error.
 *
 * When an error boundary catches an offline error, it sets this flag,
 * which causes BottomNav to hide itself (even if globals.css isn't cached).
 *
 * This ensures ONE stable offline experience: whether the user lands on
 * the SW fallback /offline page OR the app hydrates and an error boundary
 * catches a chunk load failure, they see the same UI with no bottom nav.
 */

interface OfflineErrorContextValue {
  isOfflineError: boolean;
  setIsOfflineError: (value: boolean) => void;
}

const OfflineErrorContext = createContext<OfflineErrorContextValue | undefined>(undefined);

export function OfflineErrorProvider({ children }: { children: ReactNode }) {
  const [isOfflineError, setIsOfflineError] = useState(false);

  return (
    <OfflineErrorContext.Provider value={{ isOfflineError, setIsOfflineError }}>
      {children}
    </OfflineErrorContext.Provider>
  );
}

export function useOfflineError() {
  const context = useContext(OfflineErrorContext);
  if (context === undefined) {
    throw new Error("useOfflineError must be used within OfflineErrorProvider");
  }
  return context;
}
