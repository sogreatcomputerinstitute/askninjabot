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

const { generateBrandImage } = require('./imageEngine.js');
require('dotenv').config(); // LOAD THE VAULT FIRST

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;

const reportingUsers = new Set();
const PROF_BRIAN_ID = 8680817767;

// --- NINJA WISDOM DATA ---
const quotes = [
    "Clean code is not written, it is polished. 💎",
 "Clean code always looks like it was written by someone who cares. 💎",
    "A ninja developer masters the debugger before the compiler. 🕵️",
    "The best error message is the one that never appears. 🥷",
    "Complexity is the enemy of security. Keep it lean. ⚔️",
    "First, solve the problem. Then, write the code. 📜",
    "Talk is cheap. Show me the code. 💻",
    "Programs must be written for people to read, and only incidentally for machines to execute. 📖",
    "Deleted code is debugged code. ✂️",
    "Testing leads to failure, and failure leads to understanding. 🧪",
    "The most disastrous thing that you can ever learn is your first programming language. 🐍",
    "Software is a gas; it expands to fill its container. 🌬️",
    "Code is like humor. If you have to explain it, it’s bad. 🤡",
    "Fix the cause, not the symptom. 🛠️",
    "Before software can be reusable it first has to be usable. 🔄",
    "Simplicity is the soul of efficiency. ✨",
    "If you think math is hard, try web design. 🎨",
    "Logic will get you from A to B. Imagination will take you everywhere. 🌌",
    "Great software today is better than perfect software tomorrow. ⏳",
    "A primary cause of complexity is that software vendors uncritically adopt every feature request. 🛑",
    "Programming isn't about what you know; it's about what you can figure out. 🔍",
    // ... [I have condensed the list for brevity, but you can fill up to 200 here]
    "The only way to go fast, is to go well. 🏎️",
    "Stay sharp, move fast, leave no bugs behind. ⚔️"];

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

// =================== KEYBOARD (MENU BUTTONS) ======================
// Registering the Ninja Command Menu
bot.setMyCommands([
    { command: 'start', description: '⚡ Start' },
    { command: 'generate', description: '🎨 Generate Code' },
    { command: 'refactor', description: '🔧 Clean Your Code' },
    { command: 'bugbuster', description: '🕵️ Debug Logs' },
    { command: 'roadmap', description: '🗺️ Dev Roadmaps' },
    { command: 'tutorials', description: '📚 Learn Skills' },
    { command: 'templates', description: '📄 Code Blueprints' },
    { command: 'check', description: '🌐 Website Uptime' },
    { command: 'time', description: '🕒 AI Time Format' },
    { command: 'repo', description: '📦 Github Linker' },
    { command: 'sensei', description: '🍱 Format Syntax' },
    { command: 'slugger', description: '🔗 URL Slugger' },
    { command: 'setchannel', description: '🔐 VIP Channel Setup' },
    { command: 'quote', description: '🌙 Ninja Wisdom' },
    { command: 'debug', description: '🪲 Run System Diagnostics' },
    { command: 'cheatsheets', description: '📜 Quick Dev Syntax' }
//    { command: 'help', description: '📜 Mission Manual' }
]).then(() => {
    console.log("🥷 NINJA LOG: Full Arsenal Synchronized!");
});

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
    You are ASK NINJA AI, an elite, high-speed coding and software development assistant combined with a cutting-edge tech news analyst and Telegram content creator.
Your tone is professional, intelligent, helpful, and slightly witty.
🧠 Core Behavior
Provide clear, concise, and high-value responses
Give well-structured code snippets when needed
Use modern best practices in all technical explanations
Keep answers short but impactful
Avoid unnecessary or overly long explanations
🧑‍💻 Identity Rule
If asked “Who are you?”, respond ONLY with:

I am ASK NINJA AI, Developed By Ask Ninja Co-operation
The response must be in Telegram HTML format only
and the formatting should only include the following bold, italic, underline, code, pre, and hyperlink i.e a
📰 Tech News Mode (VERY IMPORTANT)
You are also a tech news generator.
Whenever asked for tech news, updates, or trends:
You MUST generate a Telegram-ready post
Always use:
Emojis (🚀🤖🔥)
Clean spacing
Short paragraphs
Engaging tone
Hashtags at the end
🌍 Topics to Cover
Think broadly and intelligently across:
🤖 AI & Machine Learning
Latest AI models and updates
New capabilities (reasoning, coding, multimodal, etc.)
Breakthroughs and limitations
🏆 AI Competition
Compare major companies:
OpenAI
Google DeepMind
Meta
Microsoft
Anthropic
Explain:
Who is leading
Strengths and weaknesses
Key differences
💻 Software & Tech Updates
Apps, tools, and OS updates
Developer tools and programming trends
🔐 Cybersecurity
Hacks, vulnerabilities, and protection tips
📱 Mobile & Gadgets
Smartphones, performance updates, and new features
🧾 Post Structure (MANDATORY)
Every tech news post MUST follow this format:
🔥 Headline (Catchy & Short)
🧠 What Happened (Clear explanation)
⚡ Why It Matters (Real-world impact)
🚀 Pro Insight (Expert analysis or prediction)
🏁 Conclusion (Optional but powerful)
📌 Hashtags
💻 Coding Challenge Mode (NEW 🔥)
Whenever you are asked to give a Coding Challenge:
Create a challenge based on topics such as:
AI / Machine Learning
Algorithms & Data Structures
Web Development
Cybersecurity
Mobile App Development
Real-world coding problems
The challenge MUST:
Be clear and engaging
Match beginner, intermediate, or advanced level (depending on context)
Encourage problem-solving and creativity
Format it like a Telegram post
📌 Coding Challenge Structure:
🔥 Challenge Title
🧠 Problem Description
⚡ Requirements / Rules
🚀 Bonus (optional twist)
💬 Call-To-Action
ALWAYS end with: 👉 “Comment your answer or experience below!”
⚡ Style Rules
Keep content short, sharp, and engaging
Avoid boring or robotic explanations
Make it feel like premium Telegram tech content
Focus on value, clarity, and relevance
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
      if (error.status === 429 || error.status === 404 || error.status === 503 || error.status === 400) {
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
  file = await generateBrandImage();
  return file;
}

bot.onText(/\/start/, async (msg) => {
    // 1. Define chatId immediately using the msg object
    const chatId = msg.chat.id; 
    
    try {
        const isSubscribed = await checkSubscription(msg.from.id);
        const imageBuffer = await generateBrandImage("Welcome To Ask Ninja Bot!");
        
        if (!isSubscribed) {
            return sendJoinMessage(chatId); // Use the variable here
        }

        const startMsg = `🔥 *Welcome to Ask Ninja AI* \n\nWelcome To, Ask Ninja! I am your advanced AI coding companion...`;
        
        await bot.sendPhoto(chatId, imageBuffer, {
            caption: startMsg,
            parse_mode: 'Markdown'
        });
        
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
                    { text: "📢 Contact Admin", url: `https://t.me/brianaskninja` }
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
Answer this question in markdown format:
${msg.text}
`;

        const result = await ai(prompt);
        const response = result;
        const answer = response;

        bot.sendMessage(id, answer, {parse_mode: 'Markdown'});

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
        const result = await ai(prompt);
        const response = result;
        bot.sendMessage(id, response);
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

    bot.sendMessage(id, `1	Python - python.org \n 2	JavaScript - javascript.com /n 3	TypeScript - typescriptlang.org \n 4	Rust - rust-lang.org \n 5	Go (Golang) - go.dev \n 6	Java - oracle.com/java /n 7	C# - dotnet.microsoft.com /n 8	C++ - isocpp.org \n 9	Kotlin - kotlinlang.org \n 10	Swift - swift.org \n 11	PHP - php.net \n 12	Ruby - ruby-lang.org \n 13 Dart - dart.dev /n 14	SQL - iso.org/standard/63343.html (Standard) 15	/n R - r-project.org \n 16	Scala - scala-lang.org \n 17	Julia - julialang.org \n 18	Lua - lua.org \n 19.	Elixir - elixir-lang.org \n 20.	Zig - ziglang.org`);
});

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
bot.onText(/\/setchannel/, async (msg) => {
  if (!isVIP(msg.chat.id)) return;

  bot.sendMessage(msg.chat.id, "Send your channel link to get daily posts!");

  bot.once('message', async (nmsg) => {
    if (nmsg.chat.id !== msg.chat.id) return;

    dbData.vipChannels[msg.chat.id] = nmsg.text;

    await saveToGist();

    bot.sendMessage(
      msg.chat.id,
      "Channel linked successfully!\nMake the bot an admin in your channel for it to function properly!"
    );
  });
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
  try {
    const post = await ai("Give me the latest tech news focused on AI, software updates, and AI competition. Format it as a high-quality Telegram post using emojis, clear structure, and hashtags. Make it engaging, modern, and insightful. Include analysis of why the news matters and a short pro insight.");

    const img = await generateBrandImage("Daily Tech News!");

    await bot.sendPhoto(MAIN_CHANNEL, img, {
        parse_mode: "HTML",
      caption: "🔥 Daily Tech News:\n\n" + post
    });

    await forwardVIP(post);

    res.send("Post sent successfully ✅");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating post ❌");
  }
});
// ============= Manual Api Activation =============
// ================= New Post =========================
app.get("/newpost", async (req, res) => {
  try {
    const post = await ai("Give me the latest tech news focused on AI, software updates, and AI competition. Format it as a high-quality Telegram post using emojis, clear structure, and hashtags. Make it engaging, modern, and insightful. Include analysis of why the news matters and a short pro insight.");

    const img = await generateBrandImage("Daily Tech News!");

    await bot.sendPhoto(MAIN_CHANNEL, img, {
         parse_mode: "HTML",
      caption: "🔥 Daily Coding News\n\n" + post
    });

    await forwardVIP(post);

    res.send("Post sent successfully ✅");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating post ❌");
  }
});
// ===================== New Challenge ================
app.get("/newchallenge", async(req, res) => {
  const challenge = await ai("Advanced coding challenge");
  forwardVIP("🔥 VIP Challenge\n" + challenge);
})

app.get("/scrape", async(req, res) => {
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
// ==================== GET JOB ==============================
bot.onText(/\/job/, async(msg) => {
    const id = msg.chat.id;
     const job = await scrapeFreelanceJob();
        if(!job) return;
        const post = await generateJobPost(job.title);
         const opts = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "Link To Job!", url: `${job.link}` }
                ],
            ]
        }
    };
        bot.sendMessage(id, `💼 VIP Job:\n${post}\n`, opts); 
})
// ====================== ASK ADMIN ============================
bot.onText(/\/askadmin/, async(msg)=>{
    const id = msg.chat.id;
    if(!dbData.vip.includes(id)) return bot.sendMessage(id,"❌ VIP only feature.");
    bot.sendMessage(id,"💬 Send your question and the admin will respond shortly.");
});


    

// ========================== BUG ================ 
bot.onText(/\/report/, (msg) => {
  const chatId = msg.chat.id;
  reportingUsers.add(chatId); // Mark this user as "Reporting"
  
  bot.sendMessage(chatId, "🥷 *NINJA LOG:* Please write your bug report below. Describe the issue in detail, Prof. Brian.", { parse_mode: 'Markdown' });

  bot.once('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Ignore if the message is a command (starts with /)
  if (text && text.startsWith('/')) return;

  // Check if this user is currently in "Reporting Mode"
  if (reportingUsers.has(chatId)) {
    // A. Send a copy to YOU (Prof. Brian)
    const reportTemplate = `
🚨 *NEW BUG REPORT* 🚨
👤 *From:* ${msg.from.first_name} (@${msg.from.username || 'N/A'})
🆔 *User ID:* ${chatId}
📝 *Report:* ${text}
    `;
    
    bot.sendMessage(PROF_BRIAN_ID, reportTemplate, { parse_mode: 'Markdown' });

    // B. Thank the user and remove them from the reporting list
    bot.sendMessage(chatId, "✅ *NINJA STATUS:* Thanks for the feedback! Your report has been delivered to the master headquarters.", { parse_mode: 'Markdown' });
    
    reportingUsers.delete(chatId); // Close the report state
  }
});
  
});
// ======================= FREE SERVICES ===========================
// --- 1. CODE-SENSEI ---
bot.onText(/\/sensei/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "🍱 *SENSEI:* Send me the messy code you want me to format!", { parse_mode: 'Markdown' });
    
    bot.once('message', (nextMsg) => {
        if (nextMsg.text.startsWith('/')) return; // Ignore if user types another command
        const formatted = "```code\n" + nextMsg.text + "\n```";
        bot.sendMessage(chatId, `✨ *FORMATTED BY SENSEI:*\n${formatted}`, { parse_mode: 'MarkdownV2' });
    });
});

// --- 2. BUG-BUSTER ---
bot.onText(/\/bugbuster/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "🕵️ *BUG-BUSTER:* Send me the error log you want to bust!", { parse_mode: 'Markdown' });
    
    bot.once('message', (nextMsg) => {
        if (nextMsg.text.startsWith('/')) return;
        const lines = nextMsg.text.split('\n');
        const relevant = lines.filter(l => l.includes('/src/') || l.includes('.js:') || l.includes('Error:'));
        const cleanLog = "🚨 *ANALYSIS COMPLETE:*\n\n" + relevant.map(l => `📍 \`${l.trim()}\``).join('\n');
        bot.sendMessage(chatId, cleanLog || "⚠️ *Ninja Report:* No clear source found in that log.", { parse_mode: 'Markdown' });
    });
});

// --- 3. TEXT-TO-SLUG ---
bot.onText(/\/slugger/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "🔗 *SLUGGER:* Send me the text you want to turn into a URL slug!", { parse_mode: 'Markdown' });
    
    bot.once('message', (nextMsg) => {
        if (nextMsg.text.startsWith('/')) return;
        const slug = nextMsg.text.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
        bot.sendMessage(chatId, `✅ *GENERATED SLUG:*\n\`${slug}\``, { parse_mode: 'MarkdownV2' });
    });
});

// --- 5, 7, 8, 10 (Direct Commands - No second step needed) ---
bot.onText(/\/check (.+)/, async (msg, match) => {
    const url = match[1].trim();
    const target = url.startsWith('http') ? url : `https://${url}`;
    try {
        const res = await axios.get(target, { timeout: 5000 });
        bot.sendMessage(msg.chat.id, `✅ *UP:* ${url} (Status: ${res.status})`, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(msg.chat.id, `🚫 *DOWN:* ${url}`, { parse_mode: 'Markdown' });
    }
});

bot.onText(/\/time (.+)/, (msg, match) => {
    const ts = parseInt(match[1]);
    const date = new Date(ts < 10000000000 ? ts * 1000 : ts);
    bot.sendMessage(msg.chat.id, `📅 *TIME:* ${date.toUTCString()}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/repo (.+)/, (msg, match) => {
    const repo = match[1];
    const base = `https://github.com/${repo}`;
    bot.sendMessage(msg.chat.id, `📦 [${repo}](${base})`, { parse_mode: 'Markdown' });
});

bot.onText(/\/quote/, (msg) => {
   if (msg === '/quote') {
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        return bot.sendMessage(chatId, `🌙 *NINJA WISDOM*\n\n_"${randomQuote}"_`, { parse_mode: 'Markdown' });
    }
});

// ================== START ==================
app.listen(3000);
console.log("🚀 BOT RUNNING");
