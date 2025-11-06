import { RADIX_CST, RadixUtils, Utils } from '@cmts-dev/carmentis-sdk/server';
import { NodeCrypto } from './crypto/NodeCrypto';
import { LevelDb } from './database/LevelDb';
import { DbInterface } from './database/DbInterface';

function debug(array: any) {
    return [...array].map((n) => n.toString(16).toUpperCase().padStart(2, 0)).join('');
}

/**
  Radix tree

  This structure is used to:
  - store the hash of the last state of each virtual blockchain, given the hash of the genesis block as the key
  - store the hash of the state of each account (from DB_ACCOUNT_STATE), given the hash of the account virtual blockchain as
    the key

  The key hash is split into nibbles. So, each node may have up to 16 children. Each node in the tree is identified by its
  hash. We use an 'early leaf node' when there's only one remaining path.

  Standard node:
    BITMASK (2 bytes) : non-zero bit-mask of active child nodes
    for each active child (from LSB to MSB):
      HASH (32 bytes) : hash of child node, or target value if this is the deepest level (*)
    end

  Early leaf node:
    BITMASK (2 bytes)       : set to 0x0000
    TRAILING_PATH (N bytes) : the remaining nibbles in the path, packed in the nearest number of bytes
    VALUE (32 bytes)        : target value

  (*) Although this case is supported, it will never happen in practice. (For it would mean that we have two hashes that are
      identical up to the penultimate nibble, which is almost as unlikely as a full hash collision.)
*/
export class RadixTree {
    db: DbInterface;
    tableId: number;

    constructor(db: DbInterface, tableId: number) {
        this.db = db;
        this.tableId = tableId;
    }

    /**
    Sets a (key, value) pair
  */
    async set(key: any, value: Uint8Array) {
        const rootHash = await this.getRootHash();
        const newRootHash = await this.write(key, value, rootHash, 0);

        await this.setRootHash(newRootHash);
    }

    /**
    Given a key, returns the corresponding value.*
  */
    async get(key: any) {
        const rootHash = await this.getRootHash();
        const proof: any = [];
        const value = await this.read(key, rootHash, 0, proof);

        return { value, proof };
    }

    async getFromStorage(depth: number, hash: any) {
        let value = await this.db.getRaw(this.tableId, hash);

        if (!value) {
            if (hash.some((v: any) => v)) {
                console.log(value);
                throw `failed to get hash ${Utils.binaryToHexa(hash)} from storage`;
            } else {
                value = RADIX_CST.ROOT_ANCHORING_HASH;
            }
        }
        return value;
    }

    async setToStorage(depth: number, hash: any, value: any) {
        return await this.db.putRaw(this.tableId, hash, value);
    }

    async removeFromStorage(depth: number, hash: any) {
        return await this.db.del(this.tableId, hash);
    }

    /**
    Returns the root hash of the tree.
  */
    async getRootHash() {
        return await this.getFromStorage(-1, RADIX_CST.ROOT_ANCHORING_HASH);
    }

    /**
    Sets the root hash of the tree.
  */
    async setRootHash(rootHash: any) {
        await this.setToStorage(-1, RADIX_CST.ROOT_ANCHORING_HASH, rootHash);
    }

    /**
    Debugging method.
  */
    async getEntries() {
        function hexa(a: any) {
            return a.map((v: any) => v.toString(16).toUpperCase().padStart(2, 0)).join('');
        }

        const iterator = await this.db.query(this.tableId);
        const list = [];

        for  (const e of iterator) {
            const msk = (e[1][0] << 8) | e[1][1];

            list.push(
                hexa([...e[0]]) +
                    ': ' +
                    (e[0].some((v: any) => v)
                        ? // @ts-expect-error TS(2550): Property 'padStart' does not exist on type 'string... Remove this comment to see the full error message
                          msk.toString(2).padStart(16, 0) +
                          ' ' +
                          (msk
                              ? hexa([...e[1]].slice(2))
                                    .match(RegExp(`.{${RADIX_CST.HASH_SIZE * 2}}`, 'g'))
                                    .join(' ')
                              : hexa([...e[1]].slice(2)).replace(
                                    RegExp(`(.*)(.{${RADIX_CST.HASH_SIZE * 2}})$`),
                                    '$1 $2',
                                ))
                        : hexa([...e[1]])),
            );
        }
        return list;
    }

    async write(key: any, value: any, nodeHash: any, depth: any) {
        if (depth == RADIX_CST.HASH_SIZE * 2) {
            return value;
        }

        let node = nodeHash && (await this.getFromStorage(depth, nodeHash));
        const len = (RADIX_CST.HASH_SIZE * 2 + 1 - depth) >> 1;

        //console.log('node', nodeHash && debug(nodeHash));
        if (node) {
            //console.log('node exists');
            // the node already exists
            let msk = (node[0] << 8) | node[1];
            const nibble = (key[depth >> 1] >> (4 * (depth & 1))) & 0xf;
            let update = 0;
            let hashList = [];

            if (msk) {
                //console.log('already standard');
                // this is already a standard node --> get the list of hashes of child nodes and update the node
                hashList = RadixUtils.getHashList(msk, node);
                update = 1;
            } else {
                // this is an early leaf node --> test whether this is the same key
                if (RadixUtils.keyDifference(depth, key, node)) {
                    //console.log('early leaf / different key');
                    // this is not the same key --> turn this node into a standard node with a single child and update the node
                    const prevKey = new Uint8Array(RADIX_CST.HASH_SIZE);
                    const prevValue = node.slice(2 + len, 2 + RADIX_CST.HASH_SIZE + len);
                    const index = (node[2] >> (4 * (depth & 1))) & 0xf;

                    prevKey.set(node.slice(2, 2 + len), RADIX_CST.HASH_SIZE - len);

                    hashList = Array(16).fill(null);
                    hashList[index] = await this.write(prevKey, prevValue, null, depth + 1);
                    msk = 1 << index;
                    update = 1;
                } else {
                    //console.log('early leaf / same key');
                    // this is the same key --> just update the target hash
                    node.set(value, 2 + len);
                }
            }

            if (update) {
                // the node is now guaranteed to be a standard one and an update is required
                hashList[nibble] = await this.write(key, value, hashList[nibble], depth + 1);

                const nHash = hashList.reduce((p: any, c: any) => p + (c != null), 0);

                node = new Uint8Array(2 + RADIX_CST.HASH_SIZE * nHash);

                msk |= 1 << nibble;
                node[0] = msk >> 8;
                node[1] = msk;

                let ptr = 2;

                for (let i = 0; i < 16; i++) {
                    if (msk & (1 << i)) {
                        node.set(hashList[i], ptr);
                        ptr += RADIX_CST.HASH_SIZE;
                    }
                }
            }
        } else {
            //console.log('node does not exist -> new early leaf');
            // the node does not exist --> create an early leaf node
            node = new Uint8Array(2 + RADIX_CST.HASH_SIZE + len);
            node.set(key.slice(depth >> 1), 2);

            if (depth & 1) {
                // odd depth --> because we may get an exact copy of a previous early leaf node that was just turned into a standard
                // node at depth - 1, we XOR the unused nibble in the key with 0xF to make sure that we'll get a different hash
                node[2] ^= 0xf;
            }

            node.set(value, 2 + len);
        }

        // remove the previous entry / save the new one
        if (nodeHash) {
            await this.removeFromStorage(depth, nodeHash);
        }

        const newHash = NodeCrypto.Hashes.sha256AsBinary(node).slice(0, RADIX_CST.HASH_SIZE);
        //console.log('hash', debug(newHash), debug(node));
        await this.setToStorage(depth, newHash, node);

        return newHash;
    }

    async read(key: any, nodeHash: any, depth: any, proof: any): Promise<Uint8Array | boolean> {
        if (depth == RADIX_CST.HASH_SIZE * 2) {
            return nodeHash;
        }

        const node = nodeHash && (await this.getFromStorage(depth, nodeHash));

        if (!node) {
            throw `missing node in radix tree`;
        }

        proof.push(node);

        const msk = (node[0] << 8) | node[1];

        if (msk) {
            const hashList = RadixUtils.getHashList(msk, node);
            const nibble = (key[depth >> 1] >> (4 * (depth & 1))) & 0xf;

            return msk & (1 << nibble)
                ? await this.read(key, hashList[nibble], depth + 1, proof)
                : false;
        }

        if (RadixUtils.keyDifference(depth, key, node)) {
            return false;
        }

        const len = (RADIX_CST.HASH_SIZE * 2 + 1 - depth) >> 1;

        return node.slice(2 + len);
    }
}
