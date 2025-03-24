// Initialize global variables
const SHEET_NAME = "REKAP";
const LAST_ROW_PROCESSED_PROPERTY = "lastRowProcessed";
const MESSAGE_CACHE_PROPERTY = "lastMessageCache";
const MESSAGE_TIMESTAMP_PROPERTY = "lastMessageTimestamp";
const PENDING_MESSAGES_PROPERTY = "pendingMessages";

// WhatsApp API JS server details
const WHATSAPP_API_URL = "http://103.87.66.140:3000/send-message";
const GROUP_ID = "120363401616760903@g.us";

// Time settings
const MIN_TIME_BETWEEN_MESSAGES = 60000; // 1 minute
const MESSAGE_DELAY = 30000; // 30 seconds delay between edit and sending

/**
 * Remove all existing triggers and creates required triggers
 * Run this function manually when updating the script
 */
function resetAndCreateTriggers() {
  // Delete all existing triggers
  const allTriggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < allTriggers.length; i++) {
    ScriptApp.deleteTrigger(allTriggers[i]);
  }

  // Create an edit trigger
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger("onEdit").forSpreadsheet(spreadsheet).onEdit().create();

  // Create a time-based trigger to process pending messages every minute
  ScriptApp.newTrigger("processPendingMessages").timeBased().everyMinutes(1).create();

  // Reset the cache properties
  PropertiesService.getScriptProperties().deleteProperty(MESSAGE_CACHE_PROPERTY);
  PropertiesService.getScriptProperties().deleteProperty(MESSAGE_TIMESTAMP_PROPERTY);
  PropertiesService.getScriptProperties().deleteProperty(PENDING_MESSAGES_PROPERTY);

  console.log("All triggers reset and new triggers created successfully");
}

/**
 * This function runs automatically when the spreadsheet is edited.
 * Instead of sending messages immediately, it queues them for delayed sending.
 */
function onEdit(e) {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    console.log("Could not obtain lock. Another execution is in progress.");
    return;
  }

  try {
    if (e.source.getActiveSheet().getName() !== SHEET_NAME) {
      return;
    }

    const sheet = e.source.getActiveSheet();
    const editedRow = e.range.getRow();
    const editedCol = e.range.getColumn();

    if (editedRow <= 2) {
      return;
    }

    if (e.range.getNumRows() === 1 && e.range.getNumColumns() === 1 && editedCol !== 9) {
      return;
    }

    const isRowComplete = checkRowCompleteness(sheet, editedRow);

    if (!isRowComplete) {
      return;
    }

    const lastRowProcessed = PropertiesService.getScriptProperties().getProperty(LAST_ROW_PROCESSED_PROPERTY) || 2;
    const updateType = editedRow > lastRowProcessed ? "new" : "update";

    const messageData = generateFinancialMessage(sheet, editedRow, updateType);

    queueMessageForDelayedSending(messageData.message, editedRow, updateType);
  } catch (error) {
    console.error("Error in onEdit function:", error);
    const errorMsg = "⚠️ *ERROR NOTIFICATION*\n" + error.toString();
    if (!isDuplicateMessage(errorMsg)) {
      queueMessageForDelayedSending(errorMsg, null, "error");
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * Queues a message to be sent after a delay
 */
function queueMessageForDelayedSending(message, row, updateType) {
  const properties = PropertiesService.getScriptProperties();

  let pendingMessages = [];
  const pendingMessagesJson = properties.getProperty(PENDING_MESSAGES_PROPERTY);

  if (pendingMessagesJson) {
    pendingMessages = JSON.parse(pendingMessagesJson);
  }

  pendingMessages.push({
    message: message,
    row: row,
    updateType: updateType,
    scheduledSendTime: new Date().getTime() + MESSAGE_DELAY,
  });

  properties.setProperty(PENDING_MESSAGES_PROPERTY, JSON.stringify(pendingMessages));

  console.log(`Message queued for sending in ${MESSAGE_DELAY / 1000} seconds`);
}

/**
 * Process any pending messages that are ready to be sent
 * This function will be triggered every minute by a time-based trigger
 */
function processPendingMessages() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    console.log("Could not obtain lock for processing pending messages.");
    return;
  }

  try {
    const properties = PropertiesService.getScriptProperties();
    const pendingMessagesJson = properties.getProperty(PENDING_MESSAGES_PROPERTY);

    if (!pendingMessagesJson) {
      return;
    }

    const pendingMessages = JSON.parse(pendingMessagesJson);
    const currentTime = new Date().getTime();
    const remainingMessages = [];

    for (const messageData of pendingMessages) {
      if (currentTime >= messageData.scheduledSendTime) {
        if (!isDuplicateMessage(messageData.message)) {
          const success = sendWhatsAppMessage(messageData.message);

          if (success) {
            if (messageData.updateType === "new" && messageData.row) {
              properties.setProperty(LAST_ROW_PROCESSED_PROPERTY, messageData.row.toString());
            }

            cacheLastMessage(messageData.message);
          } else {
            messageData.scheduledSendTime = currentTime + 5 * 60000; // Retry in 5 minutes
            remainingMessages.push(messageData);
          }
        }
      } else {
        remainingMessages.push(messageData);
      }
    }

    if (remainingMessages.length > 0) {
      properties.setProperty(PENDING_MESSAGES_PROPERTY, JSON.stringify(remainingMessages));
    } else {
      properties.deleteProperty(PENDING_MESSAGES_PROPERTY);
    }
  } catch (error) {
    console.error("Error processing pending messages:", error);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Checks if all required fields in a row are filled
 */
function checkRowCompleteness(sheet, row) {
  // Required columns (except uang masuk and uang keluar)
  // 1:No, 2:Tanggal, 3:Jam, 4:Uraian, 7:Saldo, 9:Catatan
  const requiredColumns = [1, 2, 3, 4, 7, 9];

  for (const col of requiredColumns) {
    const value = sheet.getRange(row, col).getValue();
    if (!value && value !== 0) {
      return false;
    }
  }

  const uangMasuk = sheet.getRange(row, 5).getValue();
  const uangKeluar = sheet.getRange(row, 6).getValue();

  if ((!uangMasuk || uangMasuk === 0) && (!uangKeluar || uangKeluar === 0)) {
    return false;
  }

  return true;
}

/**
 * Generates a financial update message
 */
function generateFinancialMessage(sheet, row, updateType) {
  const no = sheet.getRange(row, 1).getValue();
  const tanggal = sheet.getRange(row, 2).getValue();
  const jam = sheet.getRange(row, 3).getValue();
  const uraian = sheet.getRange(row, 4).getValue();
  const uangMasuk = sheet.getRange(row, 5).getValue();
  const uangKeluar = sheet.getRange(row, 6).getValue();
  const saldo = sheet.getRange(row, 7).getValue();
  const keterangan = sheet.getRange(row, 8).getValue();
  const catatan = sheet.getRange(row, 9).getValue();

  let formattedDate = tanggal;
  if (tanggal instanceof Date) {
    formattedDate = Utilities.formatDate(tanggal, "GMT+7", "dd/MM/yyyy");
  }

  const isUangMasuk = uangMasuk && uangMasuk > 0;
  const isUangKeluar = uangKeluar && uangKeluar > 0;

  let type = "";
  if (isUangMasuk) {
    type = "*UANG MASUK*";
  } else {
    type = "*UANG KELUAR*";
  }

  let message = "";

  let separator = "";
  if (isUangMasuk) {
    separator += "💰";
  }

  if (isUangKeluar) {
    separator += "📤";
  }

  if (updateType === "new") {
    message = `${separator} *LAPORAN BENDAHARA* ${separator}\n`;
  } else {
    message = "🔄 *UPDATE LAPORAN BENDAHARA* 🔄\n";
  }

  message += `\nNo: ${no}\n`;
  message += `Tanggal: ${formattedDate} ${jam}\n`;
  message += `Keterangan: ${type}\n`;

  if (keterangan || uraian) {
    message += `\nCatatan: *${uraian}${keterangan ? ` (${keterangan})` : ""}*\n`;
  }

  if (uangMasuk && uangMasuk > 0) {
    message += `Nominal: *Rp${formatMoney(uangMasuk)}*\n`;
  }

  if (uangKeluar && uangKeluar > 0) {
    message += `Nominal: *Rp${formatMoney(uangKeluar)}*\n`;
  }

  if (catatan) {
    let parts = catatan.split(":");
    let result = `${parts[0]}: *${parts[1].trim()}*`;
    message += `${result}\n`;
  }

  message += `\n💼 Saldo terkini: *Rp${formatMoney(saldo)}*`;

  return {
    message: message,
    rowData: {
      no,
      tanggal,
      jam,
      uraian,
      uangMasuk,
      uangKeluar,
      saldo,
      keterangan,
      catatan,
    },
  };
}

/**
 * Checks if a message is a duplicate of one recently sent
 */
function isDuplicateMessage(message) {
  const properties = PropertiesService.getScriptProperties();
  const lastMessage = properties.getProperty(MESSAGE_CACHE_PROPERTY);
  const lastTimestamp = properties.getProperty(MESSAGE_TIMESTAMP_PROPERTY);

  if (!lastMessage || !lastTimestamp) {
    return false;
  }

  const now = new Date().getTime();
  const lastSentTime = parseInt(lastTimestamp);

  if (message === lastMessage && now - lastSentTime < MIN_TIME_BETWEEN_MESSAGES) {
    return true;
  }

  return false;
}

/**
 * Caches the last message sent and timestamp
 */
function cacheLastMessage(message) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(MESSAGE_CACHE_PROPERTY, message);
  properties.setProperty(MESSAGE_TIMESTAMP_PROPERTY, new Date().getTime().toString());
}

/**
 * Formats a number as currency (adds thousand separators)
 */
function formatMoney(amount) {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Sends a message to WhatsApp using the WhatsApp Web JS API
 */
function sendWhatsAppMessage(message) {
  try {
    const payload = {
      groupId: GROUP_ID,
      message: message,
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    console.log("Sending message:", message);

    const response = UrlFetchApp.fetch(WHATSAPP_API_URL, options);

    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    console.log(`Response Code: ${responseCode}`);
    console.log(`Response Body: ${responseText}`);

    if (responseCode !== 200) {
      console.error("Error sending message. Response:", responseText);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending WhatsApp message:", error);
    return false;
  }
}

/**
 * Manual test function to verify everything is working
 * Can be run manually from the script editor
 */
function testWhatsAppIntegration() {
  const testMessage = "🧪 *TEST NOTIFICATION*\n" + "Dugedagedigedu";
  sendWhatsAppMessage(testMessage);
}

/**
 * Function to manually send a summary of the current financial status
 * Can be run on a time-based trigger (e.g., daily or weekly)
 */
function sendFinancialSummary() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();

  const latestSaldo = sheet.getRange(lastRow, 7).getValue();

  let totalPemasukan = 0;
  let totalPengeluaran = 0;

  for (let i = 3; i <= lastRow; i++) {
    const uangMasuk = sheet.getRange(i, 5).getValue() || 0;
    const uangKeluar = sheet.getRange(i, 6).getValue() || 0;

    totalPemasukan += uangMasuk;
    totalPengeluaran += uangKeluar;
  }

  const message =
    "📊 *RINGKASAN KEUANGAN*\n" +
    "───\n" +
    `Total Pemasukan: *Rp${formatMoney(totalPemasukan)}*\n` +
    `Total Pengeluaran: *Rp${formatMoney(totalPengeluaran)}*\n` +
    `\nSaldo Terkini: *Rp${formatMoney(latestSaldo)}*\n` +
    "───\n";

  sendWhatsAppMessage(message);
}

/**
 * Sets up a time-based trigger to send daily summaries
 * Run this function once manually to create the trigger
 */
function createDailySummaryTrigger() {
  ScriptApp.newTrigger("sendFinancialSummary").timeBased().atHour(21).everyDays(1).create();
  console.log("Daily summary trigger created successfully");
}

/**
 * Function to get the group ID by connecting to the WhatsApp Web JS server
 * Run this manually to see list of available groups
 */
function getWhatsAppGroups() {
  try {
    const apiUrl = "http://103.87.66.140:3000/get-groups";
    const response = UrlFetchApp.fetch(apiUrl);

    const responseText = response.getContentText();
    console.log("Available groups:", responseText);

    const responseData = JSON.parse(responseText);

    if (responseData.success && responseData.groups) {
      responseData.groups.forEach((group, index) => {
        console.log(`Group ${index + 1}: ${group.name} - ID: ${group.id}`);
      });
    }
  } catch (error) {
    console.error("Error getting WhatsApp groups:", error);
  }
}
