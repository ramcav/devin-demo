# Playbook: add an integration (port + adapter)

Use this to connect the platform to an external system (a payment processor, a KYC vendor, Entra ID, a data warehouse). Apps never call external APIs directly; they use a port, and this playbook adds one.

## Inputs

- What the apps need from the system, in domain terms (for example: "issue a refund to the original payment method", "fetch a customer's verification result").
- The vendor's API docs, if a real adapter is in scope.
- `.devin/knowledge.md` (rules and conventions).

## Outcome

A port in `src/platform/ports/<system>.ts`, a mock adapter and (if in scope) a real adapter in `src/platform/adapters/<system>/`, both passing the same contract tests, delivered as one PR with green CI.

## Steps

1. **Define the port around what the apps need**, not around the vendor's API. Use domain types (`RefundRequest`, `VerificationResult`) and domain errors (`PaymentDeclined`, `ProviderUnavailable`). No vendor types leak into the port.
2. **Write the contract tests first** in `tests/platform/ports/<system>.contract.ts`: one shared suite that any adapter must pass (happy path, each domain error, timeouts).
3. **Mock adapter.** Implement the port in memory with seeded data. It's what local dev and every app test use.
4. **Real adapter (if in scope).** Map the vendor's API to the port. Run the contract suite against it with a sandbox account, gated behind an env flag so CI doesn't need credentials.
5. **Configuration and secrets.** Select the adapter with an env var (for example `PAYMENTS_ADAPTER=mock|stripe`). Read secrets only from env vars; list every variable in `.env.example` with a placeholder. Request the least-privilege credentials the vendor offers.
6. **Resilience.** Set a timeout on every call. Retry only safe operations; for writes (refunds, status changes), send an idempotency key so a retry can't act twice. Map vendor errors to the port's domain errors.
7. **Audit.** Every outbound write that changes something (a refund issued, a case decision sent) is recorded with `audit.record()` in the same transaction as the local state change, including the vendor's reference ID.
8. **Data handling.** Send and store only the fields the port needs. Never log secrets, full card numbers or national IDs.
9. **Docs.** Add a README section: what the integration does, the env vars, how to switch adapters, and what the mock simulates.
10. **PR.** One PR with the port, adapters, contract tests and docs. The description lists the domain operations, the error mapping, and which operations are retried or idempotent.

## Postconditions

- [ ] The mock adapter (and the real one, if built) pass the same contract suite
- [ ] No app code imports anything from `src/platform/adapters/`; apps depend only on the port
- [ ] No secrets in the repo; `.env.example` lists every variable
- [ ] Every outbound write has a timeout, an idempotency key and an audit row

## Forbidden

- Calling the vendor from app code, or exposing vendor types through the port.
- Committing credentials, tokens or real customer data, even in tests.
- Retrying a write without an idempotency key.
