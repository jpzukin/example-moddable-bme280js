import I2C from "pins/i2c";
import Timer from "timer";

const I2C_INTF = 0x01;

const I2C_ADDR_PRIM = 0x76;
const I2C_ADDR_SEC  = 0x77;
const CHIP_ID = 0x60;

const CHIP_ID_ADDR               = 0xD0;
const RESET_ADDR                 = 0xE0;
const TEMP_PRESS_CALIB_DATA_ADDR = 0x88;
const HUMIDITY_CALIB_DATA_ADDR   = 0xE1;
const PWR_CTRL_ADDR              = 0xF4;
const CTRL_HUM_ADDR              = 0xF2;
const CTRL_MEAS_ADDR             = 0xF4;
const CONFIG_ADDR                = 0xF5;
const DATA_ADDR                  = 0xF7;

const TEMP_PRESS_CALIB_DATA_LEN  = 26;
const HUMIDITY_CALIB_DATA_LEN    = 7;
const P_T_H_DATA_LEN             = 8;
  
const SOFT_RESET_COMMAND         = 0xB6;
const STATUS_REG_ADDR            = 0xF3;
const STATUS_IM_UPDATE           = 0x01;

const SENSOR_MODE_MSK            = 0x03; 

class BME280 extends I2C {
  temperature = 0;
  pressure = 0;
  humidity = 0;

  calibData = {
    t_fine: 0,
    dig_T1: 0, dig_T2: 0, dig_T3: 0,
    dig_P1: 0, dig_P2: 0, dig_P3: 0,
    dig_P4: 0, dig_P5: 0, dig_P6: 0,
    dig_P7: 0, dig_P8: 0, dig_P9: 0,
    dig_H1: 0, dig_H2: 0, dig_H3: 0,
    dig_H4: 0, dig_H5: 0, dig_H6: 0,
  };

  constructor(dictionary = { address: I2C_ADDR_PRIM }) {
    super(dictionary);
   
    let tryCount = 5;
    let chipId = 0;

    while (tryCount) {
      chipId = this.getChipId();
      if (chipId == CHIP_ID) {
        this.softwareReset();
        break;
      }

      Timer.delay(1);
      --tryCount;
    }

    if (tryCount == 0) {
      throw("Device not found");
    }

    this.getCalibrationData();
  }

  softwareReset() {
    let bytes = null;
    let tryCount = 5; 

    this.write(RESET_ADDR, SOFT_RESET_COMMAND);

    do {
      Timer.delay(2);

      bytes = this.getRegister(STATUS_REG_ADDR, 1); 
      tryCount -= 1;
    } while ((tryCount > 0) && (bytes[0] & STATUS_IM_UPDATE));

    if (bytes[0] & STATUS_IM_UPDATE) {
      throw("Failed software reset");
    }
  }

  getSensorMode() {
    const bytes = this.getRegister(PWR_CTRL_ADDR, 1);
    return bytes[0] & SENSOR_MODE_MSK;
  }

  setSensorMode(sensorMode) {
    if (this.getSensorMode() != BME280.SLEEP_MODE) {
      this.writeSensorMode(BME280.SLEEP_MODE);
    }
    this.writeSensorMode(sensorMode);
  }

  writeSensorMode(sensorMode) {
    let bytes = this.getRegister(PWR_CTRL_ADDR, 1); 
    const ctrlMeas = (bytes[0] & (~0x3)) | (sensorMode & 0x3);

    this.write(PWR_CTRL_ADDR, ctrlMeas, true);
  }

  setSensorSettings(dictionary = {
    osrTemperature: BME280.NO_OVERSAMPLING,
    osrPressure:    BME280.NO_OVERSAMPLING,
    osrHumidity:    BME280.NO_OVERSAMPLING,
    filter:         BME280.FILTER_COEFF_OFF, 
    standbyTime:    BME280.STANDBY_TIME_0_5_MS
  }) {
    if (this.getSensorMode() != BME280.SLEEP_MODE) {
      this.write(PWR_CTRL_ADDR, BME280.SLEEP_MODE);
    }

    const config = (dictionary.standbyTime << 5)
                 | (dictionary.filter << 2)
                 | I2C_INTF;
    const ctrlMeas = (dictionary.osrTemperature << 5)
                   | (dictionary.osrPressure << 2)
                   | (BME280.SLEEP_MODE & 0x3);
    const ctrlHum = dictionary.osrHumidity & 0x7;

    this.write(CTRL_HUM_ADDR, ctrlHum, false);
    this.write(CTRL_MEAS_ADDR, ctrlMeas, false);
    this.write(CONFIG_ADDR, config, true);
  }

  update() {
    const regData = this.getRegister(DATA_ADDR, P_T_H_DATA_LEN);
    const uncompData = this.parseSensorData(regData);
    const compData = this.compensateData(uncompData);

    this.temperature = compData.temperature;
    this.pressure = compData.pressure / 100;  // Pa => hPa
    this.humidity = compData.humidity;
  }

  getRegister(address, length) {
    this.write(address);
    const bytes = this.read(length);
    if (!bytes) {
      throw "failed get register";
    }
    return bytes;
  }

  getChipId() {
    return this.getRegister(CHIP_ID_ADDR, 1)[0];
  }

  getCalibrationData() {
    let bytes = null;

    bytes = this.getRegister(TEMP_PRESS_CALIB_DATA_ADDR, TEMP_PRESS_CALIB_DATA_LEN);
    this.parseTemperaturePressureCalibrationData(bytes);

    bytes = this.getRegister(HUMIDITY_CALIB_DATA_ADDR, HUMIDITY_CALIB_DATA_LEN);
    this.parseHumidityCalibrationData(bytes);
  }

  parseTemperaturePressureCalibrationData(regData) {
    const regView = new DataView(regData.buffer);

    this.calibData.dig_T1 = regView.getUint16( 0, true);
    this.calibData.dig_T2 = regView.getInt16(  2, true);
    this.calibData.dig_T3 = regView.getInt16(  4, true);
    this.calibData.dig_P1 = regView.getUint16( 6, true);
    this.calibData.dig_P2 = regView.getInt16(  8, true);
    this.calibData.dig_P3 = regView.getInt16( 10, true);
    this.calibData.dig_P4 = regView.getInt16( 12, true);
    this.calibData.dig_P5 = regView.getInt16( 14, true);
    this.calibData.dig_P6 = regView.getInt16( 16, true);
    this.calibData.dig_P7 = regView.getInt16( 18, true);
    this.calibData.dig_P8 = regView.getInt16( 20, true);
    this.calibData.dig_P9 = regView.getInt16( 22, true);
    this.calibData.dig_H1 = regView.getUint8(25);
  }

  parseHumidityCalibrationData(regData) {
    const getInt12 = value => (value & 0x800 ? -((value - 1) ^ 0xfff) : value);
    const regView = new DataView(regData.buffer);

    this.calibData.dig_H2 = regView.getInt16(0, true);
    this.calibData.dig_H3 = regData[2];
    this.calibData.dig_H4 = getInt12((regData[3] << 4) | (regData[4] & 0xf));
    this.calibData.dig_H5 = getInt12((regData[5] << 4) | (regData[4] >> 4));
    this.calibData.dig_H6 = regView.getInt8(6);
  }

  parseSensorData(regData) {
    let msb, lsb, xlsb;
    let pressure, temperature, humidity;

    msb = regData[0] << 12;
    lsb = regData[1] << 4;
    xlsb = regData[2] >> 4;
    pressure = msb | lsb | xlsb;

    msb = regData[3] << 12;
    lsb = regData[4] << 4;
    xlsb = regData[5] >> 4;
    temperature = msb | lsb | xlsb;

    msb = regData[6] << 8;
    lsb = regData[7];
    humidity = msb | lsb;

    return { pressure, temperature, humidity };
  }

  compensateData(uncompData) {
    let temperature = this.compensateTemperature(uncompData);
    let pressure = this.compensatePressure(uncompData);
    let humidity = this.compensateHumidity(uncompData);

    return { pressure, temperature, humidity };
  }

  compensateTemperature(uncompData) {
    let temperature;
    let temperature_min = -40;
    let temperature_max = 85;
    let var1, var2;

    var1 = uncompData.temperature / 16384.0 - this.calibData.dig_T1 / 1024.0;
    var1 = var1 * this.calibData.dig_T2;
    var2 = uncompData.temperature / 131072.0 - this.calibData.dig_T1 / 8192.0;
    var2 = var2 * var2 * this.calibData.dig_T3;
    this.calibData.t_fine = var1 + var2;
    temperature = (var1 + var2) / 5120.0;
    if (temperature < temperature_min) {
      temperature = temperature_min;
    } else if (temperature > temperature_max) {
      temperature = temperature_max;
    }

    return temperature;
  }

  compensatePressure(uncompData) {
    let pressure;
    let pressure_min = 30000;
    let pressure_max = 110000;
    let var1, var2, var3;

    var1 = this.calibData.t_fine / 2.0 - 64000.0;
    var2 = (var1 * var1 * this.calibData.dig_P6) / 32768.0;
    var2 = var2 + var1 * this.calibData.dig_P5 * 2.0;
    var2 = var2 / 4.0 + this.calibData.dig_P4 * 65536.0;
    var3 = (this.calibData.dig_P3 * var1 * var1) / 524288.0;
    var1 = (var3 + this.calibData.dig_P2 * var1) / 524288.0;
    var1 = (1.0 + var1 / 32768.0) * this.calibData.dig_P1;

    if (var1) {
      pressure = 1048576.0 - uncompData.pressure;
      pressure = ((pressure - var2 / 4096.0) * 6250.0) / var1;
      var1 = (this.calibData.dig_P9 * pressure * pressure) / 2147483648.0;
      var2 = (pressure * this.calibData.dig_P8) / 32768.0;
      pressure = pressure + (var1 + var2 + this.calibData.dig_P7) / 16.0;
      if (pressure < pressure_min) {
        pressure = pressure_min;
      } else if (pressure > pressure_max) {
        pressure = pressure_max;
      }
    } else {
      pressure = pressure_min;
    }

    return pressure;
  }

  compensateHumidity(uncompData) {
    let humidity;
    let humidity_min = 0.0;
    let humidity_max = 100.0;
    let var1, var2, var3, var4, var5, var6;

    var1 = this.calibData.t_fine - 76800.0;
    var2 = this.calibData.dig_H4 * 64.0 + (this.calibData.dig_H5 / 16384.0) * var1;
    var3 = uncompData.humidity - var2;
    var4 = this.calibData.dig_H2 / 65536.0;
    var5 = 1.0 + (this.calibData.dig_H3 / 67108864.0) * var1;
    var6 = 1.0 + (this.calibData.dig_H6 / 67108864.0) * var1 * var5;
    var6 = var3 * var4 * (var5 * var6);

    humidity = var6 * (1.0 - (this.calibData.dig_H1 * var6) / 524288.0);

    if (humidity > humidity_max) {
      humidity = humidity_max;
    } else if (humidity < humidity_min) {
      humidity = humidity_min;
    }

    return humidity;
  }
}

// Sensor power mode
BME280.SLEEP_MODE  = 0x00;
BME280.FORCED_MODE = 0x01;
BME280.NORMAL_MODE = 0x03;

// Oversampling
BME280.NO_OVERSAMPLING = 0x00;
BME280.OVERSAMPLING_1X = 0x01;
BME280.OVERSAMPLING_2X = 0x02;
BME280.OVERSAMPLING_4X = 0x03;
BME280.OVERSAMPLING_8X = 0x04;
BME280.OVERSAMPLING_16X = 0x05;

// Standby duration
BME280.STANDBY_TIME_0_5_MS = 0x00;
BME280.STANDBY_TIME_62_5_MS = 0x01;
BME280.STANDBY_TIME_125_MS = 0x02;
BME280.STANDBY_TIME_250_MS = 0x03;
BME280.STANDBY_TIME_500_MS = 0x04;
BME280.STANDBY_TIME_1000_MS = 0x05;
BME280.STANDBY_TIME_10_MS = 0x06;
BME280.STANDBY_TIME_20_MS = 0x07;

// IIR filter coefficient
BME280.FILTER_COEFF_OFF = 0x00;
BME280.FILTER_COEFF_2 = 0x01;
BME280.FILTER_COEFF_4 = 0x02;
BME280.FILTER_COEFF_8 = 0x03;
BME280.FILTER_COEFF_16 = 0x04;

Object.freeze(BME280);

export default BME280;

