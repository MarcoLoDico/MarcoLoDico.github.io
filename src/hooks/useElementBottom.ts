import { useCallback, useSyncExternalStore, type RefObject } from "react";

/**
 * The element's bottom edge in viewport pixels. It stays current as the
 * element resizes (chips wrapping, layout switching) or the viewport changes
 * (rotation, safe-area insets), so other UI can sit just below it.
 */
export function useElementBottom(ref: RefObject<HTMLElement | null>): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const observer = new ResizeObserver(onChange);
      if (ref.current) {
        observer.observe(ref.current);
      }
      window.addEventListener("resize", onChange);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", onChange);
      };
    },
    [ref],
  );

  return useSyncExternalStore(subscribe, () => Math.ceil(ref.current?.getBoundingClientRect().bottom ?? 0));
}
