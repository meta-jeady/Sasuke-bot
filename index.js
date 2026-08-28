const express = require('express');
const app = express();
const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const QRCode = require('qrcode');

app.use(express.static('public')); // <--- VA SERVIR TON INDEX.HTML
app.use(express.json());
const PORT = process.env.PORT || 10000;
let qrData = null, botStatus = "Déconnecté", sockInstance = null;
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
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
    browser: ["SASUKE-BOT", "Chrome", "1.0"],
  });
  sockInstance = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, qr } = u;
    if(qr){
      qrData = await QRCode.toDataURL(qr);
      botStatus = "QR Prêt - ou utilise Pairing Code";
    }
    if(connection === 'open'){
      qrData = null;
      botStatus = "Connecté ✅";
      connectedAt = new Date().toLocaleString();
      console.log("CONNECTE:", sock.user.id);
    }
    if(connection === 'close'){
      botStatus = "Déconnecté - Reconnexion...";
      setTimeout(startBot, 2000);
    }
  });

  sock.ev.on('group-participants.update', async (anu) => {
    try {
      const metadata = await sock.groupMetadata(anu.id);
      let logoBuffer = fs.existsSync('./public/logo.jpg')? fs.readFileSync('./public/logo.jpg') : null;
      for(let p of anu.participants){
        if(anu.action == 'add'){
          const txt = `╭──〔 BIENVENUE 〕──\n│ 👤 @${p.split('@')[0]}\n│ Groupe: ${metadata.subject}\n╰──\n\n📢 Rejoins ma chaine:\n${CONFIG.CHANNEL}\n\nTape.menu`;
          if(logoBuffer) await sock.sendMessage(anu.id, { image: logoBuffer, caption: txt, mentions: [p] });
          else await sock.sendMessage(anu.id, { text: txt, mentions: [p] });
        }
        if(anu.action == 'remove'){
          const txt = `╭──〔 AU REVOIR 〕──\n│ 👤 @${p.split('@')[0]}\n╰──\n\n📢 Ma chaine:\n${CONFIG.CHANNEL}`;
          if(logoBuffer) await sock.sendMessage(anu.id, { image: logoBuffer, caption: txt, mentions: [p] });
          else await sock.sendMessage(anu.id, { text: txt, mentions: [p] });
        }
      }
    } catch{}
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if(!msg.message || msg.key.fromMe) return;
    const from = msg.key.remoteJid;
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    if(!body.startsWith(CONFIG.PREFIX)) return;
    const cmd = body.slice(1).trim().split(/ +/)[0].toLowerCase();
    const reply = (t) => sock.sendMessage(from, { text: t }, { quoted: msg });

    if(cmd === 'menu'){
      let logo = fs.existsSync('./public/logo.jpg')? fs.readFileSync('./public/logo.jpg') : null;
      if(logo) await sock.sendMessage(from, { image: logo, caption: MENU36 }, {quoted: msg});
      else reply(MENU36);
    }
    if(cmd === 'ping') reply("Pong! 🏓");
    if(cmd === 'owner' || cmd === 'chaine') reply(`📢 MA CHAINE\n${CONFIG.CHANNEL}`);
  });
}

// --- API POUR TON INDEX.HTML ---
app.get('/api/status', (req,res)=> res.json({ qr: qrData, status: botStatus }));

app.get('/api/bots', (req,res)=>{
  if(sockInstance?.user && botStatus.includes('Connecté')){
    const rawId = sockInstance.user.id;
    const number = rawId.split(':')[0].split('@')[0];
    res.json({
      total: 1,
      bots: [{
        id: rawId,
        number: number,
        name: sockInstance.user.name || "SASUKE-BOT",
        status: botStatus,
        connectedAt: connectedAt
      }]
    });
  } else {
    res.json({ total: 0, bots: [] });
  }
});

app.get('/api/pair/:number', async (req,res)=>{
  try{
    if(!sockInstance) return res.json({error:"Bot pas prêt"});
    const num = req.params.number.replace(/[^0-9]/g,'');
    const code = await sockInstance.requestPairingCode(num);
    res.json({code});
  }catch(e){ res.json({error:e.message}); }
});

// SUPPRIME l'ancien app.get('/') - laisse public/index.html faire le travail

app.listen(PORT, ()=> console.log("SASUKE PAIRING MODE ON"));
startBot();
