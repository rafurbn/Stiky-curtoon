// Bangladesh Standard Time (Asia/Dhaka) is permanently UTC+6 (no DST).
const BD_OFFSET_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_BD_SLOTS = ['08:30', '15:00', '19:50'];

export function getBdDateKey(date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const bdMs = d.getTime() + BD_OFFSET_MS;
  return new Date(bdMs).toISOString().slice(0, 10);
}

export function computeUpcomingBdSlots(
  slots: string[],
  totalCount: number,
  jitterMinutes = 0,
  fromDate = new Date(),
  minBufferMinutes = 15
): Date[] {
  const cleanSlots = (slots.length > 0 ? slots : DEFAULT_BD_SLOTS)
    .map((s) => {
      const [hh, mm] = s.split(':').map((n) => parseInt(n, 10));
      return {
        h: Number.isFinite(hh) ? Math.max(0, Math.min(23, hh)) : 8,
        m: Number.isFinite(mm) ? Math.max(0, Math.min(59, mm)) : 30,
      };
    })
    .sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));

  const minAllowedUtcMs = fromDate.getTime() + minBufferMinutes * 60 * 1000;
  const bdNow = new Date(fromDate.getTime() + BD_OFFSET_MS);
  const startYear = bdNow.getUTCFullYear();
  const startMonth = bdNow.getUTCMonth();
  const startDay = bdNow.getUTCDate();
  const results: Date[] = [];
  let dayOffset = 0;

  while (results.length < totalCount && dayOffset < 35) {
    for (const slot of cleanSlots) {
      if (results.length >= totalCount) break;
      const bdWallUtcMs =
        Date.UTC(startYear, startMonth, startDay + dayOffset, slot.h, slot.m, 0) -
        BD_OFFSET_MS;
      const jitterOffsetMs =
        jitterMinutes > 0
          ? Math.round((Math.random() * 2 - 1) * jitterMinutes) * 60 * 1000
          : 0;
      const finalUtcMs = bdWallUtcMs + jitterOffsetMs;
      if (finalUtcMs >= minAllowedUtcMs) {
        results.push(new Date(finalUtcMs));
      }
    }
    dayOffset += 1;
  }
  return results;
}

export function formatBdTimeLabel(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return date.toLocaleString('bn-BD', {
    timeZone: 'Asia/Dhaka',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatSlotTimeBn(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period =
    h < 5
      ? 'ভোর'
      : h < 12
        ? 'সকাল'
        : h < 16
          ? 'দুপুর'
          : h < 18
            ? 'বিকাল'
            : 'রাত';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(m).padStart(2, '0');
  return `${period} ${h12}:${mm}`;
}
