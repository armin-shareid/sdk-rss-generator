const express = require("express");
const router = express.Router();
const fs = require("fs");
const { scrapeChangelog } = require("../services/scrapper");
const { compareAndSaveRss, buildRssFeed } = require("../services/rss");
const { sendTestEmail } = require("../services/email");
const config = require("../config/config");

// Home page
router.get("/", (req, res) => {
  fs.readFile(__dirname + "/../index.html", "utf8", (err, data) => {
    if (err) {
      return res.status(500).send("Error loading page");
    }

    const html = data
      .replace(
        /\{\{RSS_WEB_URL\}\}/g,
        `${config.BASE_URL}${config.RSS_WEB_URL}`
      )
      .replace(
        /\{\{RSS_IOS_URL\}\}/g,
        `${config.BASE_URL}${config.RSS_IOS_URL}`
      )
      .replace(
        /\{\{RSS_ANDROID_URL\}\}/g,
        `${config.BASE_URL}${config.RSS_ANDROID_URL}`
      );

    res.send(html);
  });
});

// Web SDK RSS feed
router.get(config.RSS_WEB_URL, async (req, res) => {
  await generateRssFeed(
    config.GITBOOK_SDK_WEB_URL,
    "SDK Web Changelog",
    "web",
    res
  );
});

// iOS SDK RSS feed
router.get(config.RSS_IOS_URL, async (req, res) => {
  await generateRssFeed(
    config.GITBOOK_SDK_IOS_URL,
    "SDK iOS Changelog",
    "ios",
    res
  );
});

// Android SDK RSS feed
router.get(config.RSS_ANDROID_URL, async (req, res) => {
  await generateRssFeed(
    config.GITBOOK_SDK_ANDROID_URL,
    "SDK Android Changelog",
    "android",
    res
  );
});

// Test email endpoint
router.get("/test-email", async (req, res) => {
  try {
    await sendTestEmail();
    res.send("Test email sent! Check your inbox or console for preview URL.");
  } catch (error) {
    res.status(500).send("Error sending test email: " + error.message);
  }
});

router.get("/ping", (req, res) => {
  res.send("pong");
});

// Helper function for generating RSS feeds
async function generateRssFeed(gitbookUrl, title, type, res) {
  if (!gitbookUrl) {
    console.error(`URL for ${type} feed is not defined`);
    return res
      .status(500)
      .send(`Error generating RSS feed: URL for ${type} SDK is not configured`);
  }

  try {
    // Scrape the content
    const items = await scrapeChangelog(gitbookUrl, type);

    // Build the RSS feed
    const rssFeed = buildRssFeed(items, title, gitbookUrl, type);

    // Send response
    res.set("Content-Type", "application/rss+xml");
    res.send(rssFeed);

    // Compare and save RSS feed, get new items
    const newItems = await compareAndSaveRss(rssFeed, type);

    if (newItems.length > 0) {
      console.log(
        `New ${type} items:`,
        newItems.map((item) => item.title).join(", ")
      );
    }
  } catch (error) {
    console.error(`Error generating RSS feed for ${type}: ${error.message}`);
    res
      .status(500)
      .send(`Error generating RSS feed for ${title}: ${error.message}`);
  }
}

module.exports = router;
