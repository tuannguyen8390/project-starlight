import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";

const Ctx = createContext({ stats: null, refresh: () => {} });

export function StatsProvider({ children }) {
  const [stats, setStats] = useState(null);
  const refresh = useCallback(() => {
    api.stats().then(setStats).catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);
  return <Ctx.Provider value={{ stats, refresh }}>{children}</Ctx.Provider>;
}

export const useStats = () => useContext(Ctx);
