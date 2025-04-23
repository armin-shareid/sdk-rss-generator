const { format } = require("date-fns");
const { saveRssToFile, fileExists, readFile } = require("../utils/file");
const { sendChangelogEmail } = require("../services/email");
const config = require("../config/config");

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

async function compareAndSaveRss(newRssFeed, type) {
  const filePath = config.RSS_FILE_PATHS[type];
  const exists = await fileExists(filePath);

  if (!exists) {
    console.log(`📄 Creating new ${type} RSS feed file`);
    await saveRssToFile(newRssFeed, type, config.RSS_FILE_PATHS);
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
      await saveRssToFile(newRssFeed, type, config.RSS_FILE_PATHS);

      await sendChangelogEmail(addedItems, type, newRssFeed);

      return addedItems;
    } else {
      console.log(`✓ No changes in ${type} RSS feed`);
      return [];
    }
  } catch (error) {
    console.error(`Error comparing ${type} RSS feeds:`, error);
    await saveRssToFile(newRssFeed, type, config.RSS_FILE_PATHS);
    return [];
  }
}

function buildRssFeed(items, title, gitbookUrl, type) {
  const feedUrls = {
    web: config.RSS_WEB_URL,
    ios: config.RSS_IOS_URL,
    android: config.RSS_ANDROID_URL,
  };

  const feedUrl = `${config.BASE_URL}${feedUrls[type]}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
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
}

module.exports = {
  extractItems,
  findNewItems,
  compareAndSaveRss,
  buildRssFeed,
};
