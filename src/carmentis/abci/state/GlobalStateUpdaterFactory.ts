import { GlobalStateUpdater } from './GlobalStateUpdater';

export class GlobalStateUpdaterFactory {
    static createGlobalStateUpdater(globalStateUpdaterVersion: number = 1): GlobalStateUpdater {
        // TODO: implement the global state updater selection version
        return new GlobalStateUpdater()
    }
}