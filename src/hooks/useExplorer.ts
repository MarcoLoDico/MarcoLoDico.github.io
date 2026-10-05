import { useEffect, useReducer, useRef, type ActionDispatch } from "react";
import {
  explorerReducer,
  isSameExplorerState,
  parseExplorerState,
  serializeExplorerState,
  type ExplorerAction,
  type ExplorerState,
} from "../lib/explorer";

function readStateFromLocation(): ExplorerState {
  return parseExplorerState(window.location.search);
}

/**
 * Explorer state lives in the URL so every view is shareable and the browser
 * back button steps out of a place or category like it does in a maps app.
 */
export function useExplorer(): [ExplorerState, ActionDispatch<[ExplorerAction]>] {
  const [state, dispatch] = useReducer(explorerReducer, undefined, readStateFromLocation);
  const stateInUrl = useRef(state);

  useEffect(() => {
    if (isSameExplorerState(stateInUrl.current, state)) {
      return;
    }
    stateInUrl.current = state;
    const { pathname, hash } = window.location;
    window.history.pushState(null, "", `${pathname}${serializeExplorerState(state)}${hash}`);
  }, [state]);

  useEffect(() => {
    const restoreFromHistory = () => {
      const restored = readStateFromLocation();
      stateInUrl.current = restored;
      dispatch({ type: "restore", state: restored });
    };
    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, []);

  return [state, dispatch];
}
