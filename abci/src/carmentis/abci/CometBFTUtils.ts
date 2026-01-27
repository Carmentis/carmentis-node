import {
    RequestCheckTx,
    ResponseCheckTx,
    ValidatorUpdate,
} from '../../proto/tendermint/abci/types';
import { CheckTxResponseCode } from './CheckTxResponseCode';
import { CometBFTPublicKeyConverter } from './CometBFTPublicKeyConverter';
import { getLogger } from '@logtape/logtape';
import { Timestamp } from '../../proto/google/protobuf/timestamp';

export class CometBFTUtils {
    private static logger = getLogger(["node", "cometbft", "utils"])
    public static extractNodeAddressFromValidatorUpdate(validatorUpdate: ValidatorUpdate): Uint8Array {
        if (!validatorUpdate.pubKey)
            throw new Error('Cannot extract node address without having its public key');
        const pubKey = validatorUpdate.pubKey;
        if (pubKey.ed25519)
            return CometBFTPublicKeyConverter.convertRawPublicKeyIntoAddress(pubKey.ed25519);
        throw new Error(`Unsupported node public key type`);
    }

    public static extractNodePublicKeyKeyFromValidatorUpdate(validatorUpdate: ValidatorUpdate): {
        pubKeyType: string;
        pubKey: Uint8Array;
    } {
        if (!validatorUpdate.pubKey)
            throw new Error('Cannot extract node public key without having its public key');
        const pubKey = validatorUpdate.pubKey;
        if (pubKey.ed25519)
            return { pubKeyType: 'ed25519', pubKey: pubKey.ed25519 };
        throw new Error(`Unsupported node public key type`);
    }

    public static convertDateInTimestamp(date: Timestamp | undefined) {
        if (date === undefined) {
            this.logger.warn("Date is undefined, returning 0")
            return 0;
        }
        return Number(date.seconds);
    }
}
