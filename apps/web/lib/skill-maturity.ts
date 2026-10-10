/**
 * Deletion-decision thresholds, shared between the server (recommendation logic)
 * and the client (badges and notes).
 *
 * Deliberately has no imports: `skillpulse.ts` pulls in `node:fs`, so a client
 * component cannot import a value from it without dragging filesystem code into
 * the browser bundle.
 *
 * Why these exist - neither "few total uses" nor "idle for a while" is safe on
 * its own:
 *   - low total but recent use (router: 3 uses, used yesterday) must be kept
 *   - idle but heavily used (docker-vps-2026: 88 uses, idle 41 days) must be kept
 *   - newly installed with zero uses must NOT be called unused
 * A skill is only a candidate when it is mature AND never really adopted AND
 * currently idle.
 */

/** Skills younger than this are never judged - they cannot have proven value yet. */
export const SKILL_MATURITY_DAYS = 60

/** At or above this many recorded uses, idleness is a lull rather than a signal. */
export const PROVEN_VALUE_USES = 20

/** Days without use before a low-adoption skill counts as idle. */
export const IDLE_DAYS = 30

export const IMMATURE_LABEL = "New"

export const IMMATURE_NOTE =
  "Skills installed in the last 60 days are excluded from cleanup windows - they are too new to judge."
