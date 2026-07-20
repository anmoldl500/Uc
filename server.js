import express from "express";
import cors from "cors";
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser } from "@whiskeysockets/baileys";

const app = express();
app.use(cors());

let sock = null;
let currentQR = null;
let status = "starting";

function cleanPhone(value) {
  if (!value) return null;
  const digits = String(value).split("@")[0].replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

function memberRole(p) {
  if (p.admin === "superadmin") return "superadmin";
  if (p.admin === "admin") return "admin";
  return "member";
}

function resolveParticipantPhone(p) {
  // Baileys v7 exposes real phone for many LID users here.
  const fromPhoneNumber = cleanPhone(p.phoneNumber);
  if (fromPhoneNumber) return fromPhoneNumber;

  // Normal phone JID: 919876543210@s.whatsapp.net
  const id = jidNormalizedUser(p.id || "");
  if (id.endsWith("@s.whatsapp.net")) return cleanPhone(id);

  // LID without phoneNumber is privacy-hidden. Do not export it as a phone.
  return null;
}

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
    const groups = Object.values(chats).map((g) => {
      const members = g.participants
        .map((p) => ({ phoneNumber: resolveParticipantPhone(p), role: memberRole(p), id: p.id }))
        .filter((m) => m.phoneNumber);
      return {
        id: g.id,
        name: g.subject,
        totalMembers: g.participants.length,
        resolvedMembers: members.length,
        hiddenMembers: g.participants.length - members.length,
        members,
      };
    });
    res.json({ groups });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Listening on", PORT));
