const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const port = 3000;

app.use(bodyParser.json());

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ["--no-sandbox"],
  },
});

client.on("qr", (qr) => {
  console.log("QR RECEIVED. Scan this with your WhatsApp:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("WhatsApp client is ready!");
});

client.on("authenticated", () => {
  console.log("WhatsApp authentication successful");
});

client.on("auth_failure", (msg) => {
  console.error("WhatsApp authentication failed:", msg);
});

// Store pending commands in memory
global.pendingCommands = [];

// Handle incoming messages (UPDATED)
client.on("message", async (msg) => {
  // Check if the message is from a group
  if (msg.from.endsWith("@g.us")) {
    const chat = await msg.getChat();

    // Process commands
    if (msg.body.startsWith("!cek")) {
      // Store the command for Google Apps Script to retrieve
      global.pendingCommands.push({
        chatId: msg.from,
        body: msg.body,
        timestamp: new Date().getTime(),
      });

      handleCommands(msg, chat);
    }
  }
});

// Function to handle commands (NEW)
async function handleCommands(msg, chat) {
  const command = msg.body.toLowerCase().trim();

  try {
    if (command === "!cek summary") {
      await chat.sendMessage("⏳ Mengambil ringkasan keuangan...");
      // The actual data will be retrieved by Google Apps Script
      // This just notifies the bot to fetch the data
    } else if (command === "!cek terakhir") {
      await chat.sendMessage("⏳ Mengambil catatan keuangan terakhir...");
      // The actual data will be retrieved by Google Apps Script
    } else if (command === "!cek bantuan") {
      const helpMessage =
        `*BANTUAN PERINTAH*\n\n` +
        `!cek summary - Melihat ringkasan keuangan\n` +
        `!cek terakhir - Melihat catatan terakhir\n` +
        `!cek bantuan - Menampilkan pesan ini`;
      await chat.sendMessage(helpMessage);
    }
  } catch (error) {
    console.error("Error handling command:", error);
    await chat.sendMessage("⚠️ Terjadi kesalahan saat memproses perintah");
  }
}

client.initialize();

app.post("/send-message", async (req, res) => {
  try {
    const { groupId, message } = req.body;

    if (!groupId || !message) {
      return res.status(400).json({ success: false, error: "Group ID and message are required" });
    }

    const result = await client.sendMessage(groupId, message);

    return res.status(200).json({
      success: true,
      messageId: result.id._serialized,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/get-groups", async (req, res) => {
  try {
    const chats = await client.getChats();
    const groups = chats.filter((chat) => chat.isGroup);

    const groupList = groups.map((group) => ({
      id: group.id._serialized,
      name: group.name,
    }));

    return res.status(200).json({
      success: true,
      groups: groupList,
    });
  } catch (error) {
    console.error("Error getting groups:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Endpoint to check for commands (UPDATED)
app.get("/check-commands", async (req, res) => {
  try {
    // Make a copy of pending commands
    const commands = [...(global.pendingCommands || [])];

    // Clear pending commands after they're retrieved
    global.pendingCommands = [];

    console.log(`Returning ${commands.length} pending commands`);

    return res.status(200).json({
      success: true,
      pendingCommands: commands,
    });
  } catch (error) {
    console.error("Error checking commands:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// New endpoint to test connection (NEW)
app.get("/ping", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "WhatsApp API server is running",
    clientStatus: client.info ? "authenticated" : "not authenticated",
  });
});

app.listen(port, () => {
  console.log(`WhatsApp API server running on port ${port}`);
});
