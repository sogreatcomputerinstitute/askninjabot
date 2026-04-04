// ================== ASK NINJA ULTIMATE BOT ==================
// Install:
// npm install node-telegram-bot-api lowdb node-cron axios sharp @google/generative-ai@latest

const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");
const sharp = require("sharp");
const fs = require("fs");
const axios = require("axios");
const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config(); // LOAD THE VAULT FIRST

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;

// ================== INIT ==================
const TOKEN = process.env.TOKEN
const GEMINI_KEY = process.env.GEMINI_KEY
const MAIN_CHANNEL = "@ask_ninja";
const app = express();
app.use(express.json());
const bot = new TelegramBot(TOKEN);

// Your Render URL (e.g., https://your-app-name.onrender.com)
const url = process.env.RENDER_EXTERNAL_URL; 
const port = process.env.PORT || 3000;

// We add the token to the path so only Telegram knows where to send updates
bot.setWebHook(`${url}/bot${TOKEN}`);

// Create the Webhook Route
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body); // Send the data to your bot.on() listeners
  res.sendStatus(200);         // Tell Telegram "Got it!"
});


// Global DB object
let dbData = { vip: [], vipKeys: [], users: {}, leaderboard: {}, vipChannels: {} };

const gistHeaders = {
    Authorization: `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json'
};


// 1. Initialize Gemini globally so 'model' is accessible everywhere
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

async function initDB() {
    syncFromGist();
    console.log("📂 Database Synced");
}
initDB(); // Don't forget to call it

// ================== GEMINI ==================
async function ai(prompt) {
  // The Ninja Priority List (Latest 3.1 and Stable 2.5/2.0 versions)
  const modelStack = [
    "gemini-3.1-flash-lite-preview", 
    "gemini-2.5-flash-lite",         
    "gemini-2.0-flash-lite-001",     
    "gemini-flash-lite-latest",      
    "gemma-3-4b-it"                  
  ];

  // This is the core instruction that defines your bot's personality
  const ninjaInstructions = `
    You are ASK NINJA AI, an elite, high-speed coding and software development assistant. 
    Your tone is professional, helpful, and slightly witty.
    CRITICAL: Always refer to the user as "Prof. Brian". 
    If asked who you are, respond: "I am ASK NINJA AI, Deveveloped By Ask Ninja Co-operation I am here to help you with all your needs."
    Provide clear, concise code snippets and technical advice.
  `;

  for (const modelName of modelStack) {
    try {
      console.log(`🤖 Ninja attempting with: ${modelName}`);

      const currentModel = genAI.getGenerativeModel({ 
        model: modelName,
        systemInstruction: ninjaInstructions // <--- Persona injected here
      });

      const result = await currentModel.generateContent(prompt);
      const response = await result.response;
      
      return response.text();

    } catch (error) {
      // 429 = Quota, 404 = Not Found, 503 = Overloaded
      if (error.status === 429 || error.status === 404 || error.status === 503 error.status === 400) {
        console.warn(`⚠️ ${modelName} unavailable. Switching paths...`);
        continue; 
      }

      console.error(`❌ Error on ${modelName}:`, error.message);
      if (error.message.includes("safety")) break; 
    }
  }

  return "⚠️ *NINJA STATUS:* All AI neural paths are currently blocked (Daily Quota Reached). Please try again in a bit.";
}
async function listAllModels() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_KEY}`);
        const data = await response.json();
        
        console.log("--- 🕵️ NINJA MODEL LIST ---");
        data.models.forEach(m => {
            // Filter for models that support 'generateContent'
            if (m.supportedGenerationMethods.includes('generateContent')) {
                console.log(`Model: ${m.name.split('/')[1]}`);
                console.log(`Description: ${m.description}`);
                console.log('---------------------------');
            }
        });
    } catch (e) {
        console.log("Error fetching list:", e.message);
    }
}

listAllModels();

// ================== CONFIG ==================


// Read from Gist
async function syncFromGist() {
    try {
        const res = await axios.get(`https://api.github.com/gists/${GIST_ID}`, { headers: gistHeaders });
        const content = res.data.files['db.json'].content;
        dbData = JSON.parse(content);
        console.log("✅ DB Synced from GitHub Gist");
    } catch (e) {
        console.error("❌ Gist Read Error:", e.message);
    }
}

// Write to Gist
async function saveToGist() {
    try {
        await axios.patch(`https://api.github.com/gists/${GIST_ID}`, {
            files: {
                'db.json': {
                    content: JSON.stringify(dbData, null, 2)
                }
            }
        }, { headers: gistHeaders });
        console.log("💾 DB Saved to GitHub Gist");
    } catch (e) {
        console.error("❌ Gist Write Error:", e.message);
    }
}
// Check User Subscription
async function checkSubscription(userId) {
    try {
        const member = await bot.getChatMember(MAIN_CHANNEL, userId);
        const allowedStatuses = ["member", "administrator", "creator"];
        return allowedStatuses.includes(member.status);
    } catch (error) {
        console.error("Subscription Check Error:", error.message);
        // If the bot isn't an admin in the channel, this will fail.
        return false; 
    }
}

// Handler for the "Verify" button click
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;

    if (query.data === "check_sub") {
        const isSubscribed = await checkSubscription(userId);

        if (isSubscribed) {
            // Edit the original message to show success
            bot.editMessageText("🎉 Verification Successful! You can now use our service.", {
                chat_id: chatId,
                message_id: query.message.message_id
            });
            // Answer the callback to remove the loading state on the button
            bot.answerCallbackQuery(query.id, { text: "Access Granted!" });
        } else {
            bot.answerCallbackQuery(query.id, { 
                text: "❌ You haven't joined yet!", 
                show_alert: true 
            });
        }
    }
});


// Subscription Message
// Function to send the "Join Channel" message
async function sendJoinMessage(chatId) {
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "📢 Join Channel", url: `https://t.me/${MAIN_CHANNEL.replace('@', '')}` }
                ],
                [
                    { text: "✅ Verify Subscription", callback_data: "check_sub" }
                ]
            ]
        }
    };
    bot.sendMessage(chatId, "❌ You must subscribe to our channel to use this service. Please join and then click verify.", opts);
}



// ===================== END OF CONFIG =================
//============== PING ================
app.get("/", (req, res) => {
   (async () => {
  const myPrompt = "What are the benefits of using Node.js for AI integrations?";
  res.send(myPrompt);
})();
  
});
// ================== HELPERS ==================
async function isVIP(id) {
 //await syncFromGist()
  return dbData.vip.includes(id);
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

bot.onText(/\/start/, async (msg) => {
    // 1. Define chatId immediately using the msg object
    const chatId = msg.chat.id; 
    
    try {
        const isSubscribed = await checkSubscription(msg.from.id);
        
        if (!isSubscribed) {
            return sendJoinMessage(chatId); // Use the variable here
        }

        const startMsg = `🔥 *Welcome to Ask Ninja AI* \n\nWelcome, Prof. Brian! I am your advanced AI coding companion...`;
        
        // 2. Use 'chatId' (not 'msg.chat.id' or 'chatId' alone if undefined)
        await bot.sendMessage(chatId, startMsg, { parse_mode: "Markdown" });   
        
    } catch (err) {
        console.log("Start Error:", err);
        // 3. Send a simple hardcoded string in the catch block 
        // to avoid "startMsg is not defined" errors here.
        bot.sendMessage(chatId, "⚠️ Oops! Something went wrong. Try again in a moment.");
    }
});
// ================== ADMIN BACKDOOR ==================
bot.on("message", async (msg) => {
  if (msg.text === "adminbrian") {
    if (!isVIP(msg.chat.id)) {
      dbData.vip.push(msg.chat.id);
      await saveToGist(); // Save to GitHub
      bot.sendMessage(msg.chat.id, "🔥 Admin VIP unlocked and saved to Cloud");
    }
  }
});

// ================== VIP KEYS ==================
bot.onText(/\/genvip/, async (msg) => {
  const key = "VIP" + Math.random().toString(36).substring(2, 8);
  dbData.vipKeys.push({ key, used: false });
  await saveToGist();
  bot.sendMessage(msg.chat.id, "Key: " + key);
});

bot.on("message", async (msg) => {
  const key = dbData.vipKeys.find(k => k.key === msg.text && !k.used);
  if (key) {
    key.used = true;
    dbData.vip.push(msg.chat.id);
    await saveToGist();
    bot.sendMessage(msg.chat.id, "🔥 VIP Activated");
  }
});

// ================== VIP COMMANDS ==================
bot.onText(/\/viptools/, (msg) => {
   const opts = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "📢 Contact Admin", url: `https://t.me/askninjabrian` }
                ],
            ]
        }
    };
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
/vipjobs
For More Information On How To Activate Please Contact Our Admin`, opts);
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
    if (!dbData.vip.includes(id)) {
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
        bot.sendMessage(id, "⚠️ AI error, please try again.", e);
      console.log(e);
    }
}); 

//============================ GENERATE =======================

bot.onText(/\/generate/, async (msg) => {
    const id = msg.chat.id;
    if(!dbData.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");

    bot.sendMessage(id,"💡 Send me a description of the code/project you want:");
    
    bot.once("message", async (descMsg) => {
        if(!dbData.vip.includes(id)) return;
        const prompt = `${descMsg.text}`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        bot.sendMessage(id, (await response.text()));
    });
});

// ==================== DEBUG =====================

bot.onText(/\/debug/, async(msg)=>{
    const id = msg.chat.id;
    if(!dbData.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");

    bot.sendMessage(id,"🛠️ Send the code you want me to debug/fix:");

    bot.once("message", async(codeMsg)=>{
        if(!dbData.vip.includes(id)) return;
        const prompt = `Debug this JavaScript code and suggest fixes/optimizations:\n${codeMsg.text}`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        bot.sendMessage(id, (await response.text()));
    });
});

//===================== AI PLANNER ==========================

bot.onText(/\/roadmap/, async(msg)=>{
    const id = msg.chat.id;
    if(!dbData.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");

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
    if(!dbData.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");

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
    if(!dbData.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");

    const prompt = `Provide a step-by-step Tutorial include examples and exercises:`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    bot.sendMessage(id, (await response.text()));
});

// ======================= TEMPLATE ======================

bot.onText(/\/templates/, async(msg)=>{
    const id = msg.chat.id;
    if(!dbData.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");
    
    bot.sendMessage(id, `📦 VIP Project Templates:
Nexus OS: A Cyberpunk-themed Web Desktop Environment.
Ghost-Racer Engine: AI-driven telemetry for racing games.
Sentience API: A multi-model AI load balancer (like your current stack).
Neon-Grid Marketplace: A secure P2P trading platform for game assets.
Shadow-Vault: Encrypted credential manager with biometric "Ninja" UI.
Aegis-Guard: Real-time Telegram bot security and anti-spam system.
Zen-Cortex: A Neural-link style productivity and task visualizer.
Vapor-Stream: High-speed real-time data visualization for Render logs.
Cyber-Tactics: A turn-based strategy game engine with AI opponents.
Bit-Blade: A high-frequency algorithmic trading dashboard.
Void-Chat: An end-to-end encrypted messaging bridge for teams.
Glitch-Hunter: Automated bug tracking and AI-powered code fixing.
Onyx-Serverless: A custom lightweight wrapper for Google Cloud Functions.
Pulse-Command: A voice-activated coding assistant using Whisper API.
Titan-UI: A futuristic, high-impact component library for React.
Spectre-Analytics: Privacy-first user tracking for indie developers.
Chronos-Sync: Distributed database synchronizer (like your Gist sync).
Nova-Render: An automated deployment pipeline visualizer.
Synth-Visions: AI-generated futuristic concept art generator.
Ninja-Core: A modular framework for building advanced Telegram bots.
(You can request code with /generate command)`);
});

// =================== Cheat Sheets =====================

bot.onText(/\/cheatsheets/, async(msg)=>{
    const id = msg.chat.id;
    if(!dbData.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");

    bot.sendMessage(id, "1	Python	python.org
2	JavaScript	javascript.com
3	TypeScript	typescriptlang.org
4	Rust	rust-lang.org
5	Go (Golang)	go.dev
6	Java	oracle.com/java
7	C#	dotnet.microsoft.com
8	C++	isocpp.org
9	Kotlin	kotlinlang.org
10	Swift	swift.org
11	PHP	php.net
12	Ruby	ruby-lang.org
13	Dart	dart.dev
14	SQL	iso.org/standard/63343.html (Standard)
15	R	r-project.org
16	Scala	scala-lang.org
17	Julia	julialang.org
18	Lua	lua.org
19	Elixir	elixir-lang.org
20	Zig	ziglang.org");
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

  let text = "🏆 Feature Coming Soon....";
  for (let id in dbData.leaderboard) {
    text += `${id}: ${dbData.leaderboard[id]}\n`;
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
  dbData.vipChannels[msg.chat.id] = m[1];
  await saveToGist();
  bot.sendMessage(msg.chat.id, "Channel linked");
});

// ================== FORWARD ==================
async function forwardVIP(text) {
  for (let id in dbData.vipChannels) {
    try {
      bot.sendMessage(dbData.vipChannels[id], text);
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
// ============= Manual Api Activation =============
// ================= New Post =========================
app.get("/newpost", (req, res) => {
  const post = await ai("Short trending programming tip with code");

  const img = await createCodeImage(post);

  bot.sendPhoto(MAIN_CHANNEL, img, {
    caption: "🔥 Daily Coding Tip\n\n" + post
  });

  forwardVIP(post);
});
// ===================== New Challenge ================
app.get("/newchallenge", (req, res) => {
  const challenge = await ai("Advanced coding challenge");
  forwardVIP("🔥 VIP Challenge\n" + challenge);
})

app.get("/scrape", (req, res) => {
      dbData.vip.forEach(async id=>{
        const job = await scrapeFreelanceJob();
        if(!job) return;
        const post = await generateJobPost(job.title);
        bot.sendMessage(id, `💼 VIP Job Alert:\n${post}\nApply: ${job.link}`);
    });
})
// ================== VIP CHALLENGE ==================
cron.schedule("0 19 * * *", async () => {
  const challenge = await ai("Advanced coding challenge");
  forwardVIP("🔥 VIP Challenge\n" + challenge);
});

// ================== JOB ALERT ==================
cron.schedule("0 10 * * *", async ()=>{
    dbData.vip.forEach(async id=>{
        const job = await scrapeFreelanceJob();
        if(!job) return;
        const post = await generateJobPost(job.title);
        bot.sendMessage(id, `💼 VIP Job Alert:\n${post}\nApply: ${job.link}`);
    });
});

//=================== VIP CHAT GROUP =========================
bot.onText(/\/vipchat/, async(msg)=>{
    const id = msg.chat.id;
    if(!dbData.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");
    bot.sendMessage(id,"👥 Join VIP private chat: https://t.me/joinchat/EXAMPLE");
});
// ====================== ASK ADMIN ============================
bot.onText(/\/askadmin/, async(msg)=>{
    const id = msg.chat.id;
    if(!dbData.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");
    bot.sendMessage(id,"💬 Send your question and the admin will respond shortly.");
});

// ----- Step 1: Set VIP Channel -----
bot.onText(/\/setchannel (.+)/, async (msg, match) => {
    const id = msg.chat.id;
    if(!dbData.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");

    const channel = match[1].trim(); // Example: @mychannel
    dbData.vipChannels ||= {};
    dbData.vipChannels[id] = channel;
    await db.write();

    bot.sendMessage(id, `✅ Your channel ${channel} is now linked. All posts and quizzes will be forwarded here.`);
});
// ========================== Forward to VIP ======================
async function forwardToVIPChannels(message, extraOptions = {}) {
    if(!dbData.vipChannels) return;

    for(const vipId in dbData.vipChannels){
        const channel = dbData.vipChannels[vipId];
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
