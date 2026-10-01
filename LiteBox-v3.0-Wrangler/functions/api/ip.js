import { json, fetchJson, isIP, isIPv4 } from '../_shared.js';
export async function onRequestGet({ request }) {
  const u = new URL(request.url); const q = (u.searchParams.get('q') || '').trim();
  let ip = '', resolvedFrom = '';
  if (q && isIP(q)) { ip = q; resolvedFrom = '指定 IP'; }
  if (!q) ip = request.headers.get('CF-Connecting-IP') || request.headers.get('True-Client-IP') || (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim();
  if (!ip && q && !isIP(q)) { try { const d = await fetchJson('https://dns.google/resolve?name=' + encodeURIComponent(q) + '&type=A'); ip = (d.Answer || []).find(x => x.type === 1)?.data || ''; resolvedFrom = '域名 A 记录'; } catch (_) {} }
  if (!ip) { const gets = await Promise.allSettled([fetchJson('https://api.ip.sb/jsonip'), fetchJson('https://api.ipify.org?format=json')]); for (const r of gets) if (r.status === 'fulfilled' && r.value?.ip) { ip = r.value.ip; break; } if (ip) resolvedFrom = '公网 IP 服务'; }
  if (!ip) return json({ error: '无法获取本机公网 IP' }, { status: 502 });
  const sources = [];
  if (isIPv4(ip)) sources.push({ name:'国内 IP 库', url:'https://whois.pconline.com.cn/ipJson.jsp?ip='+encodeURIComponent(ip)+'&json=true', parse:d=>d&&d.ip?{ip:d.ip,country:'中国',region:d.pro||'',city:d.city||'',postal:'',org:d.addr||'',isp:(d.addr||'').split(/\s+/).pop()||'',timezone:'',source:'太平洋网络 IP 库'}:null });
  sources.push(
    {name:'IP.SB',url:'https://api.ip.sb/geoip/'+encodeURIComponent(ip),parse:d=>d&&d.ip?{ip:d.ip,country:d.country||'',region:d.region||'',city:d.city||'',postal:d.postal_code||'',org:d.organization||'',isp:d.isp||'',timezone:d.timezone||'',source:'IP.SB'}:null},
    {name:'IPWHO',url:'https://ipwho.is/'+encodeURIComponent(ip),parse:d=>d&&d.success!==false&&d.ip?{ip:d.ip,country:d.country||'',region:d.region||'',city:d.city||'',postal:d.postal||'',org:d.connection?.org||'',isp:d.connection?.isp||'',timezone:d.timezone?.id||'',source:'IPWHO'}:null},
    {name:'IPAPI',url:'https://ipapi.co/'+encodeURIComponent(ip)+'/json/',parse:d=>d&&d.ip?{ip:d.ip,country:d.country_name||'',region:d.region||'',city:d.city||'',postal:d.postal||'',org:d.org||'',isp:d.org||'',timezone:d.timezone||'',source:'IPAPI'}:null}
  );
  const results = await Promise.allSettled(sources.map(x=>fetchJson(x.url).then(d=>x.parse(d))));
  const usable = results.map((r,i)=>r.status==='fulfilled'&&r.value?{...r.value,rank:i}:null).filter(Boolean);
  usable.sort((a,b)=>{const score=x=>(isIPv4(x.ip)?2:1)+(x.city?4:0)+(x.region?2:0)+(x.isp?1:0)-(x.rank||0)*0.1;return score(b)-score(a);});
  const best=usable[0];
  if(!best) return json({ip,query:q||'本机',resolvedFrom,note:'已获取公网 IP，但归属数据库暂时不可达'});
  return json({...best,query:q||'本机',resolvedFrom,providers:usable.map(x=>x.source)});
}
