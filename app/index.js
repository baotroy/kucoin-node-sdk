require("dotenv").config();
const fs = require("fs");
const { v4 } = require("uuid");
const BN = require("bignumber.js");
const API = require("../src");

const CODES = {
  SUCCESS: "200000",
  // MANY_REQUEST: "429000",
  // NOT_SUPPORT: "400350",
  // QUANTITI_ERROR: "400100",
};
const TIMEOUT = 50000;
const pair = `${process.env.symbol.toUpperCase()}-USDT`;
console.log("Pair", pair);
const kickoffTime = Number(process.env.kickoff) * 1000;

const tickerTopics = {
  // symbolTicker: `/market/ticker:${pair}`,
  // allSymbolsTicker: "/market/ticker:all",
  bestAsk: `/spotMarket/level2Depth5:${pair}`,
};

API.init(require("./config"));
const { rest } = API;

const datafeed = new API.websocket.Datafeed();

// close callback
datafeed.onClose(() => {
  console.log("ws closed, status ", datafeed.trustConnected);
});

// connect
datafeed.connectSocket();

/**
 * @name tickerTopics.symbolTicker
 * @description Subscribe to this topic to get the push of BBO changes.
 * @updateTime 
 * @return {Object} 
 * {
    "type":"message",
    "topic":"/market/ticker:BTC-USDT",
    "subject":"trade.ticker",
    "data":{
        "sequence":"1545896668986", // Sequence number
        "price":"0.08",             // Last traded price
        "size":"0.011",             //  Last traded amount
        "bestAsk":"0.08",          // Best ask price
        "bestAskSize":"0.18",      // Best ask size
        "bestBid":"0.049",         // Best bid price
        "bestBidSize":"0.036"     // Best bid size
    }
}
 */
let init = true;
// const callbackId = datafeed.subscribe(tickerTopics.allSymbolsTicker, async (message) => {
const callbackId = datafeed.subscribe(tickerTopics.bestAsk, async (message) => {
  const current = Date.now();
  if (current <= kickoffTime) {
    return;
  }
  /*
   * @param baseParams
   *   - {string} clientOid - Unique order id created by users to identify their orders, e.g. UUID.
   *   - {string} side - buy or sell
   *   - {string} symbol - a valid trading symbol code. e.g. ETH-BTC
   *   - {string} type - [Optional] limit or market (default is limit)
   *   - {string} remark - [Optional] remark for the order, length cannot exceed 100 utf8 characters
   *   - {string} stop - [Optional] Either loss or entry. Requires stopPrice to be defined
   *   - {string} stopPrice - [Optional] Need to be defined if stop is specified.
   *   - {string} stp - [Optional] self trade prevention , CN, CO, CB or DC
   *   - {string} tradeType - [Optional] The type of trading : TRADE（Spot Trade）, MARGIN_TRADE (Margin Trade). Default is TRADE
   * @param orderParams
   *   LIMIT ORDER PARAMETERS
   *   - {string} price - price per base currency
   *   - {string} size - amount of base currency to buy or sell
   *   - {string} timeInForce - [Optional] GTC, GTT, IOC, or FOK (default is GTC), read Time In Force.
   *   - {number} cancelAfter - [Optional] cancel after n seconds, requires timeInForce to be GTT
   *   - {boolean} postOnly - [Optional] Post only flag, invalid when timeInForce is IOC or FOK
   *   - {boolean} hidden - [Optional] Order will not be displayed in the order book
   *   - {boolean} iceberg - [Optional] Only aportion of the order is displayed in the order book
   *   - {string} visibleSize - [Optional] The maximum visible size of an iceberg order
   *
   */

  if (init && message?.data) {
    const { asks } = message.data;
    // const price = asks[1][0];
    const amountToSpend = process.env.amount || 10; // USDT
    // const prices = ["0.00000099", "0.000001"];
    // const sizes = ["1010101", "1000000"];
    const [prices, sizes] = getTradeData(asks, new BN(amountToSpend));
    // console.log("asks", asks);
    // console.log("prices", prices);
    // console.log("sizes", sizes);
    // return;
    const baseParams = {
      side: "buy",
      symbol: pair,
      type: "limit",
    };

    // Place order
    const promises = [];
    if (process.env.trade === "1") {
      for (let i = 0; i < prices.length; i++) {
        baseParams.clientOid = v4();
        const orderParams = {
          price: prices[i],
          size: sizes[i],
        };
        promises.push(rest.Trade.Orders.postOrder(baseParams, orderParams));
      }
      const results = await Promise.all(promises);
      console.log("results", results);
      const success = results.find((result) => result.code === CODES.SUCCESS);
      if (success) {
        init = false;
        // Unsubscribe after timeout
        activeTimeout(TIMEOUT);
      }
    }

    // Write log
    fs.appendFileSync(`trade-${pair}.txt`, JSON.stringify({ prices, sizes }) + "\n");
    fs.appendFileSync(`book-${pair}.txt`, JSON.stringify(message.data) + "\n");
  } else {
    fs.appendFileSync(`else-${pair}.txt`, JSON.stringify(message.data) + "\n");
  }
});

function getTradeData(asks, amountToSpend) {
  const priceIndex = 0;
  const sizeIndex = 1;
  const prices = [];
  const sizes = [];
  // const amounts = [];
  for (let i = 0; i < asks.length; i++) {
    const price = new BN(asks[i][priceIndex]);
    const maxSize = new BN(toFixed(new BN(asks[i][sizeIndex]).toString(), 0));
    const affordSize = new BN(toFixed(amountToSpend.dividedBy(price).toString(), 0));
    if (affordSize.gt(maxSize)) {
      prices.push(price.toString());
      sizes.push(maxSize.toString());
      amountToSpend = amountToSpend.minus(maxSize.multipliedBy(price)); // decrease amountToSpend for next price
    } else {
      prices.push(price.toString());
      sizes.push(affordSize.toString(), 0);

      return [prices, sizes];
    }
  }

  return [prices, sizes];
}

function activeTimeout(timeout) {
  setTimeout(() => {
    // unsubscribe-symbolTicker
    datafeed.unsubscribe(tickerTopics.symbolTicker, callbackId);
    console.log(`unsubscribed: ${tickerTopics.symbolTicker} ${callbackId}`);
  }, timeout);
}
//////////////////////////////cancel subscribe//////////////////////////////////////

// function format number with signifcant digits

function toFixed(num, fixed) {
  const re = new RegExp("^-?\\d+(?:.\\d{0," + (fixed || -1) + "})?");
  const arr = num.toString().match(re);
  if (arr && arr.length > 0) {
    return arr[0];
  }
  return "0";
}
