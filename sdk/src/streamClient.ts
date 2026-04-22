import fetch, { Response } from 'node-fetch';

/**
 * Configuration for the StreamClient.
 */
export interface StreamClientConfig {
  /** The base URL of the Canton JSON API (e.g., http://localhost:7575). */
  ledgerUrl: string;
  /** A valid JWT for authenticating with the JSON API. */
  authToken: string;
  /** The Daml party ID for the user operating the client. */
  partyId: string;
  /** The package ID of the deployed payment-streaming Daml models. */
  packageId: string;
}

// =============================================================================
//  DAML CONTRACT TYPES
// =============================================================================

/**
 * Represents the payload of a `Stream.Model:Stream` contract on the ledger.
 */
export interface StreamPayload {
  payer: string;
  receiver: string;
  streamId: string;
  startTime: string;        // ISO 8601 format
  endTime: string;          // ISO 8601 format
  lastClaimTime: string;    // ISO 8601 format
  ratePerSecond: string;    // Decimal string
  budgetGuardCid: string;   // ContractId of Stream.BudgetGuard:BudgetGuard
}

/**
 * Represents an active `Stream.Model:Stream` contract.
 */
export interface StreamContract {
  contractId: string;
  templateId: string;
  payload: StreamPayload;
}

/**
 * Represents the payload of a `Stream.Propose:StreamProposal` contract.
 */
export interface StreamProposalPayload {
  payer: string;
  receiver: string;
  streamId: string;
  ratePerSecond: string;    // Decimal string
  endTime: string;          // ISO 8601 format
  budgetGuardCid: string;   // ContractId of Stream.BudgetGuard:BudgetGuard
}

/**
 * Represents an active `Stream.Propose:StreamProposal` contract.
 */
export interface StreamProposalContract {
  contractId: string;
  templateId: string;
  payload: StreamProposalPayload;
}

/**
 * Represents the payload of a `Stream.Index:StreamIndex` contract.
 */
export interface StreamIndexPayload {
  party1: string;
  party2: string;
  streamId: string;
  streamCid: string; // ContractId of Stream.Model:Stream
}

/**
 * Represents an active `Stream.Index:StreamIndex` contract.
 */
export interface StreamIndexContract {
  contractId: string;
  templateId: string;
  payload: StreamIndexPayload;
}

// =============================================================================
//  JSON API RESPONSE TYPES
// =============================================================================

interface V1CreateResponseResult {
  contractId: string;
  // Other fields omitted for brevity
}

interface V1ExerciseResponseResult {
  exerciseResult: string; // Typically a ContractId of a created contract
  events: any[];
}

// =============================================================================
//  STREAM CLIENT
// =============================================================================

/**
 * A client for interacting with the Canton Payment Streaming Daml contracts
 * via the Canton JSON API.
 */
export class StreamClient {
  private readonly config: StreamClientConfig;
  private readonly headers: { [key: string]: string };

  // Pre-constructed full template IDs for convenience
  private readonly streamTemplateId: string;
  private readonly streamProposalTemplateId: string;
  private readonly streamIndexTemplateId: string;

  constructor(config: StreamClientConfig) {
    if (!config.ledgerUrl || !config.authToken || !config.partyId || !config.packageId) {
      throw new Error("StreamClientConfig is missing required fields: ledgerUrl, authToken, partyId, packageId.");
    }
    this.config = config;
    this.headers = {
      'Authorization': `Bearer ${this.config.authToken}`,
      'Content-Type': 'application/json',
    };

    // Assuming a standard Daml module structure
    this.streamTemplateId = `${this.config.packageId}:Stream.Model:Stream`;
    this.streamProposalTemplateId = `${this.config.packageId}:Stream.Propose:StreamProposal`;
    this.streamIndexTemplateId = `${this.config.packageId}:Stream.Index:StreamIndex`;
  }

  /**
   * Creates a stream proposal to a recipient.
   * This does not create the stream itself; the recipient must accept the proposal.
   * NOTE: Assumes a BudgetGuard contract has already been created and its CID is provided.
   * @param recipient The party ID of the stream receiver.
   * @param streamId A unique identifier for the stream.
   * @param ratePerSecond The amount per second to stream, as a string decimal.
   * @param endTime The ISO 8601 timestamp when the stream should end.
   * @param budgetGuardCid The ContractId of the payer's `BudgetGuard` contract.
   * @returns The result of the create command.
   */
  public async createStreamProposal(
    recipient: string,
    streamId: string,
    ratePerSecond: string,
    endTime: string,
    budgetGuardCid: string
  ): Promise<V1CreateResponseResult> {
    const payload: Omit<StreamProposalPayload, "payer"> & { payer: string } = {
      payer: this.config.partyId,
      receiver: recipient,
      streamId,
      ratePerSecond,
      endTime,
      budgetGuardCid
    };

    return this.apiRequest<V1CreateResponseResult>('/v1/create', 'POST', {
      templateId: this.streamProposalTemplateId,
      payload,
    });
  }

  /**
   * Lists all pending stream proposals for the current party (both incoming and outgoing).
   * @returns An array of active `StreamProposal` contracts.
   */
  public async listStreamProposals(): Promise<StreamProposalContract[]> {
    return this.apiRequest<StreamProposalContract[]>('/v1/query', 'POST', {
      templateIds: [this.streamProposalTemplateId],
    });
  }

  /**
   * Accepts a stream proposal, creating the active stream.
   * This must be called by the recipient of the proposal.
   * @param proposalContractId The contract ID of the `StreamProposal`.
   * @returns The result of the exercise command.
   */
  public async acceptStreamProposal(proposalContractId: string): Promise<V1ExerciseResponseResult> {
    return this.apiRequest<V1ExerciseResponseResult>('/v1/exercise', 'POST', {
      templateId: this.streamProposalTemplateId,
      contractId: proposalContractId,
      choice: 'Accept',
      argument: {},
    });
  }

  /**
   * Claims the accrued balance from an active stream.
   * This can be called by the receiver at any time.
   * @param streamContractId The contract ID of the `Stream`.
   * @returns The result of the exercise command.
   */
  public async claimFromStream(streamContractId: string): Promise<V1ExerciseResponseResult> {
    const claimTime = new Date().toISOString();
    return this.apiRequest<V1ExerciseResponseResult>('/v1/exercise', 'POST', {
      templateId: this.streamTemplateId,
      contractId: streamContractId,
      choice: 'ClaimAccrued',
      argument: { claimTime },
    });
  }

  /**
   * Cancels an active stream.
   * This can only be called by the payer of the stream.
   * @param streamContractId The contract ID of the `Stream`.
   * @returns The result of the exercise command.
   */
  public async cancelStream(streamContractId: string): Promise<V1ExerciseResponseResult> {
    return this.apiRequest<V1ExerciseResponseResult>('/v1/exercise', 'POST', {
      templateId: this.streamTemplateId,
      contractId: streamContractId,
      choice: 'CancelStream',
      argument: {},
    });
  }

  /**
   * Lists all active streams where the current party is either the payer or receiver.
   * It queries for `StreamIndex` contracts and then batch-fetches the corresponding `Stream` contracts.
   * @returns An array of active `Stream` contracts.
   */
  public async listStreams(): Promise<StreamContract[]> {
    const indexContracts = await this.apiRequest<StreamIndexContract[]>('/v1/query', 'POST', {
        templateIds: [this.streamIndexTemplateId],
    });

    if (indexContracts.length === 0) {
        return [];
    }

    const streamCids = indexContracts.map(c => c.payload.streamCid);

    return this.fetchStreams(streamCids);
  }

  /**
   * Fetches a single active stream contract by its ID.
   * @param contractId The contract ID of the `Stream`.
   * @returns The `Stream` contract, or null if not found or not visible.
   */
  public async getStream(contractId: string): Promise<StreamContract | null> {
    try {
      return await this.apiRequest<StreamContract | null>(`/v1/contracts/${contractId}`, 'GET');
    } catch (error) {
      // A 404 or other HTTP error could mean the contract doesn't exist, is archived,
      // or is not visible to the requesting party. We return null in these cases.
      console.warn(`Failed to fetch stream ${contractId}:`, error);
      return null;
    }
  }

  /**
   * Batch-fetches multiple stream contracts by their IDs.
   * @param contractIds An array of `Stream` contract IDs.
   * @returns An array of `Stream` contracts. Contracts not found or not visible are omitted.
   */
  public async fetchStreams(contractIds: string[]): Promise<StreamContract[]> {
    if (contractIds.length === 0) {
      return [];
    }
    return this.apiRequest<StreamContract[]>('/v1/fetch', 'POST', {
      contractIds,
    });
  }

  /**
   * Helper function to handle JSON API requests and standard error handling.
   */
  private async apiRequest<T>(endpoint: string, method: string, body?: object): Promise<T> {
    const url = `${this.config.ledgerUrl}${endpoint}`;
    const options = {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    };

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API request to ${url} failed with status ${response.status}: ${errorBody}`);
    }

    const json = await response.json() as { status: number; result?: T; errors?: string[] };

    if (json.status !== 200) {
      const errorDetails = json.errors ? json.errors.join(', ') : 'Unknown ledger error';
      throw new Error(`Ledger API returned non-200 status ${json.status}: ${errorDetails}`);
    }

    if (json.result === undefined) {
      throw new Error('Ledger API response missing "result" field.');
    }

    return json.result;
  }
}