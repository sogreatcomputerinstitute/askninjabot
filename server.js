// ================== ASK NINJA ULTIMATE BOT ==================
// Install:
// npm install node-telegram-bot-api lowdb node-cron axios sharp @google/generative-ai

const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");
const sharp = require("sharp");
const fs = require("fs");
const axios = require("axios");
const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ================== CONFIG ==================
const TOKEN = "8672407668:AAEa5IMAS4oXdu1zlK4pGyYxMSpR_6HupHU";
const GEMINI_KEY = "AIzaSyDKoX-GHbEcbLREc5DyaVLC5seX8XkeVpQ";
const MAIN_CHANNEL = "@askninja";
const app = express();
// ================== INIT ==================
const bot = new TelegramBot(TOKEN, { polling: true });
const db = new Low(
  new JSONFile("db.json"),
  { vip: [], vipKeys: [], users: {}, leaderboard: {}, vipChannels: {} } // Default data required
);

async function initDB() {
  await db.read();
  await db.write();
}

app.get("/", (req, res) => {
  res.send("Bot is alive 🚀");
});
// ================== GEMINI ==================
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

async function ai(prompt) {
  const res = await model.generateContent(prompt);
  const text = await res.response.text();
  return text;
}

// ================== HELPERS ==================
function isVIP(id) {
  return db.data.vip.includes(id);
}

// ================== IMAGE GENERATOR ==================
async function createCodeImage(code, file = "code.png") {
  const svg = `
  <svg width="1000" height="600">
    <style>
      .bg { fill: #0f172a; }
      .txt { fill: #ffffff; font-size: 18px; font-family: monospace; white-space: pre; }
    </style>
    <rect width="100%" height="100%" class="bg"/>
    <text x="20" y="50" class="txt">
${code.replace(/&/g, "&amp;").replace(/</g, "&lt;")}
    </text>
  </svg>`;

  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

// ================== START ==================
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
`🔥 Welcome to Ask Ninja Bot

Use /viptools to see premium features
Unlock VIP using a key`);
});

// ================== ADMIN BACKDOOR ==================
bot.on("message", async (msg) => {
  if (msg.text === "adminbrian") {
    if (!isVIP(msg.chat.id)) {
      db.data.vip.push(msg.chat.id);
      await db.write();
      bot.sendMessage(msg.chat.id, "🔥 Admin VIP unlocked");
    }
  }
});

// ================== VIP KEYS ==================
bot.onText(/\/genvip/, async (msg) => {
  const key = "VIP" + Math.random().toString(36).substring(2, 8);
  db.data.vipKeys.push({ key, used: false });
  await db.write();
  bot.sendMessage(msg.chat.id, "Key: " + key);
});

bot.on("message", async (msg) => {
  const key = db.data.vipKeys.find(k => k.key === msg.text && !k.used);
  if (key) {
    key.used = true;
    db.data.vip.push(msg.chat.id);
    await db.write();
    bot.sendMessage(msg.chat.id, "🔥 VIP Activated");
  }
});

// ================== VIP COMMANDS ==================
bot.onText(/\/viptools/, (msg) => {
  bot.sendMessage(msg.chat.id,
`🔥 VIP COMMANDS

/generate
/debug
/refactor
/roadmap
/tutorials
/templates
/cheatsheets
/genimage
/myskills
/leaderboard
/setchannel
/alerts
/vipjobs`);
});

// ================== AI FEATURES ==================

// ================== AI TUTOR ======================
bot.on("message", async (msg) => {
    if (!msg.text) return;

    const id = msg.chat.id;

    // Ignore commands
    if (msg.text.startsWith("/")) return;

    // Only respond in private chat
    if (msg.chat.type !== "private") return;

    // Check if user is VIP
    if (!db.data.vip.includes(id)) {
        return bot.sendMessage(id, "❌ You need VIP to use the AI Coding Tutor.\nUse your VIP key or upgrade to access.");
    }

    try {
        // AI Tutor prompt
        const prompt = `
You are a friendly coding teacher.
Explain simply with examples.
Answer this question from a VIP user:
${msg.text}
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const answer = response.text();

        bot.sendMessage(id, answer);

    } catch (e) {
        bot.sendMessage(id, "⚠️ AI error, please try again.");
    }
}); 

//============================ GENERATE =======================

bot.onText(/\/generate/, async (msg) => {
    const id = msg.chat.id;
    if(!db.data.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");

    bot.sendMessage(id,"💡 Send me a description of the code/project you want:");
    
    bot.once("message", async (descMsg) => {
        if(!db.data.vip.includes(id)) return;
        const prompt = `${descMsg.text}`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        bot.sendMessage(id, (await response.text()));
    });
});

// ==================== DEBUG =====================

bot.onText(/\/debug/, async(msg)=>{
    const id = msg.chat.id;
    if(!db.data.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");

    bot.sendMessage(id,"🛠️ Send the code you want me to debug/fix:");

    bot.once("message", async(codeMsg)=>{
        if(!db.data.vip.includes(id)) return;
        const prompt = `Debug this JavaScript code and suggest fixes/optimizations:\n${codeMsg.text}`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        bot.sendMessage(id, (await response.text()));
    });
});

//===================== AI PLANNER ==========================

bot.onText(/\/roadmap/, async(msg)=>{
    const id = msg.chat.id;
    if(!db.data.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");

    bot.sendMessage(id,"💡 Send me your current skills and goals:");
    
    bot.once("message", async(skillMsg)=>{
        const prompt = `Create a personalized programming roadmap based on this info:\n${skillMsg.text}`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        bot.sendMessage(id, (await response.text()));
    });
});


// ============================ REFACTOR ==================

bot.onText(/\/refactor/, async(msg)=>{
    const id = msg.chat.id;
    if(!db.data.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");

    bot.sendMessage(id,"🧹 Send me the messy code you want refactored:");

    bot.once("message", async(codeMsg)=>{
        const prompt = `Refactor this code to make it clean, optimized, and readable:\n${codeMsg.text}`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        bot.sendMessage(id, (await response.text()));
    });
});

// ========================== TUTORIALS ===================
bot.onText(/\/tutorials/, async(msg)=>{
    const id = msg.chat.id;
    if(!db.data.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");

    const prompt = `Provide a step-by-step JavaScript tutorial for a VIP user, include examples and exercises`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    bot.sendMessage(id, (await response.text()));
});

// ======================= TEMPLATE ======================

bot.onText(/\/templates/, async(msg)=>{
    const id = msg.chat.id;
    if(!db.data.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");
    
    bot.sendMessage(id, `📦 VIP Project Templates:
1. Telegram Bot Template
2. Web App Starter
3. Node.js REST API Starter
(You can request code with /generate command)`);
});

// =================== Cheat Sheets =====================

bot.onText(/\/cheatsheets/, async(msg)=>{
    const id = msg.chat.id;
    if(!db.data.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");

    bot.sendMessage(id, "📚 Download VIP programming cheatsheets:\nhttps://example.com/cheatsheets.zip");
});
1
// ================== IMAGE FEATURE ==================
bot.onText(/\/genimage (.+)/, async (msg, m) => {
  if (!isVIP(msg.chat.id)) return;

  const code = await ai("Generate code:\n" + m[1]);
  const img = await createCodeImage(code);

  bot.sendPhoto(msg.chat.id, img, { caption: "🔥 Code Image" });
  setTimeout(() => fs.unlinkSync(img), 5000);
});

// ================== LEADERBOARD ==================
bot.onText(/\/leaderboard/, (msg) => {
  if (!isVIP(msg.chat.id)) return;

  let text = "🏆 Leaderboard\n";
  for (let id in db.data.leaderboard) {
    text += `${id}: ${db.data.leaderboard[id]}\n`;
  }
  bot.sendMessage(msg.chat.id, text);
});

// ================== SKILLS ==================
bot.onText(/\/myskills/, (msg) => {
  if (!isVIP(msg.chat.id)) return;
  bot.sendMessage(msg.chat.id, "📊 Skill tracking coming soon");
});

// ================== VIP CHANNEL LINK ==================
bot.onText(/\/setchannel (.+)/, async (msg, m) => {
  if (!isVIP(msg.chat.id)) return;
  db.data.vipChannels[msg.chat.id] = m[1];
  await db.write();
  bot.sendMessage(msg.chat.id, "Channel linked");
});

// ================== FORWARD ==================
async function forwardVIP(text) {
  for (let id in db.data.vipChannels) {
    try {
      bot.sendMessage(db.data.vipChannels[id], text);
    } catch {}
  }
}

// ================== AUTO POSTS ==================
cron.schedule("0 9,14,20 * * *", async () => {
  const post = await ai("Short programming tip with code");

  const img = await createCodeImage(post);

  bot.sendPhoto(MAIN_CHANNEL, img, {
    caption: "🔥 Daily Coding Tip\n\n" + post
  });

  forwardVIP(post);
});

// ================== VIP CHALLENGE ==================
cron.schedule("0 19 * * *", async () => {
  const challenge = await ai("Advanced coding challenge");
  forwardVIP("🔥 VIP Challenge\n" + challenge);
});

// ================== JOB ALERT ==================
cron.schedule("0 10 * * *", async ()=>{
    db.data.vip.forEach(async id=>{
        const job = await scrapeFreelanceJob();
        if(!job) return;
        const post = await generateJobPost(job.title);
        bot.sendMessage(id, `💼 VIP Job Alert:\n${post}\nApply: ${job.link}`);
    });
});

//=================== VIP CHAT GROUP =========================
bot.onText(/\/vipchat/, async(msg)=>{
    const id = msg.chat.id;
    if(!db.data.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");
    bot.sendMessage(id,"👥 Join VIP private chat: https://t.me/joinchat/EXAMPLE");
});
// ====================== ASK ADMIN ============================
bot.onText(/\/askadmin/, async(msg)=>{
    const id = msg.chat.id;
    if(!db.data.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");
    bot.sendMessage(id,"💬 Send your question and the admin will respond shortly.");
});

// ----- Step 1: Set VIP Channel -----
bot.onText(/\/setchannel (.+)/, async (msg, match) => {
    const id = msg.chat.id;
    if(!db.data.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");

    const channel = match[1].trim(); // Example: @mychannel
    db.data.vipChannels ||= {};
    db.data.vipChannels[id] = channel;
    await db.write();

    bot.sendMessage(id, `✅ Your channel ${channel} is now linked. All posts and quizzes will be forwarded here.`);
});
// ========================== Forward to VIP ======================
async function forwardToVIPChannels(message, extraOptions = {}) {
    if(!db.data.vipChannels) return;

    for(const vipId in db.data.vipChannels){
        const channel = db.data.vipChannels[vipId];
        try {
            // Forward text message
            if(message.text){
                bot.sendMessage(channel, message.text, extraOptions);
            }
            // Forward photo/image
            if(message.photo){
                bot.sendPhoto(channel, message.photo, extraOptions);
            }
            // Forward quiz/poll
            if(message.poll){
                bot.sendPoll(channel, message.poll.question, message.poll.options, extraOptions);
            }
        } catch(e){
            console.log(`Error forwarding to ${channel}:`, e.message);
        }
    }
}

// ================== START ==================
app.listen(3000);
console.log("🚀 BOT RUNNING");
