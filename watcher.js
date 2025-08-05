const axios = require('axios');

module.exports = function startWatcher(bot) {
  const WALLET = process.env.WALLET_ADDRESS;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  const RPC_URL = process.env.RPC_URL;

  let createdTokens = {};
  let monitoredTokens = {};
  let lastSignature = null;

  async function getRecentSignatures() {
    const payload = {
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [
        WALLET,
        {
          limit: 5,
          before: lastSignature || undefined
        }
      ]
    };

    const res = await axios.post(RPC_URL, payload);
    const signatures = res.data.result || [];
    return signatures;
  }

  async function getTransaction(signature) {
    const payload = {
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [signature, { encoding: "jsonParsed" }]
    };

    const res = await axios.post(RPC_URL, payload);
    return res.data.result;
  }

  async function checkForNewTokens() {
    try {
      const signatures = await getRecentSignatures();

      for (const entry of signatures) {
        const sig = entry.signature;
        if (createdTokens[sig]) continue;

        const tx = await getTransaction(sig);
        if (!tx || !tx.transaction) continue;

        const instructions = tx.transaction.message.instructions;

        const createTokenIx = instructions.find(ix =>
          ix.program === "spl-token" &&
          ix.parsed?.type === "initializeMint"
        );

        if (createTokenIx) {
          const mintAddress = createTokenIx.parsed.info.mint;
          const timeStart = new Date((tx.blockTime || Date.now()) * 1000);

          if (!monitoredTokens[mintAddress]) {
            monitoredTokens[mintAddress] = {
              timeStart,
              ath: 0,
              dropped: false,
            };

            bot.telegram.sendMessage(CHAT_ID, `🆕 Token creado: ${mintAddress}`);
            createdTokens[sig] = true;
          }
        }
      }

      if (signatures.length > 0) {
        lastSignature = signatures[0].signature;
      }
    } catch (err) {
      console.error("Error al verificar nuevos tokens:", err.message);
    }
  }

  async function checkTokenPrices() {
    for (let mint in monitoredTokens) {
      if (monitoredTokens[mint].dropped) continue;

      try {
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/pairs/solana/${mint}`);
        if (!res.data.pair || !res.data.pair.priceUsd) continue;

        const price = parseFloat(res.data.pair.priceUsd);
        const data = monitoredTokens[mint];

        if (price > data.ath) data.ath = price;

        const dropPercent = ((data.ath - price) / data.ath) * 100;

        if (dropPercent >= 35) {
          const timeEnd = new Date();
          const duration = Math.round((timeEnd - data.timeStart) / 1000);
          const timeFormatted = secondsToHMS(duration);

          bot.telegram.sendMessage(CHAT_ID, `⚠️ Token ${mint} cayó un 35%\n⏱ Tiempo desde su creación: ${timeFormatted}`);
          monitoredTokens[mint].dropped = true;
        }
      } catch (err) {
        console.log(`No se pudo obtener el precio del token ${mint}`);
      }
    }
  }

  function secondsToHMS(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}h ${m}m ${s}s`;
  }

  setInterval(checkForNewTokens, 5000); // cada 5s
  setInterval(checkTokenPrices, 10000); // cada 10s
};
