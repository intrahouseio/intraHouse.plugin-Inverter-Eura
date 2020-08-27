/**
 * Функции разбора и формирования данных
 */
const util = require("util");

exports.parse = parse;
exports.formCmdObj = formCmdObj;
exports.getPollArray = getPollArray;
exports.formSendMessage = formSendMessage;
exports.getHexAdr = getHexAdr;
exports.deviceError = deviceError;
exports.checkMessage = checkMessage;
exports.calcLRC = calcLRC;


const KFT = 100; // Делитель для значения тока (current) 

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

const CRLF = String.fromCharCode(13) + String.fromCharCode(10);

/**
 * Формирование массива для опроса
 * req - строка чтения состояния с устройства, res - первые 4 символа ответа
 * В случае ошибки вместо 03 будет 83
 */
function getPollArray(points) {
  return Object.keys(points).map(adr => ({
    req: adr + "03" + readParam6,
    res: adr + "03"
  }));
}

// chan

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

/**
 * Обработка входных данных
 * :01031000....
 **/
function parse(res, waiting) {

  checkMessage(res);
  let adr = Number("0x" + res.substr(1, 2));
  switch (res.substr(3, 2)) {
    // Результат чтения
    case "03":
      return parse03();

    // Результат команды
    case "06":
      return parse06();

    // 83  - ошибка чтения адреса  - выставить ошибку канала
    case "83":
    let errstr = 'Ошибка чтения '+getAbnormalCodeText(res.substr(5, 2));
    return deviceError(adr, errstr);

    // 86  - ошибка записи команды - просто пропустить с выводом ошибки
    case "86":
      throw { message: "Command failed! Code = " +getAbnormalCodeText(res.substr(5, 2))};
  }

  function parse03() {
    // Чтение оперативных данных - F1000.
    // В ответе адреса нет, поэтому ориентируемся по счетчику(6*2=12) и строке waiting
    if (res.substr(3, 4) == "030C") {
      let x1 = Number("0x" + res.substr(7, 4)); // Freq
      let x2 = Number("0x" + res.substr(11, 4)); // Volt
      let x3 = Number("0x" + res.substr(15, 4)); // Current
      let x4 = Number("0x" + res.substr(19, 4)); // Pole
      let x5 = Number("0x" + res.substr(23, 4)); // Bus Volt
      let x6 = Number("0x" + res.substr(27, 2)); // ratio
      let x7 = Number("0x" + res.substr(29, 2)); // STATUS

      // Разложить STATUS на состояние и ошибку
      let status = getStatus(x7); // Forward running 01, Reverse running 02
      let err = getError(x7);
      let errstr = err ? getErrorStr(x7) : "";

      //  Возвращаем 3 канала:inv_x, elc_x, elv_x

      return [
        {
          id: "inv_" + adr,
          value: x1,
          err,
          ext: { status, errstr, volt: x2, current: x3/KFT, ratio: x6 }
        },
        { id: "elv_" + adr, value: x2, err },
        { id: "elc_" + adr, value: x3/KFT, err }
        
      ];
    }

    // Служебные регистры - читаем по 4 байта?
    if (res.substr(3, 4) == "0304") {
      let x1 = Number("0x" + res.substr(7, 4));
      let x2 = Number("0x" + res.substr(11, 4));
      return [{ id: "12", value: x1, ext: { time: x2 } }];
    }
  }

  function parse06() {

  }

  function getStatus(x7) {
    return x7 <= 2 ? x7 : 0;
  }

  function getError(x7) {
    return x7 > 2 ? x7 : 0;
  }

  function getErrorStr(x7) {
    switch (x7) {
      case 4:
        return "Over-current";
      case 5:
        return "DC over-current";
      case 6:
        return "Input Out-phase";
      case 7:
        return "Frequency Over-load";
      case 8:
        return "Under-voltage";
      case 9:
        return "Overheat";
      case 10:
        return "Motor overload";
      case 11:
        return "Interference";
      case 12:
        return "LL";
      case 13:
        return "External Malfunction";
      case 14:
        return "ERR1";
      case 15:
        return "ERR2";
      case 16:
        return "ERR3";
      case 17:
        return "ERR4";
    }
  }
}

function formCmdObj(id, command, value) {
  let adr = getHexAdr(id);
  switch (command) {
    case "on":
      return { req: adr + "06" + turnOn, res: adr + "06" };
    case "off":
      return { req: adr + "06" + turnOff, res: adr + "06" };
    case "set":
      return {
        req: adr + "06" + setF113 + hexVal(Math.round(value), 4),
        res: adr + "06"
      };
  }
}

function hexVal(val, width) {
  return pad(val.toString(16).toUpperCase(), width);
}

function pad(val, width) {
  let numAsString = val + "";
  width = width || 2;
  while (numAsString.length < width) {
    numAsString = "0" + numAsString;
  }
  return numAsString;
}

// Longitudinal Redudancy Check
function calcLRC(str) {
  var sum = 0;
  for (var i = 0; i < str.length; i = i + 2) {
    sum = (sum + Number("0x" + str.substr(i, 2))) & 0xff;
  }
  if (sum != 0) sum = 0xff - sum + 1;
  // Если sum=0 -> ff+1=100 - не д б!!
  let result = sum.toString(16);
  if (sum < 16) result = "0"+result; 
  return result.toUpperCase();

  // return sum.toString(16).toUpperCase();
}

function checkMessage(str) {
    if (!str[0] == ":") throw { message: "Invalid FIRST char!" };
    if (str.substr(str.length-2) != CRLF) throw { message: "Invalid LAST chars - expected CR LF!" };

    if (str.substr(str.length-4,2) !=  calcLRC(str.substr(1,str.length-5))) throw { message: "Invalid LRC!" }; 
}



// Адрес устройства для команды из id канала - 16 ричное значение с нулем впереди
function getAdr(id) {
  return Number(id) > 0 ? "0" + Number(id).toString(16).toUpperCase() : "";
}

function getAbnormalCodeText(code) {
    let str;
    switch(code) {
        case '01': return '01: Illegal function code';
        case '02': return '02: Illegal address';
        case '03': return '03: Illegal data';
        case '04': return '04: Slave faulnote';
        case '08': return '08: Parity Check fault';
        default: return code;
    }
}

// chan
// Адрес устройства для команды из id канала - 16 ричное значение с нулем впереди
function getHexAdr(id) {
    let adr = extractNumFromStr(id);
    return Number(adr) > 0 ? "0" + Number(adr).toString(16).toUpperCase() : "";
}

/** Выделяет в строке первые числовые символы идущие подряд
*   (H_102_1 =>102)
**/
function extractNumFromStr(str) {
    let rar = str && typeof str == 'string' ? /\d+/.exec(str) : '';
    return rar && rar.length > 0 ? rar[0] : '';
}

function deviceError(adr, errstr) {
    return [
        { id: "inv_" + adr, err:1, ext:{errstr} },
        { id: "elv_" + adr, err:1, ext:{errstr} },
        { id: "elc_" + adr, err:1, ext:{errstr} }
      ];
}