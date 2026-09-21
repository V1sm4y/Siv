'use client';
import { createContext, useContext } from 'react';

/** Actions any part of the shell (palette, switcher, page buttons) can trigger. */
export interface ShellActions {
  openCreateTeam: () => void;
}
export const ShellActionsContext = createContext<ShellActions>({ openCreateTeam: () => {} });
export const useShellActions = () => useContext(ShellActionsContext);
