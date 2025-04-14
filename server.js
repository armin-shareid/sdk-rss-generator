require('dotenv').config();

const express = require("express");
const cheerio = require("cheerio");
const { format } = require("date-fns");
const puppeteer = require("puppeteer");
const fs = require("fs");

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

async function generateRssFeed(gitbookUrl, title, type, res) {
  if (!gitbookUrl) {
    console.error(`URL for ${type} feed is not defined`);
    return res.status(500).send(`Error generating RSS feed: URL for ${type} SDK is not configured`);
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

        const anchor = $(el).attr("id") || $(el).find("a[href^='#']").attr("href")?.substring(1) || "";
        const baseUrlWithoutFragment = gitbookUrl.split("#")[0];
        const link = `${baseUrlWithoutFragment}${anchor ? "#" + anchor : ""}`;

        // Initialize description parts array
        let descriptionParts = [];
        let currentSection = "";
        let currentEl = $(el).next();
        
        while (currentEl.length && !currentEl.is("h2") && !currentEl.is("hr")) {
          if (currentEl.is("p")) {
            const text = currentEl.text().trim();
            if (text.includes("🚀") || text.includes("🛠")) {
              // Add extra newline before new section if not first section
              if (descriptionParts.length > 0) {
                descriptionParts.push("");
              }
              descriptionParts.push(text);
              descriptionParts.push(""); // Add empty line after section header
              currentSection = text;
            } else {
              descriptionParts.push(text);
            }
          } else if (currentEl.is("ul")) {
            const listItems = [];
            currentEl.find("li").each((_, li) => {
              listItems.push(`• ${$(li).text().trim()}`);
            });
            if (listItems.length > 0) {
              descriptionParts.push(listItems.join("\n"));
              descriptionParts.push(""); // Add empty line after list
            }
          }
          currentEl = currentEl.next();
        }

        // Handle content after <hr> if present
        if (currentEl.is("hr")) {
          currentEl = currentEl.next();
          while (currentEl.length && !currentEl.is("h2")) {
            if (currentEl.is("p")) {
              const text = currentEl.text().trim();
              if (text.includes("🚀") || text.includes("🛠")) {
                // Add extra newline before new section
                descriptionParts.push("");
                descriptionParts.push(text);
                descriptionParts.push(""); // Add empty line after section header
                currentSection = text;
              } else {
                descriptionParts.push(text);
              }
            } else if (currentEl.is("ul")) {
              const listItems = [];
              currentEl.find("li").each((_, li) => {
                listItems.push(`• ${$(li).text().trim()}`);
              });
              if (listItems.length > 0) {
                descriptionParts.push(listItems.join("\n"));
                descriptionParts.push(""); // Add empty line after list
              }
            }
            currentEl = currentEl.next();
          }
        }

        // Remove any trailing empty lines
        while (descriptionParts.length > 0 && descriptionParts[descriptionParts.length - 1] === "") {
          descriptionParts.pop();
        }

        // Skip if no meaningful content
        if (descriptionParts.length === 0) return;

        // Join with double newlines to ensure proper spacing
        const description = descriptionParts.join("\n");

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
              <description><![CDATA[${description}]]></description>
              <pubDate>${pubDate}</pubDate>
            </item>
          `);
      });
    }

    console.log(items);

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
                    <lastBuildDate>${format(new Date(), "EEE, dd MMM yyyy HH:mm:ss xx")}</lastBuildDate>
                    ${items.join("\n")}
                </channel>
            </rss>`;

    res.set("Content-Type", "application/rss+xml");
    res.send(rssFeed);
  } catch (error) {
    console.error(`Error generating RSS feed for ${type}: ${error.message}`);
    if (browser) {
      await browser.close();
    }
    res.status(500).send(`Error generating RSS feed for ${title}: ${error.message}`);
  }
}

app.listen(PORT, () => {
  console.log(`🚀 RSS feed ready at ${BASE_URL}${RSS_WEB_URL}`);
  console.log(`🚀 RSS feed ready at ${BASE_URL}${RSS_IOS_URL}`);
  console.log(`🚀 RSS feed ready at ${BASE_URL}${RSS_ANDROID_URL}`);
});
