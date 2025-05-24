const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

let client;
let clientReady = false;
let isReconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

const createClient = () => {
  return new Client({
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
        "--single-process",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
      ignoreHTTPSErrors: true,
    },
    restartOnAuthFail: true,
  });
};

const setupClientEvents = () => {
  client.on("qr", (qr) => {
    console.log("QR RECEIVED. Scan this with your WhatsApp:");
    qrcode.generate(qr, { small: true });
    clientReady = false;
  });

  client.on("ready", () => {
    clientReady = true;
    isReconnecting = false;
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
    forceRestart();
  });

  client.on("disconnected", (reason) => {
    clientReady = false;
    console.log("WhatsApp client disconnected:", reason);
    forceRestart();
  });

  client.on("loading_screen", (percent, message) => {
    console.log("Loading screen:", percent, message);
  });

  client.on("message", async (msg) => {
    if (msg.from.endsWith("@g.us")) {
      try {
        const chat = await msg.getChat();
        if (msg.body.startsWith("!cek")) {
          handleCommands(msg, chat);
        }
      } catch (error) {
        console.error("Error processing message:", error);
      }
    }
  });
};

const forceRestart = async () => {
  if (isReconnecting) return;

  isReconnecting = true;
  reconnectAttempts++;

  console.log(`Force restarting client (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

  try {
    if (client) {
      await client.destroy();
    }
  } catch (error) {
    console.error("Error destroying client:", error);
  }

  await new Promise((resolve) => setTimeout(resolve, 3000));

  try {
    client = createClient();
    setupClientEvents();
    await client.initialize();
    console.log("Client restarted successfully");
  } catch (error) {
    console.error("Error restarting client:", error);
    isReconnecting = false;

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      setTimeout(() => forceRestart(), 5000);
    } else {
      console.error("Max restart attempts reached");
      reconnectAttempts = 0;
    }
  }
};

const isSessionClosedError = (error) => {
  if (!error || !error.message) return false;

  return (
    error.message.includes("Session closed") ||
    error.message.includes("Protocol error") ||
    error.message.includes("page has been closed") ||
    error.message.includes("browser has disconnected") ||
    error.message.includes("Navigation failed")
  );
};

const ensureClientReady = () => {
  return new Promise((resolve, reject) => {
    console.log("Current client state:", {
      clientReady,
      isReconnecting,
      hasClient: !!client,
      hasInfo: client ? !!client.info : false,
    });

    if (clientReady && !isReconnecting && client) {
      resolve();
      return;
    }

    if (isReconnecting) {
      reject(new Error("Client is reconnecting, please try again later"));
      return;
    }

    if (!client) {
      reject(new Error("Client not initialized"));
      return;
    }

    if (client.info && !clientReady) {
      console.log("Client authenticated but not ready, waiting...");
      let attempts = 0;
      const waitForReady = setInterval(() => {
        attempts++;
        if (clientReady) {
          clearInterval(waitForReady);
          resolve();
        } else if (attempts > 30) {
          clearInterval(waitForReady);
          reject(new Error("Timeout waiting for ready state"));
        }
      }, 1000);
      return;
    }

    reject(new Error("Client not ready and not authenticated"));
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
    await chat.sendMessage("⚠️ Terjadi kesalahan saat memproses perintah");
  }
}

const initializeApp = async () => {
  try {
    client = createClient();
    setupClientEvents();
    await client.initialize();
    console.log("Initial client setup completed");
  } catch (error) {
    console.error("Initial setup failed:", error);
    forceRestart();
  }
};

const runSessionHealthCheck = async () => {
  if (clientReady && !isReconnecting && client) {
    try {
      await client.getState();
    } catch (error) {
      console.error("Session health check failed:", error);
      if (isSessionClosedError(error)) {
        console.log("Detected session closed during health check");
        forceRestart();
      }
    }
  }
};

const sessionHealthCheck = setInterval(runSessionHealthCheck, 60000);

app.post("/send-message", async (req, res) => {
  try {
    const { groupId, message } = req.body;
    console.log("GroupID:", groupId);

    if (!groupId || !message) {
      return res.status(400).json({
        success: false,
        error: "Group ID and message are required",
      });
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
      forceRestart();
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
    hasClient: !!client,
  });
});

app.post("/force-reconnect", (req, res) => {
  forceRestart();
  return res.status(200).json({
    success: true,
    message: "Force restart initiated",
  });
});

app.get("/ping", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "WhatsApp API server is running",
    clientStatus: client && client.info ? "authenticated" : "not authenticated",
  });
});

process.on("SIGINT", async () => {
  clearInterval(sessionHealthCheck);
  console.log("Shutting down gracefully...");
  if (client) {
    await client.destroy();
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  clearInterval(sessionHealthCheck);
  console.log("Shutting down gracefully...");
  if (client) {
    await client.destroy();
  }
  process.exit(0);
});

initializeApp();

app.listen(port, () => {
  console.log(`WhatsApp API server running on port ${port}`);
});
