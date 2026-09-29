const { createClient } = window.supabase;
const sb = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabasePublishableKey);
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localDate=d=>{const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)};
const addDays=(s,n)=>{const d=new Date(`${s}T00:00:00`);d.setDate(d.getDate()+n);return localDate(d)};
const fmtDate=s=>new Intl.DateTimeFormat('en-SG',{weekday:'long',day:'numeric',month:'short',year:'numeric'}).format(new Date(`${s}T00:00:00`));
const fmtShortDate=s=>new Intl.DateTimeFormat('en-SG',{weekday:'short',day:'numeric',month:'short'}).format(new Date(`${s}T00:00:00`));
const fmtTime=t=>{const [h,m]=t.slice(0,5).split(':').map(Number),ap=h>=12?'PM':'AM',hh=h%12||12;return `${hh}:${String(m).padStart(2,'0')} ${ap}`};
const mins=t=>{const [h,m]=t.slice(0,5).split(':').map(Number);return h*60+m};
const tm=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:00`;
const slots=(a,b,step=30)=>{const out=[];for(let m=mins(a);m<mins(b);m+=step)out.push(tm(m));return out};
const toast=m=>{ $('toast').textContent=m;$('toast').classList.remove('hidden');clearTimeout(window.__toast);window.__toast=setTimeout(()=>$('toast').classList.add('hidden'),4500)};
const state={user:null,profile:null,resources:[],organ:[],bookings:[],selection:null,date:localDate(new Date()),resourceWeek:localDate(new Date()),guestWeek:localDate(new Date()),pending:null,syncing:false};

async function load(){
  const [r,o,b]=await Promise.all([
    sb.from('resources').select('*').eq('active',true).order('name'),
    sb.from('chms_practice_sessions').select('*').eq('status','confirmed').gte('booking_date',localDate(new Date())).order('booking_date').order('start_time'),
    sb.from('v_upcoming_resource_bookings').select('*').gte('booking_date',localDate(new Date())).order('booking_date').order('slot_start')
  ]);
  if(r.error)throw r.error;if(o.error)throw o.error;if(b.error)throw b.error;
  state.resources=r.data||[];state.organ=o.data||[];state.bookings=b.data||[];
  renderAll();
}
const resource=name=>state.resources.find(r=>r.name===name);
const bySlot=(rid,date,slot)=>state.bookings.find(b=>b.resource_id===rid&&b.booking_date===date&&b.slot_start.slice(0,5)===slot.slice(0,5));
function groupRange(groupId){
  const rows=state.bookings.filter(b=>b.booking_group_id===groupId).sort((a,b)=>a.slot_start.localeCompare(b.slot_start));
  if(!rows.length)return null;
  const step=Number(rows[0].resource_slot_minutes||30);
  const start=rows[0].slot_start;
  const endM=mins(rows[rows.length-1].slot_start)+step;
  return {start,end:tm(endM),slots:rows.length};
}
function grid(rid,date,allowed,sessionId=null){
  return `<div class="slots">${allowed.map(s=>{
    const b=bySlot(rid,date,s),mine=b?.user_id===state.user?.id;
    const selected=state.selection?.resourceId===rid&&state.selection?.date===date&&(state.selection.sessionId||null)===(sessionId||null)&&state.selection.slots.includes(s);
    const selectable=!b;
    return `<button ${selectable?`data-slot="${s}" data-rid="${rid}" data-date="${date}" data-session="${sessionId||''}"`:''} class="slot ${b?(mine?'mine':'taken'):(selected?'selected':'available')}" ${b?'disabled':''}><b>${fmtTime(s)}</b><span>${b?esc(b.display_name):'Available'}</span><small>${b?(mine?'Your booking':'Booked'):(selected?'Selected':'Tap to select')}</small></button>`;
  }).join('')}</div>`;
}
function renderOrgan(){
  const root=$('organSessions');
  root.innerHTML=state.organ.length?state.organ.map(s=>`<article class="card"><div class="row"><div><h2>${fmtDate(s.booking_date)}</h2><div>${fmtTime(s.start_time)} – ${fmtTime(s.end_time)} · Sanctuary 1</div><div class="muted">${esc(s.purpose)}</div></div><span class="badge">CHMS confirmed</span></div>${grid(s.resource_id,s.booking_date,slots(s.start_time,s.end_time,30),s.id)}</article>`).join(''):'<div class="card empty">No confirmed FBPC Organ Practice sessions are currently known.</div>';
  root.querySelectorAll('.slot.available,.slot.selected').forEach(b=>b.onclick=()=>{select(b.dataset.rid,b.dataset.date,b.dataset.session||null,b.dataset.slot);renderOrgan()});
  renderSelection('organSelection',true);
}
function calendarOverview(name,weekStart,targetId,weekStateKey){
  const r=resource(name); if(!r)return '';
  const days=Array.from({length:7},(_,i)=>addDays(weekStart,i));
  const bookedDays=days.map(date=>({date,rows:state.bookings.filter(b=>b.resource_id===r.id&&b.booking_date===date)}));
  return `<div class="week-nav"><button class="secondary" data-weekprev="${weekStateKey}">‹</button><strong>${fmtShortDate(days[0])} – ${fmtShortDate(days[6])}</strong><button class="secondary" data-weeknext="${weekStateKey}">›</button></div><div class="calendar-grid">${bookedDays.map(d=>{const selected=d.date===state.date;const ranges=groupRanges(d.rows,r.slot_minutes);return `<button class="calendar-day ${selected?'selected-day':''}" data-calendar-date="${d.date}" data-calendar-resource="${r.id}"><b>${fmtShortDate(d.date)}</b>${ranges.length?ranges.slice(0,3).map(x=>`<span>${fmtTime(x.start)}–${fmtTime(x.end)}</span>`).join(''):'<span class="muted">No bookings</span>'}${ranges.length>3?`<small>+${ranges.length-3} more</small>`:''}</button>`}).join('')}</div>`;
}
function groupRanges(rows,slotMinutes){
  const sorted=[...rows].sort((a,b)=>a.slot_start.localeCompare(b.slot_start));
  const out=[]; for(const row of sorted){const last=out[out.length-1];const end=last?mins(last.end):null;if(last&&mins(row.slot_start)===end){last.end=tm(mins(row.slot_start)+slotMinutes);}else out.push({start:row.slot_start,end:tm(mins(row.slot_start)+slotMinutes)});} return out;
}
function bindCalendar(targetId,weekStateKey,renderFn){
  const root=$(targetId);if(!root)return;
  root.querySelectorAll('[data-calendar-date]').forEach(b=>b.onclick=()=>{state.date=b.dataset.calendarDate;renderFn()});
  root.querySelector('[data-weekprev]')?.addEventListener('click',()=>{state[weekStateKey]=addDays(state[weekStateKey],-7);renderFn()});
  root.querySelector('[data-weeknext]')?.addEventListener('click',()=>{state[weekStateKey]=addDays(state[weekStateKey],7);renderFn()});
}
function renderResource(){
  const r=resource('Resource Room'); if(!r)return;
  $('resourceDate').value=state.date;
  $('resourceCalendar').innerHTML=calendarOverview('Resource Room',state.resourceWeek,'resourceCalendar','resourceWeek');
  $('resourceDay').innerHTML=`<div class="card"><div class="row"><div><h2>${fmtDate(state.date)}</h2><div class="muted">30-minute slots · 8:00 AM–10:00 PM · no approval required</div></div><span class="badge">Immediate confirmation</span></div>${grid(r.id,state.date,slots('08:00','22:00',30))}</div>`;
  bindCalendar('resourceCalendar','resourceWeek',renderResource);
  $('resourceDay').querySelectorAll('.slot.available,.slot.selected').forEach(b=>b.onclick=()=>{select(b.dataset.rid,b.dataset.date,null,b.dataset.slot);renderResource()});
  renderSelection('resourceSelection',false);
}
function renderGuest(){
  const r=resource('Guest Room'); if(!r)return;
  $('guestDate').value=state.date;
  $('guestCalendar').innerHTML=calendarOverview('Guest Room',state.guestWeek,'guestCalendar','guestWeek');
  $('guestDay').innerHTML=`<div class="card"><div class="row"><div><h2>${fmtDate(state.date)}</h2><div class="muted">60-minute slots · 8:00 AM–10:00 PM · no approval required</div></div><span class="badge">Immediate confirmation</span></div>${grid(r.id,state.date,slots('08:00','22:00',60))}</div>`;
  bindCalendar('guestCalendar','guestWeek',renderGuest);
  $('guestDay').querySelectorAll('.slot.available,.slot.selected').forEach(b=>b.onclick=()=>{select(b.dataset.rid,b.dataset.date,null,b.dataset.slot);renderGuest()});
  renderSelection('guestSelection',false);
}
function renderMine(){
  const mine=state.bookings.filter(b=>b.user_id===state.user?.id);
  $('myBookings').innerHTML=mine.length?[...new Map(mine.map(b=>[b.booking_group_id,b])).values()].map(g=>{const range=groupRange(g.booking_group_id);return `<div class="card row"><div><strong>${esc(g.resource_name)}</strong><div>${fmtDate(g.booking_date)}</div><div>${range?`${fmtTime(range.start)} – ${fmtTime(range.end)}`:fmtTime(g.slot_start)}</div><div class="muted">${esc(g.purpose||'')}</div></div><button class="secondary" data-cancel="${g.id}" data-group="${g.booking_group_id}">Cancel</button></div>`}).join(''):'<div class="card empty">You have no active bookings.</div>';
  $('myBookings').querySelectorAll('[data-cancel]').forEach(b=>b.onclick=async()=>{if(!confirm('Cancel this booking?'))return;const groupId=b.dataset.group;const {error}=await sb.rpc('cancel_my_booking_group',{p_booking_id:b.dataset.cancel});if(error){toast(error.message);return}let emailMessage='';const email=await sendBookingEmail(groupId,'cancelled');if(email.error)emailMessage=' The cancellation email could not be sent.';toast('Booking cancelled.'+emailMessage);await load()});
}
function renderSelection(id,fixed){
  const el=$(id); if(!state.selection?.slots.length){el.classList.add('hidden');el.innerHTML='';return}
  el.classList.remove('hidden');el.innerHTML=`<span><b>${state.selection.slots.length} slot(s)</b> · ${state.selection.slots.map(fmtTime).join(', ')}</span><button>Reserve selected</button>`;
  el.querySelector('button').onclick=()=>openDialog(fixed);
}
function select(rid,date,sessionId,slot){
  const key=state.selection&&state.selection.resourceId===rid&&state.selection.date===date&&(state.selection.sessionId||null)===(sessionId||null);
  if(!key)state.selection={resourceId:rid,date,sessionId:sessionId||null,slots:[slot]};
  else{const i=state.selection.slots.indexOf(slot);i>=0?state.selection.slots.splice(i,1):state.selection.slots.push(slot);state.selection.slots.sort();if(!state.selection.slots.length)state.selection=null}
}
function openDialog(fixed){
  const s=state.selection,r=state.resources.find(x=>x.id===s.resourceId);state.pending={...s,fixed};
  $('dialogTitle').textContent=fixed?'Reserve organ practice':`Book ${r?.name||'Room'}`;
  $('dialogSlots').textContent=`${fmtDate(s.date)} · ${s.slots.map(fmtTime).join(', ')}`;
  $('purposeLabel').classList.toggle('hidden',fixed);$('purposeInput').value='';
  $('bookingDialog').showModal();
}
async function sendBookingEmail(groupId,action){
  return await sb.functions.invoke('booking-email',{body:{booking_group_id:groupId,action}});
}
async function submit(e){
  e.preventDefault();const p=state.pending;if(!p)return;
  const purpose=p.fixed?'FBPC Organ Practice':$('purposeInput').value.trim();
  if(!purpose){toast('Please enter a purpose.');return}
  const {data,error}=await sb.rpc('book_slots',{p_resource_id:p.resourceId,p_booking_date:p.date,p_slots:p.slots,p_purpose:purpose,p_practice_session_id:p.sessionId||null});
  $('bookingDialog').close();
  if(error){toast(error.message.includes('ONE_OR_MORE')?'A selected slot was just booked by someone else. Refresh and choose again.':error.message);return}
  state.selection=null;
  const groupId=data?.[0]?.booking_group_id;
  let emailMessage=''; if(groupId){const email=await sendBookingEmail(groupId,'confirmed');if(email.error)emailMessage=' The booking was saved, but the confirmation email could not be sent.';}
  toast('Booking confirmed.'+emailMessage);await load();
}
function schedulerStatus(data){
  if(!data.enabled)return {label:'Disabled',detail:'Automatic sync is disabled.',bad:false};
  if(!data.last_scheduled_at)return {label:'Not detected',detail:'The scheduler has not reached the Edge Function yet.',bad:true};
  const age=(Date.now()-new Date(data.last_scheduled_at).getTime())/60000;
  const bad=age>Math.max(30,Number(data.interval_minutes||60)*2.5);
  return {label:bad?'Needs attention':'Running',detail:`Last scheduler run: ${new Date(data.last_scheduled_at).toLocaleString('en-SG')}`,bad};
}
async function admin(){
  if(state.profile?.role!=='admin')return;
  $('adminTab').classList.remove('hidden');
  const {data,error}=await sb.from('sync_settings').select('*').eq('id',true).single();
  if(error){$('adminHealth').textContent=error.message;return}
  const sched=schedulerStatus(data);
  $('adminHealth').innerHTML=`<div class="row"><div><b>CHMS sync</b><div class="muted">${data.last_error?'Needs attention':'Healthy'}</div></div><span class="badge">${data.enabled?'Every '+data.interval_minutes+' min':'Disabled'}</span></div><p>Last successful: ${data.last_success_at?new Date(data.last_success_at).toLocaleString('en-SG'):'Never'}</p><p>Last attempt: ${data.last_attempt_at?new Date(data.last_attempt_at).toLocaleString('en-SG'):'Never'}</p><div class="scheduler-health ${sched.bad?'bad':''}"><b>Automatic scheduler: ${sched.label}</b><div class="muted">${sched.detail}</div></div><label>Interval (minutes)<input id="interval" type="number" min="15" step="15" value="${data.interval_minutes}"></label><button id="saveInterval">Save</button>${data.last_error?`<div class="notice">${esc(data.last_error)}</div>`:''}`;
  $('saveInterval').onclick=async()=>{const n=Number($('interval').value);if(!Number.isInteger(n)||n<15){toast('Use a whole number of minutes, at least 15.');return}const {error}=await sb.from('sync_settings').update({interval_minutes:n,updated_at:new Date().toISOString()}).eq('id',true);if(error)toast(error.message);else{toast('Saved.');admin()}};
}
function renderAll(){renderOrgan();renderResource();renderGuest();renderMine()}
function tab(name){for(const x of document.querySelectorAll('[data-tab]'))x.classList.toggle('active',x.dataset.tab===name);for(const x of ['organ','resource','guest','mine','admin'])$(x+'View').classList.toggle('hidden',x!==name)}
$('loginForm').onsubmit=async e=>{e.preventDefault();const {data,error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error){$('loginMessage').textContent=error.message;return}await init(data.user)};
async function init(user){state.user=user;const {data,error}=await sb.from('profiles').select('*').eq('id',user.id).single();if(error)throw error;state.profile=data;$('loginView').classList.add('hidden');$('appView').classList.remove('hidden');$('userArea').classList.remove('hidden');$('logoutBtn').classList.remove('hidden');$('currentUser').textContent=data.display_name;await load();await admin()}
$('logoutBtn').onclick=async()=>{await sb.auth.signOut();location.reload()};
$('bookingForm').onsubmit=submit;$('dialogCancel').onclick=()=>$('bookingDialog').close();
$('refreshBtn').onclick=load;$('resourceDate').onchange=e=>{state.date=e.target.value;state.resourceWeek=e.target.value;renderResource()};$('guestDate').onchange=e=>{state.date=e.target.value;state.guestWeek=e.target.value;renderGuest()};
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
$('syncNowBtn').onclick=async()=>{if(state.syncing)return;state.syncing=true;const btn=$('syncNowBtn');btn.disabled=true;btn.textContent='Syncing…';toast('CHMS sync started…');try{const {data,error}=await sb.functions.invoke('chms-sync',{body:{manual:true}});if(error)throw error;toast(`CHMS sync successful — ${data.summary?.found??0} booking(s) found.`);await load();await admin()}catch(error){toast(`CHMS sync failed: ${error.message||error}`);await admin()}finally{state.syncing=false;btn.disabled=false;btn.textContent='Sync CHMS now'}};
sb.auth.getSession().then(async({data})=>{if(data.session)await init(data.session.user)});
