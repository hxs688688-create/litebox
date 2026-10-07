/* LiteBox v5 · functions/api/train.js — 火车票查询（GET /api/train?from=&to=&date=）
   Step 14：主通道改为代理 12306 MCP Server（公共端点，免费无需 key）；
   失败时依次回退到公开数据源，再全部失败则返回 12306 / 携程跳转链接。 */
import { json, err, fetchJSON } from '../_utils.js';

/* 12306 MCP Server 公共端点（免费，无需 key；有速率限制 200 请求/分钟/IP） */
const MCP_ENDPOINT = 'https://mcp.pianam.cn/train-mcp/mcp';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const from = (url.searchParams.get('from') || '').trim();
  const to = (url.searchParams.get('to') || '').trim();
  const date = (url.searchParams.get('date') || '').trim();

  if (!from || !to) return err('缺少 from / to 参数', 400);

  /* —— 主通道：12306 MCP Server —— */
  const viaMcp = await queryMcp(from, to, date);
  if (viaMcp) return json({ available: true, trains: viaMcp });

  /* —— 回退通道：公开数据源 —— */
  const viaLegacy = await queryLegacy(from, to, date);
  if (viaLegacy) return json({ available: true, trains: viaLegacy });

  /* —— 全部失败：降级返回跳转链接 —— */
  return json(buildFallback(from, to, date));
}

/* MCP 协议调用：POST JSON-RPC，响应可能是 SSE（text/event-stream）或纯 JSON */
async function queryMcp(from, to, date) {
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'query_train_tickets',
      arguments: {
        from_city: from,
        to_city: to,
        date: date || ''
      }
    }
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!r.ok) return null;

    const text = await r.text();
    const payload = pickJsonPayload(text);
    if (!payload) return null;

    /* JSON-RPC 层错误直接放弃，交由后续通道处理 */
    if (payload.error) return null;

    const content = payload.result && payload.result.content;
    const raw = Array.isArray(content) && content[0] && content[0].text ? content[0].text : '';
    if (!raw) return null;

    const trains = parseTrainText(raw);
    return trains.length ? trains : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* 响应可能是 SSE（逐行 data: {...}）或直接 JSON，两种都试一遍 */
function pickJsonPayload(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;

  /* 1) 纯 JSON */
  if (trimmed.charAt(0) === '{') {
    try { return JSON.parse(trimmed); } catch (_) { /* 继续试 SSE */ }
  }

  /* 2) SSE：取最后一条带 result 的 data 行 */
  let found = null;
  for (const line of trimmed.split('\n')) {
    const s = line.trim();
    if (s.indexOf('data:') !== 0) continue;
    const body = s.slice(5).trim();
    if (!body || body === '[DONE]') continue;
    try {
      const d = JSON.parse(body);
      if (d && (d.result || d.error)) found = d;
    } catch (_) { /* 跳过不完整行 */ }
  }
  return found;
}

/* 把 MCP 返回的文本车次列表解析成结构化数据
   典型格式：G1234 | 北京南 08:00 → 上海虹桥 12:30 | 历时 4h30m | 二等座 有 */
function parseTrainText(text) {
  const trains = [];
  const STRICT = /^([A-Za-z]+\d+)\s*[|｜]\s*(.+?)\s*(\d{2}:\d{2})\s*(?:→|->|—|–|至)\s*(.+?)\s*(\d{2}:\d{2})\s*[|｜]\s*(.+?)\s*[|｜]\s*(.+)$/;
  const times = s => s.match(/\d{2}:\d{2}/g) || [];

  for (const rawLine of String(text).split('\n')) {
    const line = rawLine.trim().replace(/^[-*·•\d.、)）\s]+/, '');
    if (!line) continue;

    const m = line.match(STRICT);
    if (m) {
      trains.push({
        code: m[1].toUpperCase(),
        from: m[2].trim(),
        depart: m[3],
        to: m[4].trim(),
        arrive: m[5],
        duration: cleanDuration(m[6]),
        seat: m[7].trim()
      });
      continue;
    }

    /* 宽松兜底：只要一行里同时有车次号 + 两个时刻，就尽量拼出一条记录 */
    const code = line.match(/\b([GDCKTZY]\d{1,4})\b/i);
    const ts = times(line);
    if (!code || ts.length < 2) continue;

    const parts = line.split(/[|｜]/).map(s => s.trim()).filter(Boolean);
    const stations = (parts[1] || '').match(/[\u4e00-\u9fa5]{2,10}/g) || [];
    const dur = line.match(/(?:历时\s*)?(\d+\s*[hH]\s*\d+\s*[mM]|\d+\s*[小时]+\s*\d*\s*[分]?|\d{1,2}:\d{2})/);
    trains.push({
      code: code[1].toUpperCase(),
      from: stations[0] || '',
      depart: ts[0],
      to: stations[1] || '',
      arrive: ts[1],
      duration: dur ? cleanDuration(dur[1]) : '',
      seat: parts.length > 2 ? parts.slice(2).join(' · ') : ''
    });
  }
  return trains;
}

/* "历时 4h30m" / "4小时30分" → "4h30m" 归一 */
function cleanDuration(s) {
  let v = String(s || '').replace(/历时/g, '').trim();
  v = v.replace(/\s+/g, '');
  v = v.replace(/小时/g, 'h').replace(/时/g, 'h').replace(/分/g, 'm');
  return v;
}

/* 公开数据源回退（MCP 不可用时） */
async function queryLegacy(from, to, date) {
  if (!date) return null;

  /* 源 1：vvhan */
  try {
    const d = await fetchJSON(
      'https://api.vvhan.com/api/train?from=' + encodeURIComponent(from) +
      '&to=' + encodeURIComponent(to) + '&date=' + date,
      8000
    );
    if (d && d.success && Array.isArray(d.data) && d.data.length) {
      return d.data.map(x => ({
        code: x.station || x.trainNo || x.train_no || '',
        from: x.from || x.startStation || from,
        to: x.to || x.endStation || to,
        depart: x.startTime || x.departTime || x.fromTime || '',
        arrive: x.endTime || x.arriveTime || x.toTime || '',
        duration: cleanDuration(x.duration || x.lishi || ''),
        seat: x.seatInfo || x.seat || ''
      }));
    }
  } catch (_) { /* 落入下一个源 */ }

  /* 源 2：oioweb */
  try {
    const d = await fetchJSON(
      'https://api.oioweb.cn/api/train/train?start=' + encodeURIComponent(from) +
      '&end=' + encodeURIComponent(to) + '&date=' + date,
      8000
    );
    const list = (d && d.result && d.result.list) || (d && d.data) || [];
    if (Array.isArray(list) && list.length) {
      return list.map(x => ({
        code: x.train_no || x.station || x.code || '',
        from: x.start_station || from,
        to: x.end_station || to,
        depart: x.start_time || '',
        arrive: x.arrive_time || '',
        duration: cleanDuration(x.run_time || x.duration || ''),
        seat: x.seat_info || ''
      }));
    }
  } catch (_) { /* 全部失败 */ }

  return null;
}

function buildFallback(from, to, date) {
  const qs = new URLSearchParams({
    linktypeid: 'dc', fs: from, ts: to, date: date || '', flag: '1', sort: 'B'
  }).toString();
  return {
    available: false,
    reason: '实时查询暂时不可用，可前往 12306 官方页面查询',
    links: [
      { name: '12306 官方查询', url: 'https://kyfw.12306.cn/otn/leftTicket/init?' + qs },
      { name: '携程火车票', url: 'https://trains.ctrip.com/TrainBooking/SearchTrain.aspx?from=' +
        encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&day=' + (date || '') }
    ]
  };
}
