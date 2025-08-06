const axios = require('axios');

module.exports = function startWatcher(bot) {
  const WALLET = process.env.WALLET_ADDRESS;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  const RPC_URL = process.env.RPC_URL;

  let createdTokens = {};
  let monitoredTokens = {};
  let lastSignature = null;

  let isCheckingNewTokens = false;
  let isCheckingPrices = false;

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

    try {
      const res = await axios.post(RPC_URL, payload);
      return res.data.result || [];
    } catch (error) {
      console.error("❌ Error al obtener firmas:", error.message);
      return [];
    }
  }

  async function getTransaction(signature) {
    const payload = {
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [signature, { encoding: "jsonParsed" }]
    };

    try {
      const res = await axios.post(RPC_URL, payload);
      return res.data.result;
    } catch (error) {
      console.error(`❌ Error al obtener transacción ${signature}:`, error.message);
      return null;
    }
  }

  async function checkForNewTokens() {
    if (isCheckingNewTokens) return; // evitar solapamientos
    isCheckingNewTokens = true;

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

            bot.telegram.sendMessage(
              CHAT_ID,
              `🆕 *Token creado detectado*\n\n🔹 Mint: \`${mintAddress}\`\n⏱️ Hora: ${timeStart.toLocaleTimeString()}`,
              { parse_mode: "Markdown" }
            );

            console.log(`✅ Token creado: ${mintAddress}`);
            createdTokens[sig] = true;
          }
        }
      }

      if (signatures.length > 0) {
        lastSignature = signatures[0].signature;
      }
    } catch (err) {
      console.error("❌ Error al verificar nuevos tokens:", err.message);
    } finally {
      isCheckingNewTokens = false;
    }
  }

  async function checkTokenPrices() {
    if (isCheckingPrices) return;
    isCheckingPrices = true;

    for (const mint in monitoredTokens) {
      const token = monitoredTokens[mint];
      if (token.dropped) continue;

      try {
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/pairs/solana/${mint}`);
        if (!res.data.pair || !res.data.pair.priceUsd) continue;

        const price = parseFloat(res.data.pair.priceUsd);
        if (price > token.ath) token.ath = price;

        const dropPercent = ((token.ath - price) / token.ath) * 100;

        if (dropPercent >= 35) {
          const timeEnd = new Date();
          const duration = Math.round((timeEnd - token.timeStart) / 1000);
          const timeFormatted = secondsToHMS(duration);

          bot.telegram.sendMessage(
            CHAT_ID,
            `⚠️ *Caída detectada del token*\n\n🔹 Mint: \`${mint}\`\n📉 Caída: ${dropPercent.toFixed(2)}%\n⏱️ Tiempo activo: ${timeFormatted}`,
            { parse_mode: "Markdown" }
          );

          token.dropped = true;
          console.log(`⚠️ Token ${mint} cayó un 35% después de ${timeFormatted}`);
        }
      } catch (err) {
        console.log(`⚠️ No se pudo obtener el precio del token ${mint}`);
      }
    }

    isCheckingPrices = false;
  }

  function secondsToHMS(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}h ${m}m ${s}s`;
  }

  setInterval(checkForNewTokens, 5000); // cada 5 segundos
  setInterval(checkTokenPrices, 10000); // cada 10 segundos
};

