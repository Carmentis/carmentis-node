## [1.0.1](https://github.com/Carmentis/carmentis-node/compare/v1.0.0...v1.0.1) (2026-01-11)


### Bug Fixes

* debug ci ([c16d5ac](https://github.com/Carmentis/carmentis-node/commit/c16d5ac1b3f2ef529b08b74a1dbf1f8128f36005))

# 1.0.0 (2026-01-11)


### Bug Fixes

* cannot access localhost when running inside docker ([a1fd1c6](https://github.com/Carmentis/carmentis-node/commit/a1fd1c68af240093c7137daa2fc355f917e43597))
* cometbft provides number that are too large for ts and then converted to string ([a0ca7f8](https://github.com/Carmentis/carmentis-node/commit/a0ca7f8fa2180888c32555e529bd591865ca91af))
* invalid configuration verification: double exposed_rpc_endpoint variables ([32fd474](https://github.com/Carmentis/carmentis-node/commit/32fd474e32668c7a3b51790187577e1a31a96834))
* invalid default filename ([4f30526](https://github.com/Carmentis/carmentis-node/commit/4f305265071a37de39b31d21f7ec9e664a718c01))
* invalid type for hash ([1565555](https://github.com/Carmentis/carmentis-node/commit/1565555a90a8ea35dc4ed6568df8d7c0178d5648))
* jenkins for config setup wizard ([71ea345](https://github.com/Carmentis/carmentis-node/commit/71ea34517628adb1649abdd3fcb1d91057756bd6))
* package.json ([16d5177](https://github.com/Carmentis/carmentis-node/commit/16d51772fbca0aac174a2e37f8381e12aaa804a1))
* package.json ([0ee5cd0](https://github.com/Carmentis/carmentis-node/commit/0ee5cd08ec4353dfcdfb24064123efc9f8e79b49))


### Features

* add `initializeTable` method to `LevelDb` for default chain info initialization ([7150940](https://github.com/Carmentis/carmentis-node/commit/7150940ec9e24ba974453a7cbb356139deec4aab))
* add extensive logging and enhancements for genesis handling and state management ([7b46593](https://github.com/Carmentis/carmentis-node/commit/7b46593f559abef4acfd1d9405d635154c63c094))
* add genesis runoff configuration file for initial vesting, accounts, and transfers ([654348c](https://github.com/Carmentis/carmentis-node/commit/654348c3a51a1ab8ac4dcb5b70935b86a3408059))
* add GenesisRunoff support to AbciService ([ca606f2](https://github.com/Carmentis/carmentis-node/commit/ca606f2f4a37c1e0a07ae855070bc5c5c3257f76))
* add GenesisRunoffTransactionsBuilder for efficient runoff transaction creation ([63003f1](https://github.com/Carmentis/carmentis-node/commit/63003f1e97c571dbd9606890c5527e81c120a8eb))
* add unit tests and validation for GenesisRunoff ([b504cd0](https://github.com/Carmentis/carmentis-node/commit/b504cd0f7d8f4a411f718b34a2a8802fc423dec8))
* addition of abci and comet ([fa35a4e](https://github.com/Carmentis/carmentis-node/commit/fa35a4ec7d1a1256601857e8a488795ceb6592fa))
* cometbft exposed rpc endpoint is now included in the abci config ([0ce7917](https://github.com/Carmentis/carmentis-node/commit/0ce7917eb5d0f6e0b3cd0fdb678278789b39b85d))
* docker node abci, wizard, licence and jenkins ([5a4458e](https://github.com/Carmentis/carmentis-node/commit/5a4458ef5f7df501c3f3b49d1d1e3532a5ea90ed))
* docker-compose ([e932f46](https://github.com/Carmentis/carmentis-node/commit/e932f463f4a3ffc407235b424f6e1a0b64e53f66))
* enhance `CachedLevelDb` with logging using Logtape ([683feb8](https://github.com/Carmentis/carmentis-node/commit/683feb859435bfa6bcd10e3edd6a443f4f2c6250))
* enhance logging and streamline genesis handling ([06064c5](https://github.com/Carmentis/carmentis-node/commit/06064c53c72edc149edba9bc9274b9ea7a34ffb8))
* enhance support for protocol virtual blockchains ([c8be50d](https://github.com/Carmentis/carmentis-node/commit/c8be50dd3b49170a522548d3b83aced7685e3ad2))
* fully working setup and configuration of ports ([22f9e9a](https://github.com/Carmentis/carmentis-node/commit/22f9e9a555e5a04a35cda7bbcaceaaf350804fe0))
* initial state completed ([b3b7d88](https://github.com/Carmentis/carmentis-node/commit/b3b7d881b3d4c041efffceb2290f1c5f4b87a92d))
* integrate enhanced logging configuration with dynamic sink creation ([b179d59](https://github.com/Carmentis/carmentis-node/commit/b179d59b0db9c52632f2fbf1ee2ea84af4982391))
* integrate Logtape for advanced logging and enhance callback handling ([4fda816](https://github.com/Carmentis/carmentis-node/commit/4fda816327cc7142a1c78aa541023c936276e8fa))
* more options supported for the setup wizard ([6cd9684](https://github.com/Carmentis/carmentis-node/commit/6cd9684cd2faa52a4ef0c413f2e3a96396d21e8d))
* rpc port is now dynamically fetched ([f0b2caf](https://github.com/Carmentis/carmentis-node/commit/f0b2cafdf1616ec0312c0279837795c26e4d9482))
* separated docker-compose (since the first node should be fully launched before the second one) ([943f3bb](https://github.com/Carmentis/carmentis-node/commit/943f3bb5ffd3504a24e70c879319adffa27a1418))
* support of private key retrieval via env variable ([7f03f32](https://github.com/Carmentis/carmentis-node/commit/7f03f32fc69144e9f7d1635b2024282690713bb4))
* upgrade to the new SDK version ([17226dc](https://github.com/Carmentis/carmentis-node/commit/17226dc7dfed08834716a5b79bc12d5c9eb7b3d4))
* wizard now generates state synchronisation ([6d7b29e](https://github.com/Carmentis/carmentis-node/commit/6d7b29e2264a9ab012c648c38d95a9e2c491ccdd))
