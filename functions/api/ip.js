import {json,fetchJson,isIP,isIPv4} from '../_shared.js';
const C={"United States":"美国","China":"中国","Japan":"日本","Singapore":"新加坡","Hong Kong":"中国香港","Taiwan":"中国台湾","South Korea":"韩国","United Kingdom":"英国","Germany":"德国","Canada":"加拿大","Australia":"澳大利亚","France":"法国","Netherlands":"荷兰","India":"印度","Russia":"俄罗斯","Vietnam":"越南","Thailand":"泰国","Malaysia":"马来西亚","Indonesia":"印度尼西亚","South Africa":"南非","Brazil":"巴西"};
const Z={Beijing:'北京',Shanghai:'上海',Tianjin:'天津',Chongqing:'重庆',Guangdong:'广东',Jiangsu:'江苏',Zhejiang:'浙江',Sichuan:'四川',Shaanxi:'陕西',Hubei:'湖北',Hunan:'湖南',Fujian:'福建',Shandong:'山东',Henan:'河南',Hebei:'河北',Anhui:'安徽',Jiangxi:'江西',Liaoning:'辽宁',Jilin:'吉林',Heilongjiang:'黑龙江',Yunnan:'云南',Guizhou:'贵州',Gansu:'甘肃',Qinghai:'青海',Shanxi:'山西',Guangxi:'广西',Xinjiang:'新疆',Tibet:'西藏',Inner:'内蒙古',Ningxia:'宁夏',Hainan:'海南'};
const cn=v=>C[v]||v||'';const z=v=>Z[v]||v||'';
export async function onRequestGet({request}){const u=new URL(request.url),q=(u.searchParams.get('q')||'').trim();let ip='';
  if(q&&isIP(q))ip=q;
  if(!q&&!ip)ip=request.headers.get('CF-Connecting-IP')||request.headers.get('True-Client-IP')||(request.headers.get('X-Forwarded-For')||'').split(',')[0].trim();
  if(!ip&&q&&!isIP(q)){try{const d=await fetchJson('https://dns.google/resolve?name='+encodeURIComponent(q)+'&type=A');ip=(d.Answer||[]).find(x=>x.type===1)?.data||''}catch(_){}}
  if(!ip){const rr=await Promise.allSettled([fetchJson('https://api.ip.sb/jsonip'),fetchJson('https://api.ipify.org?format=json'),fetchJson('https://ipwho.is/')]);for(const r of rr)if(r.status==='fulfilled'&&r.value?.ip){ip=r.value.ip;break}}
  if(!ip)return json({error:'无法获取本机公网 IP'},{status:502});
  const jobs=[
    fetchJson('https://ipwho.is/'+encodeURIComponent(ip)).then(d=>d?.ip?{ip:d.ip,country:cn(d.country),region:z(d.region),city:z(d.city),timezone:d.timezone?.id||'',org:d.connection?.org||'',isp:d.connection?.isp||'',asn:d.connection?.asn||''}:null),
    fetchJson('https://api.ip.sb/geoip/'+encodeURIComponent(ip)).then(d=>d?.ip?{ip:d.ip,country:cn(d.country),region:z(d.region),city:z(d.city),timezone:d.timezone||'',org:d.organization||'',isp:d.isp||'',asn:d.asn||''}:null),
    fetchJson('https://ipapi.co/'+encodeURIComponent(ip)+'/json/').then(d=>d?.ip?{ip:d.ip,country:cn(d.country_name),region:z(d.region),city:z(d.city),timezone:d.timezone||'',org:d.org||'',isp:d.org||'',asn:d.asn||''}:null)
  ];
  if(isIPv4(ip))jobs.push(fetchJson('https://whois.pconline.com.cn/ipJson.jsp?ip='+encodeURIComponent(ip)+'&json=true').then(d=>d?.ip?{ip:d.ip,country:'中国',region:d.pro||'',city:d.city||'',org:d.addr||'',isp:d.addr||''}:null));
  const rr=await Promise.allSettled(jobs),ok=rr.map(r=>r.status==='fulfilled'?r.value:null).filter(Boolean);const score=x=>(x.city?5:0)+(x.region?2:0)+(x.isp||x.org?2:0)+(x.asn?1:0);ok.sort((a,b)=>score(b)-score(a));const best=ok[0];
  if(!best)return json({ip,query:q||'本机',note:'IP 已取得，但归属信息暂时不可达'});return json({ip:best.ip,country:best.country,region:best.region,city:best.city,timezone:best.timezone,org:best.org,isp:best.isp,asn:best.asn,query:q||'本机'});
}
