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
        this.plugin.sendDataToServer(protocol.parse(str, this.waiting));
      } catch (e) {
        this.logger.log("ERROR: " + e.message);
      }
      this.waiting = "";

      // Перед следующей посылкой делаем задержку 10 мсек
      setTimeout(
        this.sendNext.bind(this)
      , 100);

    });
  },

  stop() {
    if (this.client) this.client.end();
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
      this.client.write(protocol.formSendMessage(payload));
      this.logger.log("<= " + payload, "out");
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
    this.logger.log("doCommand " + util.inspect(item), "command");
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

/*
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
*/
