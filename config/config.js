require('dotenv').config();

const PORT = process.env.PORT || 3000;
const HOST_DOMAIN = process.env.SHAREID_URL || `localhost:${PORT}`;
const PROTOCOL = process.env.SHAREID_URL ? "https" : "http";
const BASE_URL = `${PROTOCOL}://${HOST_DOMAIN}`;

module.exports = {
    PORT,
    HOST_DOMAIN,
    PROTOCOL,
    BASE_URL,
    RSS_WEB_URL: '/rss-web.xml',
    RSS_IOS_URL: '/rss-ios.xml',
    RSS_ANDROID_URL: '/rss-android.xml',
    GITBOOK_SDK_WEB_URL: process.env.GITBOOK_SDK_WEB_URL,
    GITBOOK_SDK_IOS_URL: process.env.GITBOOK_SDK_IOS_URL, 
    GITBOOK_SDK_ANDROID_URL: process.env.GITBOOK_SDK_ANDROID_URL,
    RSS_FILE_PATHS: {
      web: "latest_web_changelog_rss.xml",
      ios: "latest_ios_changelog_rss.xml",
      android: "latest_android_changelog_rss.xml",
    },
    EMAIL_CONFIG: {
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
    }
  };