import { createContext, useContext, useState, type ReactNode } from "react";
import type { BoardRepository } from "./repository";
import { CloudBoardRepository } from "./repository";
const Context = createContext<BoardRepository | null>(null);
export function RepositoryProvider({
  children,
  workspaceId,
}: {
  children: ReactNode;
  workspaceId: string;
}) {
  const [repository] = useState(() => new CloudBoardRepository(workspaceId));
  return <Context.Provider value={repository}>{children}</Context.Provider>;
}
export function useBoardRepository() {
  const repository = useContext(Context);
  if (!repository) throw new Error("BoardRepository is missing");
  return repository;
}
