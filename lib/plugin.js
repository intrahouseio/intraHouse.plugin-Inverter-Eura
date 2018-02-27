/**
 * plugin.js
 */
const util = require("util");

const protocol = require("./protocol");


module.exports = {
  config:[], // Каналы принятые с сервера
  points:{}, // Список адресов для опроса 
  params: {
    host: "192.168.0.250",
    port: 4001
  },

  setParams(obj) {
    if (typeof obj == "object") {
      Object.keys(obj).forEach(param => {
        if (this.params[param] != undefined) this.params[param] = obj[param];
      });
    }
  },

  setConfig (arr) {
    if (arr && util.isArray(arr)) {
     this.config = arr;
     arr.forEach(item => {
         // Выделить адрес из id канала,
         let hexadr = protocol.getHexAdr(item.id);
         if (hexadr) {
            this.points[hexadr] = 1;
         }   

     })
    }  
  },

  sendToServer(type, data) {
    process.send({ type, data });
  },

  sendDataToServer(payload) {
    if (!payload) return;

    let data;
    if (util.isArray(payload)) {
      data = payload;
    } 
    if (!data) return;
    process.send({ type: "data", data });
  }
};


