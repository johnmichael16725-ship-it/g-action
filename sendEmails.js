const nodemailer = require("nodemailer");
const { google } = require("googleapis");

// Google Sheets setup
const sheets = google.sheets("v4");
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const spreadsheetId = process.env.SPREADSHEET_ID;

// Email body (fixed)
function buildBody(name) {
  return `
  Hi ${name},<br><br>
  Looking to get off load boards and into better-paying freight? At Prism Distributions, we connect serious carriers like you with high-dollar, steady freight that moves fast — no hassle, no stress.<br><br>
  ✅ Dry Vans<br>✅ Reefers<br>✅ Power Only<br>✅ Step Decks<br>✅ Flatbeds<br>✅ Hotshots<br>✅ Box Trucks<br><br>
  We provide dispatch that earns more, saves time, and keeps you loaded. Here's what our carriers love:<br><br>
  💰 $8K–$10K weekly potential — based on actual carriers<br>
  📈 Transparent low-fee dispatch — no forced loads<br>
  📝 Full paperwork handling — you drive, we hustle<br>
  🛡 Fast Pay — no hold-ups, no stress<br><br>
  If your trailer is ready, so are we. Just send over your ZIP code + equipment and we'll get your week moving now.<br><br>
  Let's make this your most profitable week yet — real loads, real fast.<br><br>
  📍 1396 Bramlett Forest Ct, Lawrenceville, GA 30045<br>
  💳 EIN: 93-4662639<br><br>
  Best regards,<br>Prism Distributions
  `;
}

// Fetch rows from Google Sheet
async function getRows() {
  const client = await auth.getClient();
  const res = await sheets.spreadsheets.values.get({
    auth: client,
    spreadsheetId,
    range: "Emails!A2:H", // Adjust if needed
  });
  return res.data.values || [];
}

// Send email with correct account
async function sendEmail(sender, recipient, subject, body) {
  const senderKey = sender.split("@")[0].toUpperCase(); // e.g. JOHNDISPATCHER

  const transporter = nodemailer.createTransport({
    host: "mail.inbox.lv",
    port: 587,
    secure: false,
    auth: {
      user: process.env[`SMTP_USER_${senderKey}`],
      pass: process.env[`SMTP_PASS_${senderKey}`],
    },
  });

  const info = await transporter.sendMail({
    from: sender,
    to: recipient,
    subject,
    html: body,
  });

  console.log(`✅ Sent to ${recipient} from ${sender}: ${info.messageId}`);
}

// Main function
async function main() {
  const rows = await getRows();
  let count = 0;

  for (const row of rows) {
    const [recipientEmail, recipientName, subject, bodyHtml, assignedSender, status] = row;

    if (!recipientEmail || !assignedSender || status === "sent") continue;
    if (count >= 5) break; // limit per run (per account scheduling will balance)

    const body = bodyHtml && bodyHtml.trim() !== "" ? bodyHtml : buildBody(recipientName);

    try {
      await sendEmail(assignedSender, recipientEmail, subject, body);
      count++;
    } catch (err) {
      console.error(`❌ Failed to send to ${recipientEmail}: ${err.message}`);
    }
  }
}

main().catch(console.error);
