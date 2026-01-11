import { Misbehavior } from '../../../proto-ts/cometbft/abci/v1/types';

export interface GlobalStateUpdateCometParameters {
    blockHeight: number,
    blockTimestamp: number,
    blockMisbehaviors: Misbehavior[]
}
