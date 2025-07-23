const { execFileSync } = require("child_process");
const path = require("path");
const glob = require("glob");

const pluginPath = path.resolve("node_modules/.bin/protoc-gen-ts_proto" + (process.platform === "win32" ? ".cmd" : ""));
const protoFiles = glob.sync("src/proto/**/*.proto");

const options = [
  "esModuleInterop=true",
  "useOptionals=messages",
  "snakeToCamel=false",
  "useDate=false",
  "outputServices=interface"
];

const args = [
  `--plugin=protoc-gen-ts_proto=${pluginPath}`,
  "--ts_proto_out=./src/proto-ts",
  `--ts_proto_opt=${options.join(",")}`,
  "--proto_path=./src/proto",
  ...protoFiles,
];

execFileSync("protoc", args, { stdio: "inherit" });
