
var fs = require("fs");
var base = "C:\\Users\\Lenovo\\Desktop\\yilu-sync\\yilu-sync";
var filenames = ["js/elderly-app.js", "js/children-app.js", "js/doctor-app.js"];

// Feature code: Emergency contacts page
var EMERGENCY_CONTACTS = `
PAGES['emergency-contacts'] = (app) => {
    setNavTitle('管理紧急联系人');
    loadEmergencyContactsPage(app);
};

async function loadEmergencyContactsPage(app) {
    try {
        var res = await fetch(API_BASE + '/api/emergency/contacts', {
            headers: { Authorization: 'Bearer ' + currentUser.token }
        });
        var data = await res.json();
        var contacts = data.contacts || [];
        app.innerHTML = '<div class="container"><div class="banner orange"><div class="emoji">📞</div><div><div class="t">紧急联系人</div><div class="s">添加您信任的联系人，紧急时一键呼叫</div></div></div>' +
            '<div class="card"><div class="card-title">我的紧急联系人</div><div id="ec-contacts-list">' +
            (contacts.length === 0 ? '<div class="text-muted" style="text-align:center;padding:15px;">暂无紧急联系人</div>' :
            contacts.map(function(c) {
                return '<div class="form-row" style="border-bottom:1px solid #f0f0f0;padding:8px 0;"><div class="avatar">👤</div><div style="flex:1;"><div style="font-weight:600;">' + escapeHtml(c.name) + '</div><div style="font-size:13px;color:var(--gray);">' + escapeHtml(c.phone) + '</div></div><button class="btn btn-danger ec-del-btn" data-phone="' + escapeHtml(c.phone) + '" style="padding:4px 8px;font-size:12px;">删除</button></div>';
            }).join('')) +
            '</div></div>' +
            '<div class="card"><div class="card-title">添加紧急联系人</div>' +
            '<div class="form-row"><div class="form-label">姓名</div><input id="ec-name" class="form-input" placeholder="联系人姓名" /></div>' +
            '<div class="form-row"><div class="form-label">手机号</div><input id="ec-phone" class="form-input" placeholder="11位手机号" /></div>' +
            '<button class="btn btn-primary btn-block" id="add-ec-btn">添加</button></div></div>';
        
        app.querySelectorAll('.ec-del-btn').forEach(function(el) {
            el.onclick = async function() {
                var phone = el.dataset.phone;
                if (!phone) return;
                var r2 = await modal({ title: '确认删除', content: '确定要删除该紧急联系人吗？', confirmColor: '#e8504a' });
                if (r2.confirm) {
                    try {
                        var r3 = await fetch(API_BASE + '/api/emergency/contacts/delete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentUser.token },
                            body: JSON.stringify({ phone: phone })
                        });
                        var d2 = await r3.json();
                        if (d2.ok) { toast('已删除'); loadEmergencyContactsPage(app); }
                        else toast(d2.error || '删除失败');
                    } catch(e) { toast('网络错误'); }
                }
            };
        });
        
        document.getElementById('add-ec-btn').onclick = async function() {
            var name = document.getElementById('ec-name').value.trim();
            var phone = document.getElementById('ec-phone').value.trim();
            if (!name || !phone) { toast('请填写完整信息'); return; }
            if (!/^1[0-9]{10}$/.test(phone)) { toast('请输入正确的手机号'); return; }
            try {
                var r4 = await fetch(API_BASE + '/api/emergency/contacts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentUser.token },
                    body: JSON.stringify({ name: name, phone: phone })
                });
                var d4 = await r4.json();
                if (d4.ok) { toast('添加成功'); loadEmergencyContactsPage(app); }
                else toast(d4.error || '添加失败');
            } catch(e) { toast('网络错误'); }
        };
    } catch(e) {
        app.innerHTML = '<div class="container"><div class="card"><div class="text-muted" style="text-align:center;padding:20px;">加载失败，请检查网络</div><button class="btn btn-primary btn-block" onclick="navigate(\'emergency\')">返回</button></div></div>';
        toast('网络错误');
    }
}
`;

// New PAGES.emergency code
var NEW_EMERGENCY = `
PAGES.emergency = (app) => {
    setNavTitle('紧急呼叫');
    (async function() {
    try {
        var res = await fetch(API_BASE + '/api/emergency/contacts', {
            headers: { Authorization: 'Bearer ' + (currentUser ? currentUser.token : '') }
        });
        var data = await res.json();
        var contacts = data.contacts || [];
        var contactBtns = contacts.map(function(c) {
            return '<button class="emergency-call-btn primary" data-tel="' + escapeHtml(c.phone) + '"><div class="avatar">👤</div><div class="info"><div class="name">' + escapeHtml(c.name) + '</div><div class="desc">' + escapeHtml(c.phone) + '</div></div><div class="call-ic">📞</div></button>';
        }).join('');
        app.innerHTML = '<div class="container"><div class="banner orange"><div class="emoji">🆘</div><div><div class="t">遇到紧急情况？直接呼叫</div><div class="s">点击下方按钮立即拨打</div></div></div>' +
        '<button class="emergency-call-btn danger" data-tel="120"><div class="avatar">🚑</div><div class="info"><div class="name">120 急救</div><div class="desc">自动共享位置</div></div><div class="call-ic">📞</div></button>' +
        contactBtns +
        '<button class="btn btn-ghost btn-block" id="manage-ec-btn" style="margin-top:8px;">📋 管理紧急联系人</button></div>';
    app.querySelectorAll('.emergency-call-btn').forEach(el => el.onclick = async () => { if ((await modal({ title: '确认呼叫', content: '拨打 ' + el.querySelector('.name').innerText, confirmColor: '#e8504a' })).confirm) location.href = 'tel:' + el.dataset.tel; });
    var manageBtn = document.getElementById('manage-ec-btn');
    if(manageBtn) manageBtn.onclick = function() { navigate('emergency-contacts'); };
    } catch(e) {
        app.innerHTML = '<div class="container"><div class="banner orange"><div class="emoji">🆘</div><div><div class="t">遇到紧急情况？直接呼叫</div><div class="s">点击下方按钮立即拨打</div></div></div>' +
        '<button class="emergency-call-btn danger" data-tel="120"><div class="avatar">🚑</div><div class="info"><div class="name">120 急救</div><div class="desc">自动共享位置</div></div><div class="call-ic">📞</div></button>' +
        '<button class="btn btn-ghost btn-block" id="manage-ec-btn-fb" style="margin-top:8px;">📋 管理紧急联系人</button></div>';
        app.querySelectorAll('.emergency-call-btn').forEach(el => el.onclick = async () => { if ((await modal({ title: '确认呼叫', content: '拨打 ' + el.querySelector('.name').innerText, confirmColor: '#e8504a' })).confirm) location.href = 'tel:' + el.dataset.tel; });
        var fbBtn = document.getElementById('manage-ec-btn-fb');
        if(fbBtn) fbBtn.onclick = function() { navigate('emergency-contacts'); };
    }
    })();
};
`;

// AI chat page
var AI_CHAT = `
PAGES['ai-chat'] = (app) => {
    setNavTitle('智能算法');
    var adviceText = '';
    var loading = false;
    app.innerHTML = '<div class="container"><div class="banner orange"><div class="emoji">🧠</div><div><div class="t">智能营养与运动建议</div><div class="s">基于您的健康数据提供个性化建议</div></div></div>' +
      '<div class="card"><div class="card-title">健康建议</div><div id="advice-content"><div class="text-muted" style="text-align:center;padding:20px;font-size:15px;">点击下方按钮，基于您的最新健康数据获取建议</div></div></div>' +
      '<div class="card"><button class="btn btn-primary btn-block" id="provide-data-btn">📊 提供健康数据</button></div>' +
      '<div class="card"><button class="btn btn-secondary btn-block" id="refresh-advice-btn">🔄 刷新建议</button></div></div>';
    
    app.querySelector('#provide-data-btn').onclick = async () => {
      if(!currentUser){toast('请先登录');return;}
      var today = new Date().toISOString().slice(0,10);
      var record = null;
      try {
        var r = await fetch(API_BASE + '/api/health-data/today', {headers:{Authorization:'Bearer '+currentUser.token}});
        var d = await r.json();
        if(d.data) record = d.data;
      } catch(e) {}
      
      if(!record) {
        try {
          if(typeof storage !== 'undefined' && storage.getDailyRecord) {
            record = storage.getDailyRecord(today);
          }
        } catch(e) {}
      }
      
      if(!record) {
        toast('今日尚未录入健康数据，请先录入');
        navigate('data-entry');
        return;
      }
      
      var profile = null;
      try {
        var p = await fetch(API_BASE + '/api/profile', {headers:{Authorization:'Bearer '+currentUser.token}});
        var pd = await p.json();
        if(pd.profile) profile = pd.profile;
      } catch(e) {}
      if(!profile) {
        try { var p2 = storage.getProfile(); if(p2 && p2.name) profile = p2; } catch(e) {}
      }
      
      loading = true;
      document.getElementById('advice-content').innerHTML = '<div class="chart-placeholder">🤔 正在分析您的健康数据...</div>';
      try {
        var body = {
          age: (profile && profile.age) || '',
          height: (profile && profile.height) || '',
          weight: (profile && profile.weight) || '',
          bloodPressure: (record.bp || record.bloodPressure) || '',
          heartRate: record.heartRate || '',
          bloodOxygen: record.bloodOxygen || '',
          bloodSugar: record.bloodSugar || '',
          chronicDiseases: (profile && profile.hasChronic) ? '有慢性病史' : ''
        };
        var res = await fetch(API_BASE + '/api/nutrition-advice', {
          method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentUser.token},
          body:JSON.stringify(body)
        });
        var result = await res.json();
        if(result.ok && result.advice) {
          adviceText = result.advice;
          var formatted = adviceText.replace(/\\n/g, '<br>');
          document.getElementById('advice-content').innerHTML = '<div class="prescription-box" style="border-color:var(--orange);background:var(--orange-light);color:var(--text);font-size:15px;line-height:1.8;">' + formatted + '</div>';
          toast('建议已生成');
        } else {
          document.getElementById('advice-content').innerHTML = '<div class="text-muted" style="text-align:center;padding:20px;">暂时无法生成建议，请稍后再试</div>';
          toast('生成失败');
        }
      } catch(e) {
        document.getElementById('advice-content').innerHTML = '<div class="text-muted" style="text-align:center;padding:20px;">网络错误，请重试</div>';
        toast('网络错误');
      }
      loading = false;
    };
    
    app.querySelector('#refresh-advice-btn').onclick = () => {
      if(adviceText) {
        var formatted = adviceText.replace(/\\n/g, '<br>');
        document.getElementById('advice-content').innerHTML = '<div class="prescription-box" style="border-color:var(--orange);background:var(--orange-light);color:var(--text);font-size:15px;line-height:1.8;">' + formatted + '</div>';
        toast('已刷新');
      } else {
        toast('暂无建议，请先提供健康数据');
      }
    };
};
`;

// searchFriend function
var SEARCH_FRIEND = `
async function searchFriend() {
  var input = document.getElementById('friend-search-input');
  var resultDiv = document.getElementById('search-result');
  if(!input||!resultDiv) return;
  var phone = input.value.trim();
  if(!phone) { toast('请输入手机号'); return; }
  if(!currentUser){toast('请先登录');return;}
  resultDiv.innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;">搜索中...</div>';
  try {
    var res = await fetch(API_BASE + '/api/user/search?phone=' + encodeURIComponent(phone), {
      headers: { Authorization: 'Bearer ' + currentUser.token }
    });
    var data = await res.json();
    if(data.user) {
      var u = data.user;
      var roleLabel = u.role || '普通用户';
      if(roleLabel === '银龄用户') roleLabel = '老年端用户';
      else if(roleLabel === '子女群体') roleLabel = '子女端用户';
      else if(roleLabel === '医生与营养师') roleLabel = '营养师端用户';
      var nickname = '';
      try { 
        var pp = typeof u.data && u.data.profile && typeof u.data.profile === 'string' ? JSON.parse(u.data.profile) : (typeof u.data === 'object' && u.data ? u.data.profile || {} : {}); 
        nickname = pp.name || ''; 
      } catch(e) {}
      resultDiv.innerHTML = '<div class="list-item" style="cursor:default;"><div class="avatar">👤</div><div class="list-content"><div class="list-name">' + (nickname ? escapeHtml(nickname) + ' (' + escapeHtml(phone) + ')' : escapeHtml(phone)) + '</div><div class="list-desc" style="font-size:12px;color:var(--gray);">' + roleLabel + '</div></div><button class="btn btn-primary" id="add-friend-btn" style="padding:4px 10px;font-size:13px;">添加好友</button></div>';
      document.getElementById('add-friend-btn').onclick = async function() {
        if(!currentUser){toast('请先登录');return;}
        try {
          var r = await fetch(API_BASE + '/api/friend/request', {
            method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + currentUser.token},
            body:JSON.stringify({toPhone: phone})
          });
          var d = await r.json();
          if(d.ok) { toast('好友请求已发送'); resultDiv.innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;color:var(--green);">好友请求已发送</div>'; }
          else toast(d.error || '添加失败');
        } catch(e) { toast('网络错误'); }
      };
    } else {
      resultDiv.innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;">未找到该用户</div>';
    }
  } catch(e) {
    resultDiv.innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;">网络错误</div>';
    toast('网络错误');
  }
}
`;

// Process all 3 files
for (var fi = 0; fi < filenames.length; fi++) {
  var filepath = base + '\\' + filenames[fi];
  var code = fs.readFileSync(filepath, 'utf8');
  
  // 1. Replace PAGES.emergency (known range)
  var emStart = code.indexOf('PAGES.emergency = (app) => {');
  var emEnd = code.indexOf('PAGES.monitor = (app) => {');
  if (emStart >= 0 && emEnd >= 0) {
    code = code.substring(0, emStart) + NEW_EMERGENCY + code.substring(emEnd);
  }
  
  // 2. Insert emergency contacts page after PAGES.emergency (before PAGES.monitor)
  var monStart = code.indexOf('PAGES.monitor = (app) => {');
  if (monStart >= 0) {
    code = code.substring(0, monStart) + EMERGENCY_CONTACTS + '\n' + code.substring(monStart);
  }
  
  // 3. Insert AI chat page before PAGES.me
  var meStart = code.indexOf('PAGES.me = (app) => {');
  if (meStart >= 0) {
    code = code.substring(0, meStart) + '\n' + AI_CHAT + '\n' + code.substring(meStart);
  }
  
  // 4. Insert searchFriend function before function init()
  var initStart = code.indexOf('function init()');
  if (initStart >= 0) {
    code = code.substring(0, initStart) + SEARCH_FRIEND + '\n\n' + code.substring(initStart);
  }
  
  fs.writeFileSync(filepath, code, 'utf8');
  console.log(filenames[fi] + ' updated, now ' + code.split('\\n').length + ' lines');
}
console.log('All files updated!');
