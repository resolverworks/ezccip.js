var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/serve.js
var serve_exports = {};
__export(serve_exports, {
  serve: () => serve
});
module.exports = __toCommonJS(serve_exports);
var import_node_http = require("node:http");
var import_index = require("./index.js");
var import_hash = require("ethers/hash");
var import_transaction = require("ethers/transaction");
var import_crypto = require("ethers/crypto");
function serve(ezccip, {
  port = 0,
  log = true,
  formatError = (x) => x,
  protocol = "tor",
  signingKey = (0, import_hash.id)("ezccip"),
  origin,
  parseOrigin,
  ...a
} = {}) {
  if (ezccip instanceof Function) {
    let temp = new import_index.EZCCIP();
    temp.enableENSIP10(ezccip);
    ezccip = temp;
  }
  if (log === true) {
    log = (...a2) => console.log(/* @__PURE__ */ new Date(), ...a2);
  } else if (!log) {
    log = void 0;
  }
  if (!(signingKey instanceof import_crypto.SigningKey)) {
    signingKey = new import_crypto.SigningKey(signingKey);
  }
  if (!parseOrigin) {
    parseOrigin = (x) => a.resolvers?.[x.slice(1)] ?? a.resolvers?.["*"];
  }
  let killer;
  return new Promise((ful) => {
    let http = (0, import_node_http.createServer)(async (req, reply) => {
      let ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
      let { method, url } = req;
      try {
        reply.setHeader("access-control-allow-origin", "*");
        switch (method) {
          case "OPTIONS":
            return reply.setHeader("access-control-allow-headers", "*").end();
          case "POST": {
            let v = [];
            for await (let x of req) v.push(x);
            let { sender, data: calldata } = JSON.parse(Buffer.concat(v));
            let match = url.match(/\/(0x[a-f0-9]{40})(?:\b|\/|\?)/i);
            let { data, history } = await ezccip.handleRead(sender, calldata, {
              ...a,
              url,
              ip,
              protocol,
              signingKey,
              origin: match ? match[1] : parseOrigin(url) || origin
            });
            log?.(ip, url, history.toString());
            write_json(reply, { data });
            break;
          }
          default:
            throw (0, import_index.error_with)("unsupported http method", { status: 405, method });
        }
      } catch (err) {
        log?.(ip, method, url, formatError(err));
        let { status = 500, message } = err;
        reply.statusCode = status;
        write_json(reply, { message });
      }
    });
    function shutdown() {
      if (!killer) {
        if (!http.listening) return Promise.resolve();
        killer = new Promise((ful2) => http.close(() => {
          killer = null;
          ful2();
        }));
      }
      return killer;
    }
    http.listen(port, () => {
      port = http.address().port;
      let endpoint = `http://localhost:${port}`;
      let signer = (0, import_transaction.computeAddress)(signingKey);
      let context = `${signer} ${endpoint}`;
      const t0 = Date.now();
      log?.(`Serving "${protocol}" ${context}`);
      http.on("close", () => log?.(`Shutdown<${Date.now() - t0}ms>`));
      ful({ http, port, endpoint, signer, context, shutdown });
    });
  });
}
function write_json(reply, json) {
  let buf = Buffer.from(JSON.stringify(json));
  reply.setHeader("content-length", buf.length);
  reply.setHeader("content-type", "application/json");
  reply.end(buf);
}
