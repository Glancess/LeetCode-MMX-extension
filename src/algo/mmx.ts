import { MMX_INTERVAL_POLICY, MMX_POLICY_BASE, MMX_POLICY_MAX_INDEX, MMX_POLICY_MIN_INDEX } from "./mmxPolicy";

export const enum ReviewRating {
  Again = 0,
  Fuzzy = 1,
  Easy = 2,
}

export type ReviewCardState = "new" | "learning" | "review" | "relearning";

export interface ReviewCard {
  algorithm: "mmx";
  due: number;
  createdAt: number;
  interval: number;
  repetition: number;
  lastReview: number;
  state: ReviewCardState;
  difficulty: number;
  halflife: number;
  lapses: number;
  lastRecall: number;
  lastRating?: ReviewRating;
}

export interface LegacySM2Card {
  due: number;
  createdAt: number;
  interval: number;
  repetition: number;
  efactor: number;
  lastReview: number;
  state: ReviewCardState;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DIFFICULTY = 6;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 18;
const FORGET_DIFFICULTY_OFFSET = 2;
const MIN_RECALL_PROBABILITY = 0.0001;
const MAX_RECALL_PROBABILITY = 0.9999;
const MIN_HALFLIFE = Math.exp(MMX_POLICY_MIN_INDEX * Math.log(MMX_POLICY_BASE));
const MAX_HALFLIFE = Math.exp((MMX_POLICY_MAX_INDEX - 1) * Math.log(MMX_POLICY_BASE));
const FUZZY_GAIN_WEIGHT = 0.35;
const LEGACY_TARGET_RECALL = 0.8;

export function createNewMMXCard(now: number = Date.now(), difficulty: number = DEFAULT_DIFFICULTY): ReviewCard {
  const normalizedDifficulty = clampDifficulty(difficulty);
  const halflife = calculateStartHalflife(normalizedDifficulty);

  return {
    algorithm: "mmx",
    due: now,
    createdAt: now,
    interval: 0,
    repetition: 0,
    lastReview: 0,
    state: "new",
    difficulty: normalizedDifficulty,
    halflife,
    lapses: 0,
    lastRecall: 0,
  };
}

export function mmxReview(card: ReviewCard, rating: ReviewRating, now: number = Date.now()): ReviewCard {
  const difficulty = clampDifficulty(card.difficulty || DEFAULT_DIFFICULTY);
  const currentHalflife = clampHalflife(card.halflife || calculateStartHalflife(difficulty));
  const elapsedDays = getElapsedDays(card, now);
  const recall = calculateRecallProbability(currentHalflife, elapsedDays);

  let nextDifficulty = difficulty;
  let nextHalflife = currentHalflife;

  if (rating === ReviewRating.Again) {
    nextDifficulty = clampDifficulty(difficulty + FORGET_DIFFICULTY_OFFSET);
    nextHalflife = calculateForgetHalflife(difficulty, currentHalflife, recall);
  } else {
    const recallHalflife = calculateRecallHalflife(difficulty, currentHalflife, recall);
    nextHalflife =
      rating === ReviewRating.Fuzzy
        ? currentHalflife + (recallHalflife - currentHalflife) * FUZZY_GAIN_WEIGHT
        : recallHalflife;
  }

  nextHalflife = clampHalflife(nextHalflife);

  const nextInterval = getOptimalInterval(nextDifficulty, nextHalflife);
  const repetition = Math.max(0, Math.floor(card.repetition || 0)) + 1;
  const lapses = Math.max(0, Math.floor(card.lapses || 0)) + (rating === ReviewRating.Again ? 1 : 0);

  return {
    algorithm: "mmx",
    due: now + nextInterval * DAY_MS,
    createdAt: card.createdAt || now,
    interval: nextInterval,
    repetition,
    lastReview: now,
    state: getNextState(card.state, rating, nextInterval),
    difficulty: nextDifficulty,
    halflife: nextHalflife,
    lapses,
    lastRecall: recall,
    lastRating: rating,
  };
}

export function migrateLegacySM2Card(card: LegacySM2Card): ReviewCard {
  const createdAt = normalizeTimestamp(card.createdAt, card.lastReview, Date.now());
  const lastReview = normalizeTimestamp(card.lastReview, createdAt, createdAt);
  const interval = Math.max(0, Math.round(card.interval || 0));
  const scheduledInterval = Math.max(
    1,
    interval || Math.round(Math.max(1, card.due - Math.max(lastReview, createdAt)) / DAY_MS)
  );

  const difficulty = inferDifficultyFromLegacy(card);
  const halflife = clampHalflife(scheduledInterval / Math.log2(1 / LEGACY_TARGET_RECALL));

  return {
    algorithm: "mmx",
    due: Number.isFinite(card.due) ? card.due : createdAt,
    createdAt,
    interval,
    repetition: Math.max(0, Math.floor(card.repetition || 0)),
    lastReview,
    state: normalizeState(card.state, interval),
    difficulty,
    halflife,
    lapses: card.state === "relearning" ? 1 : 0,
    lastRecall: 0,
  };
}

export function isReviewCard(card: unknown): card is ReviewCard {
  if (!card || typeof card !== "object") {
    return false;
  }

  const candidate = card as ReviewCard;
  return (
    candidate.algorithm === "mmx" &&
    Number.isFinite(candidate.due) &&
    Number.isFinite(candidate.createdAt) &&
    Number.isFinite(candidate.interval) &&
    Number.isFinite(candidate.repetition) &&
    Number.isFinite(candidate.lastReview) &&
    Number.isFinite(candidate.difficulty) &&
    Number.isFinite(candidate.halflife) &&
    Number.isFinite(candidate.lapses) &&
    Number.isFinite(candidate.lastRecall)
  );
}

export function isLegacySM2Card(card: unknown): card is LegacySM2Card {
  if (!card || typeof card !== "object") {
    return false;
  }

  const candidate = card as LegacySM2Card;
  return (
    Number.isFinite(candidate.due) &&
    Number.isFinite(candidate.createdAt) &&
    Number.isFinite(candidate.interval) &&
    Number.isFinite(candidate.repetition) &&
    Number.isFinite(candidate.efactor) &&
    Number.isFinite(candidate.lastReview)
  );
}

export function estimateInitialDifficulty(problemDifficulty?: string): number {
  switch ((problemDifficulty || "").toLowerCase()) {
    case "easy":
      return 5;
    case "hard":
      return 8;
    case "medium":
    default:
      return DEFAULT_DIFFICULTY;
  }
}

function getElapsedDays(card: ReviewCard, now: number): number {
  if (!card.lastReview) {
    const createdAt = Number.isFinite(card.createdAt) ? card.createdAt : now;
    const elapsedMs = Math.max(now - createdAt, 0);
    return Math.max(elapsedMs / DAY_MS, 1 / 24);
  }

  const elapsedMs = Math.max(now - card.lastReview, 0);
  return Math.max(elapsedMs / DAY_MS, 1 / 24);
}

function calculateStartHalflife(difficulty: number): number {
  const p = Math.max(0.925 - 0.05 * difficulty, 0.025);
  return -1 / Math.log2(p);
}

function calculateRecallProbability(halflife: number, elapsedDays: number): number {
  const recall = Math.pow(2, -elapsedDays / halflife);
  return clamp(recall, MIN_RECALL_PROBABILITY, MAX_RECALL_PROBABILITY);
}

function calculateRecallHalflife(difficulty: number, halflife: number, recall: number): number {
  return (
    halflife *
    (1 +
      Math.exp(3.81) *
        Math.pow(difficulty, -0.534) *
        Math.pow(halflife, -0.127) *
        Math.pow(1 - recall, 0.97))
  );
}

function calculateForgetHalflife(difficulty: number, halflife: number, recall: number): number {
  return (
    Math.exp(-0.041) *
    Math.pow(difficulty, -0.041) *
    Math.pow(halflife, 0.377) *
    Math.pow(1 - recall, -0.227)
  );
}

function getOptimalInterval(difficulty: number, halflife: number): number {
  const difficultyIndex = clampDifficulty(difficulty) - 1;
  const row = MMX_INTERVAL_POLICY[difficultyIndex];
  const halflifeIndex = clampHalflifeIndex(halflifeToIndex(halflife));
  const policyInterval = row?.[halflifeIndex] || 0;

  if (policyInterval > 0) {
    return policyInterval;
  }

  // The paper's table uses the last index as an absorbing mastery state.
  return Math.max(1, Math.round((halflife * Math.log(0.3)) / Math.log(0.5)));
}

function halflifeToIndex(halflife: number): number {
  return Math.round(Math.log(halflife) / Math.log(MMX_POLICY_BASE)) - MMX_POLICY_MIN_INDEX;
}

function clampHalflifeIndex(index: number): number {
  return clamp(index, 0, MMX_INTERVAL_POLICY[0].length - 1);
}

function getNextState(previousState: ReviewCardState, rating: ReviewRating, interval: number): ReviewCardState {
  if (rating === ReviewRating.Again) {
    return previousState === "new" ? "learning" : "relearning";
  }

  if (interval <= 1) {
    return "learning";
  }

  return "review";
}

function normalizeState(state: ReviewCardState, interval: number): ReviewCardState {
  if (state === "new") {
    return "new";
  }
  if (state === "relearning") {
    return "relearning";
  }
  if (state === "learning") {
    return interval > 1 ? "review" : "learning";
  }
  return "review";
}

function inferDifficultyFromLegacy(card: LegacySM2Card): number {
  const ease = Number.isFinite(card.efactor) ? card.efactor : 2.5;
  let difficulty = Math.round(7 - (ease - 2.5) * 6);

  if (card.state === "relearning") {
    difficulty += 2;
  } else if (card.state === "learning" || card.interval <= 1) {
    difficulty += 1;
  }

  if ((card.repetition || 0) >= 4) {
    difficulty -= 1;
  }

  return clampDifficulty(difficulty);
}

function clampDifficulty(difficulty: number): number {
  return clamp(Math.round(difficulty), MIN_DIFFICULTY, MAX_DIFFICULTY);
}

function clampHalflife(halflife: number): number {
  if (!Number.isFinite(halflife)) {
    return calculateStartHalflife(DEFAULT_DIFFICULTY);
  }
  return clamp(halflife, MIN_HALFLIFE, MAX_HALFLIFE);
}

function normalizeTimestamp(primary: number, fallback: number, defaultValue: number): number {
  if (Number.isFinite(primary) && primary > 0) {
    return primary;
  }
  if (Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }
  return defaultValue;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
