export const CUSTOM_TIME_RANGE = '__CUSTOM_TIME_RANGE__';

export const parseTimeToMinutes = (value) => {
  const raw = String(value || '')
    .trim()
    .replace(/\s*o'clock\s*/gi, ':00 ');
  if (!raw || raw.toLowerCase() === 'unknown') return null;

  const match = raw.match(/(?:T|\s|^)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = (match[3] || '').toLowerCase();

  if (hour > 23 || minute > 59) return null;
  if (meridiem === 'pm' && hour !== 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  return hour * 60 + minute;
};

export const isTimeInRange = (value, start, end) => {
  const time = parseTimeToMinutes(value);
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);

  if (time === null) return false;
  if (startMinutes === null && endMinutes === null) return true;
  if (startMinutes === null) return time <= endMinutes;
  if (endMinutes === null) return time >= startMinutes;
  if (startMinutes <= endMinutes) return time >= startMinutes && time <= endMinutes;

  return time >= startMinutes || time <= endMinutes;
};