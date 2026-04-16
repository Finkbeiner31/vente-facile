import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { TourStop } from '@/components/TourMode';

type StopStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';

export interface TourSession {
  active: boolean;
  selectedDay: number;
  stops: TourStop[];
  currentIndex: number;
  statuses: Record<number, StopStatus>;
  visitStartTime: string | null; // ISO string for serialization
  startedAt: string; // ISO string
}

interface TourSessionContextValue {
  session: TourSession | null;
  startSession: (day: number, stops: TourStop[]) => void;
  updateSession: (patch: Partial<TourSession>) => void;
  endSession: () => void;
}

const STORAGE_KEY = 'f7_tour_session';

const TourSessionContext = createContext<TourSessionContextValue | null>(null);

function loadSession(): TourSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TourSession;
    if (!parsed.active) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session: TourSession | null) {
  if (!session) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}

export function TourSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<TourSession | null>(() => loadSession());

  // Persist on every change
  useEffect(() => {
    saveSession(session);
  }, [session]);

  const startSession = useCallback((day: number, stops: TourStop[]) => {
    const newSession: TourSession = {
      active: true,
      selectedDay: day,
      stops,
      currentIndex: 0,
      statuses: {},
      visitStartTime: null,
      startedAt: new Date().toISOString(),
    };
    setSession(newSession);
  }, []);

  const updateSession = useCallback((patch: Partial<TourSession>) => {
    setSession(prev => {
      if (!prev) return prev;
      return { ...prev, ...patch };
    });
  }, []);

  const endSession = useCallback(() => {
    setSession(null);
  }, []);

  return (
    <TourSessionContext.Provider value={{ session, startSession, updateSession, endSession }}>
      {children}
    </TourSessionContext.Provider>
  );
}

export function useTourSession() {
  const ctx = useContext(TourSessionContext);
  if (!ctx) throw new Error('useTourSession must be used within TourSessionProvider');
  return ctx;
}
