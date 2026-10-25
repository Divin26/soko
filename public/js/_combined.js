// SUPABASE
const SUPABASE_URL = 'https://rjimbkxhrrreaiesdzjr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqaW1ia3hocnJyZWFpZXNkempyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDQ1MTUsImV4cCI6MjA5MjQyMDUxNX0.0Dra6oFMdef7oU0_XB7HQYfPKVgRqXXXVIoqzjeA78Y';
const sb = (typeof supabase !== 'undefined') ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// DATA
const CATS=[
  {id:'food',en:'Food & Drinks',fr:'Alimentation',rw:'Ibiribwa',icon:'🍎'},
  {id:'electronics',en:'Electronics',fr:'Électronique',rw:'Ikoranabuhanga',icon:'📱'},
  {id:'clothes',en:'Clothes',fr:'Vêtements',rw:'Imyenda',icon:'👕'},
  {id:'shoes',en:'Shoes',fr:'Chaussures',rw:'Ingofora',icon:'👟'},
  {id:'home',en:'Home & Kitchen',fr:'Maison',rw:'Urugo',icon:'🏠'},
  {id:'beauty',en:'Beauty',fr:'Beauté',rw:'Ubwiza',icon:'💄'},
  {id:'sports',en:'Sports',fr:'Sports',rw:'Siporo',icon:'⚽'},
];

let PRODUCTS=[];

let ORDERS=[];

let KYC=[];

let USERS=[];

let PAYOUTS=[];

let DISPUTES=[];

// STATE
const CART_STORAGE_KEY='soko.cart.v1';
function readSavedCart(){
  try{
    const saved=JSON.parse(localStorage.getItem(CART_STORAGE_KEY)||'[]');
    if(!Array.isArray(saved))return[];
    return saved.filter(item=>item&&typeof item.id==='string'&&Number.isInteger(item.qty)&&item.qty>0&&item.qty<=99).map(item=>({id:item.id,qty:item.qty}));
  }catch(e){return[];}
}
function persistCart(){
  try{localStorage.setItem(CART_STORAGE_KEY,JSON.stringify(cart.map(({id,qty})=>({id:String(id),qty}))));}catch(e){console.warn('Cart could not be saved in this browser.');}
}
function hydrateCart(){
  cart=cart.map(item=>{const product=PRODUCTS.find(p=>String(p.id)===String(item.id));return product?{...product,qty:item.qty}:null;}).filter(Boolean);
  persistCart();updateCartBadge();
}
let cart=readSavedCart().map(item=>({...item,name:'Loading item…',price:0,emoji:'📦',images:[],seller:'Seller'})),currentUser=null,lang='en',selectedRole='buyer';
let commissionRateBps=null,commissionSettingsReady=false,currentMode='buyer',sellerSignInRequested=false;
let currentBuyerView='home',prevBuyerView='home',activeProductId=null;
let editingOrderId=null,editingPayoutId=null,pickedStar=0,signupData={};
let currentShopList=[...PRODUCTS],currentLocation='Kigali, Rwanda';
let prodImages=[],kycImageData=null,kycImageBlob=null;

// UTILS
const toast=(msg,type)=>{const t=document.getElementById('toast');t.textContent=msg;t.className=type?'show '+type:'show';clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2800);};
const openModal=id=>document.getElementById(id).classList.add('open');
const closeModal=id=>document.getElementById(id).classList.remove('open');
const getCat=id=>{const c=CATS.find(x=>x.id===id);return c?(c[lang]||c.en):id;};
const stars=r=>'★'.repeat(Math.round(r))+'☆'.repeat(5-Math.round(r));
const fmt=n=>Number(n).toLocaleString();
const closeAll=()=>{document.getElementById('acct-dd').classList.remove('open');document.getElementById('notif-panel').classList.remove('open');document.getElementById('all-drawer').classList.remove('open');};
const closeAcctDD=()=>document.getElementById('acct-dd').classList.remove('open');

async function loadMarketplaceSettings(){
  if(!sb)return false;
  const{data,error}=await sb.from('platform_settings').select('commission_rate_bps').eq('id',true).maybeSingle();
  if(!error&&data){commissionRateBps=Number(data.commission_rate_bps);commissionSettingsReady=Number.isInteger(commissionRateBps);}
  if(error)console.warn('Marketplace fee settings unavailable:',error.message);
  if(commissionSettingsReady&&currentMode==='buyer'&&currentBuyerView==='checkout')renderCoSummary();
  if(!window.sokoSettingsChannel){
    window.sokoSettingsChannel=sb.channel('soko-platform-settings')
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'platform_settings'},payload=>{
        const next=Number(payload.new?.commission_rate_bps);
        if(Number.isInteger(next)){commissionRateBps=next;commissionSettingsReady=true;}
        if(currentMode==='seller'&&document.querySelector('#seller-content .seller-page-title')?.textContent==='Earnings')renderSeller('earnings');
        if(currentMode==='buyer'&&currentBuyerView==='checkout')renderCoSummary();
      }).subscribe();
  }
  return commissionSettingsReady;
}
function commissionPercentText(){return commissionRateBps===null?'Loading':`${(commissionRateBps/100).toFixed(commissionRateBps%100?2:0)}%`;}

document.querySelectorAll('.modal-bg').forEach(b=>b.addEventListener('click',function(e){if(e.target===this)this.classList.remove('open');}));
document.addEventListener('click',e=>{
  if(!e.target.closest('#acct-dd')&&!e.target.closest('[onclick*="toggleAcctDD"]'))document.getElementById('acct-dd').classList.remove('open');
  if(!e.target.closest('#notif-panel')&&!e.target.closest('[onclick*="toggleNotif"]'))document.getElementById('notif-panel').classList.remove('open');
  if(!e.target.closest('#all-drawer')&&!e.target.closest('#all-menu-btn'))document.getElementById('all-drawer').classList.remove('open');
});

window.addEventListener('DOMContentLoaded',()=>{
  setTimeout(()=>{const ls=document.getElementById('loading-screen');if(ls)ls.classList.add('hidden');},1500);
  buildBuyerHome();
  loadProductsFromSupabase().then(()=>buildBuyerHome());
  loadMarketplaceSettings();
  // Password recovery: Supabase returns the user with #access_token=…&type=recovery.
  // onAuthStateChange covers the PKCE (?code=) variant, the hash check covers implicit.
  const inRecovery=/[?#&]type=recovery/.test(window.location.hash+window.location.search);
  if(sb)sb.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')showPasswordReset();});
  if(inRecovery)showPasswordReset();else restoreSession();
});

// LANGUAGE
function applyLang(l){
  lang=l;
  document.querySelectorAll('select[onchange*="applyLang"]').forEach(s=>s.value=l);
  renderCats();
  renderProds(PRODUCTS.slice(0,8),'home-products');
  const ht=document.getElementById('hero-title');
  if(ht){if(l==='fr')ht.innerHTML="Trouvez un peu<br/><em>de bonheur.</em>";else if(l==='rw')ht.innerHTML="Shaka ibitangaza<br/><em>bike.</em>";else ht.innerHTML="Find a little<br/><em>wonder.</em>";}
  const snItems=document.querySelectorAll('.snav');
  const sLbls=l==='fr'?['☰ Tout','🍎 Alimentation','📱 Électronique','👕 Vêtements','👟 Chaussures','🏠 Maison','💄 Beauté','⚽ Sports','🏪 Vendre']:l==='rw'?['☰ Byose','🍎 Ibiribwa','📱 Ikoranabuhanga','👕 Imyenda','👟 Ingofora','🏠 Urugo','💄 Ubwiza','⚽ Siporo','🏪 Gurisha']:['☰ All','🍎 Food & Drinks','📱 Electronics','👕 Clothes','👟 Shoes','🏠 Home','💄 Beauty','⚽ Sports','🏪 Sell on SOKO'];
  snItems.forEach((el,i)=>{if(sLbls[i])el.textContent=sLbls[i];});
  toast({en:'🇬🇧 English selected',fr:'🇫🇷 Français activé',rw:'🇷🇼 Ikinyarwanda'}[l]);
}

// AUTH
function authTab(t){
  ['login','signup'].forEach(x=>{document.getElementById('atab-'+x).classList.toggle('active',x===t);document.getElementById('apanel-'+x).style.display=x===t?'block':'none';});
  const kycPanel=document.getElementById('apanel-kyc');if(kycPanel)kycPanel.style.display='none';
}
async function doLogin(){
  const identifier=document.getElementById('login-identifier').value.trim();
  const pw=document.getElementById('login-pass').value;
  if(!identifier||!pw){toast('Please enter your email/phone and password','r');return;}
  if(!sb){toast('Backend unavailable — try again shortly','r');return;}
  toast('Signing in…');
  let data,error;
  if(identifier.includes('@'))({data,error}=await sb.auth.signInWithPassword({email:identifier,password:pw}));
  else{
    const{data:phoneAuth,error:phoneError}=await sb.functions.invoke('phone-auth',{body:{action:'login',phone:identifier,password:pw}});
    if(phoneError||!phoneAuth?.session){toast('Sign-in failed. Check your details and try again.','r');return;}
    data={session:phoneAuth.session,user:phoneAuth.session.user};
    ({error}=await sb.auth.setSession({access_token:phoneAuth.session.access_token,refresh_token:phoneAuth.session.refresh_token}));
  }
  if(error){toast(error.message,'r');return;}
  const userId=data.user?.id||data.session?.user?.id;
  let{data:profile}=await sb.from('users').select('id,name,email,phone,role,verified,status,auth_id,created_at,store_name,whatsapp,location').eq('auth_id',userId).single();
  if(!profile){
    const email=data.user?.email||data.session?.user?.email||identifier;
    const{data:np}=await sb.from('users').insert([{name:email.split('@')[0],email,auth_id:userId,role:'buyer',verified:false,status:'active'}]).select('id,name,email,phone,role,verified,status,auth_id,created_at,store_name,whatsapp,location').single();
    profile=np;
  }
  if(profile){signupData={id:profile.id,name:profile.name,email:profile.email,phone:profile.phone||'',role:profile.role,verified:!!profile.verified,status:profile.status,store_name:profile.store_name,whatsapp:profile.whatsapp,location:profile.location,_ctx:'login'};loginSuccess();}
  else{await sb.auth.signOut();toast('Your account profile could not be loaded. Please contact support.','r');}
}
async function doSignup(){
  const fn=document.getElementById('su-fname').value.trim(),ln=document.getElementById('su-lname').value.trim();
  const email=document.getElementById('su-email').value.trim(),pw=document.getElementById('su-pass').value;
  const phone=document.getElementById('su-phone').value||'';
  if(!fn||!ln||!email||!pw){toast('Please fill all required fields','r');return;}
  if(pw.length<6){toast('Password must be at least 6 characters','r');return;}
  if(sb){
    toast('Creating your account…');
    const{data,error}=await sb.auth.signUp({email,password:pw});
    if(error){toast(error.message,'r');return;}
    const{data:profile,error:profileError}=await sb.from('users').insert([{name:fn+' '+ln,email,phone:phone||null,role:'buyer',auth_id:data.user.id,verified:false,status:'active'}]).select().single();
    if(profileError){toast('Account creation failed: '+profileError.message,'r');console.error('profile insert error:',profileError);return;}
    signupData={id:profile.id,name:profile.name,email:profile.email,phone:profile.phone||'',role:profile.role,verified:!!profile.verified,status:profile.status,store_name:profile.store_name,whatsapp:profile.whatsapp,location:profile.location,_ctx:'signup'};
    loginSuccess();
    return;
  }
  signupData={name:fn+' '+ln,email,phone,role:'buyer',_ctx:'signup'};
  USERS.push({name:signupData.name,phone,email,role:'buyer',verified:false,joined:new Date().toISOString().slice(0,10),status:'active',earnings:0,pendingPayout:0});
  loginSuccess();
}
function handleKycUpload(file){
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){toast('Choose a JPEG, PNG or WebP image under 5MB.','r');return;}
  const reader=new FileReader();
  reader.onload=()=>{kycImageData=reader.result;kycImageBlob=file;const preview=document.getElementById('kyc-preview-area');if(preview)preview.innerHTML=`<div style="text-align:center;padding:16px;"><img src="${kycImageData}" alt="ID document preview" style="max-height:120px;border-radius:8px;border:2px solid var(--g);"/><div style="font-size:13px;color:var(--g);font-weight:600;margin-top:12px;">✓ Photo ready to upload</div></div>`;};
  reader.onerror=()=>toast('Could not read this image.','r');reader.readAsDataURL(file);
}
function handleKycDrop(e){
  e.preventDefault();
  console.log('Drop detected');
  const files=e.dataTransfer.files;
  if(files && files.length>0){
    console.log('File dropped:', files[0].name);
    handleKycUpload(files[0]);
  }
}
function loginSuccess(){
  currentUser={...signupData};
  currentMode='buyer';
  setAccountMenuState(true);
  document.getElementById('view-auth').classList.remove('active');
  document.getElementById('view-buyer').classList.add('active');
  document.getElementById('buyer-name-nav').textContent=(currentUser.name||'').split(' ')[0];
  document.getElementById('acct-dd-name').textContent=currentUser.name||'Your account';
  buildBuyerHome();
  const wantsSell=sellerSignInRequested;sellerSignInRequested=false;
  if(wantsSell&&currentUser.role==='seller'&&currentUser.verified&&currentUser.status==='active')switchToSeller();
  else if(wantsSell)buyerShowView('become-seller');
  else if(currentUser.role==='seller'&&currentUser.verified&&currentUser.status==='active')switchToSeller();
  toast('Welcome, '+currentUser.name.split(' ')[0]+'! 👋','g');
}
function switchToSeller(){
  if(!currentUser){startSellerSignIn();return;}
  (async()=>{
    if(sb){const{data:{user:authUser}}=await sb.auth.getUser();if(authUser){const{data:profile}=await sb.from('users').select('id,name,email,phone,role,verified,status,store_name,whatsapp,location').eq('auth_id',authUser.id).single();if(profile)currentUser={...currentUser,...profile};}}
    if(currentUser.role==='seller'&&currentUser.verified&&currentUser.status==='active'){
      currentMode='seller';document.getElementById('view-buyer').classList.remove('active');document.getElementById('view-seller').classList.add('active');setAccountMenuState(true);buildSellerNav();loadProductsFromSupabase().then(()=>renderSeller('dashboard'));return;
    }
    buyerShowView('become-seller');
  })().catch(error=>toast(error.message||'Seller access could not be checked.','r'));
}
function switchToBuyer(){
  if(!currentUser)return;
  currentMode='buyer';document.getElementById('view-seller').classList.remove('active');document.getElementById('view-buyer').classList.add('active');setAccountMenuState(true);buildBuyerHome();buyerShowView('home');
}
function startSellerSignIn(){sellerSignInRequested=true;openAuthScreen('login');}
function setSellerApplicationMessage(message){const el=document.getElementById('seller-application-status');if(el)el.textContent=message;}
async function loadSellerApplicationState(){
  if(!sb||!currentUser?.id)return;
  const{data,error}=await sb.from('kyc_requests').select('status,name').eq('user_id',currentUser.id).maybeSingle();
  if(error){setSellerApplicationMessage('Your application status could not be loaded. Please try again.');return;}
  const fields=document.getElementById('seller-application-fields');if(!fields)return;
  const approvedSwitch=document.getElementById('seller-approved-switch');if(approvedSwitch)approvedSwitch.style.display=data?.status==='approved'?'inline-flex':'none';
  if(data?.status==='pending'||data?.status==='approved'){
    fields.style.display='none';setSellerApplicationMessage(data.status==='pending'?'Your application is under review. We’ll let you know when it is reviewed.':'Your shop is approved. Open Seller Central to manage your listings.');
  }else{fields.style.display='block';setSellerApplicationMessage(data?.status==='rejected'?'Your last application was declined. You can update your details and apply again.':'');}
}
async function submitSellerApplication(){
  if(!sb||!currentUser){toast('Sign in before applying to sell.','r');return;}
  const shop=document.getElementById('seller-store-name').value.trim(),name=document.getElementById('kyc-name').value.trim(),idNumber=document.getElementById('kyc-id').value.trim(),button=document.getElementById('seller-application-submit');
  if(shop.length<2||name.length<3||idNumber.length<5||!kycImageBlob){toast('Enter your shop name, legal name, ID number, and upload an ID image.','r');return;}
  if(!window.createImageBitmap||!document.createElement('canvas').toBlob){toast('This browser cannot securely prepare the ID image. Try a current browser.','r');return;}
  button.disabled=true;button.textContent='Preparing private upload…';
  try{
    const auth=await sb.auth.getUser();const authUser=auth.data?.user;if(auth.error||!authUser)throw new Error('Please sign in again.');
    const bitmap=await createImageBitmap(kycImageBlob);const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82));if(!blob)throw new Error('Could not convert the image.');
    const path=`${authUser.id}/${crypto.randomUUID()}.webp`;const upload=await sb.storage.from('seller-id-documents').upload(path,blob,{contentType:'image/webp',upsert:false});if(upload.error)throw upload.error;
    const profileUpdate=await sb.from('users').update({store_name:shop}).eq('id',currentUser.id);if(profileUpdate.error){await sb.storage.from('seller-id-documents').remove([path]);throw profileUpdate.error;}
    const{data,error}=await sb.rpc('submit_seller_application',{p_full_name:name,p_id_number:idNumber,p_id_image_path:path});if(error){await sb.storage.from('seller-id-documents').remove([path]);throw error;}
    currentUser.store_name=shop;currentUser.kycStatus='pending';await loadSellerApplicationState();toast('Seller application submitted for review.','g');
  }catch(error){setSellerApplicationMessage(error.message||'Application could not be submitted.');toast(error.message||'Application could not be submitted.','r');}
  finally{button.disabled=false;button.textContent='Submit seller application';}
}
async function doLogout(){
  if(sb){try{await sb.auth.signOut();}catch(e){console.log('signout:',e);}}
  currentUser=null;signupData={};
  setAccountMenuState(false);
  closeAll();
  // Clear all views
  ['view-buyer','view-seller'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.classList.remove('active');
  });
  // Reset auth screen
  document.getElementById('view-auth').classList.add('active');
  authTab('login');
  // Clear OTP inputs
  ['otp1','otp2','otp3','otp4'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  // Clear login fields
  ['login-identifier','login-pass'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  closeAll();
  toast('You have signed out');
}
async function restoreSession(){
  if(!sb)return;
  try{
    const{data:{session}}=await sb.auth.getSession();
    if(!session)return;
    const{data:profile}=await sb.from('users').select('id,name,email,phone,role,verified,status,auth_id,created_at,store_name,whatsapp,location').eq('auth_id',session.user.id).single();
    if(profile){signupData={id:profile.id,name:profile.name,email:profile.email,phone:profile.phone||'',role:profile.role,verified:!!profile.verified,status:profile.status,store_name:profile.store_name,whatsapp:profile.whatsapp,location:profile.location,_ctx:'login'};loginSuccess();}
  }catch(e){console.log('Session restore:',e);}
}
function showPasswordReset(){
  const ls=document.getElementById('loading-screen');if(ls)ls.classList.add('hidden');
  openModal('modal-reset-pass');
  setTimeout(()=>{const f=document.getElementById('rp-new');if(f)f.focus();},60);
}
async function submitNewPassword(){
  const p1=document.getElementById('rp-new').value,p2=document.getElementById('rp-confirm').value;
  if(!p1||p1.length<6){toast('Password must be at least 6 characters','r');return;}
  if(p1!==p2){toast('Passwords do not match','r');return;}
  if(!sb){toast('Backend unavailable — try again shortly','r');return;}
  const{error}=await sb.auth.updateUser({password:p1});
  if(error){toast(error.message,'r');return;}
  document.getElementById('rp-new').value='';document.getElementById('rp-confirm').value='';
  closeModal('modal-reset-pass');
  // Drop the recovery token from the URL so a refresh can't replay it.
  history.replaceState(null,'',window.location.pathname);
  toast('✓ Password updated','g');
  await restoreSession();
}
async function forgotPassword(){
  const identifier=document.getElementById('login-identifier').value.trim();
  if(!identifier){toast('Enter your email or phone first','r');return;}
  if(!sb){toast('Supabase not configured','r');return;}
  if(identifier.includes('@')){
    const{error}=await sb.auth.resetPasswordForEmail(identifier,{redirectTo:'https://soko-omega.vercel.app/reset-password'});
    if(error){toast('Could not request a reset. Please try again shortly.','r');return;}
  }else{
    const{error}=await sb.functions.invoke('phone-auth',{body:{action:'recover',phone:identifier,redirectTo:'https://soko-omega.vercel.app/reset-password'}});
    if(error){toast('Could not request a reset. Please try again shortly.','r');return;}
  }
  toast('If an account matches those details, a password reset link will be sent to its registered email.','g');
}

// BUYER HOME
function buildBuyerHome(){
  renderCats();
  renderHeroPicks();
  renderProds(PRODUCTS.slice(0,8),'home-products');
  buildBecomeSeller();buildNotifs();updateCartBadge();
}
function renderHeroPicks(){
  const el=document.getElementById('hero-picks');if(!el)return;
  const picks=PRODUCTS.filter(p=>p&&p.active!==false&&Number(p.stock)!==0).slice(0,3);
  if(!picks.length){el.innerHTML=`<div class="hero-empty-card"><strong>YOUR<br/>NEXT FIND</strong><span>is around here</span></div>`;return;}
  el.innerHTML=picks.map((p,i)=>{
    const image=Array.isArray(p.images)?p.images[0]:'';
    const visual=image?`<img src="${image}" alt="${p.name||'Product'}"/>`:`<span>${p.emoji||'✳'}</span>`;
    const id=safeInlineId(p.id);
    return `<button class="hero-pick" onclick="showProduct('${id}')" aria-label="View ${p.name||'product'}"><div class="hero-pick-visual">${visual}</div><div class="hero-pick-copy"><span>${getCat(p.cat)||'From the market'}</span><b>${p.name||'Product'}</b><em>RWF ${fmt(p.price)}</em></div><span class="hero-pick-arrow" aria-hidden="true">↗</span></button>`;
  }).join('');
}
function renderCats(){
  const el=document.getElementById('cat-grid');if(!el)return;
  el.innerHTML=CATS.map(c=>{
    const featured=PRODUCTS.find(p=>p.cat===c.id&&Array.isArray(p.images)&&p.images[0]);
    const visual=featured?`<img src="${featured.images[0]}" alt="" loading="lazy"/>`:c.icon;
    return `<button class="cat-card" onclick="filterCat('${c.id}')"><div class="cat-icon">${visual}</div><div class="cat-name">${getCat(c.id)}</div><span class="cat-arrow" aria-hidden="true">↗</span></button>`;
  }).join('');
  const fc=document.getElementById('filter-cats');
  if(fc)fc.innerHTML=CATS.map(c=>`<div class="fopt"><input type="checkbox" onchange="filterCat('${c.id}')"/> ${c.icon} ${getCat(c.id)}</div>`).join('');
}
function renderProds(list,cid){
  const c=document.getElementById(cid);if(!c)return;
  if(!list.length){c.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ink3);"><div style="font-size:40px;margin-bottom:10px;">⌕</div><div style="font-weight:600;">New listings will appear here</div></div>`;return;}
  c.innerHTML=list.map(p=>{
    const badge=p.badge?`<div class="prod-badge ${p.badge}">${p.badge==='hot'?'Top rated':p.badge==='new'?'New':'Sale'}</div>`:'';
    const images=Array.isArray(p.images)?p.images:[];
    const thumb=images[0]?`<img src="${images[0]}" alt="${p.name||'Product'}" loading="lazy"/>`:`<span>${p.emoji||'📦'}</span>`;
    const productId=safeInlineId(p.id);
    const rating=Number(p.rating)||0,reviews=Number(p.reviews)||0;
    return `<div class="prod-card"><div class="prod-thumb">${badge}${thumb}</div><div class="prod-info" onclick="showProduct('${productId}')"><div class="prod-brand">${p.seller||'Local seller'}</div><div class="prod-name">${p.name||'Marketplace listing'}</div>${rating?`<div><span class="prod-stars">${stars(rating)}</span><span class="prod-rc">${reviews.toLocaleString()}</span></div>`:''}<div class="prod-price">RWF ${fmt(p.price)}</div></div><div style="padding:0 12px 12px;"><button class="btn-atc" onclick="addToCartGrid(event,'${productId}')">Add to cart</button></div></div>`;
  }).join('');
}
function buildBecomeSeller(){
  const el=document.getElementById('become-steps');if(!el)return;el.innerHTML='';
  [{icon:'📋',t:'Set up your seller profile',d:'Add your shop details and contact information'},{icon:'📦',t:'List your products',d:'Upload clear photos, prices, and stock levels'},{icon:'🤝',t:'Connect with buyers',d:'Respond to questions and arrange delivery'},{icon:'🌱',t:'Grow your shop',d:'Keep listings up to date as your business grows'}]
  .forEach(s=>{el.innerHTML+=`<div style="background:var(--bg2);border-radius:8px;padding:14px;display:flex;gap:10px;"><span style="font-size:22px;">${s.icon}</span><div><div style="font-weight:700;font-size:13px;margin-bottom:2px;">${s.t}</div><div style="font-size:12px;color:var(--ink3);">${s.d}</div></div></div>`;});
}
function buildNotifs(){
  const el=document.getElementById('notif-items');if(!el)return;
  el.innerHTML='<div class="notif-empty">You’re all caught up.</div>';
}

// BUYER NAVIGATION
function buyerHome(){prevBuyerView=currentBuyerView;currentBuyerView='home';showBuyerSec('buyer-home');}
function buyerShowView(v){
  if(['orders','review','dispute'].includes(v)&&!currentUser){openAuthScreen('login');return;}
  prevBuyerView=currentBuyerView;currentBuyerView=v;
  const map={home:'buyer-home',shop:'buyer-shop',detail:'buyer-detail',cart:'buyer-cart',checkout:'buyer-checkout',orders:'buyer-orders','become-seller':'buyer-become-seller',dispute:'buyer-dispute',review:'buyer-review'};
  showBuyerSec(map[v]||'buyer-home');
  if(v==='cart')renderCart();
  if(v==='orders')loadBuyerOrders();
  if(v==='checkout'){if(!cart.length){buyerShowView('cart');return;}const phone=document.getElementById('co-phone');if(phone&&!phone.value)phone.value=currentUser?.phone||'';const location=document.getElementById('co-location');if(location&&!location.value)location.value=currentUser?.location||'';renderCoSummary();}
  if(v==='shop')renderShopPage(currentShopList,'All Products');
  if(v==='become-seller'){
    if(currentUser){
      document.getElementById('become-seller-kyc').style.display='block';
      document.getElementById('become-seller-login').style.display='none';
      if(currentUser.role==='seller'&&currentUser.verified&&currentUser.status==='active'){
        document.getElementById('seller-application-fields').style.display='none';
        setSellerApplicationMessage('Your seller account is approved. Switch to Seller Central to manage your shop.');
        document.getElementById('seller-approved-switch').style.display='inline-flex';
      }else loadSellerApplicationState();
    }else{
      document.getElementById('become-seller-kyc').style.display='none';
      document.getElementById('become-seller-login').style.display='block';
    }
  }
  closeAll();
}
function showBuyerSec(id){document.querySelectorAll('#buyer-main > div').forEach(d=>d.style.display='none');const el=document.getElementById(id);if(el)el.style.display='block';}
function goBack(){
  if(prevBuyerView && prevBuyerView !== currentBuyerView){
    buyerShowView(prevBuyerView);
  }else{
    buyerShowView('home');
  }
}
function focusSearch(){document.getElementById('search-inp')?.focus();}
function bnavSet(btn){document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('active'));btn.classList.add('active');}
function setAccountMenuState(signedIn){
  const guest=document.getElementById('acct-dd-guest');
  if(guest)guest.style.display=signedIn?'none':'flex';
  document.querySelectorAll('.acct-authed-item').forEach(item=>item.style.display=signedIn?'flex':'none');
  const name=document.getElementById('acct-dd-name'),role=document.getElementById('acct-dd-role'),nav=document.getElementById('buyer-name-nav');
  if(name)name.textContent=signedIn?(currentUser?.name||'Your account'):'Welcome to SOKO';
  if(role)role.textContent=signedIn?`${(currentUser?.role||'buyer').replace(/^./,c=>c.toUpperCase())} Account`:'Guest account';
  if(nav)nav.textContent=signedIn?(currentUser?.name||'').split(' ')[0]||'Account':'sign in';
  const sellerSwitch=document.getElementById('acct-dd-seller-switch');
  if(sellerSwitch)sellerSwitch.style.display=signedIn&&currentUser?.role==='seller'&&currentUser?.verified&&currentUser?.status==='active'&&currentMode==='buyer'?'flex':'none';
  if(sellerSwitch)sellerSwitch.innerHTML=currentMode==='seller'?'🛍 Shop as buyer':'📊 Go to Seller Dashboard';
}
function openAuthScreen(tab='login'){
  closeAll();
  document.getElementById('view-buyer').classList.remove('active');
  document.getElementById('view-seller').classList.remove('active');
  document.getElementById('view-auth').classList.add('active');
  authTab(tab);
}
function toggleAcctDD(){document.getElementById('acct-dd').classList.toggle('open');document.getElementById('notif-panel').classList.remove('open');}
function toggleNotif(){document.getElementById('notif-panel').classList.toggle('open');document.getElementById('acct-dd').classList.remove('open');}
function toggleDrawer(){document.getElementById('all-drawer').classList.toggle('open');}

// SEARCH & FILTER
function doSearch(q){if(!q){buyerHome();return;}const f=PRODUCTS.filter(p=>p.name.toLowerCase().includes(q.toLowerCase())||getCat(p.cat).toLowerCase().includes(q.toLowerCase()));currentShopList=f;renderShopPage(f,`Results for "${q}"`);}
function filterCat(catId){const f=PRODUCTS.filter(p=>p.cat===catId);currentShopList=f;renderShopPage(f,getCat(catId));const bc=document.getElementById('shop-bc');if(bc)bc.textContent=getCat(catId);}
function filterByPrice(min,max){const f=currentShopList.filter(p=>p.price>=min&&p.price<=max);renderProds(f,'shop-products');document.getElementById('shop-count').innerHTML=`<b>${f.length}</b> results`;}
function filterByRating(min){const f=currentShopList.filter(p=>p.rating>=min);renderProds(f,'shop-products');document.getElementById('shop-count').innerHTML=`<b>${f.length}</b> results`;}
function renderShopPage(list,label){prevBuyerView=currentBuyerView;currentBuyerView='shop';showBuyerSec('buyer-shop');document.getElementById('shop-count').innerHTML=`<b>${list.length}</b> results in <b>${label}</b>`;renderProds(list,'shop-products');}
function sortProducts(method){let list=[...currentShopList];if(method==='price-asc')list.sort((a,b)=>a.price-b.price);else if(method==='price-desc')list.sort((a,b)=>b.price-a.price);else if(method==='rating')list.sort((a,b)=>b.rating-a.rating);renderProds(list,'shop-products');}

// PRODUCT DETAIL
function showProduct(id){
  activeProductId=id;prevBuyerView=currentBuyerView;currentBuyerView='detail';
  showBuyerSec('buyer-detail');
  const p=PRODUCTS.find(x=>x.id===id);if(!p)return;
  const galleryImages=normalizeProductImages(p.images);
  window.activeDetailGallery={images:galleryImages,emoji:p.emoji||'📦',name:p.name||'Product',index:0};
  const galleryHtml=renderDetailGallery();
  document.getElementById('detail-crumb').innerHTML=`<a onclick="buyerHome()">Home</a> › <a onclick="filterCat('${p.cat}')">${getCat(p.cat)}</a> › ${p.name.slice(0,40)}…`;
  document.getElementById('detail-content').innerHTML=`
    <div class="detail-wrap">
      <div class="detail-gallery">
        ${galleryHtml}
      </div>
      <div class="detail-info">
        <div style="font-size:12px;color:var(--b);margin-bottom:8px;"><a onclick="filterCat('${p.cat}')">${getCat(p.cat)}</a></div>
        <div class="detail-title">${p.name}</div>
        <div class="detail-brand">Visit the <span style="color:var(--b);">${p.seller}</span> Store</div>
        ${p.rating?`<div class="detail-rating-row"><span style="color:var(--or);font-size:16px;">${stars(p.rating)}</span><span style="color:var(--or);font-weight:700;">${p.rating}</span><a style="color:var(--b);font-size:13px;">${(Number(p.reviews)||0).toLocaleString()} ratings</a></div>`:''}
        <div><span class="detail-price">RWF ${fmt(p.price)}</span></div>
        <div class="detail-desc">${p.desc}</div>
        ${p.stock===0?'<div style="padding:14px;background:var(--rbg);border-radius:var(--r4);color:var(--r);font-weight:700;text-align:center;margin-top:12px;">Out of Stock</div>':''}
      </div>
      <div class="buy-box">
        <div class="buy-box-price">RWF ${fmt(p.price)}</div>
        <div style="font-size:13px;margin-bottom:10px;">Contact the seller to arrange delivery or pickup.</div>
        <div class="buy-box-stock">${p.stock>0?'In Stock':'Out of Stock'}</div>
        ${p.stock>0?`<div style="font-size:12px;font-weight:600;margin-bottom:6px;">Qty:</div>
        <div class="qty-ctrl"><button class="qty-btn" onclick="changeQty(-1)">−</button><span class="qty-num" id="detail-qty">1</span><button class="qty-btn" onclick="changeQty(1)">+</button></div>
        <button class="btn-atcr" onclick="addDetailToCart('${safeInlineId(p.id)}')">Add to Cart</button>
        <button class="btn-buynow" onclick="buyNow('${safeInlineId(p.id)}')">Buy Now</button>`:''}
        <div class="buy-box-seller">Sold by <span>${p.seller}</span></div>
        ${p.sellerPhone?`<div class="contact-btns">
          <a href="tel:${p.sellerPhone}" class="btn-contact">📞 Call</a>
          <a href="https://wa.me/${p.sellerPhone.replace(/\s/g,'')}" class="btn-contact" target="_blank">💬 WhatsApp</a>
        </div>`:'<div class="contact-btns"><span class="btn-contact" aria-disabled="true">Seller contact details unavailable</span></div>'}
      </div>
    </div>
    <div class="reviews-sec"><div style="font-size:19px;font-weight:700;margin-bottom:8px;">Reviews</div><p style="font-size:13px;color:var(--ink3);">Customer reviews will appear here once the review service is connected.</p></div>`;
}
function escapeImageAttribute(value){return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function safeInlineId(value){return String(value).replace(/[^a-zA-Z0-9_-]/g,'');}
function renderDetailGallery(){
  const gallery=window.activeDetailGallery;if(!gallery)return'';
  const {images,emoji,name}=gallery;
  const count=images.length;
  const cards=count?(count===1?[0]:[-1,0,1]).map(offset=>{
    const imageIndex=(gallery.index+offset+count)%count;
    const state=offset===0?'active':offset<0?'previous':'next';
    const single=count===1?' single':'';
    const url=escapeImageAttribute(images[imageIndex]);
    return `<div class="detail-gallery-card ${state}${single}" ${offset===0?'':'onclick="setDetailImage('+imageIndex+')"'}><img src="${url}" alt="${escapeImageAttribute(name)} — photo ${imageIndex+1}" decoding="async" fetchpriority="${offset===0?'high':'low'}" onerror="this.style.display='none';this.nextElementSibling.hidden=false"/><span class="detail-gallery-empty" hidden><span>${escapeImageAttribute(emoji)}</span><small>Photo unavailable</small></span></div>`;
  }).join(''):`<div class="detail-gallery-empty"><div><span>${escapeImageAttribute(emoji)}</span><small>Seller photos coming soon</small></div></div>`;
  const thumbs=count>1?`<div class="detail-thumbs" aria-label="Product photos">${images.map((url,index)=>`<button class="detail-thumb ${index===gallery.index?'active':''}" onclick="setDetailImage(${index})" aria-label="View photo ${index+1}"><img src="${escapeImageAttribute(url)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.parentElement.textContent='📦'"/></button>`).join('')}</div>`:'';
  return `<div class="detail-gallery-stage" id="detail-gallery-stage" role="region" tabindex="0" aria-label="${escapeImageAttribute(name)} photos" onkeydown="if(event.key==='ArrowLeft')stepDetailImage(-1);if(event.key==='ArrowRight')stepDetailImage(1)">${cards}${count>1?`<button class="detail-gallery-arrow prev" onclick="stepDetailImage(-1)" aria-label="Previous photo">‹</button><button class="detail-gallery-arrow next" onclick="stepDetailImage(1)" aria-label="Next photo">›</button>`:''}<span class="detail-gallery-note">${count?'A closer look':'A little more about this find'}</span>${count?`<span class="detail-gallery-count">${gallery.index+1} / ${count}</span>`:''}</div>${thumbs}`;
}
function setDetailImage(index){const gallery=window.activeDetailGallery;if(!gallery||!gallery.images.length)return;gallery.index=(index+gallery.images.length)%gallery.images.length;const el=document.querySelector('.detail-gallery');if(el)el.innerHTML=renderDetailGallery();}
function stepDetailImage(amount){const gallery=window.activeDetailGallery;if(gallery)setDetailImage(gallery.index+amount);}
function swapImg(thumb,src,isReal){if(isReal){const gallery=window.activeDetailGallery;const index=gallery?.images.indexOf(src)??-1;if(index>=0)setDetailImage(index);}}
function changeQty(d){const el=document.getElementById('detail-qty');if(el)el.textContent=Math.max(1,Math.min(10,parseInt(el.textContent)+d));}
function addDetailToCart(id){const qty=parseInt(document.getElementById('detail-qty')?.textContent)||1;const p=PRODUCTS.find(x=>x.id===id);if(!p)return;doAddToCart(p,qty);toast('✓ Added to cart','g');}
function buyNow(id){addDetailToCart(id);buyerShowView('checkout');}
function addToCartGrid(e,id){e.stopPropagation();const p=PRODUCTS.find(x=>x.id===id);if(!p)return;doAddToCart(p,1);toast('✓ Added to cart','g');}

// CART
function doAddToCart(p,qty=1){const safeQty=Math.max(1,Math.min(99,parseInt(qty,10)||1));const ex=cart.find(c=>String(c.id)===String(p.id));if(ex)ex.qty=Math.min(99,ex.qty+safeQty);else cart.push({id:p.id,name:p.name,price:p.price,emoji:p.emoji,images:p.images||[],qty:safeQty,seller:p.seller});persistCart();updateCartBadge();}
function updateCartBadge(){const badge=document.getElementById('cart-badge');if(badge)badge.textContent=cart.reduce((a,c)=>a+c.qty,0);}
function renderCart(){
  const iw=document.getElementById('cart-items'),sw=document.getElementById('cart-summary');
  if(!cart.length){iw.innerHTML=`<div class="cart-panel" style="text-align:center;padding:50px 20px;"><div style="font-size:80px;margin-bottom:14px;">🛒</div><h2 style="font-size:22px;font-weight:400;margin-bottom:8px;">Your cart is empty</h2><p style="color:var(--ink3);margin-bottom:20px;">Discover great deals on SOKO</p><button class="btn-checkout" style="width:auto;padding:12px 24px;" onclick="buyerHome()">Continue shopping</button></div>`;sw.innerHTML='';return;}
  const sub=cart.reduce((a,c)=>a+c.price*c.qty,0);
  iw.innerHTML=`<div class="cart-panel"><div class="cart-title">Shopping Cart <span style="font-size:14px;color:var(--ink3);float:right;">Price</span></div>`+
  cart.map(item=>`<div class="cart-item">
    <div class="cart-item-img">${(item.images&&item.images.length)?`<img src="${item.images[0]}"/>`:`<span style="font-size:48px;">${item.emoji}</span>`}</div>
    <div style="flex:1;">
      <div style="font-size:14px;color:var(--b);margin-bottom:3px;">${item.name}</div>
      <div style="color:var(--g);font-size:12px;font-weight:600;margin-bottom:3px;">In Stock</div>
      <div style="font-size:12px;color:var(--ink3);">Sold by ${item.seller}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
        <span style="font-size:12px;font-weight:600;">Qty:</span>
        <div style="display:flex;align-items:center;border:var(--border);border-radius:var(--r4);">
          <button class="qty-btn" style="width:28px;height:28px;font-size:14px;" onclick="cartQty('${safeInlineId(item.id)}',-1)">−</button>
          <span style="width:32px;text-align:center;font-size:13px;font-weight:700;">${item.qty}</span>
          <button class="qty-btn" style="width:28px;height:28px;font-size:14px;" onclick="cartQty('${safeInlineId(item.id)}',1)">+</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px;">
        <button style="padding:5px 10px;border:var(--border);border-radius:var(--r4);background:var(--bg2);font-size:12px;cursor:pointer;color:var(--b);" onclick="cartRemove('${safeInlineId(item.id)}')">Delete</button>
      </div>
    </div>
    <div style="font-size:16px;font-weight:700;flex-shrink:0;">RWF ${fmt(item.price*item.qty)}</div>
  </div>`).join('')+
  `<div style="text-align:right;font-size:16px;padding:12px 0;border-top:var(--border);">Subtotal (${cart.reduce((a,c)=>a+c.qty,0)} items): <strong>RWF ${fmt(sub)}</strong></div></div>`;
  sw.innerHTML=`<div class="cart-escrow-note">Delivery and payment arrangements will be confirmed with the seller.</div>
    <div style="font-size:18px;margin-bottom:14px;">Subtotal (${cart.reduce((a,c)=>a+c.qty,0)} items):<br/><strong style="font-size:22px;">RWF ${fmt(sub)}</strong></div>
    <button class="btn-checkout" onclick="buyerShowView('checkout')">Proceed to checkout</button>
    <div style="font-size:11px;color:var(--ink4);margin-top:8px;text-align:center;">Review your order before confirming.</div>`;
}
function cartQty(id,d){const item=cart.find(c=>String(c.id)===String(id));if(item){item.qty=Math.max(1,Math.min(99,item.qty+d));persistCart();updateCartBadge();renderCart();}}
function cartRemove(id){cart=cart.filter(c=>String(c.id)!==String(id));persistCart();updateCartBadge();renderCart();}
function renderCoSummary(){
  const el=document.getElementById('co-summary');if(!el)return;
  const place=document.getElementById('place-order-btn');
  if(!commissionSettingsReady){el.textContent='Loading the current SOKO fee…';const total=document.getElementById('co-total');if(total)total.textContent='Please wait';if(place)place.disabled=true;return;}
  if(place)place.disabled=false;
  const sub=cart.reduce((a,c)=>a+c.price*c.qty,0);
  const rate=commissionRateBps,buyerRate=Math.ceil(rate/2),sellerRate=Math.floor(rate/2),buyerFee=cart.reduce((a,c)=>a+Math.round(c.price*c.qty*buyerRate/10000),0),sellerFee=cart.reduce((a,c)=>a+Math.round(c.price*c.qty*sellerRate/10000),0);
  el.innerHTML=cart.map(item=>`<div class="co-row"><span>${item.emoji} ${item.name.slice(0,22)} ×${item.qty}</span><span style="font-weight:600;color:var(--ink);">RWF ${fmt(item.price*item.qty)}</span></div>`).join('')+
  `<div class="co-row"><span>Items subtotal</span><span>RWF ${fmt(sub)}</span></div><div class="co-row"><span>Buyer fee (${(buyerRate/100).toFixed(buyerRate%100?2:0)}%)</span><span>RWF ${fmt(buyerFee)}</span></div><div class="co-row"><span>Seller fee (${(sellerRate/100).toFixed(sellerRate%100?2:0)}%)</span><span>RWF ${fmt(sellerFee)}</span></div><div class="co-row"><span>Delivery</span><span>Confirmed with seller</span></div>`;
  const total=document.getElementById('co-total');if(total)total.innerHTML=`<div class="co-row"><span>Items</span><span>RWF ${fmt(sub)}</span></div><div class="co-row"><span>Buyer fee</span><span>RWF ${fmt(buyerFee)}</span></div><div class="co-row total"><span>Due when payment is connected</span><span>RWF ${fmt(sub+buyerFee)}</span></div>`;
}
function selPay(el){document.querySelectorAll('.checkout-sec .pay-opt').forEach(o=>{o.classList.remove('sel');const r=o.querySelector('input');if(r)r.checked=false;});el.classList.add('sel');const r=el.querySelector('input');if(r)r.checked=true;}
function selDel(el){document.querySelectorAll('.checkout-sec .del-opt').forEach(o=>o.classList.remove('sel'));el.classList.add('sel');}
async function placeOrder(){
  if(!currentUser||!sb){toast('Sign in to place an order request.','r');openAuthScreen('login');return;}
  if(!commissionSettingsReady&&!(await loadMarketplaceSettings())){toast('SOKO’s current commission could not be loaded. Try again shortly.','r');return;}
  const location=document.getElementById('co-location')?.value.trim(),phone=document.getElementById('co-phone')?.value.trim(),delivery=document.querySelector('input[name="co-delivery"]:checked')?.value;
  if(!location||location.length<2){toast('Add your location or pickup point.','r');return;}
  if(!phone||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15){toast('Enter a contact phone the seller can reach.','r');return;}
  if(!delivery||!cart.length){toast('Your cart is empty.','r');return;}
  const button=document.getElementById('place-order-btn');button.disabled=true;button.textContent='Creating order…';
  try{
    const checkoutId=sessionStorage.getItem('soko-checkout-id')||crypto.randomUUID();sessionStorage.setItem('soko-checkout-id',checkoutId);
    const{data,error}=await sb.rpc('create_order_request_with_contact',{p_checkout_id:checkoutId,p_items:cart.map(i=>({product_id:String(i.id),quantity:i.qty})),p_buyer_location:location,p_delivery_method:delivery,p_buyer_phone:phone});
    if(error)throw error;
    sessionStorage.removeItem('soko-checkout-id');cart=[];persistCart();updateCartBadge();
    const check=await sb.from('orders').select('*').eq('checkout_id',checkoutId).eq('buyer_id',currentUser.id).order('created_at',{ascending:true});
    if(!check.error)ORDERS=mapOrderRows(check.data||[]);else console.warn('Order created; refresh order history to load its lines.',check.error);
    toast(`Order request placed. ${fmt(data.buyer_total)} RWF is due after payment is connected. No payment was collected.`, 'g');
    buyerShowView('orders');
  }catch(error){toast(error.message||'The order could not be placed. Please refresh your cart and try again.','r');}
  finally{button.disabled=false;button.textContent='Place order request';}
}

// ORDERS
function mapOrderRows(rows){return rows.map(o=>({id:o.id,checkoutId:o.checkout_id,productId:o.product_id,product:o.product_name||'Product',qty:o.quantity||1,total:o.buyer_total??o.total??0,subtotal:o.items_subtotal??o.total??0,buyerFee:o.buyer_fee||0,seller:o.seller_name||'Seller',buyer:o.buyer_name||'Buyer',phone:o.buyer_phone||'',date:(o.created_at||'').slice(0,10),status:o.status||'awaiting_payment',escrow:o.escrow_status||'not_started',paymentStatus:o.payment_status||'legacy_unverified'}));}
async function loadBuyerOrders(){
  if(!sb||!currentUser?.id){ORDERS=[];renderOrders();return;}
  const{data,error}=await sb.from('orders').select('*').eq('buyer_id',currentUser.id).order('created_at',{ascending:false}).limit(50);
  if(error){toast('Your orders could not be loaded.','r');return;}ORDERS=mapOrderRows(data||[]);renderOrders();
}
function renderOrders(){
  const el=document.getElementById('orders-content');if(!el)return;
  if(!ORDERS.length){el.innerHTML=`<div style="text-align:center;padding:60px;color:var(--ink3);"><div style="font-size:48px;margin-bottom:12px;">📦</div><div style="font-size:18px;font-weight:600;">No orders yet</div></div>`;return;}
  el.innerHTML=ORDERS.slice(0,10).map(o=>{
    const p=PRODUCTS.find(x=>x.id===o.productId);
    const thumb=(p?.images&&p.images.length)?`<img src="${p.images[0]}" style="width:100%;height:100%;object-fit:cover;"/>`:`<span style="font-size:36px;">${p?.emoji||'📦'}</span>`;
    const ecls=o.escrow==='held'?'ep-held':o.escrow==='released'?'ep-rel':'ep-frz';
    const scls=o.status==='delivered'?'os-delivered':o.status==='shipped'||o.status==='confirmed'?'os-shipped':o.status==='cancelled'?'os-cancelled':'os-pending';
    return `<div class="order-card">
      <div class="order-card-hdr">
        <div><div class="order-hdr-lbl">Order placed</div><div class="order-hdr-val">${o.date}</div></div>
        <div><div class="order-hdr-lbl">Total</div><div class="order-hdr-val">RWF ${fmt(o.total)}</div></div>
        <div><div class="order-hdr-lbl">Seller</div><div class="order-hdr-val">${o.seller}</div></div>
        <div style="margin-left:auto;"><div class="order-hdr-lbl">Order #</div><div class="order-hdr-val" style="font-family:monospace;">${o.id}</div></div>
      </div>
      <div class="order-card-body">
        <div class="order-thumb">${thumb}</div>
        <div style="flex:1;">
          <div class="order-status ${scls}">${o.status==='delivered'?'Delivered':o.status==='shipped'?'On the way':o.status==='confirmed'?'Confirmed':o.status==='cancelled'?'Cancelled':o.status==='awaiting_payment'?'Awaiting payment setup':'Pending'}</div>
          <div style="font-size:14px;font-weight:600;margin-bottom:5px;">${o.product} × ${o.qty}</div>
          <span class="ep ${ecls}">${o.paymentStatus==='not_started'?'Payment not collected':o.escrow==='held'?'Escrow held':o.escrow==='released'?'Escrow released':'Payment status: '+o.paymentStatus}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${o.status==='shipped'?`<button class="bx bx-g" style="padding:7px 12px;" onclick="confirmOrderDelivery('${o.id}')">Confirm Receipt</button>`:''}
          ${o.status==='delivered'?`<button class="bx bx-o" onclick="buyerShowView('review')">⭐ Rate</button>`:''}
          <button class="bx bx-ghost" onclick="buyerShowView('dispute')">🛡️ Dispute</button>
        </div>
      </div>
    </div>`;
  }).join('');
}
function confirmOrderDelivery(){toast('Order tracking and delivery confirmation are not connected yet.','o');}
function pickStar(n){pickedStar=n;document.querySelectorAll('#star-row span').forEach((s,i)=>s.textContent=i<n?'★':'☆');}

// LOCATION
function locPreview(val){const el=document.getElementById('loc-preview');if(el)el.textContent=val||'Kigali, Rwanda';}
function saveLocation(){
  const custom=document.getElementById('loc-custom')?.value.trim(),city=document.getElementById('loc-city')?.value||'Kigali, Rwanda';
  currentLocation=custom||city;
  const nav=document.getElementById('nav-location-text');if(nav)nav.textContent=currentLocation.split(',')[0];
  const coCity=document.getElementById('co-city');if(coCity)coCity.value=currentLocation.split(',')[0];
  closeModal('modal-location');toast('📍 Location updated: '+currentLocation,'g');
}

// IMAGE UPLOAD
function handleProdFiles(files){
  if(!files||!files.length)return;
  const remaining=5-prodImages.length;
  Array.from(files).slice(0,remaining).forEach(file=>{
    if(file.size>5*1024*1024){toast('Image too large. Max 5MB.','r');return;}
    optimizeProductImage(file).then(blob=>{
      const r=new FileReader();
      r.onload=e=>{prodImages.push({url:e.target.result,name:file.name,blob,type:blob.type});renderProdPreviews();};
      r.readAsDataURL(blob);
    }).catch(()=>toast('This image could not be prepared. Try another photo.','r'));
  });
}
async function optimizeProductImage(file){
  if(!window.createImageBitmap||!document.createElement('canvas').toBlob)return file;
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext('2d',{alpha:true}).drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const optimized=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82));
  return optimized&&(scale<1||optimized.size<file.size)?optimized:file;
}
function handleProdDrop(e){e.preventDefault();document.getElementById('prod-drop').classList.remove('over');handleProdFiles(e.dataTransfer.files);}
function renderProdPreviews(){
  const wrap=document.getElementById('prod-previews');if(!wrap)return;
  wrap.innerHTML=prodImages.map((img,i)=>`<div class="img-preview-item"><img src="${img.url}"/><button class="img-preview-remove" onclick="removeProdImg(${i})">✕</button>${i===0?'<div class="img-main-badge">Main</div>':''}</div>`).join('');
  const status=document.getElementById('prod-img-status');if(status)status.textContent=prodImages.length+' image(s) selected';
}
function removeProdImg(i){prodImages.splice(i,1);renderProdPreviews();}

// SELLER
const SELLER_NAV=[{icon:'📊',label:'Dashboard',id:'dashboard'},{icon:'📦',label:'Products',id:'products'},{icon:'🛒',label:'Orders',id:'orders'},{icon:'💰',label:'Earnings',id:'earnings'},{icon:'👤',label:'Profile',id:'profile'}];
function buildSellerNav(){
  const nav=document.getElementById('seller-nav');
  nav.innerHTML=SELLER_NAV.map((n,i)=>`<div class="snav-item ${i===0?'active':''}" onclick="sellerNavClick(this,'${n.id}')"><span style="font-size:16px;width:20px;text-align:center;">${n.icon}</span>${n.label}</div>`).join('')+
  `<div class="snav-item" style="margin-top:20px;border-top:1px solid rgba(255,255,255,.07);padding-top:12px;" onclick="doLogout()"><span style="font-size:16px;width:20px;text-align:center;">🚪</span>Sign Out</div>`;
  const bnav=document.getElementById('seller-bnav');
  if(bnav)bnav.innerHTML=SELLER_NAV.map((n,i)=>`<button class="bnav-item ${i===0?'active':''}" onclick="bnavSet(this);renderSeller('${n.id}')"><span class="bnav-ico">${n.icon}</span>${n.label}</button>`).join('')+`<button class="bnav-item" onclick="doLogout()"><span class="bnav-ico">🚪</span>Sign Out</button>`;
}
function sellerNavClick(btn,id){document.querySelectorAll('.snav-item').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderSeller(id);}
function renderSeller(section){
  const el=document.getElementById('seller-content');if(!el)return;
  const badge=document.getElementById('seller-kyc-badge');
  if(badge){badge.textContent=currentUser?.verified&&currentUser?.role==='seller'?'✓ Verified seller':'Seller verification pending';badge.style.background='rgba(255,255,255,.12)';}
  if(section==='dashboard')el.innerHTML=sellerDashHTML();
  else if(section==='products')el.innerHTML=sellerProdsHTML();
  else if(section==='orders'){ORDERS=[];el.innerHTML=sellerOrdersHTML();loadSellerOrders();}
  else if(section==='earnings')el.innerHTML=sellerEarnHTML();
  else if(section==='profile')el.innerHTML=sellerProfileHTML();
}
function sellerDashHTML(){
  return `<div class="seller-page-hdr"><div class="seller-page-title">Your shop</div></div>
  <div class="seller-content"><section class="seller-setup-card">
    <span>✳</span><div><div class="seller-setup-title">Make this space yours.</div><p>Add products to your shop and keep your details up to date. Order and earnings summaries will appear here when those services are connected.</p></div>
    <button class="bx bx-g" onclick="renderSeller('products')">View my listings ↗</button>
  </section></div>`;
}
function sellerProdsHTML(){
  const ownProducts=PRODUCTS.filter(p=>String(p.sellerId)===String(currentUser?.id));
  return `<div class="seller-page-hdr"><div class="seller-page-title">My Products</div><button class="bx bx-g" style="padding:8px 16px;font-size:13px;" onclick="prodImages=[];renderProdPreviews();openModal('modal-add-product')">+ Add Product</button></div>
  <div class="seller-content"><div class="tbl-wrap"><div class="tbl-scroll"><table><thead><tr><th>Image</th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th></tr></thead>
  <tbody>${ownProducts.length?ownProducts.map(p=>`<tr>
    <td><div style="width:44px;height:44px;background:var(--bg2);border-radius:var(--r4);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:24px;">${(p.images&&p.images.length)?`<img src="${p.images[0]}" style="width:100%;height:100%;object-fit:cover;"/>`:p.emoji}</div></td>
    <td style="font-weight:600;">${p.name.slice(0,28)}…</td><td>${getCat(p.cat)}</td>
    <td style="font-weight:700;">RWF ${fmt(p.price)}</td>
    <td>${p.stock}</td><td><span class="pill ${p.stock>5?'pill-g':p.stock>0?'pill-a':'pill-r'}">${p.stock>5?'In stock':p.stock>0?'Low':'Out'}</span></td>
  </tr>`).join(''):'<tr><td colspan="6" style="padding:28px;text-align:center;color:var(--ink3);">Your shop is ready. Add your first listing to start selling.</td></tr>'}</tbody></table></div></div></div>`;
}
function sellerOrdersHTML(){
  return `<div class="seller-page-hdr"><div class="seller-page-title">Incoming Orders</div></div>
  <div class="seller-content"><div class="tbl-wrap"><div class="tbl-scroll"><table><thead><tr><th>Order ID</th><th>Product</th><th>Buyer</th><th>Phone</th><th>Buyer Total</th><th>Payment</th><th>Status</th><th>Action</th></tr></thead>
  <tbody>${ORDERS.length?ORDERS.slice(0,8).map(o=>`<tr>
    <td style="font-family:monospace;font-weight:700;">${o.id}</td><td>${o.product.slice(0,18)}…</td><td>${o.buyer}</td>
    <td style="color:var(--b);">${o.phone}</td><td style="font-weight:700;">RWF ${fmt(o.total)}</td>
    <td>${o.paymentStatus==='not_started'?'Payment not collected':o.escrow==='held'?'Escrow held':o.escrow}</td>
    <td><span class="pill ${o.status==='delivered'?'pill-g':o.status==='shipped'?'pill-b':o.status==='cancelled'?'pill-r':'pill-a'}">${o.status==='awaiting_payment'?'Awaiting payment setup':o.status}</span></td>
    <td>${o.status==='pending'?`<button class="bx bx-b" onclick="markShipped('${o.id}');renderSeller('orders')">Mark Shipped</button>`:'—'}</td>
  </tr>`).join(''):'<tr><td colspan="8" style="padding:28px;text-align:center;color:var(--ink3);">No orders have been placed for your shop.</td></tr>'}</tbody></table></div></div></div>`;
}
async function loadSellerOrders(){
  if(!sb||!currentUser?.id)return;const{data,error}=await sb.from('orders').select('*').eq('seller_id',currentUser.id).order('created_at',{ascending:false}).limit(50);
  if(error){toast('Your incoming orders could not be loaded.','r');return;}ORDERS=mapOrderRows(data||[]);const el=document.getElementById('seller-content');if(currentMode==='seller'&&el)el.innerHTML=sellerOrdersHTML();
}
function sellerEarnHTML(){
  return `<div class="seller-page-hdr"><div class="seller-page-title">Earnings</div></div>
    <div class="seller-content"><section class="seller-setup-card"><span>◷</span><div><div class="seller-setup-title">SOKO fee: ${commissionPercentText()} total</div><p>The fee is split evenly between buyer and seller. At today’s rate, you pay ${(commissionRateBps===null?'…':(Math.floor(commissionRateBps/2)/100).toFixed(commissionRateBps%200?2:0))}% of an order subtotal. Payouts are not connected yet.</p></div></section></div>`;
}
function sellerProfileHTML(){
  return `<div class="seller-page-hdr"><div class="seller-page-title">Store Profile</div></div>
  <div class="seller-content" style="max-width:600px;">
    <div style="background:var(--w);border:var(--border);border-radius:var(--r8);padding:20px;margin-bottom:14px;box-shadow:var(--sh);">
      <div style="font-size:16px;font-weight:700;margin-bottom:14px;border-bottom:var(--border);padding-bottom:10px;">Store Details</div>
      <div class="fld"><label class="fld-lbl" for="seller-profile-store">Store name</label><input class="fld-inp" id="seller-profile-store" maxlength="80" value="${escapeImageAttribute(currentUser?.store_name||'')}"/></div>
      <div class="fld"><label class="fld-lbl" for="seller-profile-phone">Phone</label><input class="fld-inp" id="seller-profile-phone" value="${escapeImageAttribute(currentUser?.phone||'')}" disabled/></div>
      <div class="fld"><label class="fld-lbl" for="seller-profile-whatsapp">WhatsApp</label><input class="fld-inp" id="seller-profile-whatsapp" maxlength="32" value="${escapeImageAttribute(currentUser?.whatsapp||'')}" placeholder="+250 7XX XXX XXX"/></div>
      <div class="fld"><label class="fld-lbl" for="seller-profile-location">Location</label><input class="fld-inp" id="seller-profile-location" maxlength="120" value="${escapeImageAttribute(currentUser?.location||'')}" placeholder="District, Rwanda"/></div>
      <button class="bx bx-g" style="padding:9px 20px;font-size:13px;" onclick="saveSellerProfile()">Save Changes</button>
    </div>
    <div style="background:var(--w);border:var(--border);border-radius:var(--r8);padding:20px;box-shadow:var(--sh);">
      <div style="font-size:16px;font-weight:700;margin-bottom:12px;">KYC Status</div>
      <span class="pill pill-g">Verified</span>
      <p style="font-size:13px;color:var(--ink3);margin-top:10px;line-height:1.6;">Seller access is linked to your SOKO account. You can switch back to shopping at any time.</p>
    </div>
  </div>`;
}
async function saveSellerProfile(){
  if(!sb||!currentUser?.id)return;const store=document.getElementById('seller-profile-store').value.trim(),whatsapp=document.getElementById('seller-profile-whatsapp').value.trim(),location=document.getElementById('seller-profile-location').value.trim();
  if(store.length<2){toast('Enter a store name.','r');return;}
  const{error}=await sb.from('users').update({store_name:store,whatsapp:whatsapp||null,location:location||null}).eq('id',currentUser.id);
  if(error){toast('Could not save your shop profile: '+error.message,'r');return;}
  Object.assign(currentUser,{store_name:store,whatsapp,location});toast('Shop profile saved.','g');
}
function markShipped(){toast('Shipping updates will be available after payment confirmation is connected.','o');}
async function addSellerProduct(){
  const name=document.getElementById('mp-name').value.trim();
  const price=parseInt(document.getElementById('mp-price').value);
  const stock=parseInt(document.getElementById('mp-stock').value,10);
  const cat=document.getElementById('mp-cat').value;
  const emoji=document.getElementById('mp-emoji').value||'📦';
  const desc=document.getElementById('mp-desc').value||'';
  if(!name||!Number.isInteger(price)||price<1||!Number.isInteger(stock)||stock<0){toast('Enter a product name, whole-number price, and stock of 0 or more.','r');return;}
  const{data:{user:authUser}}=await sb.auth.getUser();
  if(!authUser){toast('Please sign in again before adding a product.','r');return;}
  const{data:profile,error:profileError}=await sb.from('users').select('id,role').eq('auth_id',authUser.id).single();
  if(profileError||!profile||profile.role!=='seller'||!currentUser?.verified||currentUser?.status!=='active'){toast('Your account is not approved for seller listings.','r');return;}
  toast('Uploading images…');
  let imageUrls=[];
  for(let i=0;i<prodImages.length;i++){
    const img=prodImages[i];
    const blob=img.blob||await(await fetch(img.url)).blob();
    const ext=blob.type==='image/webp'?'webp':blob.type==='image/png'?'png':'jpg';
    const fileName=`${authUser.id}/products/${crypto.randomUUID()}.${ext}`;
    const{data,error}=await sb.storage.from('product-images').upload(fileName,blob,{contentType:blob.type,upsert:false});
    if(error){toast('Image upload failed: '+error.message,'r');return;}
    const{data:urlData}=sb.storage.from('product-images').getPublicUrl(fileName);
    imageUrls.push(urlData.publicUrl);
  }
  toast('Saving product…');
  const{data,error}=await sb.from('products').insert([{
    name,category:cat,cat,price,stock,emoji,description:desc,
    images:imageUrls,badge:'new',
    seller_name:currentUser?.store_name||currentUser?.name||'My Store',seller:currentUser?.store_name||currentUser?.name||'My Store',
    seller_phone:currentUser?.phone||'',seller_id:profile.id,
    active:true,
  }]).select().single();
  if(error){toast('Failed to save product: '+error.message,'r');return;}
  PRODUCTS.unshift({
    id:data.id,name:data.name,cat:data.cat||data.category,price:data.price,
    stock:data.stock,emoji:data.emoji,images:normalizeProductImages(data.images),rating:0,reviews:0,
    seller:data.seller_name||data.seller,sellerId:data.seller_id,sellerPhone:data.seller_phone||'',
    desc:data.description||'',badge:'new',
  });
  prodImages=[];closeModal('modal-add-product');renderSeller('products');
  toast('✓ Product added and saved!','g');
}

// ADMIN
async function loadProductsFromSupabase(){
  if(!sb){PRODUCTS=[];return;}
  const{data,error}=await sb.from('products').select('*').eq('active',true).order('created_at',{ascending:false});
  if(error){console.log('Products load error:',error);PRODUCTS=[];return;}
  PRODUCTS=data.map(p=>({
    id:p.id,name:p.name,cat:p.cat||p.category,price:p.price,stock:p.stock,
    emoji:p.emoji||'📦',images:normalizeProductImages(p.images),rating:p.rating||0,
    reviews:p.reviews_count||p.reviews||0,seller:p.seller_name||p.seller||'Seller',sellerId:p.seller_id||null,
    sellerPhone:p.seller_phone||'',desc:p.description||'',badge:p.badge||'',
  }));
  hydrateCart();
}
function normalizeProductImages(value){
  const validUrl=v=>typeof v==='string'&&/^https?:\/\//i.test(v.trim());
  if(Array.isArray(value))return value.filter(validUrl).map(v=>v.trim());
  if(typeof value!=='string'||!value.trim())return[];
  try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed.filter(validUrl).map(v=>v.trim());return[];}catch(e){}
  return validUrl(value)?[value.trim()]:[];
}
// AI CHAT
function toggleAIChat(){
  const popup=document.getElementById('ai-popup');
  const isOpen=popup.style.display==='flex';
  popup.style.display=isOpen?'none':'flex';
  if(!isOpen)document.getElementById('ai-input').focus();
}
async function aiGenerateDesc(){
  const name=document.getElementById('mp-name').value.trim();
  const cat=document.getElementById('mp-cat').value;
  if(!name){toast('Enter a product name first','r');return;}
  const btn=document.getElementById('ai-gen-desc-btn'),label=document.getElementById('ai-gen-label');
  btn.disabled=true;if(label)label.textContent='Generating…';
  try{
    const res=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:`Write a short, appealing 2-3 sentence product description for a Rwanda marketplace listing. Product name: "${name}". Category: ${cat}. No markdown, no quotes, just the description text.`})});
    const data=await res.json();
    const desc=data.content?.[0]?.text?.trim();
    if(desc)document.getElementById('mp-desc').value=desc;
    else toast('No description generated — try again','r');
  }catch(e){toast('AI generation failed','r');}
  btn.disabled=false;if(label)label.textContent='Generate description with AI';
}
async function sendAIMessage(){
  const input=document.getElementById('ai-input');
  const msg=input.value.trim();
  if(!msg)return;
  input.value='';
  const box=document.getElementById('ai-messages');
  const userBubble=document.createElement('div');userBubble.style.cssText='background:#E0912A;border-radius:8px;padding:10px 12px;font-size:13px;color:#17222E;box-shadow:0 1px 4px rgba(0,0,0,.08);max-width:85%;align-self:flex-end;';userBubble.textContent=msg;box.appendChild(userBubble);
  box.innerHTML+=`<div id="ai-typing" style="background:#fff;border-radius:8px;padding:10px 12px;font-size:13px;color:#78838D;max-width:85%;">Thinking…</div>`;
  box.scrollTop=box.scrollHeight;
  try{
    const response=await fetch('/api/ai',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:msg})
    });
    const data=await response.json();
    const reply=data.content?.[0]?.text||'Sorry, I could not get a response.';
    document.getElementById('ai-typing').remove();
    const replyBubble=document.createElement('div');replyBubble.style.cssText='background:#fff;border-radius:8px;padding:10px 12px;font-size:13px;color:#333;box-shadow:0 1px 4px rgba(0,0,0,.08);max-width:85%;';replyBubble.textContent=reply;box.appendChild(replyBubble);
    box.scrollTop=box.scrollHeight;
  }catch(e){
    document.getElementById('ai-typing').remove();
    const errorBubble=document.createElement('div');errorBubble.style.cssText='background:#fff;border-radius:8px;padding:10px 12px;font-size:13px;color:#C2452E;max-width:85%;';errorBubble.textContent='Something went wrong. Please try again.';box.appendChild(errorBubble);
    box.scrollTop=box.scrollHeight;
  }
}