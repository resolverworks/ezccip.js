// src/utils.js
import { toUtf8String } from "ethers/utils";
function error_with(message, params, cause) {
  let error;
  if (cause) {
    error = new Error(message, { cause });
    if (!error.cause) error.cause = cause;
  } else {
    error = new Error(message);
  }
  return Object.assign(error, params);
}
function labels_from_dns_encoded(v) {
  let labels = [];
  let pos = 0;
  while (true) {
    let n = v[pos++];
    if (!n) {
      if (pos !== v.length) break;
      return labels;
    }
    if (v.length < pos + n) break;
    let label = toUtf8String(v.subarray(pos, pos += n));
    if (label.includes(".")) break;
    labels.push(label);
  }
  throw new Error("invalid DNS-encoded name");
}
function asciiize(s) {
  return Array.from(s, (ch) => {
    let cp = ch.codePointAt(0);
    return cp >= 32 && cp <= 126 ? ch : `{${cp.toString(16).toUpperCase().padStart(2, "0")}}`;
  }).join("");
}

// src/ezccip.js
import { AbiCoder, Interface, FunctionFragment } from "ethers/abi";
import { isBytesLike, getBytes, isHexString, hexlify } from "ethers/utils";
import { solidityPackedKeccak256 } from "ethers/hash";
import { keccak256 } from "ethers/crypto";
var History = class _History {
  constructor(level) {
    this.level = level;
    this.children = [];
  }
  enter() {
    let { level, children: v } = this;
    if (!level) throw new Error("recursion limit");
    let child = new _History(level - 1);
    v.push(child);
    return child;
  }
  head() {
    let head = this;
    while (head.next) head = head.next;
    return head;
  }
  then() {
    return this.next = new _History(this.level);
  }
  toString() {
    let { data, name, show, error, children: v, next } = this;
    let desc = name || `<${data ? data.slice(0, 10) : "null"}>`;
    desc += "(";
    if (show) {
      if (typeof show === "function") show = show();
      if (!Array.isArray(show)) show = [show];
      if (show.length) {
        desc += show.map((x) => typeof x === "string" ? asciiize(x) : x).join(",");
      }
    }
    desc += ")";
    if (v.length) desc += `^${v.length} [${v.join(" ")}]`;
    if (error) desc += `<${error}>`;
    if (next) desc += `.${next}`;
    return desc;
  }
};
var ABI_CODER = AbiCoder.defaultAbiCoder();
var MULTICALL = "multicall";
var RESOLVE_ABI = new Interface([
  "function name(bytes32 node) external view returns (string)",
  "function addr(bytes32 node) external view returns (address)",
  "function addr(bytes32 node, uint256 type) external view returns (bytes)",
  "function text(bytes32 node, string key) external view returns (string)",
  "function contenthash(bytes32 node) external view returns (bytes)",
  "function pubkey(bytes32 node) external view returns (uint256 x, uint256 y)",
  "function ABI(bytes32 node, uint256 types) external view returns (uint256 type, bytes memory data)",
  "function multicall(bytes[] calls) external view returns (bytes[])"
]);
RESOLVE_ABI.forEachFunction((x) => x.__name = x.format());
var EZCCIP = class {
  constructor() {
    this.impls = /* @__PURE__ */ new Map();
    this.register("multicall(bytes[]) external view returns (bytes[])", async ([calls], context, history) => {
      history.show = false;
      return [await Promise.all(calls.map((x) => this.handleCall(x, context, history.enter()).catch(encode_error)))];
    });
  }
  enableENSIP10(get, { multicall = true } = {}) {
    this.register("resolve(bytes, bytes) external view returns (bytes)", async ([dnsname, data], context, history) => {
      let labels = labels_from_dns_encoded(getBytes(dnsname));
      let name = labels.join(".");
      history.show = [name];
      let record = await get(name, context, history);
      if (record) history.record = record;
      return processENSIP10(record, data, multicall, history.then());
    });
  }
  register(abi, impl) {
    if (typeof abi === "string") {
      abi = abi.trim();
      if (!abi.startsWith("function") && !abi.includes("\n")) abi = `function ${abi}`;
      abi = [abi];
    }
    abi = Interface.from(abi);
    let frags = abi.fragments.filter((x) => x instanceof FunctionFragment);
    if (impl instanceof Function) {
      if (frags.length != 1) throw error_with("expected 1 implementation", { abi, impl, names: frags.map((x) => x.format()) });
      let frag = frags[0];
      impl = { [frag.name]: impl };
    }
    return Object.entries(impl).map(([key, fn]) => {
      let frag = frags.find((x) => x.name === key || x.format() === key || x.selector === key);
      if (!frag) {
        throw error_with(`expected interface function: ${key}`, { abi, impl, key });
      }
      let handler = { abi, frag, fn: fn.bind(this) };
      this.impls.set(frag.selector, handler);
      return handler;
    });
  }
  // https://eips.ethereum.org/EIPS/eip-3668
  async handleRead(sender, calldata, { protocol = "tor", signingKey, resolver, recursionLimit = 2, ttlSec = 60, ...context }) {
    if (!isHexString(sender) || sender.length !== 42) throw error_with("expected sender address", { status: 400 });
    if (!isHexString(calldata) || calldata.length < 10) throw error_with("expected calldata", { status: 400 });
    context.sender = sender.toLowerCase();
    context.calldata = calldata = calldata.toLowerCase();
    context.resolver = resolver;
    context.protocol = protocol;
    let history = context.history = new History(recursionLimit);
    let response = await this.handleCall(calldata, context, history);
    let data;
    let expires = Math.floor(Date.now() / 1e3) + ttlSec;
    switch (context.protocol) {
      case "raw": {
        data = response;
        break;
      }
      case "ens": {
        let hash = solidityPackedKeccak256(
          ["bytes", "address", "uint64", "bytes32", "bytes32"],
          ["0x1900", resolver, expires, keccak256(calldata), keccak256(response)]
        );
        data = ABI_CODER.encode(
          ["bytes", "uint64", "bytes"],
          [response, expires, signingKey.sign(hash).serialized]
        );
        break;
      }
      case "tor": {
        let hash = solidityPackedKeccak256(
          ["address", "uint64", "bytes32", "bytes32"],
          [resolver, expires, keccak256(calldata), keccak256(response)]
        );
        data = ABI_CODER.encode(
          ["bytes", "uint64", "bytes"],
          [signingKey.sign(hash).serialized, expires, response]
        );
        break;
      }
      default:
        throw error_with("unknown protocol", { protocol });
    }
    return { data, history };
  }
  async handleCall(calldata, context, history) {
    try {
      history.calldata = calldata;
      let method = calldata.slice(0, 10);
      let impl = this.impls.get(method);
      if (!impl || !history.level && impl.name === MULTICALL) throw new Error(`unsupported ccip method: ${method}`);
      const { abi, frag, fn } = history.impl = impl;
      history.name = frag.name;
      let args = abi.decodeFunctionData(frag, calldata);
      history.args = history.show = args;
      let res = await fn(args, context, history);
      if (!res) {
        res = "0x";
      } else if (Array.isArray(res)) {
        res = abi.encodeFunctionResult(frag, res);
      } else if (typeof res !== "string") {
        res = hexlify(res);
      }
      return res;
    } catch (err) {
      history.error = err;
      throw err;
    }
  }
};
async function processENSIP10(record, calldata, multicall = true, history) {
  try {
    if (history) history.calldata = calldata;
    let method = calldata.slice(0, 10);
    let frag = RESOLVE_ABI.getFunction(method);
    if (!frag || !multicall && frag.name === MULTICALL) throw error_with(`unsupported resolve() method: ${method}`, { calldata });
    if (history) {
      history.name = frag.name;
    }
    let args = RESOLVE_ABI.decodeFunctionData(frag, calldata);
    if (history) {
      history.args = args;
      history.show = args.slice(1);
    }
    let res;
    switch (frag.__name) {
      case "multicall(bytes[])": {
        if (history) history.show = false;
        res = [await Promise.all(args.calls.map((x) => processENSIP10(record, x, true, history?.enter()).catch(encode_error)))];
        break;
      }
      case "addr(bytes32)": {
        let value = await record?.addr?.(60n);
        res = ["0x" + (value ? hexlify(value).slice(2, 42) : "").padStart(40, "0")];
        break;
      }
      case "addr(bytes32,uint256)": {
        if (history) history.show = [addr_type_str(args.type)];
        let value = await record?.addr?.(args.type);
        res = [value || "0x"];
        break;
      }
      case "text(bytes32,string)": {
        let value = await record?.text?.(args.key);
        res = [value || ""];
        break;
      }
      case "contenthash(bytes32)": {
        let value = await record?.contenthash?.();
        res = [value || "0x"];
        break;
      }
      case "name(bytes32)": {
        let value = await record?.name?.();
        res = [value || ""];
        break;
      }
      case "pubkey(bytes32)": {
        let value = await record?.pubkey?.();
        if (isBytesLike(value)) return value;
        res = value ? [value.x, value.y] : [0, 0];
        break;
      }
      case "ABI(bytes32,uint256)": {
        let types = Number(args.types);
        if (history) history.show = [abi_types_str(types)];
        let value = await record?.ABI?.(types);
        if (isBytesLike(value)) return value;
        res = value ? [value.type, value.data] : [0, "0x"];
        break;
      }
    }
    return RESOLVE_ABI.encodeFunctionResult(frag, res);
  } catch (err) {
    if (history) history.error = err;
    throw err;
  }
}
function encode_error(err) {
  return "0x08c379a0" + ABI_CODER.encode(["string"], [err.message]).slice(2);
}
function addr_type_str(type) {
  const msb = 0x80000000n;
  return type >= msb ? `evm:${type - msb}` : type;
}
function abi_types_str(types) {
  let v = [];
  if (types & 1) v.push("JSON");
  if (types & 2) v.push("zip(JSON)");
  if (types & 4) v.push("CBOR");
  if (types & 8) v.push("URI");
  return v.join("|");
}
export {
  EZCCIP,
  History,
  RESOLVE_ABI,
  asciiize,
  error_with,
  labels_from_dns_encoded,
  processENSIP10
};
