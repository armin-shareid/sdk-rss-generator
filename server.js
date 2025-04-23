require("dotenv").config();

const express = require("express");
const cheerio = require("cheerio");
const { format } = require("date-fns");
const puppeteer = require("puppeteer");
const fs = require("fs");
const nodemailer = require("nodemailer");

const app = express();
const PORT = 3000;

const HOST_DOMAIN = process.env.SHAREID_URL || `localhost:${PORT}`;
const PROTOCOL = process.env.SHAREID_URL ? "https" : "http";
const BASE_URL = `${PROTOCOL}://${HOST_DOMAIN}`;
const RSS_WEB_URL = `/rss-web.xml`;
const RSS_IOS_URL = `/rss-ios.xml`;
const RSS_ANDROID_URL = `/rss-android.xml`;

const GITBOOK_SDK_WEB_URL = process.env.GITBOOK_SDK_WEB_URL;
const GITBOOK_SDK_IOS_URL = process.env.GITBOOK_SDK_IOS_URL;
const GITBOOK_SDK_ANDROID_URL = process.env.GITBOOK_SDK_ANDROID_URL;

const RSS_FILE_PATHS = {
  web: "latest_web_changelog_rss.xml",
  ios: "latest_ios_changelog_rss.xml",
  android: "latest_android_changelog_rss.xml",
};

async function createTestTransporter() {
  if (!EMAIL_CONFIG.enabled) return null;

  const testAccount = await nodemailer.createTestAccount();

  console.log("Test email credentials:", {
    user: testAccount.user,
    pass: testAccount.pass,
    previewURL: "https://ethereal.email",
  });

  return nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
}

const EMAIL_CONFIG = {
  enabled: process.env.EMAIL_ENABLED === "true",
  test: process.env.EMAIL_TEST === "true",
  service: process.env.EMAIL_SERVICE || "gmail",
  user: process.env.EMAIL_USER,
  pass: process.env.EMAIL_PASS,
  from: process.env.EMAIL_FROM || "changelog@yourcompany.com",
  recipients: (process.env.EMAIL_RECIPIENTS || "")
    .split(",")
    .map((email) => email.trim()),
  subject: process.env.EMAIL_SUBJECT || "New SDK Changelog Updates",
};

let transporter = null;

if (EMAIL_CONFIG.enabled && EMAIL_CONFIG.user && EMAIL_CONFIG.pass) {
  if (EMAIL_CONFIG.test) {
    createTestTransporter()
      .then((transport) => {
        transporter = transport;
        console.log("Test email transport ready");
      })
      .catch((err) => {
        console.error("Failed to create test email transport:", err);
      });
  } else {
    transporter = nodemailer.createTransport({
      service: EMAIL_CONFIG.service,
      auth: {
        user: EMAIL_CONFIG.user,
        pass: EMAIL_CONFIG.pass,
      },
    });
  }
  console.log("Email notifications enabled");
} else {
  console.log("Email notifications disabled or not configured");
}

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.get("/", (req, res) => {
  fs.readFile(__dirname + "/index.html", "utf8", (err, data) => {
    if (err) {
      return res.status(500).send("Error loading page");
    }

    const html = data
      .replace(/\{\{RSS_WEB_URL\}\}/g, `${BASE_URL}${RSS_WEB_URL}`)
      .replace(/\{\{RSS_IOS_URL\}\}/g, `${BASE_URL}${RSS_IOS_URL}`)
      .replace(/\{\{RSS_ANDROID_URL\}\}/g, `${BASE_URL}${RSS_ANDROID_URL}`);

    res.send(html);
  });
});

app.get(RSS_WEB_URL, async (req, res) => {
  await generateRssFeed(GITBOOK_SDK_WEB_URL, "SDK Web Changelog", "web", res);
});

app.get(RSS_IOS_URL, async (req, res) => {
  await generateRssFeed(GITBOOK_SDK_IOS_URL, "SDK iOS Changelog", "ios", res);
});

app.get(RSS_ANDROID_URL, async (req, res) => {
  await generateRssFeed(
    GITBOOK_SDK_ANDROID_URL,
    "SDK Android Changelog",
    "android",
    res
  );
});

app.get("/test-email", async (req, res) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "Test SDK Update Email",
      html: "<h1>Test Email</h1><p>This is a test email for SDK changelog updates.</p>",
    });

    if (EMAIL_CONFIG.test) {
      // Log the preview URL for Ethereal
      console.log(`📨 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }
    res.send("Test email sent! Check your inbox.");
  } catch (error) {
    res.status(500).send("Error sending test email: " + error.message);
  }
});

function saveRssToFile(content, type) {
  const filePath = RSS_FILE_PATHS[type];
  fs.writeFile(filePath, content, (err) => {
    if (err) {
      console.error(`Error saving ${type} RSS feed to file:`, err);
    } else {
      console.log(`✅ ${type.toUpperCase()} RSS feed saved to ${filePath}`);
    }
  });
}

function fileExists(filePath) {
  return new Promise((resolve) => {
    fs.access(filePath, fs.constants.F_OK, (err) => {
      resolve(!err);
    });
  });
}

function readFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function extractItems(rssContent) {
  const items = [];
  const itemRegex =
    /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<\/item>/g;
  let match;

  while ((match = itemRegex.exec(rssContent)) !== null) {
    items.push({
      title: match[1],
      link: match[2],
      pubDate: match[3],
    });
  }

  return items;
}

function findNewItems(newItems, oldItems) {
  return newItems.filter(
    (newItem) =>
      !oldItems.some(
        (oldItem) =>
          oldItem.title === newItem.title && oldItem.link === newItem.link
      )
  );
}

async function sendChangelogEmail(newItems, type, newRssFeed) {
  if (
    !EMAIL_CONFIG.enabled ||
    !transporter ||
    !newItems.length ||
    !EMAIL_CONFIG.recipients.length
  ) {
    return;
  }

  try {
    const itemDetails = newItems.map((item) => {
      const itemMatch = new RegExp(
        `<item>\\s*<title>${item.title.replace(
          /[-\/\\^$*+?.()|[\]{}]/g,
          "\\$&"
        )}</title>[\\s\\S]*?<description><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></description>[\\s\\S]*?</item>`,
        "g"
      ).exec(newRssFeed);
      return {
        ...item,
        description: itemMatch ? itemMatch[1] : "No description available",
      };
    });

    const htmlContent = `
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
        <a href="${
          type === "web"
            ? GITBOOK_SDK_WEB_URL
            : type === "ios"
            ? GITBOOK_SDK_IOS_URL
            : GITBOOK_SDK_ANDROID_URL
        }">
          View the full changelog RSS feed
        </a>
      </p>
    </body>
    </html>
    `;

    for (const recipient of EMAIL_CONFIG.recipients) {
      const info = await transporter.sendMail({
        from: EMAIL_CONFIG.from,
        to: recipient,
        subject: `${EMAIL_CONFIG.subject} - ${type.toUpperCase()} SDK`,
        html: htmlContent,
      });

      console.log(`📧 Email sent to ${recipient} for ${type} SDK updates: ${info.messageId}`);

      if (EMAIL_CONFIG.test) {
        // Log the preview URL for Ethereal
        console.log(`📨 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      }
    }

    console.log(`✅ Sent individual emails to ${EMAIL_CONFIG.recipients.length} recipients`);
  } catch (error) {
    console.error(`Error sending changelog email for ${type}:`, error);
  }
}

async function compareAndSaveRss(newRssFeed, type) {
  const filePath = RSS_FILE_PATHS[type];
  const exists = await fileExists(filePath);

  if (!exists) {
    console.log(`📄 Creating new ${type} RSS feed file`);
    saveRssToFile(newRssFeed, type);
    const newItems = extractItems(newRssFeed);
    return newItems;
  }

  try {
    const oldRssFeed = await readFile(filePath);

    const newItems = extractItems(newRssFeed);
    const oldItems = extractItems(oldRssFeed);

    const addedItems = findNewItems(newItems, oldItems);

    if (addedItems.length > 0) {
      console.log(`🔄 Found ${addedItems.length} new items in ${type} feed`);
      saveRssToFile(newRssFeed, type);

      await sendChangelogEmail(addedItems, type, newRssFeed);

      return addedItems;
    } else {
      console.log(`✓ No changes in ${type} RSS feed`);
      return [];
    }
  } catch (error) {
    console.error(`Error comparing ${type} RSS feeds:`, error);
    saveRssToFile(newRssFeed, type);
    return [];
  }
}

async function generateRssFeed(gitbookUrl, title, type, res) {
  if (!gitbookUrl) {
    console.error(`URL for ${type} feed is not defined`);
    return res
      .status(500)
      .send(`Error generating RSS feed: URL for ${type} SDK is not configured`);
  }

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
    const page = await browser.newPage();
    await page.goto(gitbookUrl, { waitUntil: "networkidle2" });

    const renderedHtml = await page.content();
    await browser.close();
    browser = null;

    const $ = cheerio.load(renderedHtml);
    const items = [];

    // Extract based on the type of SDK documentation structure
    if (type === "web") {
      // Web SDK has <details> sections for different SDK types
      $("details").each((i, detailsEl) => {
        const sdkType = $(detailsEl).find("summary").text().trim();
        parseVersions($(detailsEl), sdkType);
      });
    } else {
      // iOS and Android SDKs have h2 elements directly in the page
      parseVersions($("body"), title);
    }

    function parseVersions(container, sdkType) {
      container.find("h2").each((i, el) => {
        const title = $(el).find("div.grid-area-1-1").text().trim();

        // Skip if the title is empty
        if (!title) return;

        // Attempt to find a stable anchor/link for the version
        const anchor =
          $(el).attr("id") ||
          $(el).find("a[href^='#']").attr("href")?.substring(1) ||
          "";

        // Construct the link - Check if the base URL already has a fragment
        const baseUrlWithoutFragment = gitbookUrl.split("#")[0];
        const link = `${baseUrlWithoutFragment}${anchor ? "#" + anchor : ""}`;

        // Extract the full description including all <p> and <ul> elements until the next <h2>
        let description = [];
        let currentEl = $(el).next();

        while (currentEl.length && !currentEl.is("h2") && !currentEl.is("hr")) {
          if (currentEl.is("p")) {
            // Add paragraphs as separate entries
            description.push(currentEl.text().trim());
          } else if (currentEl.is("ul")) {
            // Handle list items individually
            const listItems = [];
            currentEl.find("li").each((_, li) => {
              const formattedLi = $(li).text().trim().split("\n").join(" ");
              listItems.push(`<li>${formattedLi}</li>`);
            });
            if (listItems.length > 0) {
              description.push(`<ul>${listItems.join("\n")}</ul>`);
            }
          }
          currentEl = currentEl.next();
        }

        // If we've hit an <hr>, check if there's a p and ul following it that belong to this section
        if (currentEl.is("hr")) {
          currentEl = currentEl.next();
          while (currentEl.length && !currentEl.is("h2")) {
            if (currentEl.is("p")) {
              description.push(currentEl.text().trim());
            } else if (currentEl.is("ul")) {
              const listItems = [];
              currentEl.find("li").each((_, li) => {
                const formattedLi = $(li).text().trim().split("\n").join(" ");
                listItems.push(`<li>${formattedLi}</li>`);
              });
              if (listItems.length > 0) {
                description.push(`<ul>${listItems.join("\n")}</ul>`);
              }
            }
            currentEl = currentEl.next();
          }
        }

        // Basic check if description is meaningful
        if (description.length === 0) return;

        // Join the description sections with double newlines
        const formattedDescription = description.join("\n\n");

        // Use a fixed date for now, or find a way to extract date from page if possible
        let pubDateStr = format(new Date(), "EEE, dd MMM yyyy HH:mm:ss xx");
        const dateMatch = title.match(/(\d{4}\/\d{2}\/\d{2})/);
        if (dateMatch && dateMatch[1]) {
          try {
            const parsedDate = new Date(dateMatch[1].replace(/\//g, "-"));
            if (!isNaN(parsedDate)) {
              pubDateStr = format(parsedDate, "EEE, dd MMM yyyy HH:mm:ss xx");
            }
          } catch (parseError) {
            // Ignore if parsing fails, use current date
          }
        }
        const pubDate = pubDateStr;

        items.push(`
            <item>
              <title>${sdkType}: ${title}</title>
              <link>${link}</link>
              <description><![CDATA[${formattedDescription}]]></description>
              <pubDate>${pubDate}</pubDate>
            </item>
          `);
      });
    }

    const feedUrls = {
      web: RSS_WEB_URL,
      ios: RSS_IOS_URL,
      android: RSS_ANDROID_URL,
    };

    const feedUrl = `${BASE_URL}${feedUrls[type]}`;

    const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
            <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
                <channel>
                    <title>${title}</title>
                    <link>${gitbookUrl}</link>
                    <description>Latest updates to the ${title}</description>
                    <language>en-us</language>
                    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
                    <lastBuildDate>${format(
                      new Date(),
                      "EEE, dd MMM yyyy HH:mm:ss xx"
                    )}</lastBuildDate>
                    ${items.join("\n")}
                </channel>
            </rss>`;

    res.set("Content-Type", "application/rss+xml");
    res.send(rssFeed);

    const newItems = await compareAndSaveRss(rssFeed, type);

    if (newItems.length > 0) {
      console.log(
        `New ${type} items:`,
        newItems.map((item) => item.title).join(", ")
      );
    }
  } catch (error) {
    console.error(`Error generating RSS feed for ${type}: ${error.message}`);
    if (browser) {
      await browser.close();
    }
    res
      .status(500)
      .send(`Error generating RSS feed for ${title}: ${error.message}`);
  }
}

app.listen(PORT, () => {
  console.log(`🚀 RSS feed ready at ${BASE_URL}${RSS_WEB_URL}`);
  console.log(`🚀 RSS feed ready at ${BASE_URL}${RSS_IOS_URL}`);
  console.log(`🚀 RSS feed ready at ${BASE_URL}${RSS_ANDROID_URL}`);
  console.log(`📧 Send test email at ${BASE_URL}/test-email`);
});
