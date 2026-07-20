import express from "express";
import cors from "cors";
import baileys from "@whiskeysockets/baileys";
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

const app = express();
app.use(cors());

let sock = null;
let currentQR = null;
let status = "starting";

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ auth: state, version, browser: ["Extractor", "Chrome", "1.0"] });
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", (u) => {
    const { connection, qr, lastDisconnect } = u;
    if (qr) { currentQR = qr; status = "qr_ready"; }
    if (connection === "open") { status = "connected"; currentQR = null; }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      status = "starting";
      if (shouldReconnect) start();
    }
  });
}
start().catch((e) => { console.error("start failed", e); });

app.get("/api/status", (_req, res) => res.json({ status, qr: currentQR }));

app.get("/api/get-groups", async (_req, res) => {
  if (!sock || status !== "connected") return res.status(400).json({ error: "not connected" });
  try {
    const chats = await sock.groupFetchAllParticipating();
    const groups = Object.values(chats).map((g) => ({
      id: g.id,
      name: g.subject,
      totalMembers: g.participants.length,
      members: g.participants.map((p) => p.id.split("@")[0]),
    }));
    res.json({ groups });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Listening on", PORT));
