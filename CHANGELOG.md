## [1.6.21](https://github.com/Carmentis/carmentis-node/compare/v1.6.20...v1.6.21) (2026-06-24)


### Bug Fixes

* upgrade @inquirer/prompts and related dependencies, add private key prompts and validation to GenesisRunoffTransactionsBuilder ([7882915](https://github.com/Carmentis/carmentis-node/commit/788291566678fd817354001a55a866678c7bae6a))

## [1.6.20](https://github.com/Carmentis/carmentis-node/compare/v1.6.19...v1.6.20) (2026-06-23)


### Bug Fixes

* snapshotInProgress changed from boolean to number ([4703d69](https://github.com/Carmentis/carmentis-node/commit/4703d69ca6e04fa681ab5031ada27793723d3c3a))

## [1.6.19](https://github.com/Carmentis/carmentis-node/compare/v1.6.18...v1.6.19) (2026-06-23)


### Bug Fixes

* adapt the max microblocks per block calculation now taking the min of protocol and config levels. ([40861a3](https://github.com/Carmentis/carmentis-node/commit/40861a3f6a4d8fc66cddefc4b8fc08d19e5e6c70))
* addition of consensus params update with app version set to the globally defined APP_VERSION constant ([e7628c3](https://github.com/Carmentis/carmentis-node/commit/e7628c3b8092589c459a1e56ded5ac48385c37e0))

## [1.6.18](https://github.com/Carmentis/carmentis-node/compare/v1.6.17...v1.6.18) (2026-06-22)


### Bug Fixes

* remove cmts user (because not tested yet) ([b6766ab](https://github.com/Carmentis/carmentis-node/commit/b6766aba32ec0a755ade5f27820e2403bc8903fc))

## [1.6.17](https://github.com/Carmentis/carmentis-node/compare/v1.6.16...v1.6.17) (2026-06-22)


### Bug Fixes

* addition of loggers to make logging modular ([c276d5d](https://github.com/Carmentis/carmentis-node/commit/c276d5d5960bbcbfacd2d8d13939cbbb025e7b8e))

## [1.6.16](https://github.com/Carmentis/carmentis-node/compare/v1.6.15...v1.6.16) (2026-06-19)


### Bug Fixes

* SDK update ([ff715de](https://github.com/Carmentis/carmentis-node/commit/ff715de0a848b7a3ab88215b6b67b064c90fee50))

## [1.6.15](https://github.com/Carmentis/carmentis-node/compare/v1.6.14...v1.6.15) (2026-06-18)


### Bug Fixes

* fixed node restart bug (invalid appHash returned by Info) ([ca2c0a0](https://github.com/Carmentis/carmentis-node/commit/ca2c0a0bbba3ab255802e550b39cbd0336f8c9eb))

## [1.6.14](https://github.com/Carmentis/carmentis-node/compare/v1.6.13...v1.6.14) (2026-06-17)


### Bug Fixes

* simplified & more robust processing of validator set updates ([43aad33](https://github.com/Carmentis/carmentis-node/commit/43aad335cd306a6870d7e2cd06904d5130dc6b2e))

## [1.6.13](https://github.com/Carmentis/carmentis-node/compare/v1.6.12...v1.6.13) (2026-06-17)


### Bug Fixes

* handle edge cases for zero and single validator scenarios in FeesDispatcher ([b5081a3](https://github.com/Carmentis/carmentis-node/commit/b5081a33735f149104ddf57a36739005b8ca0c67))

## [1.6.12](https://github.com/Carmentis/carmentis-node/compare/v1.6.11...v1.6.12) (2026-06-15)


### Bug Fixes

* snapshots no longer block execution ([04d792c](https://github.com/Carmentis/carmentis-node/commit/04d792c33b2935685c31714a9892ecffa929cd54))

## [1.6.11](https://github.com/Carmentis/carmentis-node/compare/v1.6.10...v1.6.11) (2026-06-15)


### Bug Fixes

* fixed bugs ([61a2755](https://github.com/Carmentis/carmentis-node/commit/61a2755d52d7bf5f5b4b1c0f49bccf6c852f8ad2))

## [1.6.10](https://github.com/Carmentis/carmentis-node/compare/v1.6.9...v1.6.10) (2026-06-13)


### Bug Fixes

* updated release-docker.yml ([0106c94](https://github.com/Carmentis/carmentis-node/commit/0106c94bdc3843b63e9f1a914e9eb2cb5f7f4bc8))

## [1.6.9](https://github.com/Carmentis/carmentis-node/compare/v1.6.8...v1.6.9) (2026-06-13)


### Bug Fixes

* up-to-date chain references ([ab32236](https://github.com/Carmentis/carmentis-node/commit/ab32236b1355fed9c6b9aefc03290678222d9309))

## [1.6.8](https://github.com/Carmentis/carmentis-node/compare/v1.6.7...v1.6.8) (2026-06-11)


### Bug Fixes

* add error logs for protocol-level limit violations on microblocks and block size ([32be9e9](https://github.com/Carmentis/carmentis-node/commit/32be9e9a7dd4022781cd95443c41bca260287df4))

## [1.6.7](https://github.com/Carmentis/carmentis-node/compare/v1.6.6...v1.6.7) (2026-06-11)


### Bug Fixes

* enforce protocol-level limits on microblocks and block size during proposal processing ([9fd0926](https://github.com/Carmentis/carmentis-node/commit/9fd092655757c09e2835d5f97a3674429a23ca74))

## [1.6.6](https://github.com/Carmentis/carmentis-node/compare/v1.6.5...v1.6.6) (2026-06-11)


### Bug Fixes

* missing building step before proceeding to release ([887e1b0](https://github.com/Carmentis/carmentis-node/commit/887e1b0ce14b548d6ca6e666fc7099ce81577eb3))
* missing directory specification when running the install ([442f94f](https://github.com/Carmentis/carmentis-node/commit/442f94f17e977238114684760f75207eaeb32c51))

## [1.6.5](https://github.com/Carmentis/carmentis-node/compare/v1.6.4...v1.6.5) (2026-06-11)


### Bug Fixes

* bump to version 1.2.21 of @cmts-dev/carmentis-sdk-core ([08a949d](https://github.com/Carmentis/carmentis-node/commit/08a949d7f56e20a90f8b28bbbf5f1cdff66c0d64))

## [1.6.4](https://github.com/Carmentis/carmentis-node/compare/v1.6.3...v1.6.4) (2026-06-11)


### Bug Fixes

* removed VB index tables, updated the way to store the protocol VB id ([3db16d7](https://github.com/Carmentis/carmentis-node/commit/3db16d78c4b4a303e6aa054bac054e87aca98dab))

## [1.6.3](https://github.com/Carmentis/carmentis-node/compare/v1.6.2...v1.6.3) (2026-06-10)


### Bug Fixes

* fixed pnpm-lock ([dc7bef3](https://github.com/Carmentis/carmentis-node/commit/dc7bef3a197ba5b85b0016433b1b62b9908b9340))

## [1.6.2](https://github.com/Carmentis/carmentis-node/compare/v1.6.1...v1.6.2) (2026-06-10)


### Bug Fixes

* fixed critical and some high findings from Claude's report ([906e992](https://github.com/Carmentis/carmentis-node/commit/906e99247cffd322e898bb145dc22e637a05e172))

## [1.6.1](https://github.com/Carmentis/carmentis-node/compare/v1.6.0...v1.6.1) (2026-06-10)


### Bug Fixes

* added StateProof to handle MB and account proofs ([49e43fa](https://github.com/Carmentis/carmentis-node/commit/49e43fa3773597a1e1d63ef27de110026f461d90))

# [1.6.0](https://github.com/Carmentis/carmentis-node/compare/v1.5.2...v1.6.0) (2026-06-09)


### Bug Fixes

* move microblock parsing logic to limit memory usage ([75043f9](https://github.com/Carmentis/carmentis-node/commit/75043f9532533dc5c1dc7667b1d8fc686d13e966))


### Features

* add @faker-js/faker and implement PrepareProposal test with transaction data generation ([369d7f2](https://github.com/Carmentis/carmentis-node/commit/369d7f2feff8cdbe582b2fe1894eecb60431fda7))

## [1.5.2](https://github.com/Carmentis/carmentis-node/compare/v1.5.1...v1.5.2) (2026-06-08)


### Bug Fixes

* now using the new Merkle tree to serve microblocks by height ([34f33d6](https://github.com/Carmentis/carmentis-node/commit/34f33d6226a62409f83dce1ba05d78a0e91f7346))

## [1.5.1](https://github.com/Carmentis/carmentis-node/compare/v1.5.0...v1.5.1) (2026-06-04)


### Bug Fixes

* fixed check of transfer+fees, added PersistentMerkleTree ([6d5e0b2](https://github.com/Carmentis/carmentis-node/commit/6d5e0b280869a3c181da70d9bbd6510833d10b65))

# [1.5.0](https://github.com/Carmentis/carmentis-node/compare/v1.4.0...v1.5.0) (2026-06-03)


### Features

* improve token transfer log with payer balance details ([f6bcf67](https://github.com/Carmentis/carmentis-node/commit/f6bcf67e989520a0ac82df73ae0296df94621542))

# [1.4.0](https://github.com/Carmentis/carmentis-node/compare/v1.3.1...v1.4.0) (2026-06-02)


### Bug Fixes

* addition of fallback at 50 for max microblocks per block ([728f436](https://github.com/Carmentis/carmentis-node/commit/728f436cfdb98d11fbb8b8e90f4f39ac4c4d8ede))
* missing dependancies in the build ([99f395b](https://github.com/Carmentis/carmentis-node/commit/99f395bc3ef6a131da06a03a52d9e1ffc55a0b41))
* upgrade @cmts-dev/carmentis-sdk-core to 1.2.12 ([b265508](https://github.com/Carmentis/carmentis-node/commit/b26550866bea232391e1be6ea5701ada445a3ace))
* upgrade @cmts-dev/carmentis-sdk-core to 1.2.12 ([9093e66](https://github.com/Carmentis/carmentis-node/commit/9093e665f33046a52b91a9ecefd8c4d8c0d3c1c7))


### Features

* addition of max microblocks per block config ([16f765c](https://github.com/Carmentis/carmentis-node/commit/16f765ce35f1afbd9125b275c533c8cea52dd925))

## [1.3.1](https://github.com/Carmentis/carmentis-node/compare/v1.3.0...v1.3.1) (2026-06-02)


### Bug Fixes

* addition of fallback at 50 for max microblocks per block ([f2125fe](https://github.com/Carmentis/carmentis-node/commit/f2125fe53583dbad90da9f17226729461cb6fca6))

# [1.3.0](https://github.com/Carmentis/carmentis-node/compare/v1.2.13...v1.3.0) (2026-06-02)


### Bug Fixes

* missing dependancies in the build ([c4faddf](https://github.com/Carmentis/carmentis-node/commit/c4faddfbf38e1699c76028280a35a5a2c5c5b502))


### Features

* addition of max microblocks per block config ([f35289e](https://github.com/Carmentis/carmentis-node/commit/f35289ec1584e72eec981034bc1676b233c3f8ca))

## [1.2.13](https://github.com/Carmentis/carmentis-node/compare/v1.2.12...v1.2.13) (2026-05-27)


### Bug Fixes

* upgrade `@cmts-dev/carmentis-sdk-core` to v1.2.9 in `package.json` and `pnpm-lock.yaml` ([491e03f](https://github.com/Carmentis/carmentis-node/commit/491e03f72f6958b82e7c4088ccaed66f6cfdc652))

## [1.2.12](https://github.com/Carmentis/carmentis-node/compare/v1.2.11...v1.2.12) (2026-05-27)


### Bug Fixes

* upgrade `@cmts-dev/carmentis-sdk-core` to v1.2.7 in `package.json` and `pnpm-lock.yaml` ([77b25d5](https://github.com/Carmentis/carmentis-node/commit/77b25d564533cfd0557471ac8b43cee700b1e620))

## [1.2.11](https://github.com/Carmentis/carmentis-node/compare/v1.2.10...v1.2.11) (2026-05-25)


### Bug Fixes

* Dockerfile broken due to the build not producing main binary ([24d8109](https://github.com/Carmentis/carmentis-node/commit/24d8109ee71d7be9438354e0b9ae3e5b0d8b1dc2))

## [1.2.10](https://github.com/Carmentis/carmentis-node/compare/v1.2.9...v1.2.10) (2026-05-21)


### Bug Fixes

* docker build due to min publication age and approve-builds for pnpm ([aa2de5b](https://github.com/Carmentis/carmentis-node/commit/aa2de5b4692afcce3d0675668442f30ef8269786))

## [1.2.9](https://github.com/Carmentis/carmentis-node/compare/v1.2.8...v1.2.9) (2026-05-21)


### Bug Fixes

* Dockerfile ([8995e69](https://github.com/Carmentis/carmentis-node/commit/8995e6987933d270d2c3778b15e2c73d628eca29))

## [1.2.8](https://github.com/Carmentis/carmentis-node/compare/v1.2.7...v1.2.8) (2026-05-21)


### Bug Fixes

* dummy ([7e3eb8f](https://github.com/Carmentis/carmentis-node/commit/7e3eb8fc84cf30fff079a83d8015fee8a4b0413a))

## [1.2.7](https://github.com/Carmentis/carmentis-node/compare/v1.2.6...v1.2.7) (2026-03-04)


### Bug Fixes

* add write permission check for fees payer account in `GlobalStateUpdater` ([13529f1](https://github.com/Carmentis/carmentis-node/commit/13529f1ed5e10b3680c53b8d42fc8d30d3f97151))
* upgrade `@cmts-dev/carmentis-sdk` to v1.20 in `package.json` ([8e6d069](https://github.com/Carmentis/carmentis-node/commit/8e6d069b3bc59826cb0aea6afbcb20d66ec95b04))
* upgrade `@cmts-dev/carmentis-sdk` to v1.20.1 in `package.json` and `package-lock.json` ([a8665d1](https://github.com/Carmentis/carmentis-node/commit/a8665d1ffd5d1dfbe939b40032b88f1c919563ef))

## [1.2.6](https://github.com/Carmentis/carmentis-node/compare/v1.2.5...v1.2.6) (2026-03-02)


### Bug Fixes

* add write permission check for fees payer account in `GlobalStateUpdater` ([76c5aa7](https://github.com/Carmentis/carmentis-node/commit/76c5aa7634f9823f4e86d81c6ab2640aacf84e7d))

## [1.2.5](https://github.com/Carmentis/carmentis-node/compare/v1.2.4...v1.2.5) (2026-02-26)


### Bug Fixes

* add write permission check for fees payer account in `GlobalStateUpdater` ([2066022](https://github.com/Carmentis/carmentis-node/commit/2066022ed8b32c78decec4176be51da6025a9b6b))
* upgrade `@cmts-dev/carmentis-sdk` to v1.20.1 in `package.json` and `package-lock.json` ([0e922df](https://github.com/Carmentis/carmentis-node/commit/0e922dfa2000a9055b491d98bceb366e7b756267))

## [1.2.4](https://github.com/Carmentis/carmentis-node/compare/v1.2.3...v1.2.4) (2026-02-26)


### Bug Fixes

* add write permission check for fees payer account in `GlobalStateUpdater` ([c9eb5b3](https://github.com/Carmentis/carmentis-node/commit/c9eb5b3cb8464007359f3a8c5af389eeb7e9b490))
* upgrade `@cmts-dev/carmentis-sdk` to v1.20 in `package.json` ([6cbc4b6](https://github.com/Carmentis/carmentis-node/commit/6cbc4b604470f9f479238963d03ec18bf347fc2d))

## [1.2.3](https://github.com/Carmentis/carmentis-node/compare/v1.2.2...v1.2.3) (2026-02-23)


### Bug Fixes

* force npm install in Dockerfile to bypass peer dependency conflicts ([4688288](https://github.com/Carmentis/carmentis-node/commit/4688288881bdcff92d29512b1d31c68579527543))

## [1.2.2](https://github.com/Carmentis/carmentis-node/compare/v1.2.1...v1.2.2) (2026-02-23)


### Bug Fixes

* addition of comments ([b107b90](https://github.com/Carmentis/carmentis-node/commit/b107b90543fb302e5ef762789edc2c164bb08be0))

## [1.2.1](https://github.com/Carmentis/carmentis-node/compare/v1.2.0...v1.2.1) (2026-02-02)


### Bug Fixes

* snapshot chunk size 4KB -> 10MB ([20bd501](https://github.com/Carmentis/carmentis-node/commit/20bd50100130ed1b02abd030cb4c3a162576b6cf))

# [1.2.0](https://github.com/Carmentis/carmentis-node/compare/v1.1.0...v1.2.0) (2026-02-02)


### Features

* upgrade to SDK 1.18.4 ([9300101](https://github.com/Carmentis/carmentis-node/commit/9300101627ea5118a31fcadf082f94b834b9a0ae))

# [1.1.0](https://github.com/Carmentis/carmentis-node/compare/v1.0.6...v1.1.0) (2026-01-28)


### Bug Fixes

* **logging:** add error logs for rejected microblocks in `AbciService` ([c89e922](https://github.com/Carmentis/carmentis-node/commit/c89e922775de0c0ef697cf7592d1c29439a9a04f))


### Features

* add account write permission validation and upgrade to SDK 1.17 ([7b828b3](https://github.com/Carmentis/carmentis-node/commit/7b828b337b2518f9281ff5c67531c68fd2a9b81c))
* add min gas limit for microblock acceptance and rejection logic ([e7e6f76](https://github.com/Carmentis/carmentis-node/commit/e7e6f76a20100ca709ff7345464d821476f26b78))
* implement max block size checks and early microblock rejection service ([8bbd8ce](https://github.com/Carmentis/carmentis-node/commit/8bbd8ced3e4f24926a3cbb893066dc4d63401a6d))
* integrate `FeesDispatcher` and implement stake-based fee distribution ([3105500](https://github.com/Carmentis/carmentis-node/commit/3105500ae6830fa23b24681ef9baa7094b82b05c))

## [1.0.6](https://github.com/Carmentis/carmentis-node/compare/v1.0.5...v1.0.6) (2026-01-22)


### Bug Fixes

* remove unused scripts and outdated test cases ([6640c21](https://github.com/Carmentis/carmentis-node/commit/6640c21e1e0af7b4c8276de17cb73b4872ac9346))

## [1.0.5](https://github.com/Carmentis/carmentis-node/compare/v1.0.4...v1.0.5) (2026-01-22)


### Bug Fixes

* upgrade to SDK 1.16 ([c23e722](https://github.com/Carmentis/carmentis-node/commit/c23e72207a9e244893444e4b280d7bc2d9cf5ea8))

## [1.0.4](https://github.com/Carmentis/carmentis-node/compare/v1.0.3...v1.0.4) (2026-01-11)


### Bug Fixes

* add `[@ts-expect-error](https://github.com/ts-expect-error)` comment to handle schema typing issue in utils.ts ([372a503](https://github.com/Carmentis/carmentis-node/commit/372a50317ec18918b5109c76cc40f13175fb7284))

## [1.0.3](https://github.com/Carmentis/carmentis-node/compare/v1.0.2...v1.0.3) (2026-01-11)


### Bug Fixes

* update comment for fees payer account case in GlobalStateUpdater ([18b0b5b](https://github.com/Carmentis/carmentis-node/commit/18b0b5ba427430cc0a7350694a509fb0c7516f7d))

## [1.0.2](https://github.com/Carmentis/carmentis-node/compare/v1.0.1...v1.0.2) (2026-01-11)


### Bug Fixes

* otel config ([3974c9c](https://github.com/Carmentis/carmentis-node/commit/3974c9c81b0269b9a3aa190e5bd01513db57ad3f))

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
