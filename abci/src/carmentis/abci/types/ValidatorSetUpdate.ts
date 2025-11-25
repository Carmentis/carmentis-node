/**
 * Represents a validator set update entry containing validator information
 * and voting power changes.
 */
export interface ValidatorSetUpdate {
    /**
     * The voting power of the validator. Set to 0 to remove a validator.
     */
    power: number;

    /**
     * The type of public key (e.g., 'ed25519').
     */
    pub_key_type: string;

    /**
     * The raw bytes of the validator's public key.
     */
    pub_key_bytes: Uint8Array;
}
