const express = require("express");
const cheerio = require("cheerio");
const { format } = require("date-fns");
const puppeteer = require("puppeteer");

const app = express();
const PORT = 3000;

const GITBOOK_URL = "https://doc.shareid.ai/shareid-integration-doc/changelog/sdk-web#onboarding-sdk";

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get("/rss.xml", async (req, res) => {
  let browser = null;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(GITBOOK_URL, { waitUntil: "networkidle2" });

    const renderedHtml = await page.content();
    console.log("renderedHtml", renderedHtml);

    await browser.close();
    browser = null;

    const $ = cheerio.load(renderedHtml);

    const items = [];

    // Iterate over each <details> element to distinguish between SDKs
    $("details").each((i, detailsEl) => {
      const sdkType = $(detailsEl).find("summary").text().trim();

      // Look for version titles (e.g., <h2>) and descriptions below them
      $(detailsEl).find("h2").each((i, el) => {
        const title = $(el).find("div.grid-area-1-1").text().trim();

        // Attempt to find a stable anchor/link for the version
        const anchor = $(el).attr("id") || $(el).find("a[href^='#']").attr("href")?.substring(1) || "";

        // Construct the link - Check if the base URL already has a fragment
        const baseUrlWithoutFragment = GITBOOK_URL.split('#')[0];
        const link = `${baseUrlWithoutFragment}${anchor ? "#" + anchor : ""}`;

        // Extract the full description including all <p> and <ul> elements until the next <h2>
        let description = '';
        $(el).nextUntil("h2").each((_, descEl) => {
          if ($(descEl).is("p, ul")) {
            description += $(descEl).text().trim() + "\n\n";
          }
        });

        // Basic check if description is meaningful
        if (!description.trim()) return;

        // Use a fixed date for now, or find a way to extract date from page if possible
        let pubDateStr = format(new Date(), "EEE, dd MMM yyyy HH:mm:ss xx");
        const dateMatch = title.match(/(\d{4}\/\d{2}\/\d{2})/);
        if (dateMatch && dateMatch[1]) {
          try {
            const parsedDate = new Date(dateMatch[1].replace(/\//g, '-'));
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
              <description><![CDATA[${description.trim()}]]></description>
              <pubDate>${pubDate}</pubDate>
            </item>
          `);
      });
    });

    const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>SDK Web Changelog</title>
    <link>${GITBOOK_URL}</link>
    <description>Latest updates to the SDK Web</description>
    <language>en-us</language>
    <atom:link href="http://localhost:${PORT}/rss.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>${format(
      new Date(),
      "EEE, dd MMM yyyy HH:mm:ss xx"
    )}</lastBuildDate>
    ${items.join("\n")}
  </channel>
</rss>
    `;

    res.set("Content-Type", "application/rss+xml");
    res.send(rssFeed);
  } catch (error) {
    console.error("Error generating RSS feed:", error);
    if (browser) {
      await browser.close();
    }
    res.status(500).send("Error generating RSS feed");
  }
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.listen(PORT, () => {
  console.log(`🚀 RSS feed ready at http://localhost:${PORT}/rss.xml`);
});
