const axios = require('axios');

module.exports = function startWatcher(bot) {
  const WALLET = process.env.WALLET_ADDRESS;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  let createdTokens = {};
  let monitoredTokens = {};

  async function checkForNewTokens() {
    try {
      const res = await axios.get(`https://api.helius.xyz/v0/addresses/${WALLET}/transactions?api-key=${process.env.HELIUS_API_KEY}&limit=5`);
      const txs = res.data;

      for (let tx of txs) {
        const createToken = tx.instructions.find(i => i.parsed?.type === "createToken");

        if (createToken && !createdTokens[tx.signature]) {
          createdTokens[tx.signature] = true;

          const tokenMint = createToken.parsed.info.mint;
          const timeStart = new Date(tx.timestamp * 1000);
          monitoredTokens[tokenMint] = {
            timeStart,
            ath: 0,
            dropped: false,
          };

          bot.telegram.sendMessage(CHAT_ID, `🆕 Token creado: ${tokenMint}`);
        }
      }
    } catch (err) {
      console.error("Error al verificar tokens:", err.message);
    }
  }

  async function checkTokenPrices() {
    for (let mint in monitoredTokens) {
      if (monitoredTokens[mint].dropped) continue;

      try {
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/pairs/solana/${mint}`);
        const price = parseFloat(res.data.pair.priceUsd);
        const data = monitoredTokens[mint];

        if (price > data.ath) data.ath = price;

        const dropPercent = ((data.ath - price) / data.ath) * 100;

        if (dropPercent >= 35) {
          const timeEnd = new Date();
          const duration = Math.round((timeEnd - data.timeStart) / 1000);

          bot.telegram.sendMessage(process.env.TELEGRAM_CHAT_ID, `⚠️ Token ${mint} cayó un 35%\n⏱ Tiempo desde su creación: ${duration} segundos`);
          monitoredTokens[mint].dropped = true;
        }
      } catch (err) {
        console.log(`No se pudo obtener el precio del token ${mint}`);
      }
    }
  }

  setInterval(checkForNewTokens, 5000); // cada 5s
  setInterval(checkTokenPrices, 10000); // cada 10s
};
