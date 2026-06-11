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
        if (!validatorUpdate.pub_key)
            throw new Error('Cannot extract node address without having its public key');
        const pub_key = validatorUpdate.pub_key;
        if (pub_key.ed25519)
            return CometBFTPublicKeyConverter.convertRawPublicKeyIntoAddress(pub_key.ed25519);
        throw new Error(`Unsupported node public key type`);
    }

    public static extractNodePublicKeyKeyFromValidatorUpdate(validatorUpdate: ValidatorUpdate): {
        pub_keyType: string;
        pub_key: Uint8Array;
    } {
        if (!validatorUpdate.pub_key)
            throw new Error('Cannot extract node public key without having its public key');
        const pub_key = validatorUpdate.pub_key;
        if (pub_key.ed25519)
            return { pub_keyType: 'ed25519', pub_key: pub_key.ed25519 };
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
