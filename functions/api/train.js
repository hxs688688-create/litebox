/* LiteBox v5 · functions/api/train.js — 火车票查询（GET /api/train?from=&to=&date=）
   Step 5D-3：真实查询（vvhan → oioweb 双源尝试），全部失败降级 12306/携程跳转链接 */
import { json, err, fetchJSON } from '../_utils.js';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const from = (url.searchParams.get('from') || '').trim();
  const to = (url.searchParams.get('to') || '').trim();
  const date = (url.searchParams.get('date') || '').trim();

  if (!from || !to || !date) return err('缺少 from / to / date 参数', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('日期格式应为 YYYY-MM-DD', 400);

  // 源 1：vvhan 火车票 API
  try {
    const d = await fetchJSON(
      'https://api.vvhan.com/api/train?from=' + encodeURIComponent(from) +
      '&to=' + encodeURIComponent(to) + '&date=' + date,
      8000
    );
    if (d && d.success && Array.isArray(d.data) && d.data.length) {
      const trains = d.data.map(x => ({
        code: x.station || x.trainNo || x.train_no || '',
        from: x.from || x.startStation || from,
        to: x.to || x.endStation || to,
        depart: x.startTime || x.departTime || x.fromTime || '',
        arrive: x.endTime || x.arriveTime || x.toTime || '',
        duration: x.duration || x.lishi || '',
        seat: x.seatInfo || x.seat || {}
      }));
      return json({ available: true, trains });
    }
  } catch (_) {}

  // 源 2：oioweb 火车票 API
  try {
    const d = await fetchJSON(
      'https://api.oioweb.cn/api/train/train?start=' + encodeURIComponent(from) +
      '&end=' + encodeURIComponent(to) + '&date=' + date,
      8000
    );
    const list = d?.result?.list || d?.data || [];
    if (Array.isArray(list) && list.length) {
      const trains = list.map(x => ({
        code: x.train_no || x.station || x.code || '',
        from: x.start_station || from,
        to: x.end_station || to,
        depart: x.start_time || '',
        arrive: x.arrive_time || '',
        duration: x.run_time || x.duration || '',
        seat: x.seat_info || {}
      }));
      return json({ available: true, trains });
    }
  } catch (_) {}

  // 全部失败：降级返回跳转链接
  const qs12306 = new URLSearchParams({
    linktypeid: 'dc', fs: from, ts: to, date, flag: '1', sort: 'B'
  }).toString();

  return json({
    available: false,
    reason: '公开数据源暂时无法查询，可前往 12306 官方页面',
    links: [
      { name: '12306 官方查询', url: 'https://kyfw.12306.cn/otn/leftTicket/init?' + qs12306 },
      { name: '携程火车票', url: 'https://trains.ctrip.com/TrainBooking/SearchTrain.aspx?from=' +
        encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&day=' + date }
    ]
  });
}
