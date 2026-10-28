// Full UTC calendar months, with month-end anniversaries clamped to the last day.
function timestamp(value) {
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value)
    throw new Error('Enter valid contract dates.');
  return time;
}
export function fullContractMonths(start, end) {
  const a = new Date(timestamp(start)),
    b = new Date(timestamp(end));
  if (b < a) throw new Error('End date must not precede start date.');
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  const anniversary = new Date(a);
  anniversary.setUTCDate(1);
  anniversary.setUTCMonth(anniversary.getUTCMonth() + months);
  const last = new Date(anniversary);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  anniversary.setUTCDate(Math.min(a.getUTCDate(), last.getUTCDate()));
  if (anniversary > b) months--;
  return months;
}
export function contractPeriods(data, now = Date.now()) {
  const start = data.get('startDate'),
    end = data.get('endDate');
  const startTime = timestamp(start),
    endTime = end ? timestamp(end) : now;
  if (end && endTime < startTime) throw new Error('End date must not precede start date.');
  const durationMonths =
    data.get('durationMode') === 'dates' ? fullContractMonths(start, end) : Number(data.get('durationMonths'));
  if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 1200)
    throw new Error('Duration must be 1 to 1200 full months. Adjust the dates or enter it manually.');
  const status = data.get('workStatus');
  if (['completed', 'canceled'].includes(status) && (!end || endTime > now))
    throw new Error('Completed or canceled work requires an end date that is not in the future.');
  const finished =
    startTime > Math.min(now, endTime)
      ? 0
      : fullContractMonths(start, new Date(Math.min(now, endTime)).toISOString().slice(0, 10));
  let text = String(data.get('periodOutcomes') || '').trim();
  if (['canceled', 'disputed'].includes(status) && !text)
    throw new Error('Enter completed month outcomes, or “none” if no months were completed.');
  const periodOutcomes =
    status === 'completed'
      ? Array.from({ length: durationMonths }, (_, i) => ({ month: i + 1, outcome: 'success' }))
      : status === 'planned' || text.toLowerCase() === 'none' || !text
      ? []
      : text
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => {
            const match = line.trim().match(/^(\d+)\s*,\s*(success|failure)$/);
            if (!match) throw new Error('Enter each month as “1, success” or “1, failure”.');
            return { month: Number(match[1]), outcome: match[2] };
          });
  const seen = new Set();
  for (const { month } of periodOutcomes) {
    if (month < 1 || month > durationMonths || month > finished || seen.has(month))
      throw new Error('Outcomes must identify distinct, finished months within the contract duration.');
    seen.add(month);
  }
  return { durationMonths, periodOutcomes };
}
