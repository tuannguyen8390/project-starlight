const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

// painted_at / recorded_at are naive local ISO strings ("2026-11-12T16:02:00").
const parse = (iso) => new Date(iso);

export const dayLabel = (iso) => {
  const d = parse(iso);
  return `${d.getDate()} ${SHORT[d.getMonth()]}`;
};
export const longDay = (iso) => {
  const d = parse(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
export const timeLabel = (iso) => parse(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export const dayTime = (iso) => `${dayLabel(iso)}, ${timeLabel(iso)}`;
export const monthKey = (iso) => iso.slice(0, 7);
export const monthLabel = (key) => {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
};
export const dateInput = (iso) => iso.slice(0, 10);
export const withDate = (iso, yyyymmdd) => `${yyyymmdd}T${iso.slice(11, 19) || "12:00:00"}`;

/** "10 min earlier" / "2 days later" — how a painting's photo time sits against a clip. */
export function gap(seconds) {
  const s = Math.abs(seconds);
  const dir = seconds < 0 ? "earlier" : "later";
  if (s < 90) return "same moment";
  if (s < 90 * 60) return `${Math.round(s / 60)} min ${dir}`;
  if (s < 36 * 3600) return `${Math.round(s / 3600)} h ${dir}`;
  const d = Math.round(s / 86400);
  return `${d} day${d > 1 ? "s" : ""} ${dir}`;
}

export const pluralize = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
