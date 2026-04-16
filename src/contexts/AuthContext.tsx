import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type UserRole = 'admin' | 'manager' | 'sales_rep' | 'executive';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  profile: any;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  const fetchProfile = async (userId: string) => {
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      setProfile(profileData);
      setRole(roleData?.role as UserRole || 'sales_rep');
    } catch (e) {
      console.error('AuthContext: fetchProfile failed', e);
      setProfile(null);
      setRole('sales_rep');
    }
  };

  useEffect(() => {
    // Timeout failsafe: never stay loading more than 10s
    const timeout = setTimeout(() => {
      if (!initialized.current) {
        console.warn('AuthContext: startup timeout, forcing loading=false');
        initialized.current = true;
        setLoading(false);
      }
    }, 10000);

    // 1. Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (initialized.current) return;
      initialized.current = true;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      }
      setLoading(false);
    }).catch(() => {
      if (!initialized.current) {
        initialized.current = true;
        setLoading(false);
      }
    });

    // 2. Listen for future changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setRole(null);
        }
        // Also mark loading done if getSession was slow
        if (!initialized.current) {
          initialized.current = true;
        }
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, role, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
