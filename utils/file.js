const fs = require("fs");

function saveRssToFile(content, type, filePaths) {
  const filePath = filePaths[type];
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, content, (err) => {
      if (err) {
        console.error(`Error saving ${type} RSS feed to file:`, err);
        reject(err);
      } else {
        console.log(`✅ ${type.toUpperCase()} RSS feed saved to ${filePath}`);
        resolve();
      }
    });
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

module.exports = {
  saveRssToFile,
  fileExists,
  readFile,
};
