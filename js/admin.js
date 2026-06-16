const API = '/api/admin';
var adminUser = null;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
}

function toast(msg, ms) {
  if(!ms) ms=2000;
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.8);color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;z-index:9999;opacity:0;transition:opacity.2s;pointer-events:none;max-width:80%;';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(function(){t.style.opacity='1';});
  setTimeout(function(){t.style.opacity='0';setTimeout(function(){t.remove();},200);},ms);
}
var ADMIN_PASSWORD = 'admin123';

// 身份标签辅助函数
function roleBadge(role) {
  var map = {'银龄用户':'老年端','子女群体':'子女端','医生与营养师':'营养师端','健康师':'营养师端','营养师':'营养师端','医师':'营养师端','普通用户':'老年端'};
  var name = map[role] || role || '未知';
  var bg = name==='老年端'?'#fff3e0':name==='子女端'?'#e3f2fd':name==='营养师端'?'#e8f5e9':'#f5f5f5';
  var color = name==='老年端'?'#e65100':name==='子女端'?'#1565c0':name==='营养师端'?'#2e7d32':'#666';
  return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;background:'+bg+';color:'+color+'">'+name+'</span>';
}
var pages = {};

function getPath() {
  var h = (location.hash || '#/login').slice(2);
  var parts = h.split('?');
  var path = parts[0];
  var params = {};
  (parts[1]||'').split('&').filter(function(x){return x;}).forEach(function(kv){
    var p = kv.split('=');
    params[decodeURIComponent(p[0])] = decodeURIComponent(p[1]||'');
  });
  return {path:path,params:params};
}

function navigate(path, params) {
  params = params || {};
  var qs = Object.keys(params).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(params[k]);}).join('&');
  location.hash = '#/'+path+(qs?'?'+qs:'');
}

function sidebarHtml(current) {
  var items = [
    {key:'dashboard',icon:'📊',label:'数据概览'},
    {key:'users',icon:'👥',label:'用户管理'},
    {key:'prescriptions',icon:'📋',label:'运动处方'},
    {key:'services',icon:'💳',label:'付费管理'},
    {key:'coins',icon:'🪙',label:'健康币管理'},
    {key:'activities',icon:'👨‍👩‍👧‍👦',label:'亲子活动'},
    {key:'volunteer',icon:'🤝',label:'志愿报名'},
    {key:'data',icon:'📈',label:'健康数据'}
  ];
  var nav = items.map(function(i){
    var cls = i.key===current ? ' sidebar-item active' : ' sidebar-item';
    return '<div class="'+cls+'" data-nav="'+i.key+'"><span class="icon">'+i.icon+'</span><span>'+esc(i.label)+'</span></div>';
  }).join('');
  return '<div class="sidebar"><div class="sidebar-header">颐路相伴 管理</div><div class="sidebar-nav">'+nav+'</div><div class="sidebar-footer"><div class="sidebar-item" id="btn-logout"><span class="icon">🚪</span><span>退出登录</span></div></div></div>';
}

function topbarHtml(title) {
  return '<div class="main"><div class="topbar"><div class="topbar-title">'+esc(title)+'</div><div class="topbar-right">管理员: '+esc(adminUser)+' | '+new Date().toLocaleDateString('zh-CN')+'</div></div><div class="content">';
}

async function api(method, url, body) {
  var opts = {method:method,headers:{}};
  if(adminUser) opts.headers['Authorization']='Bearer admin-'+btoa(adminUser);
  if(body) {opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body);}
  try {
    var res = await fetch(API+url,opts);
    return await res.json();
  } catch(e) {toast('网络错误');return {error:e.message};}
}

function setupNav() {
  document.querySelectorAll('[data-nav]').forEach(function(el){
    el.addEventListener('click',function(){navigate(this.getAttribute('data-nav'));});
  });
  var lo = document.getElementById('btn-logout');
  if(lo) lo.addEventListener('click',function(){adminUser=null;localStorage.removeItem('adminUser');navigate('login');});
}

pages.login = function() {
  document.getElementById('admin-app').innerHTML = '<div class="admin-login"><div class="admin-login-box"><div class="admin-login-logo">颐路相伴</div><div class="admin-login-sub">管理后台 请登录</div><input type="text" id="login-user" placeholder="管理员账号" /><input type="password" id="login-pass" placeholder="密码" /><button class="admin-login-btn" id="btn-login">登 录</button><div id="login-error" class="admin-login-error"></div></div></div>';
  document.getElementById('btn-login').onclick = function() {
    var user = document.getElementById('login-user').value.trim();
    var pass = document.getElementById('login-pass').value.trim();
    if(user==='admin'&&pass===ADMIN_PASSWORD) {
      adminUser=user;localStorage.setItem('adminUser',user);navigate('dashboard');
    } else {
      document.getElementById('login-error').textContent='账号或密码错误';
    }
  };
  document.getElementById('login-user').onkeydown = function(e){if(e.key==='Enter') document.getElementById('btn-login').click();};
  document.getElementById('login-pass').onkeydown = function(e){if(e.key==='Enter') document.getElementById('btn-login').click();};
};

pages.dashboard = async function() {
  var app = document.getElementById('admin-app');
  app.innerHTML = sidebarHtml('dashboard')+topbarHtml('数据概览')+'<div class="stats-grid" id="stats-grid"></div><div class="admin-card"><div class="admin-card-title">最近注册用户</div><div id="recent-users"><div class="chart-placeholder">加载中...</div></div></div></div></div>';
  setupNav();
  var stats = await api('GET','/stats');
  var grid = '';
  var items = [
    {cls:'orange',label:'总用户数',val:stats.totalUsers||0},
    {cls:'green',label:'今日活跃',val:stats.todayActive||0},
    {cls:'blue',label:'总处方数',val:stats.totalPrescriptions||0},
    {cls:'purple',label:'注册总数',val:stats.totalUsers||0}
  ];
  items.forEach(function(i){grid+='<div class="stat-card '+i.cls+'"><div class="stat-label">'+i.label+'</div><div class="stat-value">'+i.val+'</div></div>';});
  document.getElementById('stats-grid').innerHTML = grid;
  var users = await api('GET','/users');
  if(users.data&&users.data.length) {
    var rows = users.data.slice(-10).reverse().map(function(u){
      return '<tr><td>'+esc(u.phone)+'</td><td>'+(u.updatedAt?new Date(u.updatedAt).toLocaleString('zh-CN'):'-')+'</td><td><button class="btn-admin btn-admin-sm btn-admin-primary vu" data-p="'+esc(u.phone)+'">查看</button></td></tr>';
    }).join('');
    document.getElementById('recent-users').innerHTML = '<table class="admin-table"><tr><th>手机号</th><th>身份</th><th>注册时间</th><th>操作</th></tr>'+rows+'</table>';
    document.querySelectorAll('.vu').forEach(function(el){
      el.onclick = function(){navigate('user-detail',{phone:this.getAttribute('data-p')});};
    });
  } else {
    document.getElementById('recent-users').innerHTML = '<div class="chart-placeholder">暂无用户数据</div>';
  }
};

pages.users = async function() {
  var app = document.getElementById('admin-app');
  app.innerHTML = sidebarHtml('users')+topbarHtml('用户管理')+'<div class="admin-card"><div class="admin-card-title">所有用户</div><div id="user-list"><div class="chart-placeholder">加载中...</div></div></div></div></div>';
  setupNav();
  var d = await api('GET','/users');
  if(d.data&&d.data.length) {
    var rows = d.data.map(function(u){
      var p=u.data&&u.data.profile||'{}';if(typeof p==='string'){try{p=JSON.parse(p);}catch(e){p={};}}
      return '<tr><td>'+esc(u.phone)+'</td><td>'+roleBadge(u.role)+'</td><td>'+esc(p.name||'-')+'</td><td>'+(u.updatedAt?new Date(u.updatedAt).toLocaleString('zh-CN'):'-')+'</td><td><button class="btn-admin btn-admin-sm btn-admin-primary vu" data-p="'+esc(u.phone)+'">查看</button></td></tr>';
    }).join('');
    document.getElementById('user-list').innerHTML = '<table class="admin-table"><tr><th>手机号</th><th>身份</th><th>资料</th><th>注册时间</th><th>操作</th></tr>'+rows+'</table>';
    document.querySelectorAll('.vu').forEach(function(el){
      el.onclick = function(){navigate('user-detail',{phone:this.getAttribute('data-p')});};
    });
  } else {
    document.getElementById('user-list').innerHTML = '<div class="chart-placeholder">暂无用户</div>';
  }
};

pages['user-detail'] = async function(params) {
  var phone = params.phone;
  if(!phone){navigate('users');return;}
  var app = document.getElementById('admin-app');
  app.innerHTML = sidebarHtml('users')+topbarHtml('用户详情')+'<div id="user-detail-content"><div class="chart-placeholder">加载中...</div></div></div></div>';
  setupNav();
  var d = await api('GET','/users/'+encodeURIComponent(phone));
  if(d.error){document.getElementById('user-detail-content').innerHTML='<div class="admin-card" style="color:red;">'+esc(d.error)+'</div>';return;}
  var u=d.user;
  var p=u.data&&u.data.profile||'{}';if(typeof p==='string'){try{p=JSON.parse(p);}catch(e){p={};}}
  var h=u.data&&u.data.healthData||'{}';if(typeof h==='string'){try{h=JSON.parse(h);}catch(e){h={};}}
  var sh=u.data&&u.data.signHistory||'[]';if(typeof sh==='string'){try{sh=JSON.parse(sh);}catch(e){sh=[];}}
  document.getElementById('user-detail-content').innerHTML =
    '<div class="admin-card"><div class="admin-card-title">基本信息</div><div class="detail-grid">'+
    '<div class="detail-item"><div class="detail-label">手机号</div><div class="detail-value">'+esc(phone)+'</div></div>'+
    '<div class="detail-item"><div class="detail-label">姓名</div><div class="detail-value">'+esc(p.name||'未设置')+'</div></div>'+
    '<div class="detail-item"><div class="detail-label">年龄</div><div class="detail-value">'+esc(p.age||'-')+'</div></div>'+
    '<div class="detail-item"><div class="detail-label">身高/体重</div><div class="detail-value">'+esc(p.height||'-')+' / '+esc(p.weight||'-')+'</div></div>'+
    '<div class="detail-item"><div class="detail-label">慢性病</div><div class="detail-value">'+(p.hasChronic?'有':'无')+'</div></div>'+
    '<div class="detail-item"><div class="detail-label">签到天数</div><div class="detail-value">'+(sh.length||0)+' 天</div></div>'+
    '</div></div>'+
    '<div class="admin-card"><div class="admin-card-title">健康数据</div><div class="detail-grid">'+
    '<div class="detail-item"><div class="detail-label">心率</div><div class="detail-value">'+(h.heartRate||'-')+' bpm</div></div>'+
    '<div class="detail-item"><div class="detail-label">血压</div><div class="detail-value">'+(h.bloodPressure||'-')+'</div></div>'+
    '<div class="detail-item"><div class="detail-label">血氧</div><div class="detail-value">'+(h.bloodOxygen||'-')+'%</div></div>'+
    '<div class="detail-item"><div class="detail-label">血糖</div><div class="detail-value">'+(h.bloodSugar||'-')+' mmol/L</div></div>'+
    '<div class="detail-item"><div class="detail-label">步数</div><div class="detail-value">'+(h.steps||'-')+'</div></div>'+
    '<div class="detail-item"><div class="detail-label">睡眠</div><div class="detail-value">'+(h.sleepHours||'-')+' 小时</div></div>'+
    '</div></div>'+
    '<div class="admin-card"><div class="admin-card-title"><span>运动处方</span><button class="btn-admin btn-admin-sm btn-admin-primary" id="btn-new-rx" data-p="'+esc(phone)+'">+ 生成新处方</button></div><div id="user-rx"></div></div>';
  document.getElementById('btn-new-rx').onclick = function(){navigate('prescription-new',{phone:this.getAttribute('data-p')});};
  var rxData = await api('GET','/prescription/'+encodeURIComponent(phone));
  if(rxData.data&&rxData.data.items) {
    var rx = rxData.data;
    document.getElementById('user-rx').innerHTML = '<div class="rx-card"><div class="rx-header"><div class="rx-doctor">👨‍⚕️ '+esc(rx.doctor||'系统')+'</div><div class="rx-date">'+new Date(rx.createdAt).toLocaleDateString('zh-CN')+'</div></div><div class="rx-items">'+
      (rx.items||[]).map(function(i){return '<div class="rx-item"><div class="rx-item-name">'+esc(i.name)+'</div><div class="rx-item-detail">'+esc(i.detail)+'</div></div>';}).join('')+
      '</div>'+(rx.cautions?'<div class="rx-caution">⚠️ '+esc(rx.cautions)+'</div>':'')+'</div>';
  } else {
    document.getElementById('user-rx').innerHTML = '<div class="chart-placeholder">暂无处方</div>';
  }
};

pages.prescriptions = async function() {
  var app = document.getElementById('admin-app');
  app.innerHTML = sidebarHtml('prescriptions')+topbarHtml('运动处方')+'<div class="admin-card"><div class="admin-card-title">处方管理</div>'+
    '<div class="admin-tabs"><button class="admin-tab active" id="tab-all">全部处方</button><button class="admin-tab" id="tab-new">生成新处方</button></div>'+
    '<div id="prescription-content"><div class="chart-placeholder">加载中...</div></div></div></div></div>';
  setupNav();
  document.getElementById('tab-all').onclick = function(){
    document.querySelectorAll('.admin-tab').forEach(function(t){t.classList.remove('active');});
    document.getElementById('tab-all').classList.add('active');loadAllRx();
  };
  document.getElementById('tab-new').onclick = function(){navigate('prescription-new');};
  loadAllRx();
};

async function loadAllRx() {
  var div = document.getElementById('prescription-content');
  div.innerHTML = '<div class="chart-placeholder">加载中...</div>';
  var d = await api('GET','/users');
  if(!d.data||!d.data.length){div.innerHTML='<div class="chart-placeholder">暂无用户</div>';return;}
  var html = '';
  for(var i=0;i<d.data.length;i++) {
    var u=d.data[i];
    var rxData = await api('GET','/prescription/'+encodeURIComponent(u.phone));
    var p=u.data&&u.data.profile||'{}';if(typeof p==='string'){try{p=JSON.parse(p);}catch(e){p={};}}
    if(rxData.data&&rxData.data.items) {
      html+='<div class="rx-card"><div class="rx-header"><div class="rx-doctor">'+esc(p.name||u.phone)+'</div><div class="rx-date">'+new Date(rxData.data.createdAt).toLocaleDateString('zh-CN')+'</div></div>'+
        '<div style="font-size:12px;color:var(--gray);margin-bottom:8px;">医生: '+esc(rxData.data.doctor||'-')+'</div>'+
        '<div class="rx-items">'+(rxData.data.items||[]).map(function(it){return '<div class="rx-item"><div class="rx-item-name">'+esc(it.name)+'</div><div class="rx-item-detail">'+esc(it.detail)+'</div></div>';}).join('')+'</div></div>';
    }
  }
  div.innerHTML = html||'<div class="chart-placeholder">暂无处方记录</div>';
}

pages['prescription-new'] = async function(params) {
  var phone = params.phone;
  var app = document.getElementById('admin-app');
  app.innerHTML = sidebarHtml('prescriptions')+topbarHtml('生成运动处方')+'<div class="admin-card"><div class="admin-card-title">智能处方生成</div>'+
    '<div class="form-group"><label>选择用户</label><select id="rx-phone">'+(phone?'<option value="'+esc(phone)+'">'+esc(phone)+'</option>':'')+'</select></div>'+
    '<div class="form-row-grid">'+
    '<div class="form-group"><label>心率 (bpm)</label><input id="rx-hr" placeholder="如: 78" /></div>'+
    '<div class="form-group"><label>血压</label><input id="rx-bp" placeholder="如: 125/80" /></div>'+
    '<div class="form-group"><label>血氧 (%)</label><input id="rx-ox" placeholder="如: 98" /></div>'+
    '<div class="form-group"><label>血糖 (mmol/L)</label><input id="rx-sugar" placeholder="如: 6.0" /></div>'+
    '</div>'+
    '<div class="form-group"><label>医生 / 营养师备注</label><textarea id="rx-notes" placeholder="输入医师指导意见、注意事项、目标等..."></textarea></div>'+
    '<div style="display:flex;gap:8px;"><button class="btn-admin btn-admin-primary" id="btn-gen-rx">🤖 智能生成处方</button>'+
    '<button class="btn-admin btn-admin-green" id="btn-save-rx">💾 保存处方</button></div>'+
    '<div id="rx-result" style="margin-top:16px;"></div></div></div></div>';
  setupNav();
  document.getElementById('btn-gen-rx').onclick = generatePrescription;
  document.getElementById('btn-save-rx').onclick = savePrescription;
  var d = await api('GET','/users');
  if(d.data) {
    var sel = document.getElementById('rx-phone');
    if(!phone) {
      d.data.forEach(function(u){
        var p=u.data&&u.data.profile||'{}';if(typeof p==='string'){try{p=JSON.parse(p);}catch(e){p={};}}
        sel.innerHTML+='<option value="'+esc(u.phone)+'">'+esc(p.name||u.phone)+' ('+esc(u.phone)+')</option>';
      });
    }
  }
  window._genRx = null;
};

async function generatePrescription() {
  var phone = document.getElementById('rx-phone').value;
  var hr = parseInt(document.getElementById('rx-hr').value)||75;
  var bp = document.getElementById('rx-bp').value||'120/80';
  var ox = parseInt(document.getElementById('rx-ox').value)||97;
  var sugar = parseFloat(document.getElementById('rx-sugar').value)||5.5;
  var notes = document.getElementById('rx-notes').value;
  if(!phone){toast('请选择用户');return;}
  document.getElementById('rx-result').innerHTML = '<div class="chart-placeholder">🔄 正在智能计算处方...</div>';
  var userData = await api('GET','/users/'+encodeURIComponent(phone));
  var p={};try{p=userData.user&&userData.user.data?JSON.parse(userData.user.data.profile||'{}'):{};}catch(e){p={};}if(typeof p==='string'){try{p=JSON.parse(p);}catch(e){p={};}}
  var body = {
    phone:phone,
    profile:{age:parseInt(p.age)||65,weight:p.weight||'65',height:p.height||'165',hasChronic:!!p.hasChronic,name:p.name||''},
    healthData:{heartRate:hr,bloodPressure:bp,bloodOxygen:ox,bloodSugar:sugar},
    doctorNotes:notes
  };
  var result = await api('POST','/generate-prescription',body);
  if(result.error){document.getElementById('rx-result').innerHTML='<div style="color:red;padding:10px;">错误: '+esc(result.error)+'</div>';return;}
  window._genRx = result;
  displayRx(result);
}

function displayRx(rx) {
  document.getElementById('rx-result').innerHTML =
    '<div class="rx-card"><div class="rx-header"><div class="rx-doctor"><div>生成时间: '+new Date().toLocaleString('zh-CN')+'</div></div></div>'+
    '<div style="margin-bottom:12px;"><strong>运动目标:</strong> '+esc(rx.goal||'改善心肺功能')+'</div>'+
    '<div style="margin-bottom:8px;"><strong>运动强度:</strong> '+esc(rx.intensity||'中低强度')+' | 目标心率: ≤'+(rx.maxHeartRate||120)+' bpm</div>'+
    '<div style="margin-bottom:8px;"><strong>频率:</strong> '+esc(rx.frequency||'每周5次')+' | 单次时长: '+esc(rx.duration||'30分钟')+'</div>'+
    '<div class="rx-items">'+(rx.items||[]).map(function(i){return '<div class="rx-item"><div class="rx-item-name">'+(i.icon||'🏃')+' '+esc(i.name)+'</div><div class="rx-item-detail">'+esc(i.detail)+'</div></div>';}).join('')+'</div>'+
    (rx.cautions?'<div class="rx-caution">⚠️ '+esc(rx.cautions)+'</div>':'')+
    (rx.dietAdvice?'<div style="margin-top:8px;background:#fff8f0;border:1px solid #fce4d6;border-radius:8px;padding:10px;"><div style="font-weight:600;">🥗 营养建议</div><div style="font-size:13px;margin-top:4px;">'+esc(rx.dietAdvice)+'</div></div>':'')+
    '</div>';
}

async function savePrescription() {
  var rx = window._genRx;
  if(!rx){toast('请先生成处方');return;}
  var phone = document.getElementById('rx-phone').value;
  var notes = document.getElementById('rx-notes').value;
  var result = await api('POST','/prescription/save',{phone:phone,prescription:rx,doctorNotes:notes});
  if(result.ok){toast('处方已保存 ✅');}else{toast('保存失败: '+(result.error||'未知错误'));}
}


// Services management page
pages.services = async function() {
  var app = document.getElementById('admin-app');
  app.innerHTML = sidebarHtml('services')+topbarHtml('付费管理')+'<div class="admin-card"><div class="admin-card-title">付费服务项目</div>'+
    '<div style="margin-bottom:12px;display:flex;gap:8px;"><button class="btn-admin btn-admin-primary" id="btn-new-service">+ 新建服务</button></div>'+
    '<div id="services-list"><div class="chart-placeholder">加载中...</div></div></div></div>';
  setupNav();
  document.getElementById('btn-new-service').onclick = showNewServiceForm;
  loadServices();
};

async function loadServices() {
  var d = await api('GET','/services');
  if(d.data&&d.data.length) {
    var html = '<table class="admin-table"><tr><th>名称</th><th>费用</th><th>参与人数</th><th>上限</th><th>状态</th><th>操作</th></tr>'+
      d.data.map(function(s){return '<tr><td>'+esc(s.name)+'</td><td>¥'+esc(s.price)+'</td><td>'+(s.enrolled||0)+'</td><td>'+s.maxParticipants+'</td><td>'+(s.active===false?'<span class="badge badge-gray">已下架</span>':'<span class="badge badge-green">上架中</span>')+'</td><td><button class="btn-admin btn-admin-sm btn-admin-primary edit-svc" data-id="'+esc(s.id)+'">编辑</button><button class="btn-admin btn-admin-sm btn-admin-danger del-svc" data-id="'+esc(s.id)+'">删除</button></td></tr>';
      }).join('')+'</table>';
    document.getElementById('services-list').innerHTML = html;
    document.querySelectorAll('.edit-svc').forEach(function(el){el.onclick=function(){showEditServiceForm(this.getAttribute('data-id'));};});
    document.querySelectorAll('.del-svc').forEach(function(el){el.onclick=function(){deleteService(this.getAttribute('data-id'));};});
  } else {
    document.getElementById('services-list').innerHTML = '<div class="chart-placeholder">暂无服务，点击上方按钮创建</div>';
  }
}

function showNewServiceForm() {
  document.getElementById('services-list').innerHTML = '<div class="admin-card" style="padding:0;border:2px solid var(--primary);"><div style="padding:16px;"><h3 style="margin-bottom:12px;">新建付费服务</h3>'+
    '<div class="form-group"><label>服务名称</label><input id="svc-name" placeholder="如：私人健康师" /></div>'+
    '<div class="form-row-grid"><div class="form-group"><label>费用 (元)</label><input id="svc-price" type="number" placeholder="如：199" /></div>'+
    '<div class="form-group"><label>参与人数上限</label><input id="svc-max" type="number" placeholder="如：100" /></div></div>'+
    '<div class="form-group"><label>服务描述</label><textarea id="svc-desc" placeholder="描述服务内容..."></textarea></div>'+
    '<div style="display:flex;gap:8px;"><button class="btn-admin btn-admin-primary" id="svc-save">保存</button><button class="btn-admin btn-admin-ghost" id="svc-cancel">取消</button></div></div></div>';
  document.getElementById('svc-save').onclick = async function() {
    var name = document.getElementById('svc-name').value.trim();
    var price = document.getElementById('svc-price').value;
    var maxP = parseInt(document.getElementById('svc-max').value)||100;
    var desc = document.getElementById('svc-desc').value.trim();
    if(!name||!price){toast("请填写名称和费用");return;}
    var result = await api('POST','/service/create',{name:name,price:parseFloat(price),description:desc,maxParticipants:maxP});
    if(result.ok){toast("服务创建成功 ✅");loadServices();}else{toast("创建失败: "+(result.error||""));}
  };
  document.getElementById('svc-cancel').onclick = loadServices;
}

function showEditServiceForm(id) {
  api('GET','/services').then(function(d){
    var s = d.data.find(function(x){return x.id===id;});
    if(!s){toast("服务不存在");return;}
    document.getElementById('services-list').innerHTML = '<div class="admin-card" style="padding:0;border:2px solid var(--primary);"><div style="padding:16px;"><h3 style="margin-bottom:12px;">编辑: '+esc(s.name)+'</h3>'+
      '<div class="form-group"><label>服务名称</label><input id="svc-name" value="'+esc(s.name)+'" /></div>'+
      '<div class="form-row-grid"><div class="form-group"><label>费用 (元)</label><input id="svc-price" type="number" value="'+s.price+'" /></div>'+
      '<div class="form-group"><label>参与人数上限</label><input id="svc-max" type="number" value="'+s.maxParticipants+'" /></div></div>'+
      '<div class="form-group"><label>服务描述</label><textarea id="svc-desc">'+esc(s.description||"")+'</textarea></div>'+
      '<div class="form-group"><label><input type="checkbox" id="svc-active" '+(s.active!==false?'checked':'')+' /> 上架中</label></div>'+
      '<div style="display:flex;gap:8px;"><button class="btn-admin btn-admin-primary" id="svc-update">保存修改</button><button class="btn-admin btn-admin-ghost" id="svc-cancel2">取消</button></div></div></div>';
    document.getElementById('svc-update').onclick = async function() {
      var name = document.getElementById('svc-name').value.trim();
      var price = document.getElementById('svc-price').value;
      var maxP = parseInt(document.getElementById('svc-max').value)||100;
      var desc = document.getElementById('svc-desc').value.trim();
      var active = document.getElementById('svc-active').checked;
      if(!name||!price){toast("请填写名称和费用");return;}
      var result = await api('POST','/service/update',{id:id,name:name,price:parseFloat(price),description:desc,maxParticipants:maxP,active:active});
      if(result.ok){toast("更新成功 ✅");loadServices();}else{toast("更新失败: "+(result.error||""));}
    };
    document.getElementById('svc-cancel2').onclick = loadServices;
  });
}

async function deleteService(id) {
  if(!confirm("确定删除此服务？")) return;
  var result = await api('POST','/service/delete',{id:id});
  if(result.ok){toast("已删除");loadServices();}else{toast("删除失败: "+(result.error||""));}
}


// Coins management page
pages.coins = async function() {
  var app = document.getElementById('admin-app');
  app.innerHTML = sidebarHtml('coins')+topbarHtml('健康币管理')+'<div id="coins-stats"></div><div class="admin-card"><div class="admin-card-title">用户健康币</div><div id="coins-list"><div class="chart-placeholder">加载中...</div></div></div><div class="admin-card"><div class="admin-card-title">充值记录</div><div id="coin-records"><div class="chart-placeholder">加载中...</div></div></div></div></div>';
  setupNav();
  loadCoinData();
};

async function loadCoinData() {
  try {
    var d = await api('GET','/coins');
    if(!d || d.error) {
      document.getElementById('coins-stats').innerHTML = '<div class="admin-card" style="text-align:center;color:var(--gray);">数据加载失败，请刷新页面重试</div>';
      return;
    }
    var totalUsers = d.data ? d.data.length : 0;
    var coinUsers = 0, totalCoins = 0, maxCoins = 0;
    if(d.data) {
      d.data.forEach(function(u){
        var c = u.coins||0;
        totalCoins += c;
        if(c > 0) coinUsers++;
        if(c > maxCoins) maxCoins = c;
      });
    }
    var avgCoins = totalUsers > 0 ? (totalCoins / totalUsers).toFixed(1) : 0;
    document.getElementById('coins-stats').innerHTML = '<div class="stats-grid">'+
      '<div class="stat-card orange"><div class="stat-label">总用户数</div><div class="stat-value">'+totalUsers+'</div></div>'+
      '<div class="stat-card green"><div class="stat-label">持币用户</div><div class="stat-value">'+coinUsers+'</div></div>'+
      '<div class="stat-card blue"><div class="stat-label">总健康币</div><div class="stat-value">'+totalCoins+'</div></div>'+
      '<div class="stat-card purple"><div class="stat-label">平均健康币</div><div class="stat-value">'+avgCoins+'</div></div></div>';
    if(d.data&&d.data.length) {
      var html = '<table class="admin-table"><tr><th>手机号</th><th>健康币</th><th>操作</th></tr>'+
        d.data.map(function(u){
          return '<tr><td>'+esc(u.phone)+'</td><td><strong>'+(u.coins||0)+'</strong> 枚</td><td><button class="btn-admin btn-admin-sm btn-admin-primary reset-coin" data-phone="'+esc(u.phone)+'">重置</button></td></tr>';
        }).join('')+'</table>';
      document.getElementById('coins-list').innerHTML = html;
      document.querySelectorAll('.reset-coin').forEach(function(el){
        el.onclick = function(){resetCoins(this.getAttribute('data-phone'));};
      });
    } else {
      document.getElementById('coins-list').innerHTML = '<div class="chart-placeholder">暂无用户数据</div>';
    }
    try {
      var r = await api('GET','/coin-records');
      if(r && r.data && r.data.length) {
        document.getElementById('coin-records').innerHTML = '<table class="admin-table"><tr><th>用户</th><th>类型</th><th>金额</th><th>支付方式</th><th>时间</th></tr>'+
          r.data.slice(0,50).map(function(rec){
            return '<tr><td>'+esc(rec.phone)+'</td><td>'+(rec.type==='recharge'?'充值':(rec.type==='admin_reset'?'管理员重置':rec.type))+'</td><td>'+(rec.amount||0)+'</td><td>'+(rec.method||'-')+'</td><td>'+(rec.time?new Date(rec.time).toLocaleString('zh-CN'):'-')+'</td></tr>';
          }).join('')+'</table>';
      } else {
        document.getElementById('coin-records').innerHTML = '<div class="chart-placeholder">暂无记录</div>';
      }
    } catch(e) {
      document.getElementById('coin-records').innerHTML = '<div class="chart-placeholder">暂无记录</div>';
    }
  } catch(e) {
    document.getElementById('coins-stats').innerHTML = '<div class="admin-card" style="text-align:center;color:var(--gray);">加载失败，请刷新页面</div>';
    document.getElementById('coins-list').innerHTML = '<div class="admin-card" style="text-align:center;color:var(--red);">无法连接到服务器</div>';
  }
}async function resetCoins(phone) {
  var amt = prompt("修改健康币数量(输入新数额):", "0");
  if(amt===null) return;
  var result = await api('POST','/coins/reset',{phone:phone,amount:parseInt(amt)||0});
  if(result.ok){toast("已重置");loadCoinData();}else{toast("失败: "+(result.error||""));}
}
pages.data = async function() {
  var app = document.getElementById('admin-app');
  app.innerHTML = sidebarHtml('data')+topbarHtml('健康数据监控')+'<div class="admin-card"><div class="admin-card-title">实时数据监控</div>'+
    '<div style="font-size:13px;color:var(--gray);margin-bottom:12px;">每5秒自动刷新，实时显示所有用户上传的健康数据</div>'+
    '<div id="live-monitor"><div class="chart-placeholder">加载中...</div></div></div></div></div>';
  setupNav();
  loadLiveData();
  // Auto refresh every 5 seconds
  if(window._dataRefresh) clearInterval(window._dataRefresh);
  window._dataRefresh = setInterval(loadLiveData, 5000);
};

// ========== 初始化 ==========
function init() {
  // Load admin user from localStorage
  var saved = localStorage.getItem('adminUser');
  if (saved) {
    adminUser = saved;
    navigate('dashboard');
  } else {
    navigate('login');
  }
}

// Handle hash changes
window.addEventListener('hashchange', function() {
  var hash = location.hash.slice(1);
  if (hash === '' || hash === '/login') {
    // Check login status
    var saved = localStorage.getItem('adminUser');
    if (saved) {
      adminUser = saved;
      navigate('dashboard');
    } else {
      var app = document.getElementById('admin-app');
      if (app && pages.login) pages.login(app, {});
    }
    return;
  }
  var parts = hash.slice(1).split('?');
  var path = parts[0];
  var params = {};
  if (parts[1]) {
    parts[1].split('&').forEach(function(kv) {
      var p = kv.split('=');
      params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
  }
  var fn = pages[path];
  if (fn) {
    var app = document.getElementById('admin-app');
    if (app) fn(app, params);
  } else {
    navigate('dashboard');
  }
});

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}


pages.activities = async function() {
  var app = document.getElementById('admin-app');
  app.innerHTML = sidebarHtml('activities')+topbarHtml('亲子活动')+'<div class="admin-card"><div class="admin-card-title">发布活动</div>'+
    '<div class="form-group"><label>活动名称</label><input id="act-name" placeholder="如：亲子健康挑战" /></div>'+
    '<div class="form-group"><label>活动描述</label><textarea id="act-desc" rows="2" placeholder="活动内容介绍"></textarea></div>'+
    '<div class="form-row-grid"><div class="form-group"><label>开始日期</label><input id="act-start" type="date" /></div>'+
    '<div class="form-group"><label>结束日期</label><input id="act-end" type="date" /></div></div>'+
    '<div class="form-row-grid"><div class="form-group"><label>打卡奖励 (健康币)</label><input id="act-checkin" type="number" value="5" /></div>'+
    '<div class="form-group"><label>任务奖励 (健康币)</label><input id="act-task" type="number" value="10" /></div></div>'+
    '<div class="form-group"><label>每日任务描述</label><input id="act-task-desc" placeholder="如：完成今日运动打卡" value="完成今日运动打卡" /></div>'+
    '<button class="btn-admin btn-admin-primary" id="act-publish">发布活动</button></div>'+
    '<div class="admin-card"><div class="admin-card-title">已发布活动</div><div id="activities-list"><div class="chart-placeholder">加载中...</div></div></div></div></div>';
  setupNav();
  loadActivities();
  document.getElementById('act-publish').onclick = async function(){
    var name = document.getElementById('act-name').value.trim();
    if(!name){ toast('请填写活动名称'); return; }
    var desc = document.getElementById('act-desc').value.trim();
    var start = document.getElementById('act-start').value;
    var end = document.getElementById('act-end').value;
    var checkinReward = parseInt(document.getElementById('act-checkin').value) || 5;
    var taskReward = parseInt(document.getElementById('act-task').value) || 10;
    var taskDesc = document.getElementById('act-task-desc').value.trim() || '完成今日健康任务';
    var res = await fetch('/api/activity/create', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,description:desc,startDate:start,endDate:end,checkinReward,taskReward,taskDescription:taskDesc}) });
    var d = await res.json();
    if(d.ok){ toast('活动已发布'); loadActivities(); }else{ toast('失败: '+(d.error||'')); }
  };
};
async function loadActivities() {
  var d = await fetch('/api/activities').then(function(r){return r.json();});
  if(d.data && d.data.length) {
    var html = '<table class="admin-table"><tr><th>名称</th><th>日期</th><th>打卡奖励</th><th>任务奖励</th><th>参与人数</th></tr>'+
      d.data.map(function(a){ return '<tr><td>'+esc(a.name)+'</td><td>'+(a.startDate||'')+' ~ '+(a.endDate||'')+'</td><td>'+a.checkinReward+' 币</td><td>'+a.taskReward+' 币</td><td>'+(a.participants||0)+'</td></tr>'; }).join('')+'</table>';
    document.getElementById('activities-list').innerHTML = html;
  } else {
    document.getElementById('activities-list').innerHTML = '<div class="chart-placeholder">暂无活动</div>';
  }
}


pages.volunteer = async function() {
  var app = document.getElementById('admin-app');
  app.innerHTML = sidebarHtml('volunteer')+topbarHtml('志愿报名')+
    '<div class="admin-card"><div class="admin-card-title">发布志愿活动</div>'+
    '<div class="form-group"><label>活动名称</label><input id="vol-name" placeholder="如：社区健康服务" /></div>'+
    '<div class="form-group"><label>活动描述</label><textarea id="vol-desc" rows="2" placeholder="活动内容介绍"></textarea></div>'+
    '<div class="form-row-grid"><div class="form-group"><label>服务地点</label><input id="vol-location" placeholder="如：社区中心" /></div>'+
    '<div class="form-group"><label>服务日期</label><input id="vol-date" type="date" /></div></div>'+
    '<div class="form-row-grid"><div class="form-group"><label>服务时间</label><input id="vol-time" placeholder="如：09:00-12:00" /></div>'+
    '<div class="form-group"><label>每小时奖励 (健康币)</label><input id="vol-reward" type="number" value="10" /></div></div>'+
    '<button class="btn-admin btn-admin-primary" id="vol-publish">发布活动</button></div>'+
    '<div class="admin-card"><div class="admin-card-title">已发布志愿活动</div><div id="vol-list"><div class="chart-placeholder">加载中...</div></div></div></div></div>';
  setupNav();
  loadVolunteerData();
  document.getElementById('vol-publish').onclick = async function(){
    var title = document.getElementById('vol-name').value.trim();
    if(!title){ toast('请填写活动名称'); return; }
    var description = document.getElementById('vol-desc').value.trim();
    var location = document.getElementById('vol-location').value.trim();
    var date = document.getElementById('vol-date').value;
    var time = document.getElementById('vol-time').value.trim();
    var rewardPerHour = parseInt(document.getElementById('vol-reward').value) || 10;
    var res = await fetch('/api/volunteer/create', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer admin-'+btoa(adminUser)}, body:JSON.stringify({title, description, location, date, time, rewardPerHour}) });
    var d = await res.json();
    if(d.ok){ toast('志愿活动已发布'); loadVolunteerData(); }else{ toast('失败: '+(d.error||'')); }
  };
};
async function loadVolunteerData() {
  var d = await api('GET', '/volunteer/data');
  if(d.data && d.data.length) {
    var html = '<table class="admin-table"><tr><th>名称</th><th>地点</th><th>日期</th><th>时间</th><th>奖励/时</th><th>报名人数</th></tr>'+
      d.data.map(function(v){ 
        var appCount = v.applicants ? v.applicants.length : 0;
        return '<tr><td>'+esc(v.title)+'</td><td>'+esc(v.location||'-')+'</td><td>'+(v.date||'-')+'</td><td>'+(v.time||'-')+'</td><td>'+v.rewardPerHour+' 币</td><td>'+appCount+' 人</td></tr>';
      }).join('')+'</table>'+
      d.data.map(function(v){
        if(!v.applicants || !v.applicants.length) return '';
        var r = '<div class="admin-card" style="margin-top:12px;"><div class="admin-card-title" style="font-size:14px;">📋 '+esc(v.title)+' - 报名列表</div><table class="admin-table"><tr><th>手机号</th><th>状态</th><th>服务时长</th><th>获得币</th><th>报名时间</th></tr>'+
          v.applicants.map(function(a){ 
            return '<tr><td>'+esc(a.phone)+'</td><td>'+(a.status==='pending'?'待确认':a.status==='approved'?'已通过':'已完成')+'</td><td>'+a.hours+' 小时</td><td>'+a.coinsEarned+' 币</td><td>'+(a.appliedAt?new Date(a.appliedAt).toLocaleString('zh-CN'):'-')+'</td></tr>';
          }).join('')+'</table></div>';
        return r;
      }).join('');
    document.getElementById('vol-list').innerHTML = html;
  } else {
    document.getElementById('vol-list').innerHTML = '<div class="chart-placeholder">暂无志愿活动，请发布新活动</div>';
  }
}
