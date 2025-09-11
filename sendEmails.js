const { google } = require("googleapis");
const nodemailer = require("nodemailer");

// --- Google Sheets Auth ---
const googleCredentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

const auth = new google.auth.JWT(
  googleCredentials.client_email,
  null,
  googleCredentials.private_key.replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });

// --- Constants ---
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = "Emails";

// --- Helpers ---
function getSmtpCredentials(senderEmail) {
  const userKey = "SMTP_USER_" + senderEmail.split("@")[0].toUpperCase();
  const passKey = "SMTP_PASS_" + senderEmail.split("@")[0].toUpperCase();

  const user = process.env[userKey];
  const pass = process.env[passKey];

  if (!user || !pass) {
    throw new Error(`Missing SMTP credentials for ${senderEmail}`);
  }

  return { user, pass };
}

async function sendMail(senderEmail, recipientEmail, subject, body) {
  const { user, pass } = getSmtpCredentials(senderEmail);

  const transporter = nodemailer.createTransport({
    host: "mail.inbox.lv",
    port: 587,
    secure: false,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: senderEmail,
    to: recipientEmail,
    subject: subject,
    html: body,
  });
}

// --- Main Function ---
async function processEmails() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:H`,
  });

  const rows = res.data.values || [];
  if (rows.length === 0) {
    console.log("No emails found.");
    return;
  }

  let updates = [];
  let sentCount = 0;

  for (let i = 0; i < rows.length && sentCount < 5; i++) {
    let row = rows[i];
    let [recipientEmail, recipientName, subject, body, assignedSender, status] = row;

    if (status && status.toLowerCase() === "sent") continue;

    // Default body if blank
    if (!body) {
      body = `
        Hi ${recipientName},<br><br>
        Looking to get off load boards and into better-paying freight? 
        At Prism Distributions, we connect serious carriers like you with high-dollar, steady freight.<br><br>
        ✅ Dry Vans<br>✅ Reefers<br>✅ Power Only<br>✅ Step Decks<br>✅ Flatbeds<br><br>
        Best regards,<br>Prism Distributions
      `;
    }

    try {
      await sendMail(assignedSender, recipientEmail, subject, body);
      console.log(`✅ Sent to ${recipientEmail} via ${assignedSender}`);
      updates.push({ row: i + 2, status: "sent", attempts: (row[7] || 0) + 1 });
      sentCount++;
    } catch (err) {
      console.error(`❌ Failed to ${recipientEmail}: ${err.message}`);
      updates.push({ row: i + 2, status: "failed", attempts: (row[7] || 0) + 1 });
    }
  }

  // Update sheet
  const requests = updates.map((u) => ({
    range: `${SHEET_NAME}!F${u.row}:H${u.row}`,
    values: [[u.status, "", u.attempts]],
  }));

  if (requests.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { data: requests, valueInputOption: "RAW" },
    });
  }

  console.log(`📨 Done. Sent ${sentCount} emails this run.`);
}

processEmails().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
