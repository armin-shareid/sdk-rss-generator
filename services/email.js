const nodemailer = require("nodemailer");
const config = require("../config/config");

let transporter = null;

async function initializeEmailTransporter() {
  if (!config.EMAIL_CONFIG.enabled) {
    console.log("Email notifications disabled");
    return null;
  }

  if (config.EMAIL_CONFIG.test) {
    return createTestTransporter();
  } else if (config.EMAIL_CONFIG.user && config.EMAIL_CONFIG.pass) {
    transporter = nodemailer.createTransport({
      service: config.EMAIL_CONFIG.service,
      auth: {
        user: config.EMAIL_CONFIG.user,
        pass: config.EMAIL_CONFIG.pass,
      },
    });
    console.log("Email notifications enabled");
    return transporter;
  } else {
    console.log("Email notifications not properly configured");
    return null;
  }
}

async function createTestTransporter() {
  try {
    const testAccount = await nodemailer.createTestAccount();

    console.log("Test email credentials:", {
      user: testAccount.user,
      pass: testAccount.pass,
      previewURL: "https://ethereal.email",
    });

    transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    console.log("Test email transport ready");
    return transporter;
  } catch (err) {
    console.error("Failed to create test email transport:", err);
    return null;
  }
}

async function sendChangelogEmail(newItems, type, newRssFeed) {
  if (
    !config.EMAIL_CONFIG.enabled ||
    !transporter ||
    !newItems.length ||
    !config.EMAIL_CONFIG.recipients.length
  ) {
    return;
  }

  try {
    const itemRegex = (item) =>
      new RegExp(
        `<item>\\s*<title>${item.title.replace(
          /[-\/\\^$*+?.()|[\]{}]/g,
          "\\$&"
        )}</title>[\\s\\S]*?<description><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></description>[\\s\\S]*?</item>`,
        "g"
      );

    const itemDetails = newItems.map((item) => {
      const match = itemRegex(item).exec(newRssFeed);
      return {
        ...item,
        description: match ? match[1] : "No description available",
      };
    });

    const htmlContent = buildEmailTemplate(itemDetails, type);

    for (const recipient of config.EMAIL_CONFIG.recipients) {
      const info = await transporter.sendMail({
        from: config.EMAIL_CONFIG.from,
        to: recipient,
        subject: `${config.EMAIL_CONFIG.subject} - ${type.toUpperCase()} SDK`,
        html: htmlContent,
      });

      console.log(
        `📧 Email sent to ${recipient} for ${type} SDK updates: ${info.messageId}`
      );

      if (config.EMAIL_CONFIG.test) {
        console.log(`📨 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      }
    }

    console.log(
      `✅ Sent individual emails to ${config.EMAIL_CONFIG.recipients.length} recipients`
    );
  } catch (error) {
    console.error(`Error sending changelog email for ${type}:`, error);
  }
}

function buildEmailTemplate(itemDetails, type) {
  const gitbookUrl =
    type === "web"
      ? config.GITBOOK_SDK_WEB_URL
      : type === "ios"
      ? config.GITBOOK_SDK_IOS_URL
      : config.GITBOOK_SDK_ANDROID_URL;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; }
        h1 { color: #2c3e50; }
        h2 { color: #3498db; margin-top: 20px; }
        .item { margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 20px; }
        .date { color: #7f8c8d; font-size: 14px; }
        ul { margin-top: 10px; }
        li { margin-bottom: 8px; }
        a { color: #3498db; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <h1>New ${type.toUpperCase()} SDK Updates</h1>
      <p>The following updates have been made to the ${type} SDK:</p>
      
      ${itemDetails
        .map(
          (item) => `
        <div class="item">
          <h2><a href="${item.link}">${item.title}</a></h2>
          <p class="date">Released: ${item.pubDate}</p>
          <div class="description">
            ${item.description}
          </div>
        </div>
      `
        )
        .join("")}
      
      <p>
        <a href="${gitbookUrl}">
          View the full changelog
        </a>
      </p>
    </body>
    </html>
    `;
}

async function sendTestEmail() {
  if (!transporter) {
    throw new Error("Email transport not initialized");
  }

  const info = await transporter.sendMail({
    from: config.EMAIL_CONFIG.from,
    to: config.EMAIL_CONFIG.recipients[0] || config.EMAIL_CONFIG.from,
    subject: "Test SDK Update Email",
    html: "<h1>Test Email</h1><p>This is a test email for SDK changelog updates.</p>",
  });

  if (config.EMAIL_CONFIG.test) {
    console.log(`📨 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
  }

  return info;
}

module.exports = {
  initializeEmailTransporter,
  sendChangelogEmail,
  sendTestEmail,
  getTransporter: () => transporter,
};
