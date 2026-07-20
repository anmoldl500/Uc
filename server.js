import express from "express";
import cors from "cors";
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";

const app = express();
app.use(cors());

const DEFAULT_COUNTRY_CODE = process.env.DEFAULT_COUNTRY_CODE || "91";

let sock = null;
let currentQR = null;
let status = "starting";

function cleanPhone(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text || /@lid\b/i.test(text)) return null;

  const trustedJid = /@s\.whatsapp\.net\b/i.test(text);
  const explicitInternational = text.startsWith("+") || text.startsWith("00");
  let digits = text.split("@")[0].split(":")[0].replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);

  if (digits.length === 10 && /^[6-9]/.test(digits)) return DEFAULT_COUNTRY_CODE + digits;
  if (digits.length === DEFAULT_COUNTRY_CODE.length + 10 && digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    const national = digits.slice(DEFAULT_COUNTRY_CODE.length);
    if (/^[6-9]/.test(national)) return digits;
  }

  if ((trustedJid || explicitInternational) && digits.length >= 8 && digits.length <= 15) return digits;
  if (digits.length >= 8 && digits.length <= 13) return digits;
  return null;
}

function memberRole(p) {
  if (p.admin === "superadmin") return "superadmin";
  if (p.admin === "admin") return "admin";
  return "member";
}

function resolveParticipantPhone(p) {
  // Baileys v7 exposes real phones for many LID users in phoneNumber.
  // Different builds/tools name it slightly differently, so check all known keys.
  const candidates = [
    p.phoneNumber,
    p.phone_number,
    p.phone,
    p.number,
    p.pn,
    p.pnJid,
    p.jid,
    p.participant,
    p.id,
  ];
  for (const candidate of candidates) {
    const phone = cleanPhone(candidate);
    if (phone) return phone;
  }
  // LID without a mapped phoneNumber is privacy-hidden. Do not export it as a phone.
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
    const groups = await Promise.all(Object.values(chats).map(async (g) => {
      const meta = await sock.groupMetadata(g.id).catch(() => g);
      const participants = meta.participants || g.participants || [];
      const byPhone = new Map();
      for (const p of participants) {
        const phone = resolveParticipantPhone(p);
        if (!phone) continue;
        byPhone.set(phone, { phoneNumber: phone, role: memberRole(p), id: p.id });
      }
      const members = Array.from(byPhone.values());
      return {
        id: meta.id || g.id,
        name: meta.subject || g.subject,
        totalMembers: participants.length,
        resolvedMembers: members.length,
        hiddenMembers: Math.max(0, participants.length - members.length),
        members,
      };
    }));
    res.json({ groups });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Listening on", PORT));
