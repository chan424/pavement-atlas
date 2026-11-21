import {recordOperation,putMany,prefs} from './storage.js';
import {renderStudy,prependEvaluation} from './study.js';
import {$,q,names,label,swatch,tag,button,canonicalBox,toast,emit,api} from './shared.js';
import './ui.js';
import './home.js';
import './live.js';
import './mapview.js';
import './help.js';
import {startTour,maybeAutoTour} from './tour.js';

function showStatus(text) { $('status').textContent=text; }
const state = {sample:null, blob:null,imageUrl:null, revision:0, layers:{reference:[],ai:[]}, layer:'reference', model:null, runtime:null, ran:false, dirty:false, editing:null, drawing:false, show:true, recordId:null, busy:false, loading:false, lens:[0.5,0.72], modelSha256:null};
let samples=[], filtered=[], page=0, records=[];
const pageSize=5;
const boxes=()=> state.layers[state.layer];
const threshold=()=> Number($('threshold').value);
const visibleBoxes=()=> boxes().filter(b=>b.decision!=='rejected' && (b.score==null || b.score>=threshold()));
const markDirty=()=>{state.dirty=true; $('saveState').textContent='Unsaved changes.';};
const mayReplace=()=>!state.dirty || confirm('Discard unsaved changes to this frame?');
function resizeSurface(){
  const image=$('frame'), view=$('viewport');
  if(!image.naturalWidth) return;
  const scale=Math.min(view.clientWidth/image.naturalWidth,view.clientHeight/image.naturalHeight);
  $('surface').style.width=image.naturalWidth*scale+'px';
  $('surface').style.height=image.naturalHeight*scale+'px';
  drawLens();
}
new ResizeObserver(resizeSurface).observe($('viewport'));
function svg(name,props){
  const el=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [k,v] of Object.entries(props)) el.setAttribute(k,v);
  return el;
}
function drawLens(){
  const canvas=$('lens'), frame=$('frame');
  const w=canvas.clientWidth,h=canvas.clientHeight;
  if(!w||!h||!frame.complete||!frame.naturalWidth)return;
  const d=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);
  const ctx=canvas.getContext('2d');ctx.scale(d,d);
  const iw=frame.naturalWidth,ih=frame.naturalHeight;
  const scale=Math.max(w/iw,h/ih)*2.5, cw=w/scale,ch=h/scale;
  const left=Math.max(0,Math.min(iw-cw,state.lens[0]*iw-cw/2));
  const top=Math.max(0,Math.min(ih-ch,state.lens[1]*ih-ch/2));
  ctx.drawImage(frame,left,top,cw,ch,0,0,w,h);
  if(!state.show)return;
  for(const b of visibleBoxes()){
    const [x,y,bw,bh]=b.box;
    const px=(x*iw-left)*scale,py=(y*ih-top)*scale;
    ctx.strokeStyle=swatch(b.code);ctx.lineWidth=1.5;
    ctx.strokeRect(px,py,bw*iw*scale,bh*ih*scale);
  }
}
function renderOverlay(){
  drawLens();
  const layer=$('overlay'); layer.replaceChildren();
  const img=$('frame');
  const width=img.naturalWidth || 1000,height=img.naturalHeight || 1000;
  layer.setAttribute('viewBox','0 0 '+width+' '+height);
  if(!state.show) return;
  const unit=width/640;
  for(const b of visibleBoxes()){
    const [x,y,w,h]=b.box;
    const color=swatch(b.code), px=x*width,py=y*height;
    layer.append(svg('rect',{x:px,y:py,width:w*width,height:h*height,fill:'none',stroke:color,'stroke-width':2.1*unit}));
    const str=b.code+(b.score==null?'':' '+Math.round(100*b.score)+'%');
    const tw=(str.length*6.6+8)*unit, bx=Math.min(px,Math.max(0,width-tw));
    const by=Math.max(0,py-15*unit);
    layer.append(svg('rect',{x:bx,y:by,width:tw,height:15*unit,fill:color,rx:1.5*unit}));
    const text=svg('text',{x:bx+4*unit,y:by+11*unit,'font-size':10*unit,'font-weight':700,'font-family':'monospace',fill:'#19211b'});
    text.textContent=str;layer.append(text);
  }
}
function renderBoxes(){
  const visible=visibleBoxes();
  const counts=new Map();visible.forEach(b=>counts.set(b.code,(counts.get(b.code)||0)+1));
  $('boxCount').textContent=visible.length;$('typeCount').textContent=counts.size;
  $('legend').replaceChildren(...[...counts].map(([code,n])=>tag(code,n)));
  $('boxList').replaceChildren();
  for(const b of boxes()){
    const row=q('div','boxrow'), info=q('div'), text=q('div'), actions=q('div','rowacts');
    const metric=b.score==null?'':Math.round(b.score*1000)/10+'% · ';
    text.append(q('strong',null,label(b.code)),q('small',null,metric+b.source+' · '+b.decision+(b.score!=null && b.score<threshold()?' · below cutoff':'')));
    info.style.display='flex';info.style.alignItems='center';info.style.gap='9px';info.append(tag(b.code),text);
    actions.append(button('Edit',()=>openEdit(b)));
    if(b.source==='Manual') actions.append(button('Remove',()=>{if(confirm('Remove this manual box?')){state.layers[state.layer]=boxes().filter(x=>x.id!==b.id);markDirty();render();}}));
    row.append(info,actions);$('boxList').append(row);
  }
  $('boxHelp').textContent=state.drawing?'Drag across the image to outline one defect.':boxes().length?'Edit a class or mark a box accepted or rejected.':'This layer has no boxes. Draw a defect to add one.';
  renderOverlay();
}
function render(){
  const ref=state.layer==='reference';
  $('refLayer').textContent=state.sample?.split==='Field upload'?'Manual review':'Reference';
  $('refLayer').setAttribute('aria-pressed',String(ref));$('aiLayer').setAttribute('aria-pressed',String(!ref));
  $('threshold').disabled=ref;$('cutoff').value=threshold().toFixed(2);
  $('run').disabled=state.busy || state.loading || !state.sample;
  $('run').querySelector('span').textContent=state.busy?'Analysing frame…':state.ran?'Run detector again':'Run detector';
  $('save').disabled=state.busy||state.loading||!state.sample;
  $('addBox').disabled=state.loading||!state.sample;
  $('addBox').textContent=state.drawing?'Cancel drawing':'＋ Draw box';
  $('surface').classList.toggle('drawing',state.drawing);
  $('toggleBoxes').setAttribute('aria-pressed',String(state.show));
  $('toggleBoxes').textContent=state.show?'Hide boxes':'Show boxes';
  renderBoxes();
}
function clearFields(){
  $('recordForm').reset();$('saveState').textContent='';
}
async function selectFrame(sample,blob=null,record=null){
  if(!mayReplace()) return false;
  const rev=++state.revision;
  const url=blob ? URL.createObjectURL(blob) : sample.src;
  state.loading=true;state.busy=false;render();
  const probe=new Image();probe.src=url;
  try{await probe.decode();}catch{
    if(blob)URL.revokeObjectURL(url);
    if(rev===state.revision){state.loading=false;render();showStatus('Could not read that image. Try a JPEG, PNG or WebP.');}return false;
  }
  if(rev!==state.revision){if(blob)URL.revokeObjectURL(url);return false;}
  if(state.imageUrl)URL.revokeObjectURL(state.imageUrl);
  state.imageUrl=blob?url:null;
  state.sample=sample;state.blob=blob;state.dirty=false;state.drawing=false;state.recordId=record?.id||null;state.editing=null;
  state.layers=record?.layers || {reference:(sample.boxes||[]).map(b=>canonicalBox(b.label,[b.x,b.y,b.w,b.h],'Dataset')),ai:[]};
  const first=sample.boxes?.[0];
  state.lens=first?[first.x+first.w/2,first.y+first.h/2]:[0.5,0.72];state.modelSha256=record?.modelSha256||null;
  state.layer=record?.activeLayer||'reference';state.ran=record?.ran||false;state.model=record?.model||null;state.runtime=record?.elapsedMs??null;
  state.show=true;clearFields();state.loading=false;
  $('frame').src=url;$('frame').alt='Road image '+sample.id;$('surface').hidden=false;$('emptyFrame').hidden=true;
  $('frameNo').textContent=(sample.country||'FIELD')+' / '+(sample.split||'Image');
  $('frameName').textContent=sample.id;
  if(record){$('route').value=record.road;$('notes').value=record.notes;$('lat').value=record.latitude??'';$('lon').value=record.longitude??'';}
  $('threshold').value=record?.cutoff??0.25;
  showStatus(state.ran?state.model+' · '+Math.round(state.runtime)+' ms':sample.split==='Field upload'?'Image ready for local analysis.':'Dataset annotations are shown on the reference layer.');
  render();renderGallery();return true;
}
$('frame').addEventListener('load',()=>{resizeSurface();renderOverlay();});
async function openFile(e){
  const file=e.target.files[0];e.target.value='';
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>25*1024*1024){showStatus('Choose a JPEG, PNG or WebP under 25 MB.');toast('Choose a JPEG, PNG or WebP under 25 MB.',{type:'error'});return;}
  const name=file.name&&file.name!=='image.jpg'?file.name:'Photo '+new Date().toLocaleString();
  if(await selectFrame({id:name,split:'Field upload',country:'Field',src:null,boxes:[]},file))toast('Image ready. Tap Run detector to find damage.',{action:'Run now',onAction:()=>$('run').click()});
}
$('upload').addEventListener('change',openFile);
$('capture').addEventListener('change',openFile);
$('refLayer').onclick=()=>changeLayer('reference');
$('aiLayer').onclick=()=>changeLayer('ai');
function changeLayer(layer){
  if(!state.sample)return;
  state.drawing=false;state.layer=layer;
  showStatus(layer==='ai'?(state.ran?state.model+' · '+Math.round(state.runtime)+' ms':'Run the detector to populate this layer.'):(state.blob?'Manual field review.':'Reference annotations from the dataset.'));
  render();
}
$('threshold').oninput=()=>{markDirty();render();if(state.ran)showStatus(state.model+' · '+visibleBoxes().length+' above cutoff.');};
$('toggleBoxes').onclick=()=>{state.show=!state.show;render();};
$('run').onclick=async()=>{
  if(!state.sample||state.busy)return;
  if(state.layers.ai.some(b=>b.source==='Manual'||b.decision!=='pending'||b.originalCode!==b.code||b.box.some((x,i)=>x!==(b.originalBox||b.box)[i]))&&!confirm('Replace the edited AI layer with fresh predictions?'))return;
  const rev=state.revision;
  state.busy=true;state.drawing=false;showStatus('Loading the local road-damage model…');render();
  $('deskBusy').hidden=false;$('deskBusyText').textContent='Analysing the frame…';
  try{
    const {detect}=await import('./model/detector.js');
    if(rev!==state.revision)return;
    const result=await detect($('frame'),{threshold:0.05,onProgress:msg=>{if(rev===state.revision&&typeof msg==='string'){showStatus(msg);$('deskBusyText').textContent=msg;}}});
    if(rev!==state.revision)return;
    state.layers.ai=result.detections.map(d=>canonicalBox(d.code,d.box,'Detector',d.score));
    state.ran=true;state.model=result.model;state.modelSha256=result.modelSha256;state.runtime=result.elapsedMs;state.layer='ai';markDirty();
    showStatus(result.model+' · '+Math.round(result.elapsedMs)+' ms · '+visibleBoxes().length+' above cutoff.');
    toast(visibleBoxes().length?visibleBoxes().length+' damage box'+(visibleBoxes().length===1?'':'es')+' found. Review them below, then save.':'No damage above the cutoff. Try a lower cutoff or check the photo yourself.',{type:visibleBoxes().length?'success':'info'});
  }catch(err){if(rev===state.revision){showStatus('Analysis failed. '+err.message);toast('Analysis failed. '+err.message,{type:'error',timeout:7000});}}
  finally{$('deskBusy').hidden=true;if(rev===state.revision){state.busy=false;render();}}
};
function renderGallery(){
  const gallery=$('gallery');gallery.replaceChildren();const entries=filtered.slice(page*pageSize,(page+1)*pageSize);
  for(const item of entries){
    const b=button('',()=>selectFrame(item),'sample');b.setAttribute('aria-current',String(state.sample?.id===item.id));b.setAttribute('aria-label','Inspect '+item.id);
    const img=q('img');img.src=item.src;img.loading='lazy';img.alt='';
    const info=q('span','cardtext');info.append(q('strong',null,item.id),q('small',null,[...new Set(item.boxes.map(x=>x.label))].join(' / ') || 'No labelled damage'));
    b.append(img,info);gallery.append(b);
  }
  if(!entries.length)gallery.append(q('p','help','No matching reference frames.'));
  $('sampleInfo').textContent=filtered.length? (page*pageSize+1)+'–'+(page*pageSize+entries.length)+' of '+filtered.length+' frames':'0 frames';
  $('prev').disabled=page<=0;$('next').disabled=(page+1)*pageSize>=filtered.length;
}
$('next').onclick=()=>{page++;renderGallery();};$('prev').onclick=()=>{page--;renderGallery();};
$('classFilter').onchange=e=>{const filter=e.target.value;filtered=samples.filter(s=>!filter||s.boxes.some(b=>filter==='Other'?!['D00','D10','D20','D40'].includes(b.label):b.label===filter));page=0;renderGallery();};
for(const [code,name] of Object.entries(names)){const opt=q('option',null,code+' · '+name);opt.value=code;$('editClass').append(opt);}
function openEdit(b){
  state.lens=[b.box[0]+b.box[2]/2,b.box[1]+b.box[3]/2];drawLens();state.editing=b.id; ['boxX','boxY','boxW','boxH'].forEach((id,i)=>$(id).value=b.box[i]);$('editError').textContent='';$('editClass').value=names[b.code]?b.code:'OTHER';$('decision').value=b.decision;$('editDialog').showModal();
}
$('cancelEdit').onclick=()=>$('editDialog').close();
$('editForm').onsubmit=e=>{e.preventDefault();const b=boxes().find(v=>v.id===state.editing);if(b){
    const coords=['boxX','boxY','boxW','boxH'].map(id=>Number($(id).value));
    const [x,y,w,h]=coords;
    if(x+w>1.00000001||y+h>1.00000001){$('editError').textContent='The box must fit inside the image. Reduce its width or height.';return;}
    b.originalBox??=[...b.box];b.box=coords;b.code=$('editClass').value;b.decision=$('decision').value;markDirty();
  } $('editDialog').close();render();};
$('addBox').onclick=()=>{state.drawing=!state.drawing;state.show=true;render();if(state.drawing)$('viewport').scrollIntoView({block:'center',behavior:'smooth'});};
let start=null;
function point(e){const r=$('surface').getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];}
function area(a,b){return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1])];}
$('surface').onpointerdown=e=>{if(!state.drawing){state.lens=point(e);drawLens();return;}start=point(e);$('surface').setPointerCapture(e.pointerId);};
$('surface').onpointermove=e=>{if(!state.drawing||!start)return;const [x,y,w,h]=area(start,point(e)),iw=$('frame').naturalWidth,ih=$('frame').naturalHeight;renderOverlay();$('overlay').append(svg('rect',{x:x*iw,y:y*ih,width:w*iw,height:h*ih,fill:'#ffffff1a',stroke:'white','stroke-width':iw/300,'stroke-dasharray':'5 3'}));};
$('surface').onpointercancel=()=>{start=null;renderOverlay();};
$('surface').onpointerup=e=>{
  if(!start||!state.drawing)return;
  const bbox=area(start,point(e));start=null;
  if(bbox[2]<0.008||bbox[3]<0.008){renderOverlay();return;}
  const b=canonicalBox('D40',bbox,'Manual');b.decision='accepted';
  boxes().push(b);state.drawing=false;markDirty();render();openEdit(b);
};
$('recordForm').oninput=markDirty;
$('gps').onclick=()=>{
  if(!navigator.geolocation){$('saveState').textContent='Location is unavailable. You can enter coordinates manually.';return;}
  $('saveState').textContent='Reading this device’s current location…';const rev=state.revision;
  navigator.geolocation.getCurrentPosition(p=>{if(rev!==state.revision)return;$('lat').value=p.coords.latitude.toFixed(6);$('lon').value=p.coords.longitude.toFixed(6);markDirty();$('saveState').textContent='Device location added. Verify it matches the road frame.';},()=>{if(rev===state.revision)$('saveState').textContent='Location unavailable. Enter coordinates manually.';},{timeout:12000});
};
$('recordForm').onsubmit=async e=>{
  e.preventDefault();if(!state.sample||state.loading||state.busy)return;
  const lat=$('lat').value,lon=$('lon').value;
  if((lat==='')!==(lon==='')){$('saveState').textContent='Enter both coordinates or leave both empty.';return;}
  const id=state.recordId||crypto.randomUUID();state.recordId=id;
  const prior=api.records.find(r=>r.id===id);
  const data={id,updated:new Date().toISOString(),created:prior?.created,origin:prior?.origin||'desk',sample:state.sample,blob:state.blob,activeLayer:state.layer,layers:state.layers,model:state.model,modelSha256:state.modelSha256,elapsedMs:state.runtime,ran:state.ran,road:$('route').value.trim(),notes:$('notes').value.trim(),latitude:lat===''?null:Number(lat),longitude:lon===''?null:Number(lon),cutoff:threshold()};
  try{await recordOperation('put',data);if(state.recordId===id){state.dirty=false;$('saveState').textContent='Saved to the field register.';}toast('Saved to the field register.',{type:'success',action:'View register',onAction:()=>location.hash='register'});refreshRecords();}
  catch{$('saveState').textContent='Could not save. Check available browser storage and retry.';toast('Could not save. Check available browser storage and retry.',{type:'error'});}
};
window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
async function refreshRecords(){
  try{records=(await recordOperation('getAll')).sort((a,b)=>b.updated.localeCompare(a.updated));api.records=records;$('regStatus').textContent='';drawRecords();updateRoadList();emit('records',records);}
  catch{$('regStatus').textContent='This browser could not open the local database.';emit('records',api.records);}
}
function drawRecords(){
  $('regStats').replaceChildren();
  const boxTotal=records.reduce((n,r)=>n+r.layers[r.activeLayer].filter(b=>b.decision==='accepted').length,0);
  for(const [v,t] of [[records.length,'SAVED FRAMES'],[boxTotal,'ACCEPTED BOXES'],[records.filter(r=>r.latitude!=null).length,'GEOLOCATED FRAMES']]){
    const el=q('div','stat');el.append(q('strong',null,v),q('span','tiny',t));$('regStats').append(el);
  }
  const routes=new Map();
  for(const r of records){
    const key=r.road||'Unassigned road';
    if(!routes.has(key))routes.set(key,{frames:0,accepted:0,pending:0,types:new Map()});
    const group=routes.get(key);group.frames++;
    for(const b of r.layers[r.activeLayer]){
      if(b.decision==='accepted'){group.accepted++;group.types.set(b.code,(group.types.get(b.code)||0)+1);}
      else if(b.decision==='pending')group.pending++;
    }
  }
  const routePlot=$('routePlot');routePlot.replaceChildren();
  for(const [name,g] of [...routes].sort((a,b)=>b[1].accepted-a[1].accepted)){
    const row=q('div','routeRow'),title=q('div');
    title.append(q('strong',null,name),q('small',null,g.frames+' frames · '+g.accepted+' accepted · '+g.pending+' pending'));
    const plot=q('div','routeBar');const tags=q('div','legend'); 
    for(const [code,count] of g.types){const seg=q('i');seg.style.width=(100*count/g.accepted)+'%';seg.style.background=swatch(code);plot.append(seg);tags.append(tag(code,count));}
    row.append(title,plot,tags);routePlot.append(row);
  }
  $('routeSummary').hidden=!routes.size;
  const term=$('recordSearch').value.toLowerCase();const shown=records.filter(r=>(r.sample.id+' '+r.road).toLowerCase().includes(term));
  const list=$('records');list.replaceChildren();
  if(!shown.length)list.append(q('p','blank',records.length?'No matching records.':'Your register is empty. Open a road frame, review the boxes and save your first record.'));
  for(const r of shown){
    const row=q('div','recordrow'),info=q('div'),actions=q('div','rowacts');
    const meta=q('div');meta.append(q('strong',null,r.road||r.sample.id),q('small',null,r.sample.id+' · '+r.activeLayer+' · '+new Date(r.updated).toLocaleString()+(r.origin&&r.origin!=='desk'?' · '+r.origin:'')+(r.latitude!=null?' · 📍':'')));info.append(meta);
    const thumb=q('img','thumb');thumb.alt='';thumb.loading='lazy';thumb.src=thumbUrlOf(r);info.prepend(thumb);info.classList.add('recinfo');
    actions.append(button('Open',()=>openRecord(r)),button('Delete',async()=>{
      if(!confirm('Delete this saved record and its stored image?'))return;
      try{await recordOperation('delete',r.id);if(state.recordId===r.id)state.recordId=null;await refreshRecords();toast('Record deleted.');}catch{$('regStatus').textContent='Delete failed. Please retry.';}
    }));row.append(info,actions);list.append(row);
  }
  $('expBackup').disabled=!records.length;
  for(const k of ['expCsv','expGeo','expJson'])$(k).disabled=k==='expGeo'?!records.some(r=>r.latitude!=null):!records.length;
}
$('recordSearch').oninput=drawRecords;
function download(body,type,filename){const url=URL.createObjectURL(new Blob([body],{type}));const a=q('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
const csvValue=value=>{let s=String(value??'');if(typeof value==='string'&&/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
function exportData(kind){
  const stem='pavement-atlas-'+new Date().toISOString().slice(0,10);
  if(kind==='json'){
    const clean=records.map(({blob,...r})=>({...r,imageIncluded:false}));
    download(JSON.stringify({format:'pavement-atlas/1',coordinateFormat:'normalized top-left xywh',records:clean},null,2),'application/json',stem+'.json');
  }else if(kind==='geojson'){
    const features=records.filter(r=>r.latitude!==null).map(r=>({type:'Feature',geometry:{type:'Point',coordinates:[r.longitude,r.latitude]},properties:{id:r.id,frame:r.sample.id,road:r.road,notes:r.notes,updated:r.updated,layer:r.activeLayer,boxes:r.layers[r.activeLayer]}}));
    download(JSON.stringify({type:'FeatureCollection',features},null,2),'application/geo+json',stem+'.geojson');
  }else{
    const rows=[['record_id','frame','road','latitude','longitude','updated','layer','model','cutoff','code','original_code','source','score','decision','x','y','width','height','notes']];
    for(const r of records){const bs=r.layers[r.activeLayer];for(const b of bs.length?bs:[null])rows.push([r.id,r.sample.id,r.road,r.latitude,r.longitude,r.updated,r.activeLayer,r.activeLayer==='ai'?r.model:'',r.cutoff,b?.code,b?.originalCode,b?.source,b?.score,b?.decision,...(b?.box||['','','','']),r.notes]);}
    download(rows.map(r=>r.map(csvValue).join(',')).join('\r\n'),'text/csv;charset=utf-8',stem+'.csv');
  }
  $('regStatus').textContent=kind==='geojson'?'Exported geolocated records. Coordinates use longitude, latitude order.':'Exported all saved records. JSON and CSV contain metadata and boxes. Photo files stay on this device.';
}
$('expJson').onclick=()=>exportData('json');$('expCsv').onclick=()=>exportData('csv');$('expGeo').onclick=()=>exportData('geojson');
const routes=['home','desk','live','register','map','study','help'];
let currentRoute=null;
function navigate(){const hash=location.hash.slice(1);
  // In-page help anchors (#h-...) keep the help view open and scroll to the section.
  if(hash.startsWith('h-')&&document.getElementById(hash)){if(currentRoute!=='help'){for(const id of routes)$(id).hidden=id!=='help';currentRoute='help';markNav('help');emit('route','help');}requestAnimationFrame(()=>document.getElementById(hash).scrollIntoView({behavior:'smooth',block:'start'}));return;}
  const route=routes.includes(hash)?hash:'home';const changed=route!==currentRoute;currentRoute=route;for(const id of routes)$(id).hidden=id!==route;markNav(route);emit('route',route);document.title=({home:'Dashboard',desk:'Survey desk',live:'Live camera',register:'Field register',map:'Map',study:'Model study',help:'How to use'})[route]+' · Pavement Atlas';if(changed&&document.activeElement&&document.activeElement.closest?.('nav'))$('main').focus({preventScroll:true});
  if(route==='register')refreshRecords();if(route==='desk')requestAnimationFrame(resizeSurface);window.scrollTo(0,0);}
function markNav(route){document.querySelectorAll('[data-view]').forEach(a=>{if(a.dataset.view===route)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
window.addEventListener('hashchange',navigate);renderStudy($('studyContent'));prependEvaluation($('studyContent')).catch(()=>{});navigate();
async function init(){
  render();refreshRecords();
  try{
    const res=await fetch('./data/manifest.json');if(!res.ok)throw Error('Sample manifest missing');
    const m=await res.json();samples=m.images;filtered=samples;
    $('credits').textContent=typeof m.attribution==='string'?m.attribution:'Road imagery and annotations from RDD2022, Arya et al. See the data documentation for source and licence.';
    if(!samples.length)throw Error('No packaged reference images');
    api.samples=samples;emit('samples',samples);
    renderGallery();if(!state.sample && !state.loading)await selectFrame(samples[0]);
    maybeAutoTour();
  }catch{showStatus('Reference images could not load. Open a road image to begin.');if(!state.sample){$('frameName').textContent='No frame selected';$('surface').hidden=true;$('emptyFrame').hidden=false;}}
}
init();

// ---- Additions for v2: shared API, import/restore, backups, road list ----
function thumbUrlOf(r){return api.thumbUrl?api.thumbUrl(r):(r.sample?.src||'');}
async function openRecord(r){
  if(!r.blob&&!r.sample?.src){toast('This record has no stored photo (it was imported without images). Its data is still in the register and exports.',{type:'error',timeout:7000});return false;}
  if(await selectFrame(r.sample,r.blob,r)){location.hash='desk';return true;}
  return false;
}
function updateRoadList(){const roads=[...new Set(records.map(r=>r.road).filter(Boolean))].sort();$('roadList').replaceChildren(...roads.map(r=>{const o=q('option');o.value=r;return o;}));}
const blobToDataUrl=blob=>new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=()=>reject(fr.error);fr.readAsDataURL(blob);});
async function dataUrlToBlob(url){const res=await fetch(url);return res.blob();}
$('expBackup').onclick=async()=>{
  $('expBackup').disabled=true;$('regStatus').textContent='Preparing backup with photos…';
  try{
    const list=[];for(const r of records){const {blob,...rest}=r;list.push({...rest,imageIncluded:!!blob,imageData:blob?await blobToDataUrl(blob):null});}
    download(JSON.stringify({format:'pavement-atlas/backup-2',app:'Pavement Atlas v2',exported:new Date().toISOString(),coordinateFormat:'normalized top-left xywh',records:list}),'application/json','pavement-atlas-backup-'+new Date().toISOString().slice(0,10)+'.json');
    $('regStatus').textContent='Backup saved with '+list.length+' records and their photos. Keep this file safe.';toast('Backup downloaded.',{type:'success'});
  }catch(err){$('regStatus').textContent='Backup failed. '+(err?.message||'');toast('Backup failed.',{type:'error'});}
  finally{$('expBackup').disabled=!records.length;}
};
$('importFile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{
    if(file.size>500*1024*1024)throw Error('File is too large.');
    const data=JSON.parse(await file.text());
    const list=Array.isArray(data)?data:data.records;
    if(!Array.isArray(list)||(data.format&&!String(data.format).startsWith('pavement-atlas/')))throw Error('This is not a Pavement Atlas backup or JSON export.');
    const existing=new Map(records.map(r=>[r.id,r]));const keep=[];let skipped=0,invalid=0;
    for(const raw of list){
      if(!raw||typeof raw!=='object'||typeof raw.id!=='string'||!raw.layers||!raw.sample){invalid++;continue;}
      const {imageData,imageIncluded,...r}=raw;
      const old=existing.get(r.id);
      if(old&&String(old.updated||'')>=String(r.updated||'')){skipped++;continue;}
      r.blob=typeof imageData==='string'&&imageData.startsWith('data:image/')?await dataUrlToBlob(imageData):(old?.blob||null);
      keep.push(r);
    }
    if(keep.length)await putMany(keep);
    await refreshRecords();
    const msg='Imported '+keep.length+' record'+(keep.length===1?'':'s')+(skipped?', kept '+skipped+' newer existing':'')+(invalid?', ignored '+invalid+' invalid':'')+'.';
    $('regStatus').textContent=msg;toast(msg,{type:keep.length?'success':'info'});
  }catch(err){const msg='Import failed. '+(err instanceof SyntaxError?'The file is not valid JSON.':err.message);$('regStatus').textContent=msg;toast(msg,{type:'error',timeout:7000});}
};
Object.assign(api,{openRecord,refreshRecords,selectFrame:(...a)=>selectFrame(...a),startTour,
  runDetector:()=>{if(currentRoute==='desk')$('run').click();},
  toggleBoxes:()=>{if(currentRoute==='desk')$('toggleBoxes').click();},
  drawBox:()=>{if(currentRoute==='desk'&&!$('addBox').disabled)$('addBox').click();},
  saveRecord:()=>{if(currentRoute==='desk')$('recordForm').requestSubmit();},
  galleryStep:d=>{if(currentRoute!=='desk')return;const b=d>0?$('next'):$('prev');if(!b.disabled)b.click();},
  route:()=>currentRoute});
