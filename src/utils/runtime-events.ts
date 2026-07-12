/**
 * Return true when a text payload is an internal CodeWhale runtime event.
 *
 * Runtime events are persisted as user-role messages for model transport, but
 * they are not user input and must never be painted as user transcript cards.
 * Attribute order and event kind are intentionally irrelevant; visibility is
 * the display contract.
 */
export function isInternalRuntimeEventText(text: string): boolean {
  const trimmed = text.trimStart();
  const openTag = trimmed.match(/^<codewhale:runtime_event\b([^>]*)>/i);
  if (!openTag) return false;

  return /\bvisibility\s*=\s*(["'])internal\1/i.test(openTag[1]);
}
