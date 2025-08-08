const axios = require('axios');

module.exports = function startWatcher(bot) {
  const WALLET = process.env.WALLET_ADDRESS;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  const SOLSCAN_API_KEY = process.env.SOLSCAN_API_KEY;

  let createdTokens = {};
  let monitoredTokens = {};
  let lastSignature = null;

  const solscan = axios.create({
    baseURL: 'https://pro-api.solscan.io',
    headers: { token: SOLSCAN_API_KEY }
  });

  // === 1. Detectar nuevas transacciones ===
  async function getRecentTransactions() {
    try {
      const res = await solscan.get(`/account/transactions`, {
        params: { address: WALLET, limit: 10 }
      });

      const txs = res.data.data;
      if (!txs) return;

      for (let tx of txs) {
        if (tx.txHash === lastSignature) break;
        lastSignature = tx.txHash;

        // Buscar si es creación de token (InitializeMint)
        if (tx.parsedInstruction && tx.parsedInstruction.some(instr => instr.type === 'initializeMint')) {
          const mintAddress = tx.parsedInstruction.find(instr => instr.type === 'initializeMint').params.mint;
          if (!createdTokens[mintAddress]) {
            createdTokens[mintAddress] = Date.now();
            bot.sendMessage(TELEGRAM_CHAT_ID, `🆕 Nuevo token detectado en Solscan:\n${mintAddress}`);
            monitoredTokens[mintAddress] = { ath: 0, createdAt: Date.now() };
          }
        }
      }
    } catch (err) {
      console.error("Error al obtener transacciones:", err.message);
    }
  }

  // === 2. Obtener precio y liquidez ===
  async function checkTokenPrices() {
    for (let mint in monitoredTokens) {
      try {
        const res = await solscan.get(`/market/token/${mint}`);
        const data = res.data.data;

        if (!data || !data.priceUsdt) continue;

        let price = data.priceUsdt;
        let token = monitoredTokens[mint];

        if (price > token.ath) token.ath = price;

        let dropPercent = ((token.ath - price) / token.ath) * 100;

        if (dropPercent >= 35 && !token.alertSent) {
          token.alertSent = true;
          let mins = ((Date.now() - token.createdAt) / 60000).toFixed(1);
          bot.sendMessage(TELEGRAM_CHAT_ID, `📉 Token ${mint} ha caído un ${dropPercent.toFixed(2)}% desde su ATH\nTiempo desde creación: ${mins} minutos\nPrecio actual: $${price}\nLiquidez: $${data.liquidity}`);
        }
      } catch (err) {
        console.error(`Error obteniendo datos de ${mint}:`, err.message);
      }
    }
  }

  // === 3. Intervalos de monitoreo ===
  setInterval(getRecentTransactions, 5000); // cada 5s revisa transacciones
  setInterval(checkTokenPrices, 15000); // cada 15s revisa precios
};
