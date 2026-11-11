// Date, time and size formatting, all in the time zone and locale from .env.

import config from './config.js';

const { locale, timeZone } = config;

const timeFmt = new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit' });
const clockFmt = new Intl.DateTimeFormat(locale, {
  timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const dateFmt = new Intl.DateTimeFormat(locale, {
  timeZone, weekday: 'long', day: 'numeric', month: 'long',
});

export const time = (iso) => timeFmt.format(new Date(iso));
export const clock = (date) => clockFmt.format(date);
export const longDate = (date) => dateFmt.format(date);

export function timeRange(start, end) {
  return `${time(start)}–${time(end)}`;
}

// "in 25 min", "in 2 h 10 min", "5 min ago"
export function relative(iso, now = Date.now()) {
  const mins = Math.round((Date.parse(iso) - now) / 60e3);
  const abs = Math.abs(mins);
  let text = `${abs} min`;
  if (abs >= 60) text = abs % 60 ? `${Math.floor(abs / 60)} h ${abs % 60} min` : `${abs / 60} h`;
  if (abs === 0) return 'now';
  return mins > 0 ? `in ${text}` : `${text} ago`;
}

export function duration(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

export function bytes(n) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}
