import express from "express";
import cors from "cors";
import pkg from "@whiskeysockets/baileys";
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = pkg;
import { Boom } from "@hapi/boom";

const app = express();
app.use(cors());

let sock = null;
let currentQR = null;
let status = "starting";

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  sock = makeWASocket({ auth: state, printQRInTerminal: false });
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", (u) => {
    const { connection, qr, lastDisconnect } = u;
    if (qr) { currentQR = qr; status = "qr_ready"; }
    if (connection === "open") { status = "connected"; currentQR = null; }
    if (connection === "close") {
      const shouldReconnect = new Boom(lastDisconnect?.error).output.statusCode !== DisconnectReason.loggedOut;
      status = "starting";
      if (shouldReconnect) start();
    }
  });
}
start();

app.get("/api/status", (_req, res) => res.json({ status, qr: currentQR }));

app.get("/api/get-groups", async (_req, res) => {
  if (!sock || status !== "connected") return res.status(400).json({ error: "not connected" });
  const chats = await sock.groupFetchAllParticipating();
  const groups = Object.values(chats).map((g) => ({
    id: g.id,
    name: g.subject,
    totalMembers: g.participants.length,
    members: g.participants.map((p) => p.id.split("@")[0]),
  }));
  res.json({ groups });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Listening on", PORT));
