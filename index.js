const { Telegraf } = require('telegraf');
require('dotenv').config();
const startWatcher = require('./watcher');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Mensaje de bienvenida
bot.start((ctx) => ctx.reply('🤖 Bot activo y listo para monitorear tokens.'));

// Iniciar el bot de forma segura
(async () => {
  try {
    await bot.launch();
    console.log('✅ Bot de Telegram iniciado correctamente');
    startWatcher(bot);
  } catch (error) {
    console.error('❌ Error al iniciar el bot:', error.message);
  }
})();

// Opcional: Manejamos señales del sistema para cerrar correctamente
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
