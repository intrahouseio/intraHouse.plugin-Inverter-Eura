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
    this.sendTime = 0; // Время последней посылки

    

    this.client = net.createConnection(
      { host: this.plugin.params.host, port: this.plugin.params.port },
      () => {
        this.logger.log(this.getHostPortStr() + " connected", "connect");

        this.tosend = protocol.getPollArray(this.plugin.points);
        this.logger.log(
          "points: " + util.inspect(this.plugin.points),
          "connect"
        );

        this.sendNext();
      }
    );

    // 3 сек. Этот таймаут контролирует только прием данных, keepalive не учитывает
    this.client.setTimeout(30000, () => {
      if (this.waiting) {
        // TODO Возможно, здесь нужно формировать ошибку устройства, которое не отзывается
        logger.log("Timeout error! No response for " + this.waiting);
        this.waiting = "";
      }
      this.sendNext();
    });

    
    setInterval( this.checkResponse.bind(this),1000);

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
      let str = data.toString();
      this.logger.log("=> " + str, "in");
      try {
        // Каждый результат сразу отдавать?
        // this.logger.log("sub LRC "+str.substr(str.length-4,2)); 
        // this.logger.log("for LRC "+str.substr(1,str.length-5)); //1-:; 2 - CRLF; 2 - LRC 
        // this.logger.log("LRC = "+protocol.calcLRC(str.substr(1,str.length-5)));
 
        this.plugin.sendDataToServer(protocol.parse(str, this.waiting));
      } catch (e) {
        this.logger.log("ERROR: " + e.message);
      }
      this.waiting = "";

      // Перед следующей посылкой делаем задержку 100 мсек
      setTimeout(
        this.sendNext.bind(this)
      , 100); // 100

    });
  },

  stop() {
    if (this.client) this.client.end();
  },

  checkResponse() {
    if (Date.now() - this.sendTime > 500) { // 500 mc 
        if (this.waiting) {
            let adr = Number("0x" + this.waiting.substr(0, 2));
            this.plugin.sendDataToServer(protocol.deviceError(adr, 'Timeout error! No response'));
            this.waiting = "";
        }    
        this.sendNext();
    }
  },

  sendNext() {
    if (this.waiting) return;

    if (this.tosend.length <= 0) {
      this.tosend = protocol.getPollArray(this.plugin.points);
    }

    let item = this.tosend.shift();
    if (item && item.req) {
      this.waiting = item.res;
      this.sendToUnit(item.req);

      /*
      if (item.req.substr(2, 2) == "03") {
        this.tosend.push(item); // Сразу добавить в конец
      }
      */
    }
  },

  sendToUnit(payload) {
    if (!payload) return;
    try {
      let msg = protocol.formSendMessage(payload); 
      this.client.write(msg);
      this.logger.log("<= " + msg, "out");
      this.sendTime = Date.now();
    } catch (e) {
      this.logger.log("ERROR write: " + payload, "out");
    }
  },

  getHostPortStr() {
    return this.plugin.params.host + ":" + this.plugin.params.port;
  },

  /** Команды управления
   **/
  doCommand(item) {
    
    let id = item.id;
    let command = item.command;
    let value = item.value;

    if (!command) {
      if (item.prop == "set") {
        command = "set";
        // Не пропускаются значения 10 - 1000 и 15 - 1500!!!???
        // Если добавить 0.01 - то ок
      }
    }

    // Команду добавляем в начало массива. Будет отправлена после получения предыдущего ответа
    if (id && command) {
      this.tosend.unshift(protocol.formCmdObj(id, command, value));
      this.logger.log("this.tosend= " + util.inspect(this.tosend), "command");
      this.sendNext();
    }
  }
};
