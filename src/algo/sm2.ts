export const enum ReviewRating {
  Again = 0,
  Fuzzy = 1,
  Easy = 2,
}

export interface SM2Card {
  due: number;
  createdAt: number;
  interval: number;
  repetition: number;
  efactor: number;
  lastReview: number;
  state: "new" | "learning" | "review" | "relearning";
}

function ratingToQuality(rating: ReviewRating): number {
  switch (rating) {
    case ReviewRating.Easy:
      return 5;
    case ReviewRating.Fuzzy:
      return 3;
    case ReviewRating.Again:
    default:
      return 1;
  }
}

export function sm2Review(card: SM2Card, rating: ReviewRating, now: number = Date.now()): SM2Card {
  const quality = ratingToQuality(rating);
  let { interval, repetition, efactor } = card;

  if (quality < 3) {
    repetition = 0;
    interval = 1;
  } else {
    if (repetition === 0) {
      interval = 1;
    } else if (repetition === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * efactor);
    }

    repetition += 1;
    efactor = efactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    efactor = Math.max(1.3, efactor);
  }

  interval = Math.min(interval, 365);
  const due = now + interval * 24 * 60 * 60 * 1000;

  let state: SM2Card["state"];
  if (quality < 3) {
    state = card.state === "new" ? "learning" : "relearning";
  } else if (repetition <= 1) {
    state = "learning";
  } else {
    state = "review";
  }

  return {
    due,
    createdAt: card.createdAt || now,
    interval,
    repetition,
    efactor,
    lastReview: now,
    state,
  };
}

export function createNewSM2Card(now: number = Date.now()): SM2Card {
  return {
    due: now,
    createdAt: now,
    interval: 0,
    repetition: 0,
    efactor: 2.5,
    lastReview: 0,
    state: "new",
  };
}
