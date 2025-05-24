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
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
    ignoreHTTPSErrors: true,
  },
  restartOnAuthFail: true,
});

let clientReady = false;
let isReconnecting = false;
let reconnectAttempts = 0;
let isInitializing = false;
const MAX_RECONNECT_ATTEMPTS = 5;

const reconnectClient = async () => {
  if (isReconnecting) return;

  isReconnecting = true;
  reconnectAttempts++;

  console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

  try {
    await client.destroy();
    console.log("Previous session destroyed");

    setTimeout(async () => {
      try {
        await client.initialize();
        console.log("Client reinitialized");
      } catch (error) {
        console.error("Error during client reinitialization:", error);
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          setTimeout(() => {
            isReconnecting = false;
            reconnectClient();
          }, 10000);
        } else {
          console.error("Max reconnection attempts reached, manual intervention required");
          isReconnecting = false;
          reconnectAttempts = 0;
        }
      }
    }, 5000);
  } catch (error) {
    console.error("Error during client destroy:", error);
    isReconnecting = false;

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      setTimeout(reconnectClient, 10000);
    } else {
      console.error("Max reconnection attempts reached, manual intervention required");
      reconnectAttempts = 0;
    }
  }
};

const isSessionClosedError = (error) => {
  if (!error || !error.message) {
    return false;
  }

  return (
    error.message.includes("Session closed") ||
    error.message.includes("Protocol error") ||
    error.message.includes("page has been closed")
  );
};

client.on("qr", (qr) => {
  console.log("QR RECEIVED. Scan this with your WhatsApp:");
  qrcode.generate(qr, { small: true });
  clientReady = false;
});

client.on("ready", () => {
  clientReady = true;
  isReconnecting = false;
  isInitializing = false;
  reconnectAttempts = 0;
  console.log("WhatsApp client is ready!");
  console.log("Client info:", client.info ? "Available" : "Not available");
});

client.on("authenticated", () => {
  console.log("WhatsApp authentication successful");
  console.log("Waiting for ready event...");
});

client.on("auth_failure", (msg) => {
  console.error("WhatsApp authentication failed:", msg);
  clientReady = false;
  isInitializing = false;
});

client.on("disconnected", (reason) => {
  clientReady = false;
  console.log("WhatsApp client disconnected:", reason);
  reconnectClient();
});

client.on("loading_screen", (percent, message) => {
  console.log("Loading screen:", percent, message);
});

global.pendingCommands = [];

client.on("message", async (msg) => {
  if (msg.from.endsWith("@g.us")) {
    try {
      const chat = await msg.getChat();

      if (msg.body.startsWith("!cek")) {
        handleCommands(msg, chat);
      }
    } catch (error) {
      console.error("Error processing message:", error);
      if (isSessionClosedError(error)) {
        reconnectClient();
      }
    }
  }
});

const ensureClientReady = () => {
  return new Promise((resolve, reject) => {
    console.log("Current client state:", {
      clientReady,
      isReconnecting,
      isInitializing,
      hasInfo: !!client.info,
    });

    if (clientReady && !isReconnecting) {
      resolve();
      return;
    }

    if (isInitializing) {
      console.log("Client is already initializing, waiting...");
      let attempts = 0;
      const waitForInit = setInterval(() => {
        attempts++;
        console.log(`Waiting for initialization... attempt ${attempts}/90`);
        if (clientReady) {
          clearInterval(waitForInit);
          resolve();
        } else if (attempts > 90) {
          clearInterval(waitForInit);
          reject(new Error("Timeout waiting for initialization"));
        }
      }, 1000);
      return;
    }

    if (client.info && !clientReady && !isReconnecting) {
      console.log("Client authenticated but not ready, waiting for ready event...");
      let attempts = 0;
      const waitForReady = setInterval(() => {
        attempts++;
        console.log(`Waiting for ready state... attempt ${attempts}/90`);
        if (clientReady) {
          clearInterval(waitForReady);
          console.log("Client is now ready!");
          resolve();
        } else if (attempts > 90) {
          clearInterval(waitForReady);
          reject(new Error("Timeout waiting for ready"));
        }
      }, 1000);
      return;
    }

    if (isReconnecting) {
      console.log("Client is currently reconnecting, waiting...");
      let waitAttempts = 0;
      const waitInterval = setInterval(() => {
        waitAttempts++;
        if (clientReady && !isReconnecting) {
          clearInterval(waitInterval);
          resolve();
        } else if (waitAttempts > 90) {
          clearInterval(waitInterval);
          reject(new Error("Timeout waiting for client reconnection"));
        }
      }, 1000);
      return;
    }

    console.log("Initializing client...");
    isInitializing = true;
    client
      .initialize()
      .then(() => {
        console.log("Client initialization started, waiting for ready...");
        let attempts = 0;
        const checkReady = setInterval(() => {
          attempts++;
          if (clientReady) {
            clearInterval(checkReady);
            resolve();
          } else if (attempts > 90) {
            clearInterval(checkReady);
            reject(new Error("Timeout waiting for WhatsApp client to be ready"));
          }
        }, 1000);
      })
      .catch((err) => {
        console.error("Client initialization failed:", err);
        isInitializing = false;
        reject(err);
      });
  });
};

async function handleCommands(msg, chat) {
  const command = msg.body.toLowerCase().trim();

  try {
    if (command === "!cek bantuan") {
      const helpMessage =
        `*BANTUAN PERINTAH*\n\n` +
        `!cek summary - Melihat ringkasan keuangan\n` +
        `!cek terakhir - Melihat catatan terakhir\n` +
        `!cek realisasi - Melihat realisasi anggaran\n` +
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
    } else if (command === "!cek realisasi") {
      await chat.sendMessage("⏳ Mengambil data realisasi anggaran...");

      try {
        const response = await fetch(process.env.WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "realisasi", chatId: msg.from }),
        });

        console.log("Realisasi anggaran command sent successfully:", await response.text());
      } catch (err) {
        console.error("Error requesting realisasi anggaran:", err);
      }
    }
  } catch (error) {
    console.error("Error handling command:", error);
    if (isSessionClosedError(error)) {
      reconnectClient();
      await chat.sendMessage("⚠️ Koneksi terputus. Mencoba menghubungkan kembali...");
    } else {
      await chat.sendMessage("⚠️ Terjadi kesalahan saat memproses perintah");
    }
  }
}

client.initialize();

const sessionHealthCheck = setInterval(async () => {
  await runSessionHealthCheck();
}, 60000);

const runSessionHealthCheck = async () => {
  if (clientReady && !isReconnecting) {
    try {
      await client.getState();
    } catch (error) {
      console.error("Session health check failed:", error);
      if (isSessionClosedError(error)) {
        console.log("Detected session closed during health check");
        reconnectClient();
      }
    }
  }
};

app.post("/send-message", async (req, res) => {
  try {
    const { groupId, message } = req.body;

    console.log("GroupID:", groupId);

    if (!groupId || !message) {
      return res.status(400).json({ success: false, error: "Group ID and message are required" });
    }

    await ensureClientReady();

    const result = await client.sendMessage(groupId, message);

    return res.status(200).json({
      success: true,
      messageId: result.id._serialized,
    });
  } catch (error) {
    console.error("Error sending message:", error);

    if (isSessionClosedError(error)) {
      reconnectClient();
      return res.status(503).json({
        success: false,
        error: "WhatsApp session closed. Reconnecting...",
        retryAfter: 10,
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/get-groups", async (req, res) => {
  try {
    await ensureClientReady();

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

    if (isSessionClosedError(error)) {
      reconnectClient();
      return res.status(503).json({
        success: false,
        error: "WhatsApp session closed. Reconnecting...",
        retryAfter: 10,
      });
    }

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

app.get("/status", (req, res) => {
  return res.status(200).json({
    success: true,
    clientReady: clientReady,
    isReconnecting: isReconnecting,
    reconnectAttempts: reconnectAttempts,
  });
});

app.post("/force-reconnect", (req, res) => {
  reconnectClient();
  return res.status(200).json({
    success: true,
    message: "Reconnection process initiated",
  });
});

process.on("SIGINT", async () => {
  clearInterval(sessionHealthCheck);
  console.log("Shutting down gracefully...");
  await client.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  clearInterval(sessionHealthCheck);
  console.log("Shutting down gracefully...");
  await client.destroy();
  process.exit(0);
});

if (process.env.NODE_ENV === "test") {
  const server = app.listen(0, () => {
    console.log(`Test server running on port ${server.address().port}`);
  });

  module.exports = {
    client,
    app,
    server,
    isSessionClosedError,
    reconnectClient,
    runSessionHealthCheck,
    sessionHealthCheck,
  };
} else {
  app.listen(port, () => {
    console.log(`WhatsApp API server running on port ${port}`);
  });
}
