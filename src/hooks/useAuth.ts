import { useCallback, useEffect, useState } from 'react';
import { insforge } from '../lib/insforge';

type AuthUser = {
  id: string;
  email?: string;
  name?: string;
};

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await insforge.auth.getCurrentUser();
    if (error || !data?.user) {
      setUser(null);
    } else {
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = async () => {
    await insforge.auth.signOut();
    setUser(null);
  };

  return { user, loading, refresh, signOut };
}
