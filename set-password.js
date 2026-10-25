const {createClient}=window.supabase;
const sb=createClient(APP_CONFIG.supabaseUrl,APP_CONFIG.supabasePublishableKey);
const $=id=>document.getElementById(id);
let ready=false;
async function boot(){
 const status=$('passwordPageStatus');
 try{
  // Supabase JS detects invitation/recovery tokens from the URL and establishes a session.
  const {data,error}=await sb.auth.getSession();
  if(error)throw error;
  if(!data.session){
   status.textContent='This invitation or password-reset link is invalid, expired, or already used. Please ask an administrator to send a new invitation, or request another password-reset email.';
   $('passwordPageHelp').textContent='For security, password links can only be used once and may expire.';
   return;
  }
  ready=true;
  status.textContent=`Secure link verified for ${data.session.user.email||'your account'}. Choose a new password below.`;
  $('setPasswordForm').classList.remove('hidden');
 }catch(e){status.textContent='Could not verify the link: '+(e.message||String(e));}
}
$('setPasswordForm').onsubmit=async e=>{
 e.preventDefault();
 if(!ready)return;
 const pw=$('setPassword').value,confirm=$('confirmSetPassword').value,btn=$('saveSetPassword'),status=$('passwordPageStatus');
 if(pw.length<10){status.textContent='Choose a password with at least 10 characters.';return}
 if(pw!==confirm){status.textContent='The passwords do not match.';return}
 btn.disabled=true;btn.textContent='Saving…';status.textContent='Updating your password…';
 try{
  const {error}=await sb.auth.updateUser({password:pw});
  if(error)throw error;
  status.textContent='Your password has been set successfully. Taking you to the booking system…';
  $('setPasswordForm').classList.add('hidden');
  window.location.replace(new URL('./',window.location.href).href);
 }catch(err){status.textContent='Could not set password: '+(err.message||String(err));btn.disabled=false;btn.textContent='Set password';}
};
boot();
