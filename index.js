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
${CONFIG.WEBSITE}
`;

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
${SIGNATURE}
`;

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
          const txt = `╭──〔 *BIENVENUE* 〕──\n│ 👤 @${p.split('@')[0]}\n│ 🏷️ ${metadata.subject}\n│ 👥 ${metadata.participants.length} membres\n╰──\n\nBienvenue! Tape *.menu*\n📢 \( {CONFIG.CHANNEL} \){SIGNATURE}`;
          if (logo) await sock.sendMessage(anu.id, { image: logo, caption: txt, mentions: [p] });
          else await sock.sendMessage(anu.id, { text: txt, mentions: [p] });
        }
        if (anu.action === 'remove') {
          const txt = `╭──〔 *GOODBYE* 〕──\n│ 👤 @${p.split('@')[0]}\n╰──\nAurevoir! 👋\n📢 \( {CONFIG.CHANNEL} \){SIGNATURE}`;
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
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = msg.key.participant || from;

    // Extraction robuste du texte
    let body = "";
    if (msg.message.conversation) body = msg.message.conversation;
    else if (msg.message.extendedTextMessage?.text) body = msg.message.extendedTextMessage.text;
    else if (msg.message.imageMessage?.caption) body = msg.message.imageMessage.caption;
    else if (msg.message.videoMessage?.caption) body = msg.message.videoMessage.caption;
    else if (msg.message.buttonsResponseMessage?.selectedButtonId) body = msg.message.buttonsResponseMessage.selectedButtonId;
    else if (msg.message.listResponseMessage?.singleSelectReply?.selectedRowId) body = msg.message.listResponseMessage.singleSelectReply.selectedRowId;

    // ===== ANTILINK =====
    if (isGroup && antilinkDB.has(from)) {
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

    const argsArray = body.slice(1).trim().split(/ +/);
    const cmd = argsArray[0].toLowerCase();
    const args = argsArray.slice(1).join(' ');
    const reply = (t) => sock.sendMessage(from, { text: t + SIGNATURE }, { quoted: msg });

    // ===== MENU =====
    if (cmd === 'menu') {
      const logo = fs.existsSync('./public/logo.jpg') ? fs.readFileSync('./public/logo.jpg') : null;
      if (logo) await sock.sendMessage(from, { image: logo, caption: MENU36 }, { quoted: msg });
      else reply(MENU36);
    }

    // ===== PING =====
    if (cmd === 'ping') {
      const start = Date.now();
      await sock.sendMessage(from, { 
        text: `*Pong!* 🏓\n⏱️ Latence : *\( {Date.now() - start} ms* \){SIGNATURE}` 
      }, { quoted: msg });
    }

    // ===== ALIVE / OWNER =====
    if (cmd === 'alive') reply(`*✅ ${CONFIG.BOT_NAME} ON*\n⏰ ${connectedAt || "N/A"}`);
    if (cmd === 'owner' || cmd === 'chaine') reply(CONFIG.CHANNEL);

    // ===== .VV (VUE UNIQUE) =====
    if (cmd === 'vv') {
      try {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) return reply("Réponds à une *vue unique* avec *.vv*");

        let viewOnceMsg = quoted.viewOnceMessage 
          || quoted.viewOnceMessageV2 
          || quoted.viewOnceMessageV2Extension 
          || quoted;

        const content = viewOnceMsg.message || viewOnceMsg;
        const type = Object.keys(content)[0];

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

        if (type === 'imageMessage') {
          await sock.sendMessage(from, { 
            image: buffer, 
            caption: (content.imageMessage?.caption || "✅ Vue unique récupérée") + SIGNATURE
          }, { quoted: msg });
        } else {
          await sock.sendMessage(from, { 
            video: buffer, 
            caption: (content.videoMessage?.caption || "✅ Vue unique récupérée") + SIGNATURE
          }, { quoted: msg });
        }
      } catch (e) {
        console.error("Erreur .vv:", e);
        reply("❌ Impossible de récupérer la vue unique.");
      }
    }

    // ===== ANTILINK =====
    if (cmd === 'antilink') {
      if (!isGroup) return reply("❌ Commande réservée aux groupes");
      if (args === 'on') { 
        antilinkDB.add(from); 
        reply("*✅ ANTILINK activé*"); 
      } else if (args === 'off') { 
        antilinkDB.delete(from); 
        reply("*❌ ANTILINK désactivé*"); 
      } else {
        reply("*.antilink on / off*");
      }
    }

    // ===== TAGALL / HIDETAG =====
    if (cmd === 'tagall' || cmd === 'hidetag') {
      if (!isGroup) return reply("❌ Commande réservée aux groupes");
      try {
        const meta = await sock.groupMetadata(from);
        const mentions = meta.participants.map(p => p.id);
        await sock.sendMessage(from, { 
          text: (args || "*📢 Mention de tous les membres*") + SIGNATURE, 
          mentions 
        });
      } catch (e) {
        reply("❌ Erreur lors du tag.");
      }
    }

    // ===== .OPEN / .CLOSE =====
    if (cmd === 'open' || cmd === 'close') {
      if (!isGroup) return reply("❌ Commande réservée aux groupes");
      
      try {
        const meta = await sock.groupMetadata(from);
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const botIsAdmin = meta.participants.find(p => p.id === botId || p.id === sock.user.id)?.admin;
        const senderIsAdmin = meta.participants.find(p => p.id === sender)?.admin;

        if (!botIsAdmin) return reply("❌ Le bot doit être *admin*.");
        if (!senderIsAdmin) return reply("❌ Seuls les *admins* peuvent utiliser cette commande.");

        if (cmd === 'close') {
          await sock.groupSettingUpdate(from, 'announcement');
          reply("🔒 *Groupe fermé*\nSeuls les admins peuvent écrire.");
        } else {
          await sock.groupSettingUpdate(from, 'not_announcement');
          reply("🔓 *Groupe ouvert*\nTout le monde peut écrire.");
        }
      } catch (e) {
        console.error("Erreur open/close:", e);
        reply("❌ Impossible de modifier les paramètres du groupe.");
      }
    }

    // ===== KICK / PROMOTE / DEMOTE / ADD =====
    if (['kick', 'promote', 'demote', 'add'].includes(cmd)) {
      if (!isGroup) return reply("❌ Commande réservée aux groupes");
      
      try {
        const meta = await sock.groupMetadata(from);
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const botIsAdmin = meta.participants.find(p => p.id === botId || p.id === sock.user.id)?.admin;
        const senderIsAdmin = meta.participants.find(p => p.id === sender)?.admin;

        if (!botIsAdmin) return reply("❌ Le bot doit être admin.");
        if (!senderIsAdmin) return reply("❌ Seuls les admins peuvent utiliser cette commande.");

        let target = null;
        if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
          target = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
          target = msg.message.extendedTextMessage.contextInfo.participant;
        } else if (args) {
          const num = args.replace(/[^0-9]/g, '');
          if (num) target = num + '@s.whatsapp.net';
        }

        if (!target) return reply(`Mentionne quelqu'un ou réponds à son message.\nExemple: *.${cmd} @user*`);

        if (cmd === 'kick') {
          await sock.groupParticipantsUpdate(from, [target], 'remove');
          reply(`✅ @${target.split('@')[0]} a été retiré.`);
        } else if (cmd === 'promote') {
          await sock.groupParticipantsUpdate(from, [target], 'promote');
          reply(`✅ @${target.split('@')[0]} est maintenant admin.`);
        } else if (cmd === 'demote') {
          await sock.groupParticipantsUpdate(from, [target], 'demote');
          reply(`✅ @${target.split('@')[0]} n'est plus admin.`);
        } else if (cmd === 'add') {
          await sock.groupParticipantsUpdate(from, [target], 'add');
          reply(`✅ Membre ajouté.`);
        }
      } catch (e) {
        console.error(e);
        reply("❌ Échec de l'action.");
      }
    }

    // ===== .LINK =====
    if (cmd === 'link') {
      if (!isGroup) return reply("❌ Commande réservée aux groupes");
      try {
        const code = await sock.groupInviteCode(from);
        reply(`🔗 Lien du groupe :\nhttps://chat.whatsapp.com/${code}`);
      } catch (e) {
        reply("❌ Impossible de récupérer le lien (le bot doit être admin).");
      }
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
    res.json({ 
      error: e.message || "Impossible de générer le code." 
    });
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
