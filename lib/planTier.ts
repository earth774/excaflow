/** Free plan: max projects per user */
export const FREE_TIER_MAX_PROJECTS = 5;

/** Free plan: max rooms ("pages") per project */
export const FREE_TIER_MAX_PAGES_PER_PROJECT = 5;

/**
 * Free plan: AI diagram generations per calendar month (UTC).
 * Enough to evaluate the feature; tight enough to limit API cost and abuse.
 */
export const FREE_TIER_AI_DIAGRAM_GENERATIONS_PER_MONTH = 15;

/**
 * Pro plan: AI diagram generations per calendar month (UTC).
 * High ceiling for normal power users; still bounded to protect infra spend.
 */
export const PRO_TIER_AI_DIAGRAM_GENERATIONS_PER_MONTH = 500;
