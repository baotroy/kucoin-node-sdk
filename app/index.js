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
  // if (message.subject === pair) {
  // if (1) {
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
    const price = asks[1][0];
    const amountToSpend = process.env.amount || 10; // USDT
    const size = toFixed(new BN(amountToSpend).dividedBy(new BN(price)).toString(), 0);
    const baseParams = {
      clientOid: v4(),
      side: "buy",
      symbol: pair,
      type: "limit",
    };
    const orderParams = {
      price,
      size,
    };

    // Place order
    if (process.env.trade === "1") {
      rest.Trade.Orders.postOrder(baseParams, orderParams).then((result) => {
        console.log(result);
        if (result.code === CODES.SUCCESS) {
          init = false;
        }
      });
    }

    // Unsubscribe after timeout
    activeTimeout(50000);
    console.log(orderParams);
    // Write log
    fs.appendFileSync("data.txt", JSON.stringify(message.data) + "\n");
  } else {
    // datafeed.unsubscribe(tickerTopics.symbolTicker, callbackId);
    fs.appendFileSync("data.txt", JSON.stringify(message.data) + "\n");
  }
  // }
});

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
