import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";
import type { AddressInfo, Socket } from "node:net";

export async function publicAddress(host: string) {
  const addresses = await lookup(host.replace(/^\[|\]$/g, ""), { all: true });
  if (
    !addresses.length ||
    addresses.some((a) => ipaddr.process(a.address).range() !== "unicast")
  )
    throw new Error("Private network URL blocked");
  return addresses[0];
}
export function webUrl(value: string) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error("Unsafe URL");
  return url;
}
/** All browser/Lighthouse traffic passes through a DNS-pinned public-network proxy. */
export async function browserProxy() {
  const sockets = new Set<Socket>();
  const server = createServer(async (req, res) => {
    try {
      const url = webUrl(req.url!);
      if (url.protocol !== "http:") throw new Error("Use CONNECT for HTTPS");
      const address = await publicAddress(url.hostname);
      const upstream = httpRequest(
        {
          hostname: address.address,
          port: 80,
          path: url.pathname + url.search,
          method: req.method,
          headers: { ...req.headers, host: url.host },
        },
        (incoming) => {
          res.writeHead(incoming.statusCode ?? 502, incoming.headers);
          incoming.pipe(res);
        },
      );
      upstream.on("error", () => {
        res.destroy();
      });
      req.pipe(upstream);
    } catch {
      res.writeHead(403);
      res.end("Network destination denied");
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("connect", async (req, socket, head) => {
    try {
      const target = webUrl(`https://${req.url}`);
      const address = await publicAddress(target.hostname);
      const upstream = connect(
        { host: address.address, port: Number(target.port || 443) },
        () => {
          socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          if (head.length) upstream.write(head);
          upstream.pipe(socket);
          socket.pipe(upstream);
        },
      );
      upstream.on("error", () => socket.destroy());
      socket.on("error", () => upstream.destroy());
      socket.on("close", () => upstream.destroy());
    } catch {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
