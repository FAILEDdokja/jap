/**
 * ABDM / ABHA identity — MOCK.
 *
 * This module simulates the shape of an ABHA verification + OTP exchange so the
 * identity workflow can be demonstrated. It performs NO network calls and is not
 * connected to any government system. A production integration would replace the
 * body of these functions with real ABDM Gateway calls behind a server.
 */

export type AbhaLookup = {
  abhaNumber: string;
  abhaAddress: string;
  name: string;
  gender: "Male" | "Female" | "Other";
  yearOfBirth: number;
  maskedMobile: string;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clean = (s: string) => s.replace(/\s|-/g, "");

/** Simulate resolving an ABHA number/address to a demographic stub. */
export async function lookupAbha(input: string): Promise<AbhaLookup> {
  await wait(650);
  const raw = clean(input);
  const isNumber = /^\d{14}$/.test(raw);
  if (!isNumber && !input.includes("@abdm")) {
    throw new Error("Enter a 14-digit ABHA number or an ABHA address like name@abdm.");
  }
  const seed = [...raw].reduce((a, c) => a + c.charCodeAt(0), 0);
  const first = ["Aarav", "Isha", "Kabir", "Ananya", "Rohan", "Diya", "Vivaan", "Sara"][seed % 8];
  const last = ["Nair", "Menon", "Rao", "Shah", "Reddy", "Gowda", "Bose", "Kaur"][(seed >> 3) % 8];
  const num = isNumber
    ? `${raw.slice(0, 2)}-${raw.slice(2, 6)}-${raw.slice(6, 10)}-${raw.slice(10)}`
    : `${10 + (seed % 80)}-${1000 + (seed % 9000)}-${1000 + ((seed * 7) % 9000)}-${1000 + ((seed * 13) % 9000)}`;
  return {
    abhaNumber: num,
    abhaAddress: input.includes("@abdm") ? input : `${first.toLowerCase()}.${last.toLowerCase()}@abdm`,
    name: `${first} ${last}`,
    gender: (["Male", "Female", "Other"] as const)[seed % 3],
    yearOfBirth: 1960 + (seed % 45),
    maskedMobile: `XXXXXX${(seed % 9000 + 1000).toString().slice(-4)}`,
  };
}

/** Simulate sending an OTP to the ABHA-linked mobile. Returns a demo code. */
export async function sendAbhaOtp(_abhaNumber: string): Promise<{ txnId: string; demoCode: string }> {
  await wait(500);
  return { txnId: Math.random().toString(36).slice(2), demoCode: "123456" };
}

/** Simulate OTP verification. In demo mode the code is always 123456. */
export async function verifyAbhaOtp(_txnId: string, code: string): Promise<boolean> {
  await wait(500);
  return code.trim() === "123456";
}
