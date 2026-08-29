const express = require('express');
const app = express();
const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  makeCacheableSignalKeyStore, 
  Browsers,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

app.use(express.static('public'));
app.use(express.json());

const PORT = process.env.PORT || 10000;
let sockInstance = null;
let botStatus = "Déconnecté";
let connectedAt = null;
let lastPairingCode = null;

const CONFIG = {
  PREFIX: ".",
  BOT_NAME: "SASUKE-BOT",
  OWNER: "237687960259",
  CHANNEL: "https://whatsapp.com/channel/0029VbE0WHTKWEKo9iyxl43e",
  WEBSITE: "https://sasuke-bot-guk6.onrender.com/"
};

const SIGNATURE = `
────────────────────
*Connecte-toi aussi au bot 👇👇*
${CONFIG.WEBSITE}`;

const MENU36 = `
╭──〔 *GENERAL* 〕──
│ *.menu* - Affiche ce menu
│ *.ping* - Vitesse du bot
│ *.alive* - Vérifie si bot est ON
│ *.owner* - Numéro du proprio
│ *.chaine* - Lien de la chaine
│ *.vv* - Récupère vue unique
╰──
╭──〔 *GROUPE* 〕──
│ *.tagall* - Mentionne tous
│ *.hidetag* - Tag caché
│ *.kick* - Retire un membre
│ *.add* - Ajoute un membre
│ *.promote* - Passe admin
│ *.demote* - Retire admin
│ *.link* - Lien du groupe
│ *.close* - Ferme le groupe
│ *.open* - Ouvre le groupe
│ *.antilink on/off* - Anti lien auto
╰──
╭──〔 *AUTO* 〕──
│ *Welcome* - Bienvenue auto ✅
│ *Goodbye* - Au revoir auto ✅
╰──
*📢 ${CONFIG.CHANNEL}*
${SIGNATURE}`;

const antilinkDB = new Set();

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
    const { connection, qr } = update;

    if (qr && !sock.authState.creds.registered) {
      botStatus = "En attente de pairing...";
    }

    if (connection === 'open') {
      botStatus = "Connecté ✅";
      connectedAt = new Date().toLocaleString();
      lastPairingCode = null;
      console.log("✅ Bot connecté");
    }

    if (connection === 'close') {
      botStatus = "Déconnecté - Reconnexion...";
      console.log("🔄 Reconnexion dans 3s...");
      setTimeout(startBot, 3000);
    }
  });

  // ===== WELCOME / GOODBYE =====
  sock.ev.on('group-participants.update', async (anu) => {
    try {
      const metadata = await sock.groupMetadata(anu.id);
      const logo = fs.existsSync('./public/logo.jpg') ? fs.readFileSync('./public/logo.jpg') : null;

      for (let p of anu.participants) {
        if (anu.action === 'add') {
          const txt = `╭──〔 *BIENVENUE* 〕──\n│ 👤 @${p.split('@')[0]}\n│ 🏷️ ${metadata.subject}\n│ 👥 \( {metadata.participants.length} membres\n╰──\n\nBienvenue! Tape *.menu* \){SIGNATURE}`;
          if (logo) await sock.sendMessage(anu.id, { image: logo, caption: txt, mentions: [p] });
          else await sock.sendMessage(anu.id, { text: txt, mentions: [p] });
        }
        if (anu.action === 'remove') {
          const txt = `╭──〔 *GOODBYE* 〕──\n│ 👤 @\( {p.split('@')[0]}\n╰──\nAurevoir! 👋 \){SIGNATURE}`;
          if (logo) await sock.sendMessage(anu.id, { image: logo, caption: txt, mentions: [p] });
          else await sock.sendMessage(anu.id, { text: txt, mentions: [p] });
        }
      }
    } catch (e) {
      console.error("Erreur welcome/goodbye:", e.message);
    }
  });

  // ===== MESSAGES =====
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    const msg = messages[0];
    if (!msg.message) return;

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = msg.key.participant || from;

    // Extraction du texte
    let body = "";
    const m = msg.message;
    if (m.conversation) body = m.conversation;
    else if (m.extendedTextMessage?.text) body = m.extendedTextMessage.text;
    else if (m.imageMessage?.caption) body = m.imageMessage.caption;
    else if (m.videoMessage?.caption) body = m.videoMessage.caption;
    else if (m.buttonsResponseMessage?.selectedButtonId) body = m.buttonsResponseMessage.selectedButtonId;
    else if (m.listResponseMessage?.singleSelectReply?.selectedRowId) body = m.listResponseMessage.singleSelectReply.selectedRowId;
    else if (m.templateButtonReplyMessage?.selectedId) body = m.templateButtonReplyMessage.selectedId;

    body = (body || "").trim();

    // ===== ANTILINK =====
    if (isGroup && antilinkDB.has(from) && body) {
      if (/https:\/\/chat\.whatsapp\.com\/|https:\/\/whatsapp\.com\/channel\//i.test(body)) {
        try {
          const g = await sock.groupMetadata(from);
          const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
          const isAdmin = g.participants.find(p => p.id === sender)?.admin;
          const botAdmin = g.participants.find(p => p.id === botId || p.id === sock.user.id)?.admin;

          if (!isAdmin && botAdmin) {
            await sock.sendMessage(from, { delete: msg.key });
            await sock.sendMessage(from, { 
              text: `🚫 @${sender.split('@')[0]} Lien interdit!`, 
              mentions: [sender] 
            });
          }
        } catch (e) {}
      }
    }

    if (!body.startsWith(CONFIG.PREFIX)) return;

    const argsArray = body.slice(CONFIG.PREFIX.length).trim().split(/ +/);
    const cmd = (argsArray[0] || "").toLowerCase();
    const args = argsArray.slice(1).join(' ');

    const reply = async (text) => {
      await sock.sendMessage(from, { text: text + SIGNATURE }, { quoted: msg });
    };

    try {
      // ==================== MENU ====================
      if (cmd === 'menu') {
        try {
          if (fs.existsSync('./public/logo.jpg')) {
            const logo = fs.readFileSync('./public/logo.jpg');
            await sock.sendMessage(from, { image: logo, caption: MENU36 }, { quoted: msg });
          } else {
            await sock.sendMessage(from, { text: MENU36 }, { quoted: msg });
          }
        } catch (e) {
          await sock.sendMessage(from, { text: MENU36 }, { quoted: msg });
        }
        return;
      }

      // ==================== PING ====================
      if (cmd === 'ping') {
        const start = Date.now();
        const latency = Date.now() - start;
        await sock.sendMessage(from, { 
          text: `*Pong!* 🏓\n⏱️ Latence : *\( {latency} ms* \){SIGNATURE}` 
        }, { quoted: msg });
        return;
      }

      // ==================== ALIVE ====================
      if (cmd === 'alive') {
        await reply(`*✅ ${CONFIG.BOT_NAME} est en ligne*\n⏰ Connecté depuis : ${connectedAt || "N/A"}`);
        return;
      }

      // ==================== OWNER / CHAINE ====================
      if (cmd === 'owner' || cmd === 'chaine') {
        await reply(`*📢 Chaîne / Owner*\n${CONFIG.CHANNEL}`);
        return;
      }

      // ==================== VV (Vue Unique) ====================
      if (cmd === 'vv') {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) return reply("Réponds à une *vue unique* avec *.vv*");

        let viewOnceMsg = quoted.viewOnceMessage 
          || quoted.viewOnceMessageV2 
          || quoted.viewOnceMessageV2Extension 
          || quoted;

        const content = viewOnceMsg.message || viewOnceMsg;
        const type = Object.keys(content || {})[0];

        if (!['imageMessage', 'videoMessage'].includes(type)) {
          return reply("❌ Ce n'est pas une image ou une vidéo vue unique.");
        }

        const mediaMessage = {
          key: {
            remoteJid: from,
            id: msg.message.extendedTextMessage.contextInfo.stanzaId,
            fromMe: false,
            participant: msg.message.extendedTextMessage.contextInfo.participant
          },
          message: content
        };

        const buffer = await downloadMediaMessage(
          mediaMessage,
          'buffer',
          {},
          { 
            logger: pino({ level: 'silent' }),
            reuploadRequest: sock.updateMediaMessage 
          }
        );

        const caption = (content[type]?.caption || "✅ Vue unique récupérée") + SIGNATURE;

        if (type === 'imageMessage') {
          await sock.sendMessage(from, { image: buffer, caption }, { quoted: msg });
        } else {
          await sock.sendMessage(from, { video: buffer, caption }, { quoted: msg });
        }
        return;
      }

      // ==================== ANTILINK ====================
      if (cmd === 'antilink') {
        if (!isGroup) return reply("❌ Commande réservée aux groupes");
        if (args === 'on') {
          antilinkDB.add(from);
          return reply("*✅ ANTILINK activé*");
        } else if (args === 'off') {
          antilinkDB.delete(from);
          return reply("*❌ ANTILINK désactivé*");
        } else {
          return reply("Utilise : *.antilink on* ou *.antilink off*");
        }
      }

      // ==================== TAGALL / HIDETAG ====================
      if (cmd === 'tagall' || cmd === 'hidetag') {
        if (!isGroup) return reply("❌ Commande réservée aux groupes");
        const meta = await sock.groupMetadata(from);
        const mentions = meta.participants.map(p => p.id);
        await sock.sendMessage(from, { 
          text: (args || "*📢 Mention de tous les membres*") + SIGNATURE, 
          mentions 
        });
        return;
      }

      // ==================== OPEN / CLOSE ====================
      if (cmd === 'open' || cmd === 'close') {
        if (!isGroup) return reply("❌ Commande réservée aux groupes");

        const meta = await sock.groupMetadata(from);
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const botIsAdmin = meta.participants.find(p => p.id === botId || p.id === sock.user.id)?.admin;
        const senderIsAdmin = meta.participants.find(p => p.id === sender)?.admin;

        if (!botIsAdmin) return reply("❌ Le bot doit être *admin*.");
        if (!senderIsAdmin) return reply("❌ Seuls les *admins* peuvent utiliser cette commande.");

        if (cmd === 'close') {
          await sock.groupSettingUpdate(from, 'announcement');
          return reply("🔒 *Groupe fermé*\nSeuls les admins peuvent écrire.");
        } else {
          await sock.groupSettingUpdate(from, 'not_announcement');
          return reply("🔓 *Groupe ouvert*\nTout le monde peut écrire.");
        }
      }

      // ==================== KICK / PROMOTE / DEMOTE / ADD ====================
      if (['kick', 'promote', 'demote', 'add'].includes(cmd)) {
        if (!isGroup) return reply("❌ Commande réservée aux groupes");

        const meta = await sock.groupMetadata(from);
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const botIsAdmin = meta.participants.find(p => p.id === botId || p.id === sock.user.id)?.admin;
        const senderIsAdmin = meta.participants.find(p => p.id === sender)?.admin;

        if (!botIsAdmin) return reply("❌ Le bot doit être admin.");
        if (!senderIsAdmin) return reply("❌ Seuls les admins peuvent utiliser cette commande.");

        let target = null;
        const ctx = msg.message?.extendedTextMessage?.contextInfo;
        if (ctx?.mentionedJid?.[0]) target = ctx.mentionedJid[0];
        else if (ctx?.participant) target = ctx.participant;
        else if (args) {
          const num = args.replace(/[^0-9]/g, '');
          if (num) target = num + '@s.whatsapp.net';
        }

        if (!target) return reply(`Mentionne quelqu'un ou réponds à son message.\nExemple : *.${cmd} @user*`);

        if (cmd === 'kick') {
          await sock.groupParticipantsUpdate(from, [target], 'remove');
          return reply(`✅ @${target.split('@')[0]} a été retiré.`);
        }
        if (cmd === 'promote') {
          await sock.groupParticipantsUpdate(from, [target], 'promote');
          return reply(`✅ @${target.split('@')[0]} est maintenant admin.`);
        }
        if (cmd === 'demote') {
          await sock.groupParticipantsUpdate(from, [target], 'demote');
          return reply(`✅ @${target.split('@')[0]} n'est plus admin.`);
        }
        if (cmd === 'add') {
          await sock.groupParticipantsUpdate(from, [target], 'add');
          return reply(`✅ Membre ajouté.`);
        }
      }

      // ==================== LINK ====================
      if (cmd === 'link') {
        if (!isGroup) return reply("❌ Commande réservée aux groupes");
        try {
          const code = await sock.groupInviteCode(from);
          return reply(`🔗 Lien du groupe :\nhttps://chat.whatsapp.com/${code}`);
        } catch (e) {
          return reply("❌ Impossible de récupérer le lien (le bot doit être admin).");
        }
      }

    } catch (err) {
      console.error("Erreur commande:", err);
      await sock.sendMessage(from, { text: "❌ Une erreur est survenue." + SIGNATURE }, { quoted: msg });
    }
  });
}

// ========== API ==========

app.get('/api/status', (req, res) => {
  res.json({ 
    qr: null, 
    status: botStatus,
    lastCode: lastPairingCode 
  });
});

app.get('/api/bots', (req, res) => {
  if (sockInstance?.user && botStatus.includes('Connecté')) {
    const rawId = sockInstance.user.id;
    res.json({ 
      total: 1, 
      bots: [{ 
        id: rawId, 
        number: rawId.split(':')[0].split('@')[0], 
        name: CONFIG.BOT_NAME, 
        status: botStatus, 
        connectedAt 
      }] 
    });
  } else {
    res.json({ total: 0, bots: [] });
  }
});

app.get('/api/pair/:number', async (req, res) => {
  try {
    if (!sockInstance) {
      return res.json({ error: "Bot pas encore initialisé. Réessaie dans quelques secondes." });
    }

    const num = req.params.number.replace(/[^0-9]/g, '');
    if (!num || num.length < 8) {
      return res.json({ error: "Numéro invalide" });
    }

    if (sockInstance.authState.creds.registered) {
      return res.json({ 
        error: "Session déjà connectée. Pour regénérer un code, supprime le dossier 'auth' puis redémarre le bot.",
        alreadyRegistered: true
      });
    }

    const code = await sockInstance.requestPairingCode(num);
    const formatted = code.match(/.{1,4}/g)?.join('-') || code;
    
    lastPairingCode = formatted;
    botStatus = `Code généré : ${formatted}`;

    console.log(`🔐 Code de pairing pour ${num} : ${formatted}`);
    
    res.json({ 
      code: formatted,
      raw: code,
      number: num,
      expiresIn: "environ 1-2 minutes"
    });

  } catch (e) {
    console.error("Erreur pairing:", e.message);
    res.json({ error: e.message || "Impossible de générer le code." });
  }
});

app.post('/api/logout', async (req, res) => {
  try {
    if (sockInstance) {
      await sockInstance.logout().catch(() => {});
    }
    if (fs.existsSync('./auth')) {
      fs.rmSync('./auth', { recursive: true, force: true });
    }
    botStatus = "Déconnecté - Auth supprimée";
    lastPairingCode = null;
    sockInstance = null;
    res.json({ success: true, message: "Session supprimée. Redémarre le bot pour un nouveau pairing." });
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Serveur lancé sur le port ${PORT}`));
startBot();
