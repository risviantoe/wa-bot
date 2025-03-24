# WhatsApp Bot for Financial Reporting

A Google Apps Script project that connects a Google Sheet with a WhatsApp group to automatically send financial reports and respond to commands.

## Overview

This system integrates a financial tracking spreadsheet with WhatsApp, automatically posting updates when financial entries are modified. It also responds to commands from group members to provide financial summaries and information.

## Features

- Automatic notification of new financial entries
- Update notifications when existing entries are modified
- Command-based interaction (!cek summary, !cek terakhir, !cek bantuan)
- Financial summaries with customizable formatting
- Intelligent message throttling to prevent duplicates
- Delayed message sending to allow for rapid consecutive edits

## Setup Instructions

### Google Sheets Setup

1. Create a new Google Sheet or use an existing financial tracking sheet
2. Format your sheet with the following columns:
   - Column 1: No (transaction number)
   - Column 2: Tanggal (date)
   - Column 3: Jam (time)
   - Column 4: Uraian (description)
   - Column 5: Uang Masuk (money in)
   - Column 6: Uang Keluar (money out)
   - Column 7: Saldo (balance)
   - Column 8: Keterangan (additional notes)
   - Column 9: Catatan (formatted notes)
3. Name your sheet tab appropriately

### WhatsApp API Server Setup

1. Set up the WhatsApp API server (not included in this repository)
2. Make sure the server has the following endpoints:
   - `/send-message` - For sending messages
   - `/check-commands` - For checking pending commands
   - `/ping` - For checking server status
   - `/get-groups` - For listing available groups

### Google Apps Script Setup

1. Open your Google Sheet
2. Go to Extensions > Apps Script
3. Copy the contents of `app-script.js` into the script editor
4. Replace the configuration variables at the top:
   ```javascript
   const SHEET_NAME = "YOUR-SHEET-NAME";
   const WHATSAPP_API_URL = "http://YOUR-SERVER-IP/send-message";
   const WHATSAPP_CHECK_COMMANDS_URL = "http://YOUR-SERVER-IP/check-commands";
   const WHATSAPP_PING_URL = "http://YOUR-SERVER-IP/ping";
   const GROUP_ID = "YOUR-GROUP-ID";
   ```
5. Save the project

### Deploying the Web App

1. Click on Deploy > New deployment
2. Select "Web app" as the type
3. Set the following options:
   - Execute as: Me
   - Who has access: Anyone
4. Click Deploy
5. Copy the web app URL for configuration with your WhatsApp API server

## Configuration Variables

- `SHEET_NAME`: The exact name of your sheet tab
- `WHATSAPP_API_URL`: URL for sending WhatsApp messages
- `WHATSAPP_CHECK_COMMANDS_URL`: URL for checking pending commands
- `WHATSAPP_PING_URL`: URL for pinging the WhatsApp server
- `GROUP_ID`: WhatsApp group ID to send messages to
- `MIN_TIME_BETWEEN_MESSAGES`: Minimum time between duplicate messages (ms)
- `MESSAGE_DELAY`: Delay between edit and message sending (ms)
- `COMMAND_CHECK_INTERVAL`: Interval for checking new commands (ms)

## Usage

### Initializing the System

1. After setting up configuration, run the `resetAndCreateTriggers` function once
2. Use `getWhatsAppGroups` to find your group ID if you don't know it
3. Run `testWhatsAppIntegration` to test the connection
4. Use `runSystemTest` for a more comprehensive test

### Available Commands

Users in the WhatsApp group can use these commands:

- `!cek summary` - Get a financial summary report
- `!cek terakhir` - Get the latest financial transaction
- `!cek bantuan` - Get a list of available commands

### Administrative Functions

- `resetAndCreateTriggers` - Reset and create all necessary triggers
- `createDailySummaryTrigger` - Create a trigger to send daily summaries
- `getWhatsAppGroups` - Get a list of available WhatsApp groups
- `testWhatsAppIntegration` - Test the WhatsApp connection
- `runSystemTest` - Run a comprehensive system test
- `manualCheckForCommands` - Manually check for pending commands

## Troubleshooting

- If messages aren't being sent, check the WhatsApp server status with `runSystemTest`
- Check the Apps Script execution logs for error messages
- Verify that the sheet name exactly matches the configured `SHEET_NAME`
- Ensure the WhatsApp API server is online and accessible

## Notes

- The system processes edits to rows with complete data (all required fields)
- Messages are queued and sent with a delay to accommodate rapid consecutive edits
- Duplicate message detection prevents spamming the group

## License

This project is licensed under the MIT License - see the LICENSE file for details.
