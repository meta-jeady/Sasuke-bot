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
  BOT_NAME: "kčø4p tech | SASUKE-BOT",
  OWNER: "kčø4p tech",
  CHANNEL: "https://whatsapp.com/channel/0029VbE0WHTKWEKo9iyxl43e"
};

const MENU36 = `
*╭━─━─━─〔 kčø4p tech | SASUKE-BOT V36 〕─━─━─━╮*
*│*
*│ 👑 Owner: kčø4p tech*
*│ 🤖 Bot: SASUKE-BOT V36*
*│ ⚡ Statut: En ligne ✅*
*│ 📅 Date: ${new Date().toLocaleDateString()}*
*│*
*├─━─━─━─〔 📌 MENU PRINCIPAL 〕─━─━─━*
*│*
*│ ╭──〔 👤 UTILITAIRE 〕──*
*│ │ ➜.menu - Menu principal*
*│ │ ➜.ping - Vitesse du bot*
*│ │ ➜.alive - Statut du bot*
*│ │ ➜.owner - Contact owner*
*│ │ ➜.chaine - Chaine officielle*
*│ │ ➜.pair 237... - Code d'appairage*
*│ ╰──────────────*
*│*
*│ ╭──〔 👥 GESTION GROUPE 〕──*
*│ │ ➜.tagall [txt] - Tag tous*
*│ │ ➜.hidetag [txt] - Tag invisible*
*│ │ ➜.kick @user - Éjecter*
*│ │ ➜.add 237... - Ajouter membre*
*│ │ ➜.promote @user - Passer admin*
*│ │ ➜.demote @user - Retirer admin*
*│ │ ➜.link - Lien du groupe*
*│ │ ➜.close - Fermer groupe*
*│ │ ➜.open - Ouvrir groupe*
*│ │ ➜.antilink on/off - Anti-lien*
*│ ╰──────────────*
*│*
*│ ╭──〔 🔒 SÉCURITÉ & AUTO 〕──*
*│ │ ➜.vv - Récupère vue unique*
*│ │ ➜ Welcome - Bienvenue auto ✅*
*│ │ ➜ Goodbye - Au revoir auto ✅*
*│ │ ➜ Antilink - Anti-lien auto ✅*
*│ ╰──────────────*
*│*
*│ ╭──〔 ⚙️ SYSTÈME 〕──*
*│ │ ➜ Préfixe: [. ]*
*│ │ ➜ Version: V36.1.0*
*│ │ ➜ Créateur: kčø4p tech*
*│ ╰──────────────*
*│*
*╰━─━─━─〔 🔚 FIN DU MENU 〕─━─━─━╯*
*📢 Chaine: ${CONFIG.CHANNEL}*
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
    if (update.connection === 'open') {
      botStatus = "Connecté ✅";
      connectedAt = new Date().toLocaleString();
    }
    if (update.connection === 'close') {
      botStatus = "Déconnecté - Reconnexion...";
      setTimeout(startBot, 3000);
    }
  });

  sock.ev.on('group-participants.update', async (anu) => {
    try {
      const metadata = await sock.groupMetadata(anu.id);
      const logo = fs.existsSync('./public/logo.jpg')? fs.readFileSync('./public/logo.jpg') : null;

      for (let p of anu.participants) {
        if (anu.action === 'add') {
          const welcomeTxt = `*╭━━〔 🎉 BIENVENUE CHEZ NOUS 〕━━╮*\n*│*\n*│ 👤 Utilisateur: @${p.split('@')[0]}*\n*│ 🏷️ Groupe: ${metadata.subject}*\n*│ 👥 Membres: ${metadata.participants.length}*\n*│ 🤖 Bot: kčø4p tech*\n*│*\n*│ Bienvenue dans la famille! 🥳*\n*│ Tape.menu pour voir les commandes*\n*│*\n*╰━━━━━━━━━━━━━━━━━━━━╯*\n\n*📢 Rejoins notre chaine officielle 👇*\n*${CONFIG.CHANNEL}*\n*View Channel 👆👆*`;
          if (logo) await sock.sendMessage(anu.id, { image: logo, caption: welcomeTxt, mentions: [p] });
          else await sock.sendMessage(anu.id, { text: welcomeTxt, mentions: [p] });
        }

        if (anu.action === 'remove') {
          const byeTxt = `*╭━━〔 👋 BYE BYE 〕━━╮*\n*│*\n*│ 👤 @${p.split('@')[0]}*\n*│*\n*│ Bye bye 👋*\n*│ Merci d'avoir quitté le groupe,*\n*│ sache qu'on s'en fout de toi 🫩*\n*│*\n*╰━━━━━━━━━━━━━━━━━━━━╯*\n\n*📢 Notre chaine:*\n*${CONFIG.CHANNEL}*\n*View Channel 👆👆*`;
          if (logo) await sock.sendMessage(anu.id, { image: logo, caption: byeTxt, mentions: [p] });
          else await sock.sendMessage(anu.id, { text: byeTxt, mentions: [p] });
        }
      }
    } catch (e) {}
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";
    const sender = msg.key.participant || from;

    if (isGroup && antilinkDB.has(from)) {
      if (/https:\/\/chat\.whatsapp\.com\/|https:\/\/whatsapp\.com\/channel\//i.test(body)) {
        try {
          const g = await sock.groupMetadata(from);
          const isAdmin = g.participants.find(p => p.id === sender)?.admin;
          const botAdmin = g.participants.find(p => p.id === sock.user.id)?.admin;
          if (!isAdmin && botAdmin) {
            await sock.sendMessage(from, { delete: msg.key });
            await sock.sendMessage(from, { text: `*🚫 @${sender.split('@')[0]} Lien interdit!*`, mentions: [sender] });
          }
        } catch {}
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
    if (cmd === 'ping') reply("*Pong! 🏓*\n*kčø4p tech*");
    if (cmd === 'alive') reply(`*✅ ${CONFIG.BOT_NAME} ON*\n*⏰ ${connectedAt}*\n*👑 Owner: kčø4p tech*`);
    if (cmd === 'owner' || cmd === 'chaine') reply(`*📢 Chaine kčø4p tech:*\n*${CONFIG.CHANNEL}*\n*View Channel 👆👆*`);

    if (cmd === 'pair') {
      if (!args) return reply("*❌ Usage:.pair 2376XXXXXXX*\n\n*Exemple:.pair 237687960259*");
      try {
        const num = args.replace(/[^0-9]/g, '');
        if (num.length < 8) return reply("*❌ Numéro invalide*");
        await reply(`*⏳ Génération du code pour ${num}...*`);
        const code = await sock.requestPairingCode(num);
        await reply(`*╭──〔 🔑 PAIRING CODE 〕──*\n*│*\n*│ ➜ Code: ${code}*\n*│ ➜ Numéro: ${num}*\n*│*\n*│ 1. Ouvre WhatsApp*\n*│ 2. Appareils liés > Lier*\n*│ 3. Colle le code*\n*│*\n*╰──*\n*📢 ${CONFIG.CHANNEL}*`);
      } catch (e) { reply(`*❌ Erreur: ${e.message}*`); }
    }

    if (cmd === 'vv') {
      const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted) return reply("*Réponds à une vue unique avec.vv*");
      let viewOnce = quoted.viewOnceMessage || quoted.viewOnceMessageV2 || quoted.viewOnceMessageV2Extension || quoted;
      const content = viewOnce.message || viewOnce;
      const type = Object.keys(content)[0];
      if (type === 'imageMessage') await sock.sendMessage(from, { image: content.imageMessage, caption: content.imageMessage.caption || "" }, { quoted: msg });
      else if (type === 'videoMessage') await sock.sendMessage(from, { video: content.videoMessage, caption: content.videoMessage.caption || "" }, { quoted: msg });
      else reply("*❌ Impossible*");
    }

    if (cmd === 'antilink') {
      if (!isGroup) return;
      if (args === 'on') { antilinkDB.add(from); reply("*✅ ANTILINK activé*"); }
      else if (args === 'off') { antilinkDB.delete(from); reply("*❌ ANTILINK désactivé*"); }
      else reply("*.antilink on / off*");
    }

    if (cmd === 'tagall' || cmd === 'hidetag') {
      if (!isGroup) return;
      const meta = await sock.groupMetadata(from);
      const mentions = meta.participants.map(p => p.id);
      await sock.sendMessage(from, { text: args || "*📢 Mention @kčø4p tech*", mentions });
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

app.listen(PORT, () => console.log(`🚀 kčø4p tech RUN ${PORT}`));
startBot();
