# Canton Payment Stream Use Cases & Patterns

This document outlines common design patterns for using the `canton-payment-streaming` smart contracts. The core components are the `Stream` template, which represents a continuous flow of Canton CC from a `payer` to a `receiver`, and the `BudgetGuard`, which pre-allocates funds to prevent overspending.

The key benefits driving these patterns are:
*   **Real-time Settlement:** Funds accrue second-by-second, eliminating settlement delays.
*   **Privacy by Design:** The stream rate and parties are known only to the `payer` and `receiver`, protecting sensitive financial data like salaries and subscription fees.
*   **Automation:** Streams reduce manual payment operations and can be managed programmatically via triggers or dApp logic.
*   **Capital Efficiency:** Payers only need to budget for a specific time window, not the entire stream amount upfront.

---

## Pattern 1: Employee Payroll

Instead of lump-sum monthly payments, salaries can be streamed continuously, giving employees immediate access to their earned wages.

### Scenario

A company, "ACME Corp," pays its employee, "Alice," an annual salary of 120,000 CC.

*   **Payer:** `ACME Corp`
*   **Receiver:** `Alice`

### Implementation

1.  **Budgeting:** ACME Corp creates a `BudgetGuard` contract for its payroll department, funding it with enough CC to cover salaries for the upcoming quarter. This single contract can back dozens or hundreds of individual employee streams.

2.  **Stream Creation:** When Alice is onboarded, ACME's HR system triggers the creation of a `Stream` contract with the following parameters:
    *   `payer`: `ACME Corp`'s party ID.
    *   `receiver`: `Alice`'s party ID.
    *   `ratePerSecond`: `120000.0 / (365 * 24 * 60 * 60)` ≈ `0.003805175` CC per second.
    *   `endsAt`: A suitable future date, such as the end of the fiscal year (`2024-12-31T23:59:59Z`) or her contract end date.
    *   `budgetGuardCid`: The contract ID of the payroll `BudgetGuard`.

3.  **Claiming:** Alice can claim her accrued salary at any time using the `Claim` choice on the `Stream` contract. She could do this daily, weekly, or whenever she needs funds. Her wallet dApp could automate this.

4.  **Lifecycle Management:**
    *   **Salary Increase:** ACME Corp cancels the existing stream (using `Payer_Cancel`) and atomically creates a new one with the updated `ratePerSecond`.
    *   **Employee Departure:** Upon termination, ACME Corp exercises `Payer_Cancel`. The stream stops immediately, and any remaining un-streamed funds allocated to this stream are released back into the main `BudgetGuard`, available for other uses.

### Privacy Benefits

Alice's salary is confidential. Another employee, Bob, who also has a `Stream` from ACME Corp, cannot see the details of Alice's `Stream` contract. The stream's rate and total potential value are invisible to anyone except ACME and Alice.

---

## Pattern 2: SaaS & Service Subscriptions

A service provider receives subscription fees from customers in real-time, simplifying billing and collections.

### Scenario

A user, "Bob," subscribes to a streaming music service, "Canton Music," for 15 CC per month.

*   **Payer:** `Bob` (The Customer)
*   **Receiver:** `Canton Music` (The Service Provider)

### Implementation

1.  **Onboarding:** When Bob signs up, his client application (dApp/wallet) creates a `Stream` contract.
    *   `payer`: `Bob`'s party ID.
    *   `receiver`: `Canton Music`'s party ID.
    *   `ratePerSecond`: `15.0 / (30 * 24 * 60 * 60)` ≈ `0.000005787` CC per second.
    *   `endsAt`: 30 days from the time of creation.

2.  **Service Provisioning:** Canton Music's backend systems, using a trigger or by querying the ledger, detect the creation of this new `Stream` contract where it is the `receiver`. Upon detection, it grants Bob access to the premium service.

3.  **Revenue Collection:** Canton Music can claim from all active customer streams in batches (e.g., once per day) to sweep accrued revenue into its main treasury account.

4.  **Lifecycle Management:**
    *   **Cancellation:** If Bob cancels his subscription, his client app exercises `Payer_Cancel` on the stream. Canton Music's backend detects the contract archival and revokes his service access.
    *   **Auto-Renewal:** Bob's dApp can be configured to automatically create a new 30-day stream just as the old one is about to expire, ensuring uninterrupted service. This could be backed by a personal `BudgetGuard` Bob creates for his monthly subscriptions.
    *   **Payment Failure:** If Bob's `BudgetGuard` (if used) runs out of funds, any attempt by Canton Music to `Claim` will fail. The backend can interpret this as a payment failure and suspend the account.

### Privacy Benefits

The price Bob pays for his subscription is private. This prevents data scraping of the service's pricing tiers or customer numbers and protects Bob's spending habits from being public knowledge.

---

## Pattern 3: Revenue Share & Royalties

Distribute revenue from a single transaction to multiple stakeholders according to pre-agreed splits, streamed over time. This is useful for creative projects, joint ventures, or digital marketplaces.

### Scenario

An NFT marketplace, "Artify," sells a piece of digital art for 10,000 CC. The proceeds must be split:
*   80% to the Artist, "Carla"
*   15% to the Gallery that represents her, "GalleryCo"
*   5% to the "Artify" platform as a fee

### Implementation

This pattern uses an intermediary "Treasury" party, controlled by the marketplace, to act as the payer for multiple outbound streams.

1.  **Sale Transaction:** A buyer pays 10,000 CC. These funds are transferred to a dedicated `Artify Treasury` party.

2.  **Atomic Splitting:** In the same transaction, or a subsequent one triggered by the sale, the `Artify Treasury` party's logic creates three separate `Stream` contracts from its `BudgetGuard`.
    *   **Stream 1 (Artist):**
        *   `payer`: `Artify Treasury`
        *   `receiver`: `Carla`
        *   `ratePerSecond` is calculated to stream 8,000 CC over a defined period (e.g., 24 hours).
        *   `endsAt`: `now + 24 hours`.
    *   **Stream 2 (Gallery):**
        *   `payer`: `Artify Treasury`
        *   `receiver`: `GalleryCo`
        *   `ratePerSecond` is calculated to stream 1,500 CC over 24 hours.
        *   `endsAt`: `now + 24 hours`.
    *   **Stream 3 (Platform):**
        *   `payer`: `Artify Treasury`
        *   `receiver`: `Artify` (the platform's main party)
        *   `ratePerSecond` is calculated to stream 500 CC over 24 hours.
        *   `endsAt`: `now + 24 hours`.

3.  **Claiming:** Carla, GalleryCo, and Artify can all independently claim their accrued revenue from their respective streams at any time during the 24-hour streaming period.

### Why Stream Instead of a Direct Multi-Party Transfer?

*   **Vesting & Time-Lock:** Streaming revenue over a period (e.g., 24 hours, 7 days) acts as a simple time-based vesting mechanism, which can be useful for dispute resolution or to smooth out cash flow.
*   **Composability & On-Chain Proof of Income:** Carla can use her active, incoming revenue stream as on-chain collateral or proof of income for other DeFi applications on Canton. She doesn't have to wait for the full payment to settle to leverage its value.
*   **Observability:** Each stakeholder has a clear, private, and auditable view of their specific income stream, independent of the others. The Artist doesn't see the Gallery's stream details, and vice-versa, maintaining financial privacy between the partners.