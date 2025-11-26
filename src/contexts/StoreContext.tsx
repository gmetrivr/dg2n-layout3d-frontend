import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type StoreContextValue = {
  storeName: string | null;
  setStoreName: (name: string | null) => void;
};

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [storeName, setStoreNameState] = useState<string | null>(null);

  const setStoreName = useCallback((name: string | null) => {
    setStoreNameState(name);
  }, []);

  const value = useMemo<StoreContextValue>(
    () => ({
      storeName,
      setStoreName,
    }),
    [storeName, setStoreName]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
