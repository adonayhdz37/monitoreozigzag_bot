const { Telegraf } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.on('message', (ctx) => {
  console.log("Chat ID:", ctx.chat.id);
  ctx.reply(`Tu chat ID es: ${ctx.chat.id}`);
});

bot.launch();
