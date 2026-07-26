/**
 * The project's motion vocabulary.
 *
 * Every animated surface pulls from here so the app reads as one system.
 * Before this, the codebase carried 12 different durations, 6 hover scales,
 * and 4 easing choices for what were the same interactions.
 *
 * Principles applied:
 * - Entrances and exits use ease-out; the user sees movement immediately.
 * - UI motion stays under 300ms; exits are faster than entrances.
 * - Text-bearing surfaces never scale on hover — subpixel resampling makes
 *   Chinese glyphs blurry. They shift background or border instead.
 */

/** Strong ease-out. The stock CSS curve is too weak to read as intentional. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** For elements moving across the screen rather than entering or leaving. */
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

export const DURATION = {
    /** Press feedback. Must feel immediate. */
    press: 0.12,
    /** Hover, colour, and small state changes. */
    fast: 0.16,
    /** Popovers, dropdowns, inline expansion. */
    normal: 0.2,
    /** Panels, drawers, modal shells. */
    slow: 0.26,
} as const;

export const TRANSITION = {
    press: { duration: DURATION.press, ease: EASE_OUT },
    fast: { duration: DURATION.fast, ease: EASE_OUT },
    normal: { duration: DURATION.normal, ease: EASE_OUT },
    slow: { duration: DURATION.slow, ease: EASE_OUT },
    /** Exits should clear the way faster than entrances arrive. */
    exit: { duration: DURATION.fast, ease: EASE_OUT },
} as const;

/**
 * Press feedback for controls whose label is an icon or short glyph.
 * Deliberately not applied to prose-bearing cards.
 */
export const PRESSABLE = {
    whileTap: { scale: 0.97 },
    transition: TRANSITION.press,
} as const;

/** Press feedback for icon-only buttons, which can take a little more. */
export const PRESSABLE_ICON = {
    whileTap: { scale: 0.94 },
    transition: TRANSITION.press,
} as const;

/**
 * Hover/press for text buttons: no scale, so glyphs stay crisp.
 * Pair with a CSS background transition on the element.
 */
export const PRESSABLE_TEXT = {
    whileTap: { opacity: 0.72 },
    transition: TRANSITION.press,
} as const;

/** Entrance for anchored surfaces (menus, popovers). Never scales from 0. */
export const POPOVER_MOTION = {
    initial: { opacity: 0, scale: 0.97, y: -4 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.98, y: -2 },
    transition: TRANSITION.normal,
} as const;

/** Entrance for centred modal shells; stays centred, so no offset. */
export const MODAL_MOTION = {
    initial: { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.99 },
    transition: TRANSITION.slow,
} as const;

/** Backdrop fade paired with MODAL_MOTION. */
export const BACKDROP_MOTION = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: TRANSITION.fast,
} as const;

/** Inline expand/collapse (thinking blocks, advanced panels). */
export const COLLAPSE_MOTION = {
    initial: { opacity: 0, height: 0 },
    animate: { opacity: 1, height: 'auto' },
    exit: { opacity: 0, height: 0 },
    transition: TRANSITION.normal,
} as const;

/** A message or row arriving in the transcript. */
export const ENTER_UP = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: TRANSITION.normal,
} as const;

/** Stagger step for lists. Kept short so lists never feel slow. */
export const STAGGER_STEP_SECONDS = 0.04;
