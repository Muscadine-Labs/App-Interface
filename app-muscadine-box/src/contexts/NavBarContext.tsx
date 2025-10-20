'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface NavBarContextType {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  toggleCollapse: () => void;
}

const NavBarContext = createContext<NavBarContextType | undefined>(undefined);

export function NavBarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleCollapse = () => {
    setIsCollapsed(prev => !prev);
  };

  return (
    <NavBarContext.Provider value={{ isCollapsed, setIsCollapsed, toggleCollapse }}>
      {children}
    </NavBarContext.Provider>
  );
}

export function useNavBar() {
  const context = useContext(NavBarContext);
  if (context === undefined) {
    throw new Error('useNavBar must be used within a NavBarProvider');
  }
  return context;
}
