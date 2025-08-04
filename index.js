const { Telegraf } = require('telegraf');
require('dotenv').config();
const startWatcher = require('./watcher');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.start((ctx) => ctx.reply('🤖 Bot activo y listo para monitorear tokens.'));
bot.launch();

startWatcher(bot);
