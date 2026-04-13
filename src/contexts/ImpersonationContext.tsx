import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface ImpersonatedUser {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
}

interface ImpersonationContextType {
  impersonatedUser: ImpersonatedUser | null;
  isImpersonating: boolean;
  startImpersonation: (user: ImpersonatedUser) => void;
  stopImpersonation: () => void;
  /** Returns the effective user id (impersonated or real) */
  effectiveUserId: string | null;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

export function ImpersonationProvider({ children, realUserId }: { children: ReactNode; realUserId: string | null }) {
  const [impersonatedUser, setImpersonatedUser] = useState<ImpersonatedUser | null>(null);

  const startImpersonation = useCallback((user: ImpersonatedUser) => {
    setImpersonatedUser(user);
  }, []);

  const stopImpersonation = useCallback(() => {
    setImpersonatedUser(null);
  }, []);

  const isImpersonating = impersonatedUser !== null;
  const effectiveUserId = isImpersonating ? impersonatedUser!.id : realUserId;

  return (
    <ImpersonationContext.Provider value={{
      impersonatedUser,
      isImpersonating,
      startImpersonation,
      stopImpersonation,
      effectiveUserId,
    }}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const context = useContext(ImpersonationContext);
  if (!context) throw new Error('useImpersonation must be used within ImpersonationProvider');
  return context;
}
