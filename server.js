const express = require("express");
const config = require("./config/config");
const { initializeEmailTransporter } = require("./services/email");
const routes = require("./routes");

const app = express();

initializeEmailTransporter();

app.use((req, res, next) => {
  const memoryUsage = process.memoryUsage();
  console.log(`Memory usage: ${memoryUsage.heapUsed / 1024 / 1024} MB`);
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.use("/", routes);

const server = app.listen(config.PORT, '0.0.0.0', () => {
  const address = server.address();
  console.log(`Server listening on ${address.address}:${address.port}`);
  console.log(`🚀 RSS feed ready at ${config.BASE_URL}${config.RSS_WEB_URL}`);
  console.log(`🚀 RSS feed ready at ${config.BASE_URL}${config.RSS_IOS_URL}`);
  console.log(`🚀 RSS feed ready at ${config.BASE_URL}${config.RSS_ANDROID_URL}`);
  console.log(`📧 Send test email at ${config.BASE_URL}/test-email`);
});
