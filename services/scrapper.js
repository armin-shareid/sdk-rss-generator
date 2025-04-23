const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const { format } = require("date-fns");

async function scrapeChangelog(gitbookUrl, type) {
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

    if (type === "web") {
      // Web SDK has <details> sections for different SDK types
      $("details").each((i, detailsEl) => {
        const sdkType = $(detailsEl).find("summary").text().trim();
        parseVersions($(detailsEl), sdkType);
      });
    } else {
      // iOS and Android SDKs have h2 elements directly in the page
      parseVersions(
        $("body"),
        type === "ios" ? "SDK iOS Changelog" : "SDK Android Changelog"
      );
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

    return items;
  } catch (error) {
    if (browser) await browser.close();
    throw error;
  }
}

module.exports = {
  scrapeChangelog,
};
