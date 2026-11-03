(() => {
  const cfg = window.VK_CONFIG || {};
  const ready = !!(window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("COLE_AQUI") && !cfg.SUPABASE_ANON_KEY.includes("COLE_AQUI"));
  const db = ready ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const $ = (s) => document.querySelector(s);
  const money = (n) => Number(n || 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  let registrations = [], promotions = [], settings = {female_price:25,male_price:30,capacity:60};
  let adminUser = null;

  function setMessage(el, msg, error=true){ if(el){el.textContent=msg;el.style.color=error?"#ff9ba0":"#8be0a5";} }
  function showAdminRoute(){
    const admin = location.hash === "#admin";
    $("#admin-view").hidden = !admin;
    document.querySelectorAll("body>header,body>main,body>footer,body>.ambient").forEach(el=>el.style.display=admin?"none":"");
    if(admin && ready) checkSession();
    if(admin && !ready) setMessage($("#login-message"),"Configure o arquivo config.js e execute o SQL do projeto antes de acessar o painel.");
  }
  window.addEventListener("hashchange",showAdminRoute);

  async function loadPublic(){
    if(!ready) {
      $("#spots-number").textContent="57";
      $("#spots-progress").style.width="5%";
      return;
    }
    const [{data:cfgRows},{data:promoRows},{data:countRows}] = await Promise.all([
      db.from("event_settings").select("*").eq("id",1).maybeSingle(),
      db.from("promotions").select("*").eq("active",true).order("created_at",{ascending:false}),
      db.from("registrations").select("id,status")
    ]);
    if(cfgRows) settings=cfgRows;
    promotions=promoRows||[];
    const occupied=(countRows||[]).filter(x=>x.status!=="cancelled").length;
    const capacity=settings.capacity||60;
    $("#spots-number").textContent=Math.max(0,capacity-occupied);
    $("#spots-progress").style.width=Math.min(100,occupied/capacity*100)+"%";
    $("#price-female").innerHTML=money(settings.female_price).replace(",00",'<span>,00</span>');
    $("#price-male").innerHTML=money(settings.male_price).replace(",00",'<span>,00</span>');
    const select=$("#promotion-select");
    select.innerHTML='<option value="">Sem promoção / preço normal</option>';
    promotions.forEach(p=>{
      const opt=document.createElement("option");opt.value=p.id;opt.textContent=`${p.name} — ${money(p.price)}`;select.appendChild(opt);
    });
  }

  const copyPixButton=$("#copy-pix");
  if(copyPixButton) copyPixButton.addEventListener("click",async()=>{
    try{await navigator.clipboard.writeText(cfg.PIX_COPIA_E_COLA);setMessage($("#pix-message"),"Pix copiado! Confira o recebedor e o valor no banco.",false);}
    catch(_){setMessage($("#pix-message"),"Não foi possível copiar automaticamente. Peça o código Pix à organização.");}
  });

  document.querySelectorAll(".choose-ticket").forEach(btn=>btn.addEventListener("click",()=>{
    $("#gender-select").value=btn.dataset.gender;
    $("#cadastro").scrollIntoView({behavior:"smooth"});
  }));

  $("#registration-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const form=e.currentTarget, data=Object.fromEntries(new FormData(form).entries());
    const age=Number(data.age);
    if(age<16){setMessage($("#form-message"),"A entrada é permitida somente para pessoas com 16 anos ou mais.");return;}
    if(!data.consent){setMessage($("#form-message"),"É necessário confirmar as informações e o aviso de privacidade.");return;}
    if(!ready){setMessage($("#form-message"),"O cadastro online ainda não foi conectado ao banco de dados. Configure o Supabase conforme o README.");return;}
    const payload={p_full_name:data.full_name.trim(),p_phone:data.phone.trim(),p_age:age,p_gender:data.gender,p_promotion_id:data.promotion_id||null};
    const {data:result,error}=await db.rpc("create_registration",payload);
    if(error){setMessage($("#form-message"),error.message.includes("CAPACITY")?"As 60 vagas foram preenchidas.":"Não foi possível registrar: "+error.message);return;}
    const ticket=result;
    const msg=[
      "Olá! Quero confirmar minha inscrição na Halloween da VK.",
      `Nome: ${data.full_name}`,
      `Idade: ${age}`,
      `WhatsApp: ${data.phone}`,
      `Ingresso: ${data.gender}`,
      `Código da solicitação: ${ticket.registration_code}`,
      `Valor: ${money(ticket.price)}`,
      "",
      "Vou anexar aqui manualmente a foto do documento e o comprovante Pix."
    ].join("\n");
    const url=`https://wa.me/${cfg.WHATSAPP}?text=${encodeURIComponent(msg)}`;
    setMessage($("#form-message"),"Solicitação registrada! O WhatsApp será aberto. Anexe manualmente as duas fotos antes de enviar.",false);
    form.reset();loadPublic();
    window.open(url,"_blank","noopener");
  });

  async function checkSession(){
    if(!ready)return;
    const {data:{session}}=await db.auth.getSession();
    if(!session){$("#admin-login").hidden=false;$("#admin-dashboard").hidden=true;return;}
    const {data:allowed,error}=await db.from("admins").select("user_id").eq("user_id",session.user.id).maybeSingle();
    if(error||!allowed){await db.auth.signOut();$("#admin-login").hidden=false;$("#admin-dashboard").hidden=true;setMessage($("#login-message"),"Este usuário não está autorizado como administrador.");return;}
    adminUser=session.user;$("#admin-login").hidden=true;$("#admin-dashboard").hidden=false;await loadDashboard();
  }
  $("#login-form").addEventListener("submit",async e=>{
    e.preventDefault();if(!ready){setMessage($("#login-message"),"Configure o Supabase primeiro.");return;}
    const f=Object.fromEntries(new FormData(e.currentTarget).entries());
    const {error}=await db.auth.signInWithPassword({email:f.email,password:f.password});
    if(error){setMessage($("#login-message"),"Não foi possível entrar. Confira e-mail e senha.");return;}
    await checkSession();
  });
  $("#logout-button").addEventListener("click",async()=>{await db.auth.signOut();checkSession();});
  async function loadDashboard(){
    const [{data:rows},{data:cfgRow},{data:promoRows},{data:history}] = await Promise.all([
      db.from("registrations").select("*").order("created_at",{ascending:false}),
      db.from("event_settings").select("*").eq("id",1).single(),
      db.from("promotions").select("*").order("created_at",{ascending:false}),
      db.from("promotion_history").select("*").order("created_at",{ascending:false}).limit(30)
    ]);
    registrations=rows||[];promotions=promoRows||[];if(cfgRow)settings=cfgRow;
    renderDashboard();renderPromotions();renderHistory(history||[]);
  }
  function renderDashboard(){
    const active=registrations.filter(r=>r.status!=="cancelled");
    const confirmed=active.filter(r=>r.status==="confirmed");
    const pending=active.filter(r=>r.status==="pending");
    $("#stat-occupied").textContent=active.length;
    $("#stat-remaining").textContent=Math.max(0,(settings.capacity||60)-active.length);
    $("#stat-pending").textContent=pending.length;
    $("#stat-raised").textContent=money(confirmed.reduce((s,r)=>s+Number(r.price||0),0));
    $("#prices-form").elements.female_price.value=settings.female_price;
    $("#prices-form").elements.male_price.value=settings.male_price;
    renderParticipants();
  }
  function renderParticipants(){
    const q=($("#participant-search").value||"").toLowerCase();
    const body=$("#participants-body");
    const filtered=registrations.filter(r=>(r.full_name+" "+r.phone).toLowerCase().includes(q));
    body.innerHTML="";
    if(!filtered.length){body.innerHTML='<tr><td colspan="6">Nenhuma inscrição encontrada.</td></tr>';return;}
    filtered.forEach(r=>{
      const tr=document.createElement("tr");
      const date=new Date(r.created_at).toLocaleDateString("pt-BR");
      const status=r.status==="confirmed"?"Confirmado":r.status==="cancelled"?"Cancelado":"Pendente";
      tr.innerHTML=`<td>${esc(r.full_name)}<br><small>${esc(r.phone)} · ${r.age==null?"idade não informada":r.age+" anos"}</small></td><td>${esc(r.gender||"Não informado")}${r.promotion_name?`<br><small>${esc(r.promotion_name)}</small>`:""}</td><td>${r.price==null?"A confirmar":money(r.price)}</td><td><span class="status ${r.status}">${status}</span></td><td>${date}</td><td>${r.status==="pending"?`<button class="table-action" data-action="confirm" data-id="${r.id}">CONFIRMAR PIX</button>`:""}${r.status!=="cancelled"?`<button class="table-action" data-action="cancel" data-id="${r.id}">CANCELAR</button>`:""}</td>`;
      body.appendChild(tr);
    });
  }
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  $("#participant-search").addEventListener("input",renderParticipants);
  $("#participants-body").addEventListener("click",async e=>{
    const b=e.target.closest("button[data-action]");if(!b)return;
    const status=b.dataset.action==="confirm"?"confirmed":"cancelled";
    if(!confirm(status==="confirmed"?"Confirma que o Pix foi recebido?":"Cancelar esta inscrição e liberar a vaga?"))return;
    const {error}=await db.from("registrations").update({status}).eq("id",b.dataset.id);
    if(error){alert("Não foi possível atualizar: "+error.message);return;}await loadDashboard();await loadPublic();
  });
  $("#prices-form").addEventListener("submit",async e=>{
    e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget).entries());
    const {error}=await db.from("event_settings").update({female_price:Number(f.female_price),male_price:Number(f.male_price),updated_at:new Date().toISOString()}).eq("id",1);
    if(error){alert(error.message);return;}await loadDashboard();await loadPublic();alert("Preços atualizados.");
  });
  $("#promotion-form").addEventListener("submit",async e=>{
    e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget).entries());
    const row={name:f.name,price:Number(f.price),quantity:Number(f.quantity),eligibility:f.eligibility,starts_at:f.starts_at?new Date(f.starts_at).toISOString():null,ends_at:f.ends_at?new Date(f.ends_at).toISOString():null,active:!!e.currentTarget.elements.active.checked};
    const id=f.id;
    const result=id?await db.from("promotions").update(row).eq("id",id):await db.from("promotions").insert(row);
    if(result.error){alert(result.error.message);return;}
    e.currentTarget.reset();e.currentTarget.elements.id.value="";e.currentTarget.elements.active.checked=true;
    await loadDashboard();await loadPublic();
  });
  $("#cancel-promo-edit").addEventListener("click",()=>{$("#promotion-form").reset();$("#promotion-form").elements.id.value="";});
  function renderPromotions(){
    const el=$("#promotions-list");el.innerHTML="";
    promotions.forEach(p=>{
      const div=document.createElement("div");div.className="promo-item";
      div.innerHTML=`<div><strong>${esc(p.name)} · ${money(p.price)}</strong><p>${p.quantity} ingressos · ${p.eligibility==="both"?"Todos":esc(p.eligibility)} · ${p.active?"Ativa":"Inativa"}</p></div><div><button class="table-action" data-edit="${p.id}">EDITAR</button><button class="table-action" data-toggle="${p.id}" data-active="${p.active}">${p.active?"DESATIVAR":"ATIVAR"}</button></div>`;
      el.appendChild(div);
    });
    el.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>{
      const p=promotions.find(x=>x.id===b.dataset.edit),f=$("#promotion-form");
      Object.entries({id:p.id,name:p.name,price:p.price,quantity:p.quantity,eligibility:p.eligibility,starts_at:p.starts_at?new Date(p.starts_at).toISOString().slice(0,16):"",ends_at:p.ends_at?new Date(p.ends_at).toISOString().slice(0,16):""}).forEach(([k,v])=>f.elements[k].value=v??"");
      f.elements.active.checked=p.active;f.scrollIntoView({behavior:"smooth"});
    }));
    el.querySelectorAll("[data-toggle]").forEach(b=>b.addEventListener("click",async()=>{
      const {error}=await db.from("promotions").update({active:b.dataset.active!=="true"}).eq("id",b.dataset.toggle);
      if(error){alert(error.message);return;}await loadDashboard();await loadPublic();
    }));
  }
  function renderHistory(items){
    const el=$("#promotion-history");el.innerHTML="";
    if(!items.length){el.textContent="Nenhuma alteração registrada ainda.";return;}
    items.forEach(x=>{const d=document.createElement("div");d.className="history-item";d.innerHTML=`<div><strong>${esc(x.action)} — ${esc(x.promotion_name||"Promoção")}</strong><p>${new Date(x.created_at).toLocaleString("pt-BR")}</p></div>`;el.appendChild(d);});
  }
  $("#export-button").addEventListener("click",()=>{
    const headers=["Nome","Telefone","Idade","Ingresso","Promoção","Valor","Status","Código","Criado em"];
    const lines=[headers,...registrations.map(r=>[r.full_name,r.phone,r.age,r.gender,r.promotion_name||"",r.price,r.status,r.registration_code,r.created_at])];
    const csv="\uFEFF"+lines.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(";")).join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download="participantes-halloween-vk.csv";a.click();URL.revokeObjectURL(a.href);
  });
  showAdminRoute();loadPublic();
})();