// whatsapp-bot.js
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

app.listen(port, () => {
  console.log(`WhatsApp API server running on port ${port}`);
});
