// src/serve.js
import { createServer } from "node:http";
import { EZCCIP, error_with } from "./index.mjs";
import { id as keccakStr } from "ethers/hash";
import { computeAddress } from "ethers/transaction";
import { SigningKey } from "ethers/crypto";
function serve(ezccip, {
  port = 0,
  log = true,
  formatError = (x) => x,
  protocol = "tor",
  signingKey = keccakStr("ezccip"),
  origin,
  parseOrigin,
  ...a
} = {}) {
  if (ezccip instanceof Function) {
    let temp = new EZCCIP();
    temp.enableENSIP10(ezccip);
    ezccip = temp;
  }
  if (log === true) {
    log = (...a2) => console.log(/* @__PURE__ */ new Date(), ...a2);
  } else if (!log) {
    log = void 0;
  }
  if (!(signingKey instanceof SigningKey)) {
    signingKey = new SigningKey(signingKey);
  }
  if (!parseOrigin) {
    parseOrigin = (x) => a.resolvers?.[x.slice(1)] ?? a.resolvers?.["*"];
  }
  let killer;
  return new Promise((ful) => {
    let http = createServer(async (req, reply) => {
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
            throw error_with("unsupported http method", { status: 405, method });
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
      let signer = computeAddress(signingKey);
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
export {
  serve
};
