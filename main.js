import {} from "piu/MC";
import Timer from "timer";

// 1) モジュールをインポートする
import BME280 from "bme280";

const Font = "OpenSans-Semibold-28";

const LableTemplate = Label.template($ => ({
  name: $,
  left: 0,
  height: 80
}));

export default application = new Application(null, {
  style: new Style({ font: Font, color: "#000000" }),
  skin: new Skin({ fill: "#FFFFFF" }),
  contents: [
    new LableTemplate( "T", {top: 0}),
    new LableTemplate( "P", {top: 80}),
    new LableTemplate( "H", {top: 160})
  ]
});

// 2) インスタンスの生成する
const bme280 = new BME280();

// 3) センサーのパラメータを設定する
// Indoor navigation
bme280.setSensorSettings({
  osrTemperature: BME280.OVERSAMPLING_2X,
  osrPressure: BME280.OVERSAMPLING_16X,
  osrHumidity: BME280.OVERSAMPLING_1X,
  filter: BME280.FILTER_COEFF_16,
  standbyTime: BME280.STANDBY_TIME_0_5_MS
}); 

// 4) センサーモードを設定する
bme280.setSensorMode(BME280.NORMAL_MODE);

// 一定間隔で測定値を取得して表示を更新する
Timer.repeat(id => {

  // 5) センサーから測定値を読み出す
  bme280.update();

  // 6) 各プロパティから気温、気圧、湿度を取得する
  application.content("T").string = "Temperature = " + bme280.temperature.toFixed(2) + "C";
  application.content("P").string = "Pressure = " + bme280.pressure.toFixed(2) + "hPa";
  application.content("H").string = "Humidity = " + bme280.humidity.toFixed(2) + "%";

}, 1000);

