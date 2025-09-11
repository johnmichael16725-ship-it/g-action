const { GoogleSpreadsheet } = require("google-spreadsheet");
const nodemailer = require("nodemailer");

// ---- Load Service Account from GitHub Secret ----
const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

// ---- Spreadsheet Setup ----
const SHEET_ID = "1kePTiK78wxPIDhXe2YbKt_rJ52xXyO3O5Us0YzDkdFs"; // tumhari sheet ID
const doc = new GoogleSpreadsheet(SHEET_ID);

async function sendEmails() {
  try {
    // Auth with service account
    await doc.useServiceAccountAuth(serviceAccount);
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex[0]; // first sheet (Emails tab)
    const rows = await sheet.getRows();

    let sentCount = 0;

    for (let row of rows) {
      if (row.Status && row.Status.toLowerCase() === "sent") continue;

      const recipient = row.RecipientEmail;
      const subject = row.Subject || "No subject";
      const body = row.BodyHTML || `Hi ${row.RecipientName || ""},<br><br>Default body text.`;
      const senderEmail = row.AssignedSender;

      if (!recipient || !senderEmail) continue;

      // Get SMTP creds from GitHub secrets dynamically
      const userKey = "SMTP_USER_" + senderEmail.split("@")[0].toUpperCase();
      const passKey = "SMTP_PASS_" + senderEmail.split("@")[0].toUpperCase();

      const smtpUser = process.env[userKey];
      const smtpPass = process.env[passKey];

      if (!smtpUser || !smtpPass) {
        console.error(`Missing SMTP creds for ${senderEmail}`);
        continue;
      }

      // Nodemailer transporter
      const transporter = nodemailer.createTransport({
        host: "mail.inbox.lv",
        port: 587,
        secure: false,
        auth: { user: smtpUser, pass: smtpPass },
      });

      try {
        await transporter.sendMail({
          from: senderEmail,
          to: recipient,
          subject,
          html: body,
        });

        row.Status = "sent";
        row.LastSent = new Date().toISOString();
        row.Attempts = (parseInt(row.Attempts || "0") + 1).toString();
        await row.save();

        sentCount++;
        if (sentCount >= 5) break; // per run 5 emails limit per account
      } catch (err) {
        row.Status = "failed: " + err.message;
        await row.save();
        console.error(`Failed to send to ${recipient}:`, err.message);
      }
    }

    console.log(`✅ Sent ${sentCount} emails this run`);
  } catch (err) {
    console.error("❌ Error in sendEmails:", err);
  }
}

sendEmails();
