# Canton Payment Streaming

Real-time, private payment streams on the Canton Network.

[![CI](https://github.com/digital-asset/canton-payment-streaming/actions/workflows/ci.yml/badge.svg)](https://github.com/digital-asset/canton-payment-streaming/actions/workflows/ci.yml)

This project implements Superfluid-style continuous payment streams using Daml smart contracts on the Canton Network. It allows parties to pay each other by the second, with stream details like payment rate and recipient remaining confidential between the involved parties.

## Overview

Traditional payment systems operate on discrete, periodic schedules—monthly salaries, weekly invoices, quarterly dividends. Payment streaming transforms this model by enabling continuous, real-time value transfer. Instead of a lump sum payment at the end of a period, funds flow from payer to receiver every second.

This approach offers significant benefits:
*   **For Recipients:** Improved cash flow and immediate access to earned capital. No more waiting for "payday."
*   **For Payers:** Just-in-time capital allocation and simplified, automated payment operations.

Canton's privacy model provides a critical advantage over public blockchain streaming protocols. The rate, duration, and total value of a stream are private to the payer and receiver, making it ideal for sensitive use cases like salaries and confidential commercial agreements.

## Key Features

*   **Continuous Flow:** Payments accrue on a per-second basis, calculated on-demand.
*   **Private by Design:** The stream rate, start/end times, and total amount are known only to the counterparties of the agreement, not to network observers.
*   **On-Demand Withdrawal:** The recipient can claim their accrued balance at any time, as frequently as they wish.
*   **Trustless & Atomic:** Daml smart contracts enforce the stream's terms, ensuring payments are executed exactly as agreed with atomic settlement.
*   **Cancellable:** The payer can cancel the stream at any time, and the receiver can claim any balance accrued up to the point of cancellation.
*   **Native CC Support:** Built to stream Canton's native currency, CC (Canton Coin).

## How It Works

The logic is codified in a single Daml template, `Canton.PaymentStreaming.Stream.Stream`.

1.  **Stream Creation:** A `Payer` creates a `Stream` contract, specifying the `Receiver`, a start time, an optional end time, and a `rate` (in CC per second). The contract is proposed to the `Receiver`.
2.  **Stream Activation:** The `Receiver` accepts the proposal, activating the stream. The `Payer` is the signatory on the active `Stream` contract.
3.  **Claiming Funds:** The `Receiver` can exercise the `Claim` choice on the `Stream` contract at any time. The choice logic:
    *   Calculates the time elapsed since the last claim (or the stream's start time).
    *   Computes the `amountAccrued = timeElapsed * rate`.
    *   Atomically transfers the `amountAccrued` in CC from the `Payer` to the `Receiver`.
    *   Updates the contract's `lastClaimTime` to the current time and archives the old contract, creating a new one with the updated state.
4.  **Cancellation:** The `Payer` can cancel the stream at any time by exercising the `Cancel` choice, which archives the contract. The `Receiver` can still perform a final claim for any funds accrued before cancellation.

This entire process is atomic and private, enforced by the Canton ledger.

## Use Cases

*   **Payroll & Salaries:** Pay employees by the second, giving them instant access to their earnings.
*   **Subscriptions:** Bill customers for SaaS, media, or other services in real-time as they are consumed.
*   **Consulting & Freelancing:** Enable contractors to be paid continuously as they work on projects.
*   **Revenue Sharing & Royalties:** Automatically and transparently distribute earnings to partners, artists, or creators as revenue is generated.
*   **Token Vesting:** A specialized stream for distributing tokens to team members or investors over a predefined period.

## Getting Started

### Prerequisites

You need the Canton SDK (which includes the DPM package manager) installed.
```bash
curl https://get.digitalasset.com/install/install.sh | sh
```

### Build

Compile the Daml code into a DAR (Daml Archive).
```bash
dpm build
```

### Test

Run the Daml Script tests to verify the contract logic.
```bash
dpm test
```

### Run Locally

Start a local Canton ledger (sandbox) environment. The JSON API will be available on port `7575`.
```bash
dpm sandbox
```

## Project Structure

```
.
├── daml/
│   └── Canton/
│       └── PaymentStreaming/
│           └── Stream.daml       # Core Stream template and logic.
├── tests/
│   └── Canton/
│       └── PaymentStreaming/
│           └── Test.daml         # Daml Script tests for the Stream workflow.
├── daml.yaml                     # Daml project configuration.
└── README.md                     # This file.
```