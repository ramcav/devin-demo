import { createMemoryPaymentsAdapter } from "@/platform/adapters/payments/memory";
import { paymentsPortContract } from "../ports/payments.contract";

paymentsPortContract("memory", () => createMemoryPaymentsAdapter({ timeoutMs: 100, slowMs: 1000 }));
