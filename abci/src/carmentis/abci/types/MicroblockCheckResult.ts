/**
 * Represents the result of a microblock check operation, which can either
 * be successful or failed due to an error.
 *
 * A successful result is indicated by `checked: true`.
 * A failed result is represented by `checked: false` and includes an error
 * message describing the reason for failure.
 */
export type MicroblockCheckResult =
    { checked: true } |
    { checked: false, error: string };