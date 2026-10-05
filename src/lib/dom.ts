/**
 * Scrolls `container` sideways just enough to show `child`. Unlike
 * `scrollIntoView`, this never scrolls any other ancestor.
 */
export function scrollChildIntoViewHorizontally(
  container: HTMLElement,
  child: HTMLElement,
  edgeMargin: number,
  behavior: ScrollBehavior,
): void {
  const containerBox = container.getBoundingClientRect();
  const childBox = child.getBoundingClientRect();
  if (childBox.left < containerBox.left + edgeMargin) {
    container.scrollBy({ left: childBox.left - containerBox.left - edgeMargin, behavior });
  } else if (childBox.right > containerBox.right - edgeMargin) {
    container.scrollBy({ left: childBox.right - containerBox.right + edgeMargin, behavior });
  }
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
  );
}
