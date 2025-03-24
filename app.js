const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

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

global.pendingCommands = [];

client.on("message", async (msg) => {
  if (msg.from.endsWith("@g.us")) {
    const chat = await msg.getChat();

    if (msg.body.startsWith("!cek")) {
      handleCommands(msg, chat);
    }
  }
});

async function handleCommands(msg, chat) {
  const command = msg.body.toLowerCase().trim();

  try {
    if (command === "!cek bantuan") {
      const helpMessage =
        `*BANTUAN PERINTAH*\n\n` +
        `!cek summary - Melihat ringkasan keuangan\n` +
        `!cek terakhir - Melihat catatan terakhir\n` +
        `!cek bantuan - Menampilkan pesan ini`;
      await chat.sendMessage(helpMessage);
      return;
    }

    if (command === "!cek summary") {
      await chat.sendMessage("⏳ Mengambil ringkasan keuangan...");

      try {
        const response = await fetch(process.env.WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "summary", chatId: msg.from }),
        });

        console.log("Summary command sent successfully:", await response.text());
      } catch (err) {
        console.error("Error requesting summary:", err);
      }
    } else if (command === "!cek terakhir") {
      await chat.sendMessage("⏳ Mengambil catatan keuangan terakhir...");

      try {
        const response = await fetch(process.env.WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "terakhir", chatId: msg.from }),
        });

        console.log("Latest record command sent successfully:", await response.text());
      } catch (err) {
        console.error("Error requesting latest record:", err);
      }
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

app.get("/check-commands", async (req, res) => {
  try {
    const commands = [...(global.pendingCommands || [])];
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

app.get("/ping", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "WhatsApp API server is running",
    clientStatus: client.info ? "authenticated" : "not authenticated",
  });
});

app.post("/direct-command", async (req, res) => {
  try {
    const { command, chatId } = req.body;

    if (!command || !chatId) {
      return res.status(400).json({ success: false, error: "Command and chatId are required" });
    }

    const response = await fetch(process.env.WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, chatId }),
    });

    const commandResult = await response.json();

    return res.status(200).json({
      success: true,
      result: commandResult,
    });
  } catch (error) {
    console.error("Error processing direct command:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`WhatsApp API server running on port ${port}`);
});
