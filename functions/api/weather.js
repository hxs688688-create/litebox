const H={'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=300'};
const out=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...H,...extra}});
const fetchJ=async(u)=>{const r=await fetch(u,{headers:{accept:'application/json'},cf:{cacheTtl:300,cacheEverything:true}});if(!r.ok)throw Error('upstream');return r.json()};
export async function onRequestGet({request}){
  const u=new URL(request.url),name=(u.searchParams.get('name')||'').trim();let lat=Number(u.searchParams.get('lat')),lon=Number(u.searchParams.get('lon')),location=null;
  try{
    if(name){const g=await fetchJ('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(name)+'&count=1&language=zh&format=json');const x=g.results?.[0];if(!x)return out({ok:false,error:'没有找到这个城市' },404);lat=x.latitude;lon=x.longitude;location={name:x.name,latitude:lat,longitude:lon,admin1:x.admin1||'',country:x.country||''};}
    if(!Number.isFinite(lat)||!Number.isFinite(lon))return out({ok:false,error:'缺少有效坐标' },400);
    const p='https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day&hourly=temperature_2m,weather_code,precipitation_probability,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max&timezone=auto&forecast_days=7';
    const data=await fetchJ(p);return out({ok:true,location:location||{name:'当前位置',latitude:lat,longitude:lon},current:data.current||{},hourly:data.hourly||{},daily:data.daily||{},timezone:data.timezone||'',timezone_abbreviation:data.timezone_abbreviation||''});
  }catch(e){return out({ok:false,error:'天气服务暂时不可达，请稍后重试' },502)}
}
