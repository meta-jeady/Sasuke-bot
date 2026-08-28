const express = require('express');
const app = express();
const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

app.use(express.static('public'));
app.use(express.json());

const PORT = process.env.PORT || 10000;
let sockInstance = null;
let botStatus = "Déconnecté";
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

// Mémoire antilink
const antilinkDB = new Set();

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
    browser: Browsers.ubuntu("Chrome"),
    printQRInTerminal: false,
    syncFullHistory: false,
  });

  sockInstance = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    if (update.connection === 'open') {
      botStatus = "Connecté ✅";
      connectedAt = new Date().toLocaleString();
      console.log("✅ CONNECTÉ");
    }
    if (update.connection === 'close') {
      botStatus = "Déconnecté - Reconnexion...";
      setTimeout(startBot, 3000);
    }
  });

  // === WELCOME & GOODBYE AUTO ===
  sock.ev.on('group-participants.update', async (anu) => {
    try {
      const metadata = await sock.groupMetadata(anu.id);
      const logo = fs.existsSync('./public/logo.jpg')? fs.readFileSync('./public/logo.jpg') : null;

      for (let p of anu.participants) {
        if (anu.action === 'add') {
          const txt = `╭──〔 BIENVENUE 〕──\n│ 👤 @${p.split('@')[0]}\n│ 🏷️ ${metadata.subject}\n│ 👥 ${metadata.participants.length} membres\n╰──\n\nBienvenue! Tape.menu\n\n📢 ${CONFIG.CHANNEL}`;
          if (logo) await sock.sendMessage(anu.id, { image: logo, caption: txt, mentions: [p] });
          else await sock.sendMessage(anu.id, { text: txt, mentions: [p] });
        }
        if (anu.action === 'remove') {
          const txt = `╭──〔 GOODBYE 〕──\n│ 👤 @${p.split('@')[0]}\n╰──\nAurevoir! 👋\n\n📢 ${CONFIG.CHANNEL}`;
          if (logo) await sock.sendMessage(anu.id, { image: logo, caption: txt, mentions: [p] });
          else await sock.sendMessage(anu.id, { text: txt, mentions: [p] });
        }
      }
    } catch (e) { console.log(e.message) }
  });

  // === COMMANDES + ANTILINK ===
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";
    const sender = msg.key.participant || from;

    // ANTILINK AUTO
    if (isGroup && antilinkDB.has(from)) {
      const linkRegex = /https:\/\/chat\.whatsapp\.com\/|https:\/\/whatsapp\.com\/channel\//i;
      if (linkRegex.test(body)) {
        const groupMeta = await sock.groupMetadata(from);
        const isAdmin = groupMeta.participants.find(p => p.id === sender)?.admin;
        const botIsAdmin = groupMeta.participants.find(p => p.id === sock.user.id)?.admin;
        if (!isAdmin && botIsAdmin) {
          await sock.sendMessage(from, { delete: msg.key });
          await sock.sendMessage(from, { text: `🚫 @${sender.split('@')[0]} Lien interdit supprimé!`, mentions: [sender] });
        }
      }
    }

    if (!body.startsWith(CONFIG.PREFIX)) return;
    const cmd = body.slice(1).trim().split(/ +/)[0].toLowerCase();
    const args = body.slice(1).trim().split(/ +/).slice(1).join(' ');
    const reply = (t) => sock.sendMessage(from, { text: t }, { quoted: msg });

    if (cmd === 'menu') {
      const logo = fs.existsSync('./public/logo.jpg')? fs.readFileSync('./public/logo.jpg') : null;
      if (logo) await sock.sendMessage(from, { image: logo, caption: MENU36 }, { quoted: msg });
      else reply(MENU36);
    }
    if (cmd === 'ping') reply("Pong! 🏓");
    if (cmd === 'alive') reply(`✅ ${CONFIG.BOT_NAME} ON\n⏰ ${connectedAt}`);
    if (cmd === 'owner' || cmd === 'chaine') reply(CONFIG.CHANNEL);

    // ANTILINK ON/OFF
    if (cmd === 'antilink') {
      if (!isGroup) return reply("Groupe seulement");
      if (args === 'on') {
        antilinkDB.add(from);
        reply("✅ ANTILINK activé");
      } else if (args === 'off') {
        antilinkDB.delete(from);
        reply("❌ ANTILINK désactivé");
      } else {
        reply("Utilise:.antilink on /.antilink off");
      }
    }
  });
}

app.get('/api/status', (req, res) => res.json({ qr: null, status: botStatus }));
app.get('/api/bots', (req, res) => {
  if (sockInstance?.user && botStatus.includes('Connecté')) {
    const rawId = sockInstance.user.id;
    res.json({ total: 1, bots: [{ id: rawId, number: rawId.split(':')[0].split('@')[0], name: CONFIG.BOT_NAME, status: botStatus, connectedAt }] });
  } else res.json({ total: 0, bots: [] });
});
app.get('/api/pair/:number', async (req, res) => {
  try {
    const num = req.params.number.replace(/[^0-9]/g, '');
    const code = await sockInstance.requestPairingCode(num);
    res.json({ code });
  } catch (e) { res.json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`🚀 RUN ${PORT}`));
startBot();
