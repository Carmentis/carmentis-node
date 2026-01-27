import { Misbehavior } from '../../../proto/tendermint/abci/types';

export interface GlobalStateUpdateCometParameters {
    blockHeight: number,
    blockTimestamp: number,
    blockMisbehaviors: Misbehavior[]
}
