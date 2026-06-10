"use client";
import { createContext, useContext, useState } from "react";

const SidebarContext = createContext<{ toggle: () => void }>({ toggle: () => {} });

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);
  return (
    <SidebarContext.Provider value={{ toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebarToggle = () => useContext(SidebarContext).toggle;
