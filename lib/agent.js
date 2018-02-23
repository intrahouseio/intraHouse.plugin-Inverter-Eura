/**
 * agent.js
 * Работа через tcp клиент
 */

const util = require("util");
const net = require("net");

const protocol = require("./protocol");


module.exports = {

  start(plugin, logger) {
    this.plugin = plugin;
    this.logger = logger;
 
    this.tosend = [];
    this.waiting = "";

    this.client = net.createConnection(
      { host: this.plugin.params.host, port: this.plugin.params.port },
      () => {
        this.logger.log(this.getHostPortStr() + " connected", "connect");
        this.tosend = protocol.getPollArray(this.plugin.config); 
        this.sendNext();
      }
    );

    // Этот таймаут контролирует только прием данных, keepalive не учитывает
    this.client.setTimeout(3000, () => {
      if (this.waiting) {
        logger.log("Timeout error! No response for "+this.waiting);
        this.waiting = "";
      }
      this.sendNext();
    });
    

    this.client.on("end", () => {
      logger.log("disconnected", "connect");
      process.exit(1);
    });

    this.client.on("error", e => {
      this.client.end();
      this.logger.log(this.getHostPortStr() + " connection error:" + e.code);
      process.exit(1);
    });

    this.client.on("data", data => {
      this.processInputData(data.toString());
      this.waiting = "";
      this.sendNext();
    });
  },

  stop() {
    if (this.client) this.client.end();
  },

  processInputData(res) {
    this.logger.log("=> " + res, "in");
    let result = protocol.parse(res);
    if (result) {
      this.plugin.sendDataToServer(result);
    }
  },

  sendNext() {
    if (!this.waiting && this.tosend.length > 0) {
      let item = this.tosend.shift();
      if (item && item.req) {
        this.waiting =item.res;
        this.sendToUnit(item.req);
        if (item.req.substr(2,2) == '03') {
            this.tosend.push(item); // Сразу добавить в конец
        }    
      }
    }
  },

  sendToUnit(payload) {
    if (!payload) return; 
    // try {
      this.client.write(protocol.formSendMessage(payload));
      this.logger.log("<= " + payload, "out");
    // } catch (e) {
    //  this.logger.log("ERROR write: " + payload, "out");
    // }
  },


  getHostPortStr() {
    return this.plugin.params.host + ":" + this.plugin.params.port;
  },

  /** Команды управления
   **/
  doCommand(item) {
    // let op = command == "on" ? turnOn : turnOff;
    // let cmdObj = { req: op, res: op }; // Ответ полностью совпадает с запросом
    this.logger.log('doCommand '+util.inspect(item),'command');
    let id = item.id;
    let command = item.command;
    let value =  item.value;
    this.logger.log('HEX= '+hexVal(Math.round(value * 100), 4),'command');
    
    if (!command) {
        if (item.prop == 'set') {
            command = 'set';
        }
    }

    // Команду добавляем в начало массива. Будет отправлена после получения предыдущего ответа
    if (id && command) {
        this.tosend.unshift(protocol.formCmdObj(id, command, value));
    }
  }
};

function hexVal(val, width) {
    return pad(val.toString(16).toUpperCase(), width);
  }
  
  function pad(val, width) {
    let numAsString = val + '';
    width = width || 2;
    while (numAsString.length < width) {
      numAsString = '0' + numAsString;
    }
    return numAsString;
  }