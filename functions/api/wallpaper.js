const H={'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=120'};
const out=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:H});
const TERMS={all:['wallpaper landscape nature','landscape scenery'],nature:['mountain landscape nature','landscape scenery'],city:['city skyline architecture','city night skyline'],chinese:['Chinese traditional landscape','Chinese painting landscape'],anime:['anime illustration','Japanese animation art'],animal:['wildlife animal photography','animal photography'],car:['automobile car photography','sports car'],tech:['technology computer','computer hardware'],game:['video game art','gaming artwork'],space:['galaxy astronomy space','nebula night sky'],portrait:['portrait photography','woman portrait photography'],mobile:['mobile wallpaper aesthetic','phone background aesthetic']};
const getJSON=async(u)=>{const r=await fetch(u,{headers:{accept:'application/json'},cf:{cacheTtl:120,cacheEverything:true}});if(!r.ok)throw Error('upstream');return r.json()};
const query=async(term,page,width)=>{const u='https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch='+encodeURIComponent(term)+'&gsrnamespace=6&gsrlimit=30&gsroffset='+(page*30)+'&prop=imageinfo&iiprop=url|mime|size&iiurlwidth='+width+'&format=json';const d=await getJSON(u);return Object.values(d.query?.pages||{}).map(x=>{const i=x.imageinfo?.[0]||{};return{id:x.pageid,url:i.thumburl||i.url||'',w:i.thumbwidth||i.width||0,h:i.thumbheight||i.height||0,title:x.title||''}}).filter(x=>x.url&&x.w>240&&x.h>160&&!/\.svg(?:\?|$)/i.test(x.url));};
export async function onRequestGet({request}){const u=new URL(request.url),cat=(u.searchParams.get('cat')||'all').toLowerCase(),page=Math.max(0,Number(u.searchParams.get('page')||0)),size=u.searchParams.get('size')==='mobile'?'mobile':'pc',q=(u.searchParams.get('q')||'').trim(),terms=TERMS[cat]||TERMS.all,width=size==='mobile'?720:1100;
  try{
    const searches=q?[q]:terms;let items=[];for(const t of searches){items=await query(t,page,width);if(items.length>=10)break}
    const seen=new Set();items=items.filter(x=>{const k=x.url.split('?')[0];if(seen.has(k))return false;seen.add(k);return true}).slice(0,18);
    return out({ok:true,items,hasMore:items.length>=10});
  }catch(e){return out({ok:false,error:'壁纸服务暂时不可达，请稍后重试'},502)}
}
