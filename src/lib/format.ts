import { format, formatDistanceToNowStrict, parseISO, differenceInYears } from "date-fns";

export const fmtDate = (d: string | Date) =>
  format(typeof d === "string" ? parseISO(d) : d, "d MMM yyyy");

export const fmtDateTime = (d: string | Date) =>
  format(typeof d === "string" ? parseISO(d) : d, "d MMM yyyy, HH:mm");

export const fmtTime = (d: string | Date) =>
  format(typeof d === "string" ? parseISO(d) : d, "HH:mm");

export const relative = (d: string | Date) =>
  formatDistanceToNowStrict(typeof d === "string" ? parseISO(d) : d, { addSuffix: true });

export const ageFrom = (dob: string) =>
  differenceInYears(new Date(), parseISO(dob));

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export const maskAbha = (n: string) => {
  const digits = n.replace(/\D/g, "");
  if (digits.length < 4) return n;
  return `XX-XXXX-XXXX-${digits.slice(-4)}`;
};

export const titleCase = (s: string) =>
  s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
