/**
 * Функции разбора и формирования данных
 */
const util = require("util");

exports.parse = parse;
exports.formCmdObj = formCmdObj;
exports.getPollArray = getPollArray;
exports.formSendMessage = formSendMessage;

// Управление aa06......
const turnOn = "20000001";
const turnOff = "20000003";
const reset = "20000009";
const setF113 = "010D";

// Чтение aa03......
const readParam = "10000004";
const readParam6 = "10000006";
const readF113F114 = "010D0002";
const readF111F112 = "010B0002";
const readF112F113 = "010C0002";

/**
 * Формирование массива для опроса
 * req - строка чтения состояния с устройства, res - первые 4 символа ответа
 * В случае ошибки вместо 03 будет 83
 */
function getPollArray(channels) {
  let res = [];
  if (channels && util.isArray(channels)) {
    channels.forEach(item => {
      let adr = getAdr(item.id);
      if (adr) {
        res.push({ req: adr + "03" + readParam6, res: adr + "03" });
        res.push({ req: adr + "03" + readF112F113, res: adr + "03" });
      }
    });
  }
  return res;
}

// Адрес устройства для команды из id канала - 16 ричное значение с нулем впереди
function getAdr(id) {
  return Number(id) > 0 ? "0" + id.toString(16).toUpperCase() : "";
}

/**
 * Формирование данных для отправки
 * Первый символ - :
 * В конце - контрольная сумма и 13,10
 */
function formSendMessage(payload) {
  return (
    ":" +
    payload +
    calcLRC(payload) +
    String.fromCharCode(13) +
    String.fromCharCode(10)
  );
}

/** Обработка входных данных
 **/
function parse(res) {
  let result;
  if (res[0] == ":") {
    if (res.substr(1, 6) == "010304") {
      let x1 = Number("0x" + res.substr(7, 4));
      let x2 = Number("0x" + res.substr(11, 4));
      result = [{ id: "12", value: x1, ext: { time: x2 } }];
    }

    if (res.substr(1, 6) == "01030C") {
      let x1 = Number("0x" + res.substr(7, 4));
      let x2 = Number("0x" + res.substr(11, 4));
      let x3 = Number("0x" + res.substr(15, 4));
      let x4 = Number("0x" + res.substr(19, 4));
      let x5 = Number("0x" + res.substr(23, 4));
      let x6 = res.substr(27, 4);
      /*
        this.logger.log(
          "Freq " +
            x1 +
            " Volt " +
            x2 +
            " Current " +
            x3 +
            " Pole " +
            x4 +
            " Bus Volt " +
            x5 +
            " STATUS " +
            x6,
          "in"
        );
        */
      result = [{ id: "1", value: x1, ext: { volt: x2, current: x3 } }];
    }
  }
  return result;
}

function formCmdObj(id, command, value) {
  let adr = getAdr(id);
  switch (command) {
    case "on":
      return { req: adr + "06" + turnOn, res: adr + "06" };
    case "off":
      return { req: adr + "06" + turnOff, res: adr + "06" };
    case "set":
      return {
        req: adr + "06" + setF113 + hexVal(Math.round(value * 100), 4),
        res: adr + "06"
      };
  }
}

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

// Longitudinal Redudancy Check
function calcLRC(str) {
  var sum = 0;
  for (var i = 0; i < str.length; i = i + 2) {
    sum = (sum + Number("0x" + str.substr(i, 2))) & 0xff;
  }
  sum = 0xff - sum + 1;
  return sum.toString(16).toUpperCase();
}

