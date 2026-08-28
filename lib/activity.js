const ACTORS = new Set(["you", "agent", "intent"]);
const MAX_EVENTS = 8;

function cleanText(value, label, maxLength) {
  if (typeof value !== "string") throw new TypeError(`Activity ${label} must be text.`);
  const cleaned = value.trim();
  if (!cleaned) throw new TypeError(`Invalid activity ${label}.`);
  return cleaned.slice(0, maxLength);
}

export function appendActivity(history, event) {
  if (!Array.isArray(history)) throw new TypeError("Activity history must be a list.");
  if (!ACTORS.has(event?.actor)) throw new TypeError("Invalid activity actor.");
  const previousSequence = history.at(-1)?.sequence ?? 0;
  const entry = Object.freeze({
    sequence: previousSequence + 1,
    actor: event.actor,
    title: cleanText(event.title, "title", 100),
    detail: cleanText(event.detail, "detail", 240)
  });
  return Object.freeze([...history.slice(-(MAX_EVENTS - 1)), entry]);
}
