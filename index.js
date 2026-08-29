const express = require('express');
const app = express();
const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

app.use(express.static('public'));
app.use(express.json());

const PORT = process.env.PORT || 10000;
let sockInstance = null;
let botStatus = "Déconnecté";
let connectedAt = null;

const CONFIG = {
  PREFIX: ".",
  BOT_NAME: "SASUKE-BOT V36",
  OWNER: "237687960259",
  CHANNEL: "https://whatsapp.com/channel/0029VbE0WHTKWEKo9iyxl43e"
};

const MENU36 = `
╭──〔 *SASUKE BOT V36* 〕──
│ *.menu* - Affiche ce menu
│ *.ping* - Vitesse du bot
│ *.alive* - Bot ON?
│ *.owner* - Proprio
│ *.chaine* - Lien chaine
│ *.vv* - Récupère vue unique
╰──
╭──〔 *GROUPE* 〕──
│ *.tagall* - Mentionne tous
│ *.hidetag* - Tag caché
│ *.kick* - Retire membre
│ *.add* - Ajoute membre
│ *.promote / demote*
│ *.link / close / open*
│ *.antilink on/off*
╰──
╭──〔 *AUTO* 〕──
│ Welcome / Goodbye auto ✅
╰──
*📢 ${CONFIG.CHANNEL}*
`;

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
    const { connection } = update;
    if (connection === 'open') {
      botStatus = "Connecté ✅";
      connectedAt = new Date().toLocaleString();
      console.log('BOT CONNECTE');
    }
    if (connection === 'close') {
      botStatus = "Déconnecté - Reconnexion...";
      setTimeout(startBot, 3000);
    }
  });

  // Welcome/Goodbye
  sock.ev.on('group-participants.update', async (anu) => {
    try {
      const metadata = await sock.groupMetadata(anu.id);
      for (let p of anu.participants) {
        if (anu.action === 'add') {
          const txt = `╭──〔 *BIENVENUE* 〕──\n│ 👤 @${p.split('@')[0]}\n│ 🏷️ ${metadata.subject}\n│ 👥 ${metadata.participants.length} membres\n╰──\n\nTape *.menu*\n📢 ${CONFIG.CHANNEL}`;
          await sock.sendMessage(anu.id, { text: txt, mentions: [p] });
        }
        if (anu.action === 'remove') {
          const txt = `╭──〔 *GOODBYE* 〕──\n│ 👤 @${p.split('@')[0]}\n╰──\nBye! 👋`;
          await sock.sendMessage(anu.id, { text: txt, mentions: [p] });
        }
      }
    } catch {}
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";
    const sender = msg.key.participant || from;

    if (isGroup && antilinkDB.has(from) && /https:\/\/chat\.whatsapp\.com\/|whatsapp\.com\/channel/i.test(body)) {
      try {
        const g = await sock.groupMetadata(from);
        const isAdmin = g.participants.find(p => p.id === sender)?.admin;
        const botAdmin = g.participants.find(p => p.id === sock.user.id)?.admin;
        if (!isAdmin && botAdmin) {
          await sock.sendMessage(from, { delete: msg.key });
          await sock.sendMessage(from, { text: `🚫 @${sender.split('@')[0]} Lien interdit!`, mentions: [sender] });
        }
      } catch {}
    }

    if (!body.startsWith(CONFIG.PREFIX)) return;
    const args = body.slice(1).trim().split(/ +/).slice(1).join(' ');
    const cmd = body.slice(1).trim().split(/ +/)[0].toLowerCase();
    const reply = (t) => sock.sendMessage(from, { text: t }, { quoted: msg });

    if (cmd === 'menu') reply(MENU36);
    if (cmd === 'ping') reply("*Pong!* 🏓 "+Date.now()%1000+"ms");
    if (cmd === 'alive') reply(`*✅ ${CONFIG.BOT_NAME} ON*\n⏰ ${connectedAt}`);
    if (cmd === 'owner' || cmd === 'chaine' || cmd === 'channel') reply(CONFIG.CHANNEL);

    if (cmd === 'vv') {
      const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted) return reply("Réponds à une vue unique avec *.vv*");
      let viewOnce = quoted.viewOnceMessage || quoted.viewOnceMessageV2 || quoted.viewOnceMessageV2Extension || quoted;
      const content = viewOnce.message || viewOnce;
      const type = Object.keys(content)[0];
      if (type === 'imageMessage') await sock.sendMessage(from, { image: content.imageMessage }, { quoted: msg });
      else if (type === 'videoMessage') await sock.sendMessage(from, { video: content.videoMessage }, { quoted: msg });
    }

    if (cmd === 'antilink') {
      if (!isGroup) return;
      if (args === 'on') { antilinkDB.add(from); reply("✅ ANTILINK ON"); }
      else if (args === 'off') { antilinkDB.delete(from); reply("❌ ANTILINK OFF"); }
      else reply("*.antilink on/off*");
    }

    if (cmd === 'tagall' || cmd === 'hidetag') {
      if (!isGroup) return;
      const meta = await sock.groupMetadata(from);
      const mentions = meta.participants.map(p=>p.id);
      await sock.sendMessage(from, { text: args || "📢", mentions });
    }
  });
}

// FIX PAIRING - LE PLUS IMPORTANT
async function getPairingCode(number){
  // Si bot déjà connecté, on ne peut pas générer un nouveau code sur le même auth
  // On crée un auth temporaire juste pour générer le code
  if (!sockInstance) {
    // Première fois, on démarre un socket temporaire
    const { state } = await useMultiFileAuthState('auth');
    const sock = makeWASocket({
      logger: pino({ level: 'silent' }),
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
      browser: Browsers.ubuntu("Chrome"),
      printQRInTerminal: false,
    });
    sockInstance = sock;
    // Attendre 2s que le socket soit prêt
    await new Promise(r=>setTimeout(r,1500));
  }

  try{
    if(!sockInstance.requestPairingCode) throw new Error("Baileys trop ancien - fais npm i @whiskeysockets/baileys@latest");
    const code = await sockInstance.requestPairingCode(number);
    return code;
  }catch(e){
    // Si le socket est déjà connecté, on supprime auth et on regénère
    console.log("Pairing fail, reset auth:", e.message);
    if(fs.existsSync('auth')){
      fs.rmSync('auth', {recursive:true, force:true});
    }
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const sock = makeWASocket({
      logger: pino({ level: 'silent' }),
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
      browser: Browsers.ubuntu("Chrome"),
      printQRInTerminal: false,
    });
    sockInstance = sock;
    sock.ev.on('creds.update', saveCreds);
    await new Promise(r=>setTimeout(r,2000));
    const code = await sock.requestPairingCode(number);
    return code;
  }
}

app.get('/api/status', (req, res) => {
  res.json({
    status: botStatus,
    total: (sockInstance?.user && botStatus.includes('Connecté'))? 1 : 0,
    bots: (sockInstance?.user && botStatus.includes('Connecté'))? [sockInstance.user.id.split(':')[0]] : []
  });
});

app.get('/api/bots', (req, res) => {
  if (sockInstance?.user && botStatus.includes('Connecté')) {
    const rawId = sockInstance.user.id;
    res.json({ total: 1, bots: [{ id: rawId, number: rawId.split(':')[0].split('@')[0], name: CONFIG.BOT_NAME, status: botStatus, connectedAt }] });
  } else res.json({ total: 0, bots: [] });
});

// Route GET - ton front l'utilise
app.get('/api/pair/:number', async (req, res) => {
  try {
    const num = req.params.number.replace(/[^0-9]/g, '');
    if(!num || num.length<8) return res.json({ error: "Numéro invalide" });
    console.log("Demande pairing pour:", num);
    const code = await getPairingCode(num);
    console.log("Code généré:", code);
    res.json({ code });
  } catch (e) {
    console.error("PAIR ERROR:", e);
    res.json({ error: e.message });
  }
});

// Route POST - compatibilité
app.post('/api/pair', async (req, res) => {
  try {
    const num = (req.body.number || req.body.num || req.body.phone || "").toString().replace(/[^0-9]/g, '');
    if(!num) return res.json({ error: "Numéro manquant" });
    const code = await getPairingCode(num);
    res.json({ code });
  } catch (e) { res.json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`🚀 SASUKE V36 RUN ${PORT}`));
startBot();
