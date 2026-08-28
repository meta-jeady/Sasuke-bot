const express = require('express');
const app = express();
const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

app.use(express.static('public'));
app.use(express.json());

const PORT = process.env.PORT || 10000;

let pairingCode = null;
let botStatus = "Déconnecté";
let sockInstance = null;
let connectedAt = null;

const CONFIG = {
  PREFIX: ".",
  BOT_NAME: "SASUKE-BOT",
  OWNER: "237687960259",
  CHANNEL: "https://whatsapp.com/channel/0029VbE0WHTKWEKo9iyxl43e"
};

const MENU36 = `
╭──〔 GENERAL 〕──
│ menu
│ ping
│ alive
│ owner
│ chaine
╰──
╭──〔 GROUPE 〕──
│ tagall
│ hidetag
│ kick
│ add
│ promote
│ demote
│ link
│ close
│ open
│ antilink
│ welcome
│ goodbye
╰──
╭──〔 STICKER 〕──
│ sticker
│ toimg
│ qc
│ emojimix
╰──
╭──〔 DOWNLOAD 〕──
│ play
│ tiktok
│ fb
│ insta
│ apk
│ ytmp3
╰──
╭──〔 OUTILS 〕──
│ ai
│ imagine
│ meteo
│ calc
│ trt
│ ss
│ del
│ vcard
╰──
📢 ${CONFIG.CHANNEL}
`;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  
  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    browser: Browsers.ubuntu("Chrome"),
    printQRInTerminal: false,
    syncFullHistory: false,
  });

  sockInstance = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection } = update;

    if (connection === 'open') {
      pairingCode = null;
      botStatus = "Connecté ✅";
      connectedAt = new Date().toLocaleString();
      console.log("✅ CONNECTÉ :", sock.user.id);
    }

    if (connection === 'close') {
      botStatus = "Déconnecté - Reconnexion...";
      pairingCode = null;
      setTimeout(startBot, 3000);
    }
  });

  // Welcome / Goodbye
  sock.ev.on('group-participants.update', async (anu) => {
    try {
      const metadata = await sock.groupMetadata(anu.id);
      const logoBuffer = fs.existsSync('./public/logo.jpg') ? fs.readFileSync('./public/logo.jpg') : null;

      for (let p of anu.participants) {
        if (anu.action === 'add') {
          const txt = `╭──〔 BIENVENUE 〕──\n│ 👤 @${p.split('@')[0]}\n│ Groupe: \( {metadata.subject}\n╰──\n\n📢 Rejoins ma chaine:\n \){CONFIG.CHANNEL}\n\nTape .menu`;
          if (logoBuffer) {
            await sock.sendMessage(anu.id, { image: logoBuffer, caption: txt, mentions: [p] });
          } else {
            await sock.sendMessage(anu.id, { text: txt, mentions: [p] });
          }
        }
        if (anu.action === 'remove') {
          const txt = `╭──〔 AU REVOIR 〕──\n│ 👤 @\( {p.split('@')[0]}\n╰──\n\n📢 Ma chaine:\n \){CONFIG.CHANNEL}`;
          if (logoBuffer) {
            await sock.sendMessage(anu.id, { image: logoBuffer, caption: txt, mentions: [p] });
          } else {
            await sock.sendMessage(anu.id, { text: txt, mentions: [p] });
          }
        }
      }
    } catch {}
  });

  // Commandes
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    if (!body.startsWith(CONFIG.PREFIX)) return;

    const cmd = body.slice(1).trim().split(/ +/)[0].toLowerCase();
    const reply = (t) => sock.sendMessage(from, { text: t }, { quoted: msg });

    if (cmd === 'menu') {
      const logo = fs.existsSync('./public/logo.jpg') ? fs.readFileSync('./public/logo.jpg') : null;
      if (logo) {
        await sock.sendMessage(from, { image: logo, caption: MENU36 }, { quoted: msg });
      } else {
        reply(MENU36);
      }
    }
    if (cmd === 'ping') reply("Pong! 🏓");
    if (cmd === 'owner' || cmd === 'chaine') reply(`📢 MA CHAINE\n${CONFIG.CHANNEL}`);
  });
}

// ====================== API ======================

app.get('/api/status', (req, res) => {
  res.json({
    pairingCode: pairingCode,
    status: botStatus
  });
});

app.get('/api/bots', (req, res) => {
  if (sockInstance?.user && botStatus.includes('Connecté')) {
    const rawId = sockInstance.user.id;
    const number = rawId.split(':')[0].split('@')[0];
    res.json({
      total: 1,
      bots: [{
        id: rawId,
        number: number,
        name: sockInstance.user.name || CONFIG.BOT_NAME,
        status: botStatus,
        connectedAt: connectedAt
      }]
    });
  } else {
    res.json({ total: 0, bots: [] });
  }
});

// === PAIRING CODE UNIQUEMENT ===
app.get('/api/pair/:number', async (req, res) => {
  try {
    if (!sockInstance) {
      return res.json({ error: "Bot pas encore prêt, réessaie dans 3 secondes" });
    }

    const num = req.params.number.replace(/[^0-9]/g, '');
    
    if (num.length < 10 || num.length > 15) {
      return res.json({ error: "Numéro invalide" });
    }

    if (sockInstance.authState.creds.registered) {
      return res.json({ error: "Bot déjà connecté" });
    }

    const code = await sockInstance.requestPairingCode(num);
    pairingCode = code;
    botStatus = `Pairing Code: ${code}`;
    
    console.log("🔑 Pairing Code généré pour", num, "→", code);
    
    res.json({ code });
  } catch (e) {
    console.error("Erreur Pairing:", e.message);
    res.json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 SASUKE-BOT Pairing Mode → http://localhost:${PORT}`);
});

startBot();
