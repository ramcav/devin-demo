/** Synthetic charges served by the mock payment provider. No real customers or card numbers. */
export type ChargeFixture = {
  id: string;
  customerId: string;
  customerName: string;
  amountCents: number;
  currency: "USD";
  pmToken: string;
  last4: string;
  createdAt: string;
};

const companies = ["Acme", "Globex", "Initech", "Umbrella", "Hooli", "Vandelay", "Stark", "Wayne", "Wonka", "Tyrell"];
const suffixes = ["Labs", "Foods", "Logistics", "Studio", "Retail", "Health"];
const last4s = ["4242", "1881", "0005", "4444", "5556", "1117", "0004", "9424"];

function pseudo(n: number): number {
  return ((n * 2654435761) >>> 0) % 1000;
}

const generated: ChargeFixture[] = Array.from({ length: 60 }, (_, i) => {
  const n = i + 1;
  const id = String(n).padStart(4, "0");
  return {
    id: `ch_${id}`,
    customerId: `cus_${id}`,
    customerName: `${companies[n % companies.length]} ${suffixes[n % suffixes.length]} (synthetic)`,
    amountCents: 2_500 + pseudo(n) * 250, // $25 – $2,522.50
    currency: "USD",
    pmToken: `pm_mock_${id}${pseudo(n + 7).toString(36)}`,
    last4: last4s[n % last4s.length]!,
    createdAt: new Date(Date.UTC(2026, 8, 1) + n * 3_600_000 * 7).toISOString(),
  };
});

/** Charges whose refunds the mock provider fails on purpose, to exercise the port's domain errors. */
export const SIMULATED = {
  decline: "ch_sim_decline",
  unavailable: "ch_sim_unavailable",
  slow: "ch_sim_slow",
} as const;

const simulated: ChargeFixture[] = [
  { id: SIMULATED.decline, customerName: "Simulated: refunds are declined" },
  { id: SIMULATED.unavailable, customerName: "Simulated: provider is down" },
  { id: SIMULATED.slow, customerName: "Simulated: provider times out" },
].map((s, i) => ({
  ...s,
  customerId: `cus_sim_${i + 1}`,
  amountCents: 100_000,
  currency: "USD" as const,
  pmToken: `pm_mock_sim_${i + 1}`,
  last4: "0000",
  createdAt: new Date(Date.UTC(2026, 8, 1)).toISOString(),
}));

export const chargeFixtures: ChargeFixture[] = [...generated, ...simulated];
