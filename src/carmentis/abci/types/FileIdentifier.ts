/**
 * Converts the 32-bit encoded expiration day and microblock hash to a 32-bit file identifier:
 * - the range 0x00000000 - 0x000EFFFF is reserved for special uses (only 0x00000000 is currently
 *   used to identify the database file in a snapshot)
 * - the range 0x000F0000 - 0xFEFFFFFF is used for files with an expiration day
 * - the range 0xFF000000 - 0xFF0000FF is used for files with endless storage
 * - the range 0xFF000100 - 0xFFFFFFFF is currently not used
 */
export type FileIdentifier = number;
