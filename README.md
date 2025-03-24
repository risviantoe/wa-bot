# WhatsApp Financial Report Bot

A Google Apps Script-based automation system that monitors a financial spreadsheet and sends automatic notifications to a WhatsApp group when financial transactions are recorded.

## Overview

This system consists of two main components:

1. A Google Apps Script that runs within a Google Sheet to monitor changes and generate financial reports
2. A Node.js server that connects to WhatsApp Web and provides an API for sending messages

## Features

- 🔄 Automatic detection of new financial entries
- 💰 Formatted financial reports sent to WhatsApp
- 📊 Daily financial summaries
- ⏱️ Delayed message sending to prevent duplicate notifications
- 🔒 Ensures complete data before sending notifications
- 🚫 Duplicate message prevention

## Setup Instructions

### Google Sheet Setup

1. Create or open your financial spreadsheet in Google Sheets
2. Ensure it has a sheet named "REKAP" with the following columns:
   - Col 1: No
   - Col 2: Tanggal (Date)
   - Col 3: Jam (Time)
   - Col 4: Uraian (Description)
   - Col 5: Uang Masuk (Income)
   - Col 6: Uang Keluar (Expense)
   - Col 7: Saldo (Balance)
   - Col 8: Keterangan (Additional Notes)
   - Col 9: Catatan (Category/Notes)
3. Open the Script Editor (Extensions > Apps Script)
4. Copy the contents of `app-script.js` into the editor
5. Save the script with a name like "Financial WhatsApp Bot"

### WhatsApp Server Setup

1. Ensure you have Node.js installed on your server
2. Clone this repository to your server
3. Install dependencies:
   ```
   npm install
   ```
4. Build and run the Docker container:
   ```
   docker build -t wa-bot-lap-keuangan .
   docker run -p 3000:3000 wa-bot-lap-keuangan
   ```
5. When the server starts, it will display a QR code in the console
6. Scan this QR code with WhatsApp on your phone to authenticate

## Configuring the Google Apps Script

1. In the script editor, modify the following constants at the top of the script:

   - `WHATSAPP_API_URL`: URL of your WhatsApp API server
   - `GROUP_ID`: The WhatsApp group ID where messages should be sent

2. Run the `resetAndCreateTriggers` function manually to set up all required triggers
3. Optionally run `createDailySummaryTrigger` to set up daily financial summaries

## Using the System

Once set up, the system works automatically:

1. When you add or edit a row in the spreadsheet, the system checks if all required fields are filled
2. If the row is complete, it generates a formatted financial message
3. The message is queued for sending after a short delay (to avoid sending during active editing)
4. The message is sent to the configured WhatsApp group

## Manual Functions

The script includes several functions you can run manually:

- `resetAndCreateTriggers`: Set up all required triggers
- `testWhatsAppIntegration`: Send a test message to verify the system is working
- `sendFinancialSummary`: Send a summary of current financial status
- `createDailySummaryTrigger`: Set up automatic daily summaries
- `getWhatsAppGroups`: List available WhatsApp groups and their IDs

## Troubleshooting

### Common Issues

1. **Messages not sending**: Check that your WhatsApp server is running and the QR code has been scanned
2. **Duplicate messages**: The system has built-in protection against duplicates. If necessary, run `resetAndCreateTriggers` to reset the message cache
3. **Authentication errors**: Re-scan the QR code on the server

### Logging

- Check the Google Apps Script execution logs for debugging (View > Execution Log)
- Check the Node.js server console for WhatsApp connection issues

## License

This project is provided as-is for educational and personal use.

## Security Note

This implementation uses an unauthenticated API endpoint. For production use, consider adding API key authentication to the WhatsApp server.
