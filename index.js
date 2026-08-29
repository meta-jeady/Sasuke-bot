const express = require('express');
const app = express();
const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
app.use(express.static('public')); app.use(express.json());
const PORT = process.env.PORT || 10000;
let sockInstance=null, botStatus="Déconnecté", connectedAt=null;

const CONFIG = {
  PREFIX: ".",
  BOT_NAME: "SASUKE-BOT V38",
  OWNER: "237687960259",
  CHANNEL: "https://whatsapp.com/channel/0029VbE0WHTKWEKo9iyxl43e"
};

const messageCache = new Map();

const MENU_COMPLET = `
*╭━━━〔 SASUKE-BOT V38 〕━━━┈⊷*
*│ 👑 Owner: 237687960259*
*│ 🤖 Bot: ${CONFIG.BOT_NAME}*
*│ ⚡ Prefix: ${CONFIG.PREFIX}*
*│ ✅ Anti-Delete: AUTO ON*
*│*
*├─〔 BIENVENUE & BYE 〕*
*│ • Auto Welcome avec logo*
*│ • Auto Bye Bye avec logo*
*│*
*├─〔 GENERAL 〕*
*│ • ${CONFIG.PREFIX}menu*
*│ • ${CONFIG.PREFIX}ping*
*│ • ${CONFIG.PREFIX}alive*
*│ • ${CONFIG.PREFIX}owner*
*│ • ${CONFIG.PREFIX}chaine*
*│ • ${CONFIG.PREFIX}vv*
*│*
*├─〔 🔥 5 CMD IMPORTANTES 〕*
*│ • ${CONFIG.PREFIX}antidelete*
*│ • ${CONFIG.PREFIX}kick @*
*│ • ${CONFIG.PREFIX}promote @*
*│ • ${CONFIG.PREFIX}demote @*
*│ • ${CONFIG.PREFIX}sticker*
*│ • ${CONFIG.PREFIX}del*
*│*
*├─〔 GROUPE 〕*
*│ • ${CONFIG.PREFIX}tagall*
*│ • ${CONFIG.PREFIX}hidetag*
*│ • ${CONFIG.PREFIX}antilink on/off*
*│ • ${CONFIG.PREFIX}kick*
*│ • ${CONFIG.PREFIX}promote*
*│ • ${CONFIG.PREFIX}demote*
*│*
*├─〔 AUTO 〕*
*│ ✅ Anti-Delete auto -> IB*
*│ ✅ Welcome logo auto*
*│ ✅ Bye Bye logo auto*
*│ ✅ Antilink auto*
*│*
*╰━━━━━━━━━━━━━━━━┈⊷*
*📢 ${CONFIG.CHANNEL}*
*💬 Répond en IB + Groupe*
`;

function getLogo(){
  const paths=['./public/logo.jpg','./public/logo.png','./logo.jpg','./public/logo.jpeg'];
  for(let p of paths) if(fs.existsSync(p)) return fs.readFileSync(p);
  return null;
}

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
    browser: Browsers.ubuntu("Chrome"),
    syncFullHistory: true,
  });
  sockInstance=sock;
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', u=>{
    if(u.connection==='open'){ botStatus="Connecté ✅"; connectedAt=new Date().toLocaleString(); console.log('✅ V38 CONNECTE - ANTI-DELETE AUTO'); }
    if(u.connection==='close') setTimeout(startBot, 3000);
  });

  // WELCOME & BYE BYE
  sock.ev.on('group-participants.update', async anu=>{
    try{
      const meta = await sock.groupMetadata(anu.id); const logo=getLogo();
      for(let p of anu.participants){
        if(anu.action==='add'){
          const txt=`*╭──〔 BIENVENUE 〕──*\n*│ 👤 @${p.split('@')[0]}*\n*│ 🏷️ ${meta.subject}*\n*│ 👥 ${meta.participants.length} membres*\n*╰──*\n\n📢 *${CONFIG.CHANNEL}*`;
          if(logo) await sock.sendMessage(anu.id,{image:logo,caption:txt,mentions:[p]}); else await sock.sendMessage(anu.id,{text:txt,mentions:[p]});
        }
        if(anu.action==='remove'){
          const txt=`*╭──〔 BYE BYE 〕──*\n*│ 👤 @${p.split('@')[0]}*\n*│*\n*│ ~ merci de quitter le groupe chasse que ont s'en fout de toi 🥲*\n*╰──*\n\n📢 *${CONFIG.CHANNEL}*`;
          if(logo) await sock.sendMessage(anu.id,{image:logo,caption:txt,mentions:[p]}); else await sock.sendMessage(anu.id,{text:txt,mentions:[p]});
        }
      }
    }catch{}
  });

  // MESSAGE + ANTI-DELETE AUTO
  sock.ev.on('messages.upsert', async ({messages})=>{
    const msg=messages[0]; if(!msg.message) return;
    const from=msg.key.remoteJid; const isGroup=from.endsWith('@g.us');
    const body=msg.message.conversation||msg.message.extendedTextMessage?.text||msg.message.imageMessage?.caption||msg.message.videoMessage?.caption||"";
    const sender=msg.key.participant||from;

    if(!msg.key.fromMe &&!msg.message.protocolMessage){
      messageCache.set(msg.key.id, { content: msg.message, from, sender, time: new Date() });
      if(messageCache.size>500) messageCache.delete(messageCache.keys().next().value);
    }

    if(msg.message.protocolMessage && msg.message.protocolMessage.type===0){
      const delKey=msg.message.protocolMessage.key;
      const cached=messageCache.get(delKey.id);
      if(cached){
        const ownerJid=CONFIG.OWNER+"@s.whatsapp.net";
        try{
          const type=Object.keys(cached.content)[0];
          let cap=`*🚨 ANTI-DELETE AUTO 🚨*\n\n*👤 @${cached.sender.split('@')[0]}*\n*📍 ${cached.from}*\n*🕒 ${cached.time.toLocaleString()}*\n`;
          if(type==='conversation' || type==='extendedTextMessage'){
            cap+=`\n*💬 Message:*\n${cached.content.conversation||cached.content.extendedTextMessage?.text}`;
            await sock.sendMessage(ownerJid,{text:cap,mentions:[cached.sender]});
          }else if(type==='imageMessage'){
            await sock.sendMessage(ownerJid,{text:cap+`\n*📸 Image supprimée*`,mentions:[cached.sender]});
            await sock.sendMessage(ownerJid,{image:cached.content.imageMessage});
          }else if(type==='videoMessage'){
            await sock.sendMessage(ownerJid,{text:cap+`\n*🎥 Vidéo supprimée*`,mentions:[cached.sender]});
            await sock.sendMessage(ownerJid,{video:cached.content.videoMessage});
          }else{
            await sock.sendMessage(ownerJid,{text:cap+`\n*📎 ${type} supprimé*`,mentions:[cached.sender]});
          }
        }catch(e){}
      }
    }

    if(!body.startsWith(CONFIG.PREFIX)) return;
    const cmd=body.slice(1).trim().split(/ +/)[0].toLowerCase();
    const args=body.slice(1).trim().split(/ +/).slice(1);
    const argsJoin=args.join(' ');
    const logo=getLogo();
    const reply=(t)=>sock.sendMessage(from,{text:t},{quoted:msg});
    const replyLogo=(t)=>{ if(logo) return sock.sendMessage(from,{image:logo,caption:t},{quoted:msg}); else return reply(t); };

    // MENU AVEC LOGO
    if(cmd==='menu' || cmd==='help'){
      if(logo) await sock.sendMessage(from,{image:logo,caption:MENU_COMPLET},{quoted:msg});
      else reply(MENU_COMPLET);
    }

    if(cmd==='ping') reply(`*Pong!* 🏓 ${Date.now()%1000}ms\n*${CONFIG.BOT_NAME}*`);
    if(cmd==='alive') replyLogo(`*✅ ${CONFIG.BOT_NAME} ONLINE*\n*⏰ ${connectedAt}*\n*Anti-Delete: AUTO ✅*\n*📢 ${CONFIG.CHANNEL}*`);
    if(cmd==='owner' || cmd==='chaine' || cmd==='channel') reply(`*📢 Chaine Officielle:*\n*${CONFIG.CHANNEL}*`);
    if(cmd==='antidelete') reply(`*✅ ANTI-DELETE AUTO ACTIF*\nTous les msg supprimés vont en IB automatiquement`);

    if(cmd==='vv'){
      const q=msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
      if(!q) return reply("*Réponds à vue unique*");
      const v=q.viewOnceMessage||q.viewOnceMessageV2||q; const c=v.message||v; const t=Object.keys(c)[0];
      if(t==='imageMessage') await sock.sendMessage(from,{image:c.imageMessage},{quoted:msg});
      if(t==='videoMessage') await sock.sendMessage(from,{video:c.videoMessage},{quoted:msg});
    }

    if(cmd==='antilink'){
      if(!isGroup) return;
      if(argsJoin==='on'){ sock.antilink=1; reply("*✅ ANTILINK ON*"); }
      else reply("*❌ ANTILINK OFF*");
    }

    if(cmd==='tagall' || cmd==='hidetag'){
      if(!isGroup) return;
      const meta=await sock.groupMetadata(from);
      await sock.sendMessage(from,{text:argsJoin||`*📢 ${CONFIG.BOT_NAME}*`,mentions:meta.participants.map(p=>p.id)});
    }

    if(cmd==='kick'){
      if(!isGroup) return;
      const jid=msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if(jid) await sock.groupParticipantsUpdate(from,[jid],"remove");
    }

    if(cmd==='promote' || cmd==='demote'){
      if(!isGroup) return;
      const jid=msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if(jid) await sock.groupParticipantsUpdate(from,[jid],cmd);
    }

    if(cmd==='sticker' || cmd==='s'){
      const q=msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
      const m=q||msg.message;
      if(m.imageMessage||m.videoMessage){
        const buf=await downloadMediaMessage({key:msg.key,message:m},'buffer',{}, {logger:pino({level:'silent'}),reuploadRequest:sock.updateMediaMessage});
        await sock.sendMessage(from,{sticker:buf},{quoted:msg});
      }
    }

    if(cmd==='del'){
      const qid=msg.message.extendedTextMessage?.contextInfo?.stanzaId;
      const qp=msg.message.extendedTextMessage?.contextInfo?.participant;
      if(qid) await sock.sendMessage(from,{delete:{remoteJid:from,fromMe:false,id:qid,participant:qp}});
    }
  });
}

async function getPairingCode(n){
  if(!sockInstance){
    const { state } = await useMultiFileAuthState('auth');
    const s = makeWASocket({ logger:pino({level:'silent'}), auth:{ creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys,pino({level:'silent'})) }, browser: Browsers.ubuntu("Chrome") });
    sockInstance=s; await new Promise(r=>setTimeout(r,1500));
  }
  try{ return await sockInstance.requestPairingCode(n); }
  catch(e){
    if(fs.existsSync('auth')) fs.rmSync('auth',{recursive:true,force:true});
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const s = makeWASocket({ logger:pino({level:'silent'}), auth:{ creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys,pino({level:'silent'})) }, browser: Browsers.ubuntu("Chrome") });
    sockInstance=s; s.ev.on('creds.update',saveCreds);
    await new Promise(r=>setTimeout(r,2000)); return await s.requestPairingCode(n);
  }
}

app.get('/api/status',(req,res)=>res.json({status:botStatus,total:sockInstance?.user?1:0}));
app.get('/api/bots',(req,res)=>{
  if(sockInstance?.user) res.json({total:1,bots:[{id:sockInstance.user.id,number:sockInstance.user.id.split(':')[0],name:CONFIG.BOT_NAME,status:botStatus,connectedAt}]});
  else res.json({total:0,bots:[]});
});
app.get('/api/pair/:number', async (req,res)=>{ try{ res.json({code:await getPairingCode(req.params.number.replace(/[^0-9]/g,''))}); }catch(e){res.json({error:e.message});} });
app.post('/api/pair', async (req,res)=>{ try{ res.json({code:await getPairingCode((req.body.number||"").replace(/[^0-9]/g,''))}); }catch(e){res.json({error:e.message});} });
app.listen(PORT,()=>console.log(`🚀 V38 MENU COMPLET ${PORT}`));
startBot();
