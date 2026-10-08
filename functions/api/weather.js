/* LiteBox v5 · functions/api/weather.js — 天气预报（GET /api/weather?lat=&lon= | ?name=）
   geocoding + forecast 均走 Open-Meteo，响应格式与前端 Step 3G-2 约定一致 */
import { json, err, fetchJSON } from '../_utils.js';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const name = url.searchParams.get('name');

  let latNum = lat ? parseFloat(lat) : null;
  let lonNum = lon ? parseFloat(lon) : null;
  let location = null;

  try {
    /* 若给城市名，先 geocoding */
    if ((!latNum || !lonNum) && name) {
      const g = await fetchJSON(
        'https://geocoding-api.open-meteo.com/v1/search?name=' +
        encodeURIComponent(name) + '&count=1&language=zh&format=json',
        6000
      );
      if (!g.results || !g.results.length) return err('没有找到这个城市', 404);
      const c = g.results[0];
      latNum = c.latitude;
      lonNum = c.longitude;
      location = {
        name: c.name,
        admin1: c.admin1 || '',
        country: c.country || '',
        latitude: c.latitude,
        longitude: c.longitude
      };
    }

    if (latNum == null || lonNum == null) return err('缺少 lat/lon 或 name 参数', 400);

    if (!location) {
      location = { name: '当前位置', admin1: '', country: '', latitude: latNum, longitude: lonNum };
    }

    const weatherUrl =
      'https://api.open-meteo.com/v1/forecast' +
      '?latitude=' + latNum +
      '&longitude=' + lonNum +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation' +
      '&hourly=temperature_2m,precipitation_probability,weather_code' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max' +
      '&timezone=auto&forecast_days=7';

    const w = await fetchJSON(weatherUrl, 8000);

    return json({
      location,
      current: w.current,
      hourly: w.hourly,
      daily: w.daily,
      timezone: w.timezone
    });
  } catch (e) {
    return err(e.message || '天气获取失败', 502);
  }
}
