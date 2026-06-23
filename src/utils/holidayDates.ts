export function getHolidayDayDiff(startDate: string, baseDate = new Date()) {
  const targetDate = new Date(`${startDate.slice(0, 10)}T00:00:00`);
  const compareDate = new Date(baseDate);
  compareDate.setHours(0, 0, 0, 0);

  return Math.ceil((targetDate.getTime() - compareDate.getTime()) / (1000 * 3600 * 24));
}

export function shouldAutoArchiveHoliday(startDate: string, baseDate = new Date(), thresholdDays = 7) {
  return getHolidayDayDiff(startDate, baseDate) <= -thresholdDays;
}

export function buildReviewDeferredUntil(baseDate = new Date()) {
  const deferredDate = new Date(baseDate);
  deferredDate.setDate(deferredDate.getDate() + 1);
  deferredDate.setHours(9, 0, 0, 0);
  return deferredDate.toISOString();
}

export function isReviewDeferredActive(reviewDeferredUntil: string | null, baseDate = new Date()) {
  if (!reviewDeferredUntil) return false;
  return new Date(reviewDeferredUntil).getTime() > baseDate.getTime();
}
