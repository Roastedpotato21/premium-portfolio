/* The existing login UI now authenticates against the CMS server. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const modal=$('loginModal'),form=$('loginForm'),username=$('username'),password=$('password'),confirmation=$('confirmPassword'),current=$('currentPassword');
 let csrf=null,mode='login',busy=false,trigger,operation=0;
 async function request(path,options={}){
  const headers={...options.headers};if(options.body&&!(options.body instanceof Blob))headers['Content-Type']='application/json';if(csrf)headers['X-CSRF-Token']=csrf;
  const response=await fetch(path,{...options,headers,credentials:'same-origin'});
  let result;try{result=await response.json();}catch{throw Error('Start the CMS server and open the portfolio using its URL.');}
  if(!response.ok){if(response.status===401)document.dispatchEvent(new Event('portfolio:admin-expired'));throw Error(result.error||'Request failed.');}return result;
 }
 function showError(message){$('loginError').textContent=message;$('loginError').classList.add('active');$('loginStatus').textContent='';}
 function configure(next){mode=next;form.reset();$('loginError').classList.remove('active');$('loginStatus').textContent='';const saving=mode!=='login';
  for(const [group,input,visible]of [['confirmPasswordGroup',confirmation,saving],['currentPasswordGroup',current,mode==='change'],['setupTokenGroup',$('setupToken'),mode==='setup']]){ $(group).hidden=!visible;input.disabled=!visible;input.required=visible; }
  password.minLength=saving?8:1;password.autocomplete=saving?'new-password':'current-password';$('adminLoginTitle').textContent=mode==='setup'?'Set Admin Credentials':mode==='change'?'Change Credentials':'Admin Login';
  modal.querySelector('.login-modal-subtitle').textContent=saving?'Choose your username and a password of at least 8 characters.':'Enter your credentials to access edit mode';modal.querySelector('.login-submit').textContent=saving?'Save Credentials':'Login';
 }
 function setBusy(value){busy=value;form.setAttribute('aria-busy',String(value));modal.querySelector('.login-submit').disabled=value;form.querySelectorAll('input').forEach(el=>el.readOnly=value);}
 async function open(change=false){trigger=document.activeElement;const task=++operation;configure('login');modal.classList.add('active');modal.setAttribute('aria-hidden','false');document.body.classList.add('admin-modal-open');setBusy(true);
  try{const status=await request('/api/auth/status');if(task!==operation)return;csrf=status.csrf;configure(!status.configured?'setup':change?'change':'login');(change?current:username).focus();}
  catch(e){if(task===operation)showError(e.message);}finally{if(task===operation)setBusy(false);}
 }
 function close(){operation++;setBusy(false);form.reset();modal.classList.remove('active');modal.setAttribute('aria-hidden','true');document.body.classList.remove('admin-modal-open');trigger?.focus();}
 form.addEventListener('submit',async event=>{event.preventDefault();if(busy||!form.reportValidity())return;if(mode!=='login'&&password.value!==confirmation.value){showError('The new passwords do not match.');confirmation.focus();return;}const task=++operation;const startingMode=mode;
  const data={username:username.value.trim(),password:password.value};if(mode==='setup')data.setup_token=$('setupToken').value.trim();if(mode==='change')data.current_password=current.value;
  setBusy(true);$('loginError').classList.remove('active');
  try{const result=await request(mode==='setup'?'/api/auth/setup':mode==='change'?'/api/auth/credentials':'/api/auth/login',{method:mode==='change'?'PUT':'POST',body:JSON.stringify(data)});if(result.csrf)csrf=result.csrf;
   if(task!==operation){if(startingMode==='login')await logout();return;}
   if(startingMode==='setup'){configure('login');username.value=data.username;$('loginStatus').textContent='Credentials saved. Sign in with your new password.';password.focus();}
   else{close();document.dispatchEvent(new Event('portfolio:admin-authenticated'));}
  }catch(e){if(task===operation)showError(e.message);}finally{if(task===operation)setBusy(false);}
 });
 async function logout(){await request('/api/auth/logout',{method:'POST',body:'{}'});csrf=null;}
 $('loginClose').addEventListener('click',close);$('loginCancel').addEventListener('click',close);$('changeCredentialsBtn').addEventListener('click',()=>open(true));modal.addEventListener('click',e=>{if(e.target===modal)close();});
 document.addEventListener('keydown',event=>{if(!modal.classList.contains('active'))return;if(event.key==='Escape'){event.preventDefault();close();return;}if(event.key!=='Tab')return;const fields=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(e=>e.getClientRects().length);const first=fields[0],last=fields.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
 window.portfolioAdmin=Object.freeze({open,logout,request,restore:async()=>{const status=await request('/api/auth/status');csrf=status.csrf;return status;}});
})();
