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
const MAX_RECONNECT_ATTEMPTS = 5;

// Function to handle client reconnection
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
          }, 10000); // Wait 10 seconds before next attempt
        } else {
          console.error("Max reconnection attempts reached, manual intervention required");
          isReconnecting = false;
          reconnectAttempts = 0;
        }
      }
    }, 5000); // Wait 5 seconds before reinitializing
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

// Helper function to check if error is a session closed error
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

// Handle WhatsApp client events
client.on("qr", (qr) => {
  console.log("QR RECEIVED. Scan this with your WhatsApp:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  clientReady = true;
  isReconnecting = false;
  reconnectAttempts = 0;
  console.log("WhatsApp client is ready!");
});

client.on("authenticated", () => {
  console.log("WhatsApp authentication successful");
});

client.on("auth_failure", (msg) => {
  console.error("WhatsApp authentication failed:", msg);
});

client.on("disconnected", (reason) => {
  clientReady = false;
  console.log("WhatsApp client disconnected:", reason);
  reconnectClient();
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
    if (clientReady && !isReconnecting) {
      resolve();
    } else {
      console.log("Client not ready, attempting to initialize...");

      if (isReconnecting) {
        console.log("Client is currently reconnecting, waiting...");
        let waitAttempts = 0;
        const waitInterval = setInterval(() => {
          waitAttempts++;
          if (clientReady && !isReconnecting) {
            clearInterval(waitInterval);
            resolve();
          } else if (waitAttempts > 30) {
            clearInterval(waitInterval);
            reject(new Error("Timeout waiting for client reconnection"));
          }
        }, 1000);
        return;
      }

      client
        .initialize()
        .then(() => {
          let attempts = 0;
          const checkReady = setInterval(() => {
            attempts++;
            if (clientReady) {
              clearInterval(checkReady);
              resolve();
            } else if (attempts > 30) {
              clearInterval(checkReady);
              reject(new Error("Timeout waiting for WhatsApp client to be ready"));
            }
          }, 1000);
        })
        .catch((err) => reject(err));
    }
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

// Add session health check interval
const sessionHealthCheck = setInterval(async () => {
  await runSessionHealthCheck();
}, 60000); // Check every minute

// Extract the health check logic into a separate function for testing
const runSessionHealthCheck = async () => {
  if (clientReady && !isReconnecting) {
    try {
      // Perform a lightweight operation to check session health
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

// Update API endpoints with better error handling
app.post("/send-message", async (req, res) => {
  try {
    const { groupId, message } = req.body;

    if (!groupId || !message) {
      return res.status(400).json({ success: false, error: "Group ID and message are required" });
    }

    await ensureClientReady();

    // Validate the groupId format
    let validGroupId = groupId.trim();

    // Make sure the ID has the proper format - should end with @g.us for groups
    if (!validGroupId.endsWith("@g.us")) {
      // If it's just numbers, add the @g.us suffix
      if (/^\d+$/.test(validGroupId)) {
        validGroupId += "@g.us";
      } else {
        return res.status(400).json({
          success: false,
          error: "Invalid group ID format. Group IDs must end with @g.us",
        });
      }
    }

    console.log(`Sending message to group ID: ${validGroupId}`);

    // Verify the chat exists before sending
    try {
      const chat = await client.getChatById(validGroupId);
      if (!chat || !chat.isGroup) {
        return res.status(404).json({
          success: false,
          error: "Group not found or invalid",
        });
      }
    } catch (chatError) {
      console.error("Error retrieving chat:", chatError);
      return res.status(404).json({
        success: false,
        error: "Group not found: " + chatError.message,
      });
    }

    const result = await client.sendMessage(validGroupId, message);

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

// Add endpoint to force reconnection
app.post("/force-reconnect", (req, res) => {
  reconnectClient();
  return res.status(200).json({
    success: true,
    message: "Reconnection process initiated",
  });
});

// Clean up resources on server shutdown
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

// Export for testing
if (process.env.NODE_ENV === "test") {
  // Create a separate server instance for testing to avoid port conflicts
  const server = app.listen(0, () => {
    console.log(`Test server running on port ${server.address().port}`);
  });

  module.exports = {
    client,
    app,
    server, // Export server so it can be closed in tests
    isSessionClosedError,
    reconnectClient,
    runSessionHealthCheck,
    sessionHealthCheck,
  };
} else {
  // Only start the server in non-test environments
  app.listen(port, () => {
    console.log(`WhatsApp API server running on port ${port}`);
  });
}
