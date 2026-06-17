// ========== 配置 ==========
const API_BASE = '';
let currentUser = null;

// ========== 本地存储 ==========
const KEYS = {
    PROFILE: 'profile',
    SIGN_HISTORY: 'signHistory',
    PRESCRIPTION: 'prescription',
    MESSAGES: 'messages',
    CONTACTS: 'contacts',
    HEALTH_DATA: 'healthData',
    DAILY_RECORDS: 'dailyRecords',
    FONT_SIZE: 'msgFontSize'
};

const lsGet = (k, def = null) => {
    try {
        const v = localStorage.getItem(k);
        if (v === null) return def;
        const parsed = JSON.parse(v);
        if (k === KEYS.SIGN_HISTORY && !Array.isArray(parsed)) return [];
        if (k === KEYS.DAILY_RECORDS && (parsed === null || typeof parsed !== 'object')) return {};
        if (k === KEYS.MESSAGES && (parsed === null || typeof parsed !== 'object')) return {};
        if (k === KEYS.CONTACTS && !Array.isArray(parsed)) return null;
        return parsed;
    } catch (e) {
        return def;
    }
};
const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const storage = {
    getProfile: () => lsGet(KEYS.PROFILE),
    setProfile: (d) => { lsSet(KEYS.PROFILE, d); if (currentUser) syncToCloud(); },
    getSignHistory: () => { const h = lsGet(KEYS.SIGN_HISTORY, []); return Array.isArray(h) ? h : []; },
    isSignedToday() {
        const today = new Date().toISOString().slice(0,10);
        return this.getSignHistory().includes(today);
    },
    addSignToday() {
        const today = new Date().toISOString().slice(0,10);
        const h = this.getSignHistory();
        if (h.includes(today)) return false;
        h.push(today);
        lsSet(KEYS.SIGN_HISTORY, h);
        if (currentUser) syncToCloud();
        return true;
    },
    signStreak() {
        const h = this.getSignHistory().slice().sort();
        if (!h.length) return 0;
        let streak = 0, cur = new Date();
        while (true) {
            const d = cur.toISOString().slice(0,10);
            if (h.includes(d)) { streak++; cur.setDate(cur.getDate()-1); }
            else break;
        }
        return streak;
    },
    getPrescription: () => lsGet(KEYS.PRESCRIPTION),
    setPrescription: (d) => { lsSet(KEYS.PRESCRIPTION, d); if (currentUser) syncToCloud(); },
    generatePrescription(profile) {
        const p = profile || {};
        const age = parseInt(p.age || 60);
        const hasChronic = p.hasChronic;
        const maxHr = Math.round((220 - age) * 0.6);
        const items = ['太极拳', '慢走'];
        if (age < 70) items.push('八段锦');
        if (!hasChronic) items.push('健步走');
        return {
            doctor: '营养师，国家注册营养师',
            hospital: '黑石礁社区 · 健康服务中心',
            maxHeartRate: maxHr,
            items,
            frequency: hasChronic ? '每周 3 次' : '每周 5 次',
            duration: '每次 30 分钟',
            intensity: hasChronic ? '低强度有氧，严格控制心率' : '中低强度有氧，循序渐进',
            cautions: '避免剧烈弯腰、憋气；运动前热身 10 分钟。出现胸闷头晕立即停止。',
            createdAt: new Date().toISOString()
        };
    },
    getMessages(name) { return (lsGet(KEYS.MESSAGES, {}))[name] || []; },
    addMessage(name, msg) {
        const all = lsGet(KEYS.MESSAGES, {});
        const list = all[name] || [];
        list.push(msg);
        all[name] = list;
        lsSet(KEYS.MESSAGES, all);
        if (currentUser) syncToCloud();
    },
    getContacts() {
        const val = lsGet(KEYS.CONTACTS, null);
        if (val && Array.isArray(val)) return val;
        return [
            { name: '爸爸', avatar: '👨', bg: '', time: '刚刚', phone: '13800001234' },
            { name: '妈妈', avatar: '👩', bg: '', time: '10:25', phone: '13900005678' },
            { name: '叔叔', avatar: '👴', bg: '', time: '昨天', phone: '13800000001' },
            { name: '王教练', avatar: '🧑‍🏫', bg: '', time: '昨天', phone: '13800000002' },
            { name: '黑石礁社区', avatar: '🏘', bg: '', time: '2 天前', phone: '' }
        ];
    },
    getHealthData() {
        return lsGet(KEYS.HEALTH_DATA) || {
            heartRate: 76, bloodPressure: '125/80', bloodOxygen: 98,
            bloodSugar: 6.0, steps: 4820, sleepHours: 8.25, sleepScore: 85
        };
    },
    getDailyRecords() { return lsGet(KEYS.DAILY_RECORDS, {}); },
    getDailyRecord(date) { return this.getDailyRecords()[date] || null; },
    saveDailyRecord(date, rec) {
        const all = this.getDailyRecords();
        all[date] = { ...rec, ts: Date.now() };
        lsSet(KEYS.DAILY_RECORDS, all);
        if (currentUser) syncToCloud();
    },
    clearAll() { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); },
    getFontSize() {
        const size = lsGet(KEYS.FONT_SIZE, null);
        return size ? parseInt(size) : 18;
    },
    setFontSize(size) {
        lsSet(KEYS.FONT_SIZE, size);
        document.documentElement.style.setProperty('--msg-font-size', size + 'px');
    }
};

// ========== 工具 ==========
function toast(msg, ms = 1600) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 250);
    }, ms);
}
function modal({ title, content, showCancel = true, confirmText = '确定', cancelText = '取消', confirmColor }) {
    return new Promise(resolve => {
        const mask = document.createElement('div');
        mask.className = 'modal-mask';
        mask.innerHTML = `
            <div class="modal">
                <div class="modal-title">${escapeHtml(title)}</div>
                <div class="modal-content">${escapeHtml(content)}</div>
                <div class="modal-actions">
                    ${showCancel ? `<button class="modal-btn cancel">${escapeHtml(cancelText)}</button>` : ''}
                    <button class="modal-btn confirm" ${confirmColor ? `style="color:${confirmColor}"` : ''}>${escapeHtml(confirmText)}</button>
                </div>
            
            <div class="card"><div class="card-title">👴 老人看板</div><div id="elderly-dashboard"><div class="text-muted" style="text-align:center;padding:12px;">加载中...</div></div></div>
        <div class="card"><div class="card-title">已购课程</div><div id="elderly-purchases"><div class="text-muted" style="text-align:center;padding:12px;">加载中...</div></div></div></div>`;
        document.body.appendChild(mask);
        mask.querySelector('.confirm').onclick = () => { mask.remove(); resolve({ confirm: true }); };
        const cb = mask.querySelector('.cancel');
        if (cb) cb.onclick = () => { mask.remove(); resolve({ confirm: false }); };
    });
}
function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ========== 云端同步 ==========
async function syncToCloud() {
    if (!currentUser) return;
    const allData = {};
    for (const k of Object.values(KEYS)) allData[k] = lsGet(k, null);
    try {
        await fetch(`${API_BASE}/api/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}` },
            body: JSON.stringify({ allData })
        });
    } catch(e) { console.warn('同步失败', e); }
}
async function pullFromCloud() {
    if (!currentUser) return;
    try {
        const res = await fetch(`${API_BASE}/api/sync`, { headers: { 'Authorization': `Bearer ${currentUser.token}` } });
        if (res.ok) {
            const cloud = await res.json();
            for (const k of Object.values(KEYS)) if (cloud[k] !== undefined) lsSet(k, cloud[k]);
            toast('已同步最新数据');
            render();
        } else {
            console.warn('同步失败，状态码', res.status);
        }
    } catch(e) {
        console.warn('网络错误，使用本地数据', e);
    }
}

function loadSmartReminders() {
  var el = document.getElementById('smart-reminders');
  if(!el) return;
  var boundPhone = localStorage.getItem('boundElderlyPhone');
  if(!boundPhone){ el.innerHTML = '<div class="text-muted" style="text-align:center;padding:12px;font-size:13px;">请先绑定老人手机号，即可查看智能提醒</div>'; return; }
  if(typeof currentUser === 'undefined' || !currentUser){ el.innerHTML = '<div class="text-muted" style="text-align:center;padding:12px;">请先登录</div>'; return; }
  fetch(API_BASE+'/api/elderly/dashboard/'+encodeURIComponent(boundPhone),{
    headers:{'Authorization':'Bearer '+currentUser.token}
  }).then(function(r){return r.json();}).then(function(d){
    if(d.error){ el.innerHTML = '<div class="text-muted" style="text-align:center;padding:12px;color:var(--red);">'+d.error+'</div>'; return; }
    var h = '';
    var alerts = [];
    
    // 1. 课程通知
    var today = new Date().toISOString().slice(0,10);
    if(d.courses && d.courses.length > 0){
      alerts.push({type:'info', icon:'\uD83D\uDCDA', text:'\u4eca\u65e5\u6709 ' + d.courses.length + ' \u95e8\u8bfe\u7a0b\u5b89\u6392'});
    } else {
      alerts.push({type:'muted', icon:'\uD83D\uDCC5', text:'\u4eca\u65e5\u65e0\u8bfe\u7a0b\u5b89\u6392'});
    }
    
    // 2. 运动预警 - check todayRecord
    var rec = d.todayRecord || {};
    var hasExercise = rec.steps || rec.heartRate;
    if(!hasExercise){
      alerts.push({type:'warning', icon:'\u26A0\uFE0F', text:'\u4eca\u65e5\u5c1a\u672a\u8bb0\u5f55\u8fd0\u52a8\u6570\u636e\uff0c\u8bf7\u63d0\u9192\u8001\u4eba\u8fd0\u52a8'});
    } else {
      alerts.push({type:'success', icon:'\u2705', text:'\u4eca\u65e5\u5df2\u8bb0\u5f55\u8fd0\u52a8\u6570\u636e'});
    }
    
    // 3. 健康数据异常告警
    var issues = [];
    if(rec.bp){
      var bp = parseInt(rec.bp);
      if(bp > 140) issues.push('\u8840\u538b\u504f\u9ad8\uff08' + rec.bp + ' mmHg\uff09');
      else if(bp < 90) issues.push('\u8840\u538b\u504f\u4f4e\uff08' + rec.bp + ' mmHg\uff09');
    }
    if(rec.heartRate){
      var hr = parseInt(rec.heartRate);
      if(hr > 100) issues.push('\u5fc3\u7387\u8fc7\u5feb\uff08' + hr + ' \u6b21/\u5206\uff09');
      else if(hr < 60) issues.push('\u5fc3\u7387\u8fc7\u6162\uff08' + hr + ' \u6b21/\u5206\uff09');
    }
    if(rec.bloodOxygen){
      var bo = parseInt(rec.bloodOxygen);
      if(bo < 95) issues.push('\u8840\u6c27\u504f\u4f4e\uff08' + bo + '%\uff09');
    }
    if(rec.bloodSugar){
      var bs = parseFloat(rec.bloodSugar);
      if(bs > 7.0) issues.push('\u8840\u7cd6\u504f\u9ad8\uff08' + bs + ' mmol/L\uff09');
      else if(bs < 3.9) issues.push('\u8840\u7cd6\u504f\u4f4e\uff08' + bs + ' mmol/L\uff09');
    }
    if(issues.length > 0){
      alerts.push({type:'danger', icon:'\uD83D\uDEA8', text: issues.join('; ')});
    } else if(hasExercise) {
      alerts.push({type:'success', icon:'\u2705', text:'\u4eca\u65e5\u5065\u5eb7\u6570\u636e\u5747\u5728\u6b63\u5e38\u8303\u56f4\u5185'});
    }
    
    // 4. 运动处方
    if(d.prescription && d.prescription.items){
      alerts.push({type:'info', icon:'\uD83C\uDFC3', text:'\u5f53\u524d\u8fd0\u52a8\u65b9\u6848\uff1a' + (d.prescription.items||[]).map(function(x){return x.name||x;}).join('\u3001')});
    }
    
    // Render
    alerts.forEach(function(a){
      var bg = a.type === 'danger' ? '#fff0f0' : a.type === 'warning' ? '#fff8e8' : a.type === 'success' ? '#f0fff0' : '#f7f8fa';
      var color = a.type === 'danger' ? '#e8504a' : a.type === 'warning' ? '#e68a2e' : a.type === 'success' ? '#22a559' : '#666';
      h += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:6px;background:' + bg + ';border-radius:8px;font-size:13px;color:' + color + ';"><span>' + a.icon + '</span><span>' + a.text + '</span></div>';
    });
    
    el.innerHTML = h;
  });
}

function loadActivitiesList() {
  var el = document.getElementById('activity-section');
  if(!el) return;
  fetch(API_BASE + '/api/activities').then(function(r){return r.json();}).then(function(d){
    if(!d.data || !d.data.length){ el.innerHTML = '<div class="text-muted" style="text-align:center;padding:12px;font-size:13px;">暂无可报名的亲子活动</div>'; return; }
    var h = '';
    d.data.forEach(function(a){
      h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0f1f2;">' +
        '<div><div style="font-weight:600;font-size:14px;">' + escapeHtml(a.name) + '</div>' +
        '<div style="font-size:12px;color:#999;">' + (a.startDate||'') + ' ~ ' + (a.endDate||'') + '</div>' +
        '<div style="font-size:12px;color:#999;">打卡+' + a.checkinReward + '币 / 任务+' + a.taskReward + '币</div></div>' +
        '<button class="btn btn-primary" style="padding:6px 12px;font-size:13px;white-space:nowrap;" onclick="signupActivity(\'' + a.id + '\')">报名</button></div>';
    });
    el.innerHTML = h;
  });
}
window.signupActivity = async function(activityId) {
  if(!currentUser){ toast('\u8bf7\u5148\u767b\u5f55'); return; }
  var res = await fetch(API_BASE + '/api/activity/signup', { method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentUser.token}, body:JSON.stringify({activityId:activityId}) });
  var d = await res.json();
  if(d.ok){ toast('\u62a5\u540d\u6210\u529f'); navigate('activity',{id:activityId}); }else{ toast(d.error||'\u62a5\u540d\u5931\u8d25'); }
};

function renderElderlyDash() {
  var el = document.getElementById('elderly-dashboard');
  if(!el) return;
  var boundPhone = localStorage.getItem('boundElderlyPhone');
  if(!boundPhone){
    el.innerHTML = '<div style="display:flex;gap:8px;margin-bottom:8px;"><input id="bind-elderly-input" class="form-input" placeholder="输入老人手机号" style="flex:1;" /><button class="btn btn-primary" id="bind-elderly-btn" style="padding:6px 12px;white-space:nowrap;">绑定</button></div><div class="text-muted" style="text-align:center;font-size:13px;">绑定后查看老人今日健康数据与课程安排</div>';
    var btn = document.getElementById('bind-elderly-btn');
    if(btn) btn.onclick = function(){
      var phone = document.getElementById('bind-elderly-input').value.trim();
      if(!phone){ toast('请输入手机号'); return; }
      localStorage.setItem('boundElderlyPhone', phone);
      toast('已绑定');
      renderElderlyDash();
    };
    var inp = document.getElementById('bind-elderly-input');
    if(inp) inp.onkeypress = function(e){ if(e.key==='Enter' && document.getElementById('bind-elderly-btn')) document.getElementById('bind-elderly-btn').click(); };
    return;
  }
  if(typeof currentUser === 'undefined' || !currentUser){ el.innerHTML = '<div class="text-muted" style="text-align:center;padding:12px;">请先登录</div>'; return; }
  el.innerHTML = '<div class="text-muted" style="text-align:center;padding:12px;">加载中...</div>';
  fetch(API_BASE+'/api/elderly/dashboard/'+encodeURIComponent(boundPhone),{
    headers:{'Authorization':'Bearer '+currentUser.token}
  }).then(function(r){return r.json();}).then(function(d){
    if(d.error){
      el.innerHTML = '<div style="margin-bottom:8px;"><div class="text-muted" style="text-align:center;padding:12px;color:var(--red);">'+(d.error||'')+'</div><button class="btn btn-ghost btn-block" id="unbind-elderly-btn">解绑</button></div>';
      var ub=document.getElementById('unbind-elderly-btn');
      if(ub) ub.onclick=function(){localStorage.removeItem('boundElderlyPhone');renderElderlyDash();};
      return;
    }
    var h='';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><span style="font-weight:600;">📱 '+(d.name||d.phone)+'</span><button class="btn btn-ghost" onclick="renderElderlyDash()" style="padding:2px 10px;font-size:12px;">刷新</button></div>';
    h += '<div style="font-size:14px;font-weight:500;margin-bottom:6px;">基本健康信息</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">';
    var items = [
      {label:'\u8840\u538b',val:(d.healthData&&d.healthData.bloodPressure)||'--'},
      {label:'\u5fc3\u7387',val:(d.healthData&&d.healthData.heartRate)||'--'},
      {label:'\u8eab\u9ad8',val:(d.profile&&d.profile.height?d.profile.height+' cm':'--')},
      {label:'\u4f53\u91cd',val:(d.profile&&d.profile.weight?d.profile.weight+' kg':'--')}
    ];
    items.forEach(function(it){
      h += '<div style="background:#f7f8fa;border-radius:12px;padding:10px;text-align:center;"><div style="font-size:20px;font-weight:600;color:var(--primary);">'+it.val+'</div><div style="font-size:12px;color:var(--gray);margin-top:2px;">'+it.label+'</div></div>';
    });
    h += '</div>';
    if(d.todayRecord && Object.keys(d.todayRecord).length > 0){
      h += '<div style="font-size:14px;font-weight:500;margin-bottom:4px;margin-top:8px;">今日记录</div>';
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">';
      var todayItems = [];
      if(d.todayRecord.bp) todayItems.push({label:'\u8840\u538b',val:d.todayRecord.bp});
      if(d.todayRecord.heartRate) todayItems.push({label:'\u5fc3\u7387',val:d.todayRecord.heartRate});
      if(d.todayRecord.steps) todayItems.push({label:'\u6b65\u6570',val:d.todayRecord.steps});
      if(d.todayRecord.sleep) todayItems.push({label:'\u7761\u7720',val:d.todayRecord.sleep});
      if(d.todayRecord.bloodOxygen) todayItems.push({label:'\u8840\u6c27',val:d.todayRecord.bloodOxygen});
      if(d.todayRecord.bloodSugar) todayItems.push({label:'\u8840\u7cd6',val:d.todayRecord.bloodSugar});
      todayItems.forEach(function(it){
        h += '<div style="background:#e8f5e9;border-radius:10px;padding:8px;text-align:center;"><div style="font-size:18px;font-weight:600;color:var(--green);">'+it.val+'</div><div style="font-size:11px;color:var(--gray);">'+it.label+'</div></div>';
      });
      h += '</div>';
    }
    if(d.recentRecords && Object.keys(d.recentRecords).length > 0){
      h += '<div style="font-size:14px;font-weight:500;margin-bottom:4px;margin-top:8px;">历史记录</div>';
      var dates = Object.keys(d.recentRecords).reverse();
      dates.forEach(function(date){
        var rec = d.recentRecords[date];
        var parts = [];
        if(rec.bp) parts.push('\u8840\u538b:'+rec.bp);
        if(rec.heartRate) parts.push('\u5fc3\u7387:'+rec.heartRate);
        if(rec.steps) parts.push('\u6b65\u6570:'+rec.steps);
        if(parts.length){
          h += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f1f2;font-size:13px;"><span>'+date.slice(5)+'</span><span style="color:var(--gray);">'+parts.join(' ')+'</span></div>';
        }
      });
      h += '</div>';
    }
    if(d.courses && d.courses.length){
      h += '<div style="font-size:14px;font-weight:500;margin-bottom:4px;margin-top:8px;">课程安排</div>';
      d.courses.forEach(function(c){
        h += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:1px solid #f0f1f2;"><span>'+escapeHtml(c.name)+'</span><span style="color:var(--gray);">'+(c.time||'')+'</span></div>';
      });
    }
    el.innerHTML = h;
  });
}async function loginOrRegister(phone, password, isLogin) {
    const url = isLogin ? '/api/login' : '/api/register';
    const res = await fetch(`${API_BASE}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    currentUser = { phone, token: data.token, role: data.user.role || "银龄用户" };
    localStorage.setItem('user', JSON.stringify(currentUser));
    await pullFromCloud();
    navigate('home');
}
function logout() {
    currentUser = null;
    localStorage.removeItem('user');
    navigate('login');
}

// ========== 路由 ==========
const TABBAR_PAGES = ['home', 'messages', 'me'];
const TABBAR_LIST = [
    { key: 'home', text: '首页', icon: '🏠' },
    { key: 'messages', text: '消息', icon: '💬' },
    { key: 'me', text: '我的', icon: '👤' }
];
const PAGES = {};

function parseHash() {
    const h = (location.hash || '#/index').slice(2);
    const [path, query = ''] = h.split('?');
    const params = {};
    for (const kv of query.split('&')) {
        if (!kv) continue;
        const [k, v = ''] = kv.split('=');
        params[decodeURIComponent(k)] = decodeURIComponent(v);
    }
    return { path: path || 'index', params };
}
function navigate(path, params = {}) {
    const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    location.hash = `#/${path}${qs ? '?' + qs : ''}`;
}
function setNavTitle(title) { document.getElementById('navbar-title').textContent = title; }
function setNavRight(html, onClick) {
    const right = document.getElementById('navbar-right');
    if (html) {
        right.innerHTML = html;
        right.style.display = 'flex';
        if (onClick) right.onclick = onClick;
    } else {
        right.innerHTML = '';
        right.style.display = 'none';
    }
}
function render() {
    const { path, params } = parseHash();
    const fn = PAGES[path] || PAGES.index;
    const app = document.getElementById('app');
    const navbar = document.getElementById('navbar');
    const tabbar = document.getElementById('tabbar');
    app.innerHTML = '';
    if (path === 'index' || path === 'login' || path === 'register') {
        navbar.style.display = 'none';
        tabbar.classList.add('hidden');
    } else if (TABBAR_PAGES.includes(path)) {
        navbar.style.display = 'none';
        tabbar.classList.remove('hidden');
        [...tabbar.children].forEach(el => el.classList.toggle('active', el.dataset.tab === path));
    } else {
        navbar.style.display = 'flex';
        tabbar.classList.add('hidden');
    }
    fn(app, params);
    window.scrollTo(0,0);
}
window.addEventListener('hashchange', render);

// ========== 页面定义 ==========
PAGES.index = (app) => {
  // Auto-login: check if user is already logged in
  var savedUser = localStorage.getItem("user");
  if (savedUser) {
    try {
      var u = JSON.parse(savedUser);
      if (u && u.token) {
        // Already logged in, redirect to home
        navigate("home");
        return;
      }
    } catch(e) {}
  }
  // Render landing page
  app.innerHTML = '<div class="landing-page">'+
    '<div class="landing-inner">'+
      '<div class="landing-logo-wrap"><div class="landing-logo-circle"><img src="images/logo-desktop.png" alt="颐路相伴" style="width:110px;height:110px;"></div></div>'+
      '<div class="landing-title">\u9890\u8DEF\u76F8\u4F34</div>'+
      '<div class="landing-subtitle">\u94F6\u9F84\u8FD0\u52A8\u5065\u5EB7\u667A\u6167\u5E73\u53F0</div>'+
      '<div class="landing-subtitle second">\u966A\u60A8\u8D70\u597D\u6BCF\u4E00\u6B65\u5065\u5EB7\u4E4B\u8DEF</div>'+
      '<button class="landing-btn landing-btn-primary" id="start-btn">\u5F00\u59CB\u4F7F\u7528</button>'+
      '<button class="landing-btn landing-btn-secondary" id="first-time-btn">\u9996\u6B21\u4F7F\u7528\u00B7\u5F55\u5165\u8D44\u6599</button>'+
      '<div class="landing-footer">\u4E13\u4E1A\u533B\u5E08\u6307\u5BFC \u00B7 \u5C31\u8FD1\u793E\u533A\u670D\u52A1 \u00B7 \u5B50\u5973\u5B9E\u65F6\u5173\u7231</div>'+
    '</div></div>';
  app.querySelector('#start-btn').onclick = function(){
    // Double-check if user is logged in
    try {
      var u = JSON.parse(localStorage.getItem("user"));
      if(u && u.token) { navigate("home"); return; }
    } catch(e) {}
    navigate("login");
  };
  app.querySelector('#first-time-btn').onclick = function(){ navigate("register"); };
};

PAGES.login = (app) => {
  // Reuse register page with isLogin=true
  PAGES.register(app, true);
};;
PAGES.register = (app, initialLogin) => {
  let isLogin = initialLogin === true;
  const renderForm = () => {
    app.innerHTML = '<div class="container" style="margin-top:40px;"><div class="card"><div class="card-title">'+(isLogin?'登录':'注册')+'</div>'+
      '<div class="form-row"><div class="form-label">手机号</div><input id="phone" class="form-input" placeholder="11位手机号" /></div>'+
      '<div class="form-row"><div class="form-label">密码</div><input id="password" type="password" class="form-input" placeholder="密码" /></div>'+
      (!isLogin?'<div class="form-row"><div class="form-label">选择身份</div><select id="role-select" class="form-input"><option value="银龄用户">银龄用户</option><option value="医生与营养师">医生与营养师</option><option value="子女群体">子女群体</option></select></div>':'')+
      '<button class="btn btn-primary btn-block" id="submit-btn">'+(isLogin?'登录':'注册')+'</button>'+
      '<div class="text-muted mt-20" style="text-align:center;"><span id="toggle-mode">'+(isLogin?'没有账号？去注册':'已有账号？去登录')+'</span></div>'+
    '</div></div>';
    app.querySelector('#submit-btn').onclick = async () => {
      const phone = app.querySelector('#phone').value.trim();
      const pwd = app.querySelector('#password').value.trim();
      if (!phone || !pwd) { toast("请填写完整"); return; }
      try {
        if (isLogin) {
          await loginOrRegister(phone, pwd, true);
        } else {
          var sel = document.getElementById("role-select");
          var role = sel ? sel.value : "普通用户";
          await registerWithRole(phone, pwd, role);
        }
      } catch(e) { toast(e.message); }
    };
    app.querySelector('#toggle-mode').onclick = () => { isLogin = !isLogin; renderForm(); };
  };
  renderForm();
};

async function registerWithRole(phone, password, role) {
  const res = await fetch(API_BASE+"/api/register", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({phone,password,role})
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error);
  currentUser = {phone, token:data.token, role:data.user.role};
  localStorage.setItem("user", JSON.stringify(currentUser));
  await pullFromCloud();
  navigate("home");
}

// 健康首页 (图片路径已修正)
PAGES.home = (app) => {
    const p = storage.getProfile();
    const name = (p && p.name) ? p.name : '家人';
    const signed = storage.isSignedToday();
    const streak = storage.signStreak();
    
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">颐路相伴</div><div class="header-subtitle">您好，${escapeHtml(name)}</div></div></div>
            <div class="card"><div class="card-title">今日打卡</div><div class="row space-between"><div><div class="fs-40 fw-600 text-orange" id="sign-status">${signed ? '今日已签到' : '还未签到'}</div><div class="text-muted mt-12">连续签到 <span id="streak-num">${streak}</span> 天</div></div><button class="btn btn-primary" id="sign-btn">${signed ? '已签到' : '去签到'}</button></div><div class="progress orange mt-20"><div id="sign-bar" style="width:${signed ? 100 : 30}%"></div></div></div>
            <div class="card"><div class="card-title">老人看板</div><div id="elderly-dashboard"><div class="text-muted" style="text-align:center;padding:12px;">加载中...</div></div></div>
            <div class="card"><div class="card-title">智能待办提醒</div><div id="smart-reminders"><div class="text-muted" style="text-align:center;padding:12px;">加载中...</div></div></div>
            <div class="card"><div class="card-title">亲子互动活动</div><div id="activity-section"><div class="text-muted" style="text-align:center;padding:12px;">加载中...</div></div></div>
        </div>`;
    
    app.querySelectorAll('[data-go]').forEach(el => el.onclick = () => navigate(el.dataset.go));
    
    // 从服务器加载健康币
    if(typeof currentUser !== 'undefined' && currentUser){
        fetch(API_BASE+"/api/coins",{headers:{Authorization:"Bearer "+currentUser.token}}).then(function(r){return r.json();}).then(function(d){
            var el = document.getElementById("coin-count-me");
            if(el) el.textContent = (d.coins||0) + " 枚";
        });
    }
    
    // Load elderly purchase records
    if(typeof currentUser !== 'undefined' && currentUser){
        fetch(API_BASE + '/api/my-elderly-purchases', {
            headers: { 'Authorization': 'Bearer ' + currentUser.token }
        }).then(function(r){return r.json();}).then(function(d){
            var el = document.getElementById('elderly-purchases');
            if(!el) return;
            if(d.data && d.data.length){
                var h = '';
                d.data.forEach(function(p){
                    h += '<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f1f2;"><span>'+(p.elderlyPhone||'')+'</span><span style="font-size:13px;color:var(--primary);">'+(p.courseName||'')+'</span></div>';
                });
                el.innerHTML = h;
            } else {
                el.innerHTML = '<div class="text-muted" style="text-align:center;padding:12px;">无</div>';
            }
        });
    }
    
    // Load elderly dashboard
    renderElderlyDash();
    
    // 智能待办提醒
    loadSmartReminders();
    
    // 加载亲子活动
    loadActivitiesList();
    
    // 签到按钮
    app.querySelector('#sign-btn').onclick = () => {
        if (storage.isSignedToday()) { toast('今天已经签到了'); return; }
        if (storage.addSignToday()) {
            if(currentUser){
                fetch(API_BASE+"/api/coins/signin",{method:"POST",headers:{Authorization:"Bearer "+currentUser.token}}).then(function(r){return r.json();}).then(function(d){
                    if(d.ok){console.log("签到+10健康币");}
                });
            }
            toast('签到成功 +10 健康币');
            app.querySelector('#sign-status').textContent = '今日已签到';
            app.querySelector('#streak-num').textContent = storage.signStreak();
            app.querySelector('#sign-bar').style.width = '100%';
            app.querySelector('#sign-btn').textContent = '已签到';
        }
    };
};

;

PAGES.data = (app) => {
    app.innerHTML = '<div class="container"><div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">数据</div><div class="header-subtitle">等待添加新内容</div></div></div></div>';
};

;

;

// 单聊相关
const DEFAULT_GREETINGS = { '爸爸': [{text:'爸，今天身体怎么样？',mine:false}], '妈妈': [{text:'妈，注意休息',mine:false}] };
function latestMessageDescapeHtml(name) {
    const msgs = storage.getMessages(name);
    if (msgs.length) return msgs[msgs.length-1].text || '';
    const g = DEFAULT_GREETINGS[name];
    return g ? g[g.length-1].text : '';
}

function showEditContactModal(nm){
  var ct=storage.getContacts();
  var i=ct.findIndex(function(c){return c.name===nm;});
  if(i<0){toast('联系人不存在');return;}
  var co=ct[i];
  var mk=document.createElement('div'); mk.className='modal-mask';
  mk.innerHTML='<div class="modal"><div class="modal-title">编辑联系人</div><div style="padding:8px;"><input id="edit-name" class="form-input" style="margin-bottom:8px;" value="'+escapeHtml(co.name)+'"><input id="edit-phone" class="form-input" style="margin-bottom:8px;" value="'+escapeHtml(co.phone||'')+'"><select id="edit-relation" class="form-input" style="margin-bottom:8px;"><option value="\u957f\u8f88"'+(co.relation==='\u957f\u8f88'?' selected':'')+'>\u957f\u8f88</option><option value="\u7236\u6bcd"'+(co.relation==='\u7236\u6bcd'?' selected':'')+'>\u7236\u6bcd</option><option value="\u540c\u8f88"'+(co.relation==='\u540c\u8f88'?' selected':'')+'>\u540c\u8f88</option><option value="\u665a\u8f88"'+(co.relation==='\u665a\u8f88'?' selected':'')+'>\u665a\u8f88</option><option value="\u5176\u4ed6"'+(co.relation==='\u5176\u4ed6'?' selected':'')+'>\u5176\u4ed6</option></select></div><div class="modal-actions"><button class="modal-btn cancel">\u53d6\u6d88</button><button class="modal-btn confirm" style="color:var(--orange);">\u4fdd\u5b58</button></div></div>';
  document.body.appendChild(mk);
  mk.querySelector('.cancel').onclick=function(){mk.remove();};
  mk.querySelector('.confirm').onclick=function(){
    var ni=mk.querySelector('#edit-name').value.trim();
    if(!ni){toast('\u8bf7\u8f93\u5165\u59d3\u540d');return;}
    ct[i].name=ni;
    ct[i].phone=mk.querySelector('#edit-phone').value.trim();
    ct[i].relation=mk.querySelector('#edit-relation').value;
    lsSet(KEYS.CONTACTS,ct);
    if(currentUser)syncToCloud();
    toast('\u5df2\u66f4\u65b0');
    mk.remove();
    render();
  };
}

async function showAddContactModal() {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `<div class="modal"><div class="modal-title">添加联系人</div><div style="padding:8px;"><input id="new-name" placeholder="姓名" class="form-input" style="margin-bottom:12px;"><input id="new-phone" placeholder="手机号" class="form-input" style="margin-bottom:8px;"><select id="new-relation" class="form-input" style="margin-bottom:8px;"><option value="长辈">长辈</option><option value="父母">父母</option><option value="同辈">同辈</option><option value="晚辈">晚辈</option><option value="其他">其他</option></select><input id="new-avatar" placeholder="头像表情" class="form-input" value="👤"></div><div class="modal-actions"><button class="modal-btn cancel">取消</button><button class="modal-btn confirm" style="color:var(--orange);">添加</button></div></div>`;
    document.body.appendChild(mask);
    const nameInput = mask.querySelector('#new-name');
    const avatarInput = mask.querySelector('#new-avatar');
    mask.querySelector('.cancel').onclick = () => mask.remove();
    mask.querySelector('.confirm').onclick = () => {
        const name = nameInput.value.trim();
        if (!name) { toast('请填写姓名'); mask.remove(); return; }
        const contacts = storage.getContacts();
        if (contacts.some(c => c.name === name)) { toast('联系人已存在'); mask.remove(); return; }
        contacts.push({ name, avatar: avatarInput.value.trim() || '👤', bg: '', time: '刚刚', phone: '' });
        lsSet(KEYS.CONTACTS, contacts);
        if (currentUser) syncToCloud();
        toast(`已添加联系人 ${name}`);
        mask.remove();
        render();
    };
}
PAGES.messages = (app) => {
    const contacts = storage.getContacts();
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">消息</div><div class="header-subtitle">${contacts.length} 位联系人</div></div><div class="header-add" id="add-contact-btn">＋</div></div>
            <div class="card" style="margin-bottom:8px;"><div class="form-row" style="border:none;"><span>🔍</span><input id="friend-search-input" class="form-input" placeholder="输入手机号搜索好友" style="flex:1;" /><button class="btn btn-primary" id="search-friend-btn" style="padding:6px 12px;">搜索</button></div><div id="search-result"></div></div><div class="banner orange" id="group-list-btn"><div class="emoji">👥</div><div><div class="t">群聊</div><div class="s">点击查看我的群聊</div></div></div>
            <div class="banner" id="assistant-btn"><div class="emoji">🤖</div><div><div class="t">安全助手</div><div class="s">智能健康顾问（支持语音）</div></div></div><div class="banner orange" id="ai-algorithm-btn" style="margin-top:4px;"><div class="emoji">🧠</div><div><div class="t">智能算法</div><div class="s">基于健康数据的营养运动建议</div></div></div>
            <div class="card" id="report-card" style="margin-bottom:8px;display:none;"><div class="card-title">📋 康复报告</div><div id="report-list"></div></div>
            <div class="card" id="friend-requests-card" style="display:none;"><div class="card-title">📩 好友请求</div><div id="friend-requests-list"></div></div>
            <div class="card" id="friends-card" style="display:none;"><div class="card-title">👥 我的好友</div><div id="friends-list"><div class="text-muted" style="text-align:center;padding:12px;">加载中...</div></div></div>
            <div class="card" id="contacts-list">${contacts.map(c => `<div class="list-item" data-name="${escapeHtml(c.name)}"><div class="avatar ${c.bg || ''}">${c.avatar}</div><div class="list-content"><div class="list-name">${escapeHtml(c.name)}</div><div class="list-desc">${escapeHtml(latestMessageDescapeHtml(c.name))}</div></div><div class="list-time">${c.time}</div><button class="edit-contact-btn" data-name="${escapeHtml(c.name)}" style="background:none;border:none;font-size:16px;cursor:pointer;padding:4px;">✎</button></div>`).join('')}</div>
        </div>`;
    app.querySelectorAll('.list-item').forEach(el => el.onclick = () => navigate('chat', { name: el.dataset.name }));
    app.querySelectorAll('.edit-contact-btn').forEach(function(el){ el.onclick = function(e){ e.stopPropagation(); showEditContactModal(this.dataset.name); }; });
    app.querySelector('#add-contact-btn').onclick = showAddContactModal;
    app.querySelector('#group-list-btn').onclick = () => navigate('group-list');
    app.querySelector('#assistant-btn').onclick = () => navigate('assistant');
    app.querySelector('#ai-algorithm-btn').onclick = () => navigate('ai-chat');
        loadReports(app);
    app.querySelector('#search-friend-btn').onclick = searchFriend;
    document.getElementById('friend-search-input').onkeypress = function(e) { if(e.key==='Enter') searchFriend(); };
    // Load friend requests and friends
    if(typeof currentUser !== 'undefined' && currentUser && currentUser.token){
      fetch(API_BASE+'/api/friend/requests',{headers:{'Authorization':'Bearer '+currentUser.token}})
        .then(function(r){return r.json();}).then(function(d){
          var card=document.getElementById('friend-requests-card');
          var list=document.getElementById('friend-requests-list');
          if(!card||!list)return;
          if(d.data&&d.data.length){
            card.style.display='';
            var html='';
            d.data.forEach(function(req){
              var nm=req.fromName||req.from;
              html+='<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0f1f2;">';
              html+='<span>👤 '+escapeHtml(nm)+'</span>';
              html+='<div><button class="btn btn-primary" style="font-size:12px;padding:4px 10px;margin-right:6px;" onclick="acceptFriend(\''+req.from+'\')">接受</button>';
              html+='<button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" onclick="rejectFriend(\''+req.from+'\')">拒绝</button></div></div>';
            });
            list.innerHTML=html;
          } else { card.style.display='none'; }
        });
      fetch(API_BASE+'/api/friends',{headers:{'Authorization':'Bearer '+currentUser.token}})
        .then(function(r){return r.json();}).then(function(d){
          var list=document.getElementById('friends-list');
          if(!list)return;
          if(d.data&&d.data.length){
            var card=document.getElementById('friends-card');
            if(card) card.style.display='';
            list.innerHTML=d.data.map(function(f){
              var nm=f.name||f.phone;
              return '<div class="list-item" data-friend="'+escapeHtml(f.phone)+'"><div class="avatar">👤</div><div class="list-content"><div class="list-name">'+escapeHtml(nm)+'</div><div class="list-desc">'+escapeHtml(f.lastMessage||'暂无消息')+'</div></div></div>';
            }).join('');
            list.querySelectorAll('.list-item').forEach(function(el){
              el.onclick=function(){ var nm=this.querySelector('.list-name').textContent; navigate('chat',{name:nm,phone:this.dataset.friend}); };
            });
          } else { if(document.getElementById('friends-card')) document.getElementById('friends-card').style.display='none'; }
        });
    }

};

PAGES.chat = (app, params) => {
    const name = params.name || '对话';
    setNavTitle(name);
    
    // 字体控制
    const fontSize = storage.getFontSize();
    setNavRight(`<button class="font-btn" id="set-identity-btn" style="font-size:12px;margin-right:8px;">🏷 身份</button><div class="font-control"><button class="font-btn" id="font-minus">A-</button><span id="font-size-value" style="margin:0 4px;">${fontSize}px</span><button class="font-btn" id="font-plus">A+</button></div>`, null);
    const rightArea = document.getElementById('navbar-right');
    // 设置身份按钮
    setTimeout(function(){
      var idBtn = document.getElementById('set-identity-btn');
      if(idBtn) idBtn.onclick = function(){
        var ct = storage.getContacts();
        var co = ct.find(function(c){return c.phone === (params.phone||'') || c.name === params.name;});
        if(!co){ toast('未找到该联系人')
ct.push({name:params.name, phone:params.phone||'', avatar:'👤', bg:'', time:'刚刚', relation:'长辈'});
lsSet(KEYS.CONTACTS,ct);
co=ct[ct.length-1];
}
        showEditContactModal(co.name);
      };
    }, 200);
    if (rightArea && !rightArea.hasFontListener) {
        rightArea.hasFontListener = true;
        rightArea.addEventListener('click', (e) => {
            const target = e.target;
            if (target.id === 'font-plus') {
                let newSize = storage.getFontSize() + 2;
                if (newSize > 32) newSize = 32;
                storage.setFontSize(newSize);
                const span = document.getElementById('font-size-value');
                if (span) span.textContent = newSize + 'px';
                render();
            } else if (target.id === 'font-minus') {
                let newSize = storage.getFontSize() - 2;
                if (newSize < 12) newSize = 12;
                storage.setFontSize(newSize);
                const span = document.getElementById('font-size-value');
                if (span) span.textContent = newSize + 'px';
                render();
            }
        });
    }

    let history = storage.getMessages(name);
    if (!history.length && DEFAULT_GREETINGS[name]) history = DEFAULT_GREETINGS[name].map((g,i) => ({ id: 'init_'+i, text: g.text, mine: g.mine, ts: Date.now() }));
    
    app.innerHTML = `<div class="chat-page"><div class="chat-list" id="chat-list"></div><div class="chat-input-bar"><input class="chat-input" id="chat-input" placeholder="请输入消息…" /><button class="voice-btn" id="voice-btn">🎤</button><button class="btn btn-secondary" id="send-btn">发送</button></div><div class="voice-overlay" id="voice-overlay"><div class="voice-wave">🎙</div><div class="voice-tip">松开发送 · 上滑取消</div></div></div>`;
    const list = app.querySelector('#chat-list');
    const input = app.querySelector('#chat-input');
    const renderMsg = () => {
        list.innerHTML = history.map(m => `<div class="msg ${m.mine ? 'me' : 'other'}"><div class="avatar">${m.mine ? '👴' : '👤'}</div><div class="bubble">${escapeHtml(m.text)}</div></div>`).join('');
        list.scrollTop = list.scrollHeight;
    };
    renderMsg();
    
    app.querySelector('#send-btn').onclick = () => {
        const text = input.value.trim();
        if (!text) return;
        const my = { id: 'm_'+Date.now(), text, mine: true, ts: Date.now() };
        storage.addMessage(name, my);
        history.push(my);
        const reply = { id: 'r_'+Date.now(), text: '收到，我会继续关注您的健康！', mine: false, ts: Date.now() };
        storage.addMessage(name, reply);
        history.push(reply);
        input.value = '';
        renderMsg();
    };
    
    // 语音录制
    let mediaRecorder = null, audioChunks = [], startY = 0;
    const voiceBtn = app.querySelector('#voice-btn');
    const overlay = app.querySelector('#voice-overlay');
    const overlayTip = overlay.querySelector('.voice-tip');
    const moveHandler = (e) => {
        const y = e.clientY || e.touches?.[0]?.clientY;
        if (startY - y > 30) {
            overlay.classList.add('cancel');
            overlayTip.textContent = '松手取消';
        } else {
            overlay.classList.remove('cancel');
            overlayTip.textContent = '松开发送 · 上滑取消';
        }
    };
    voiceBtn.addEventListener('mousedown', startRecord);
    voiceBtn.addEventListener('mouseup', stopRecord);
    voiceBtn.addEventListener('mouseleave', () => { if (mediaRecorder && mediaRecorder.state === 'recording') cancelRecord(); });
    voiceBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecord(e); });
    voiceBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopRecord(e); });
    function startRecord(e) {
        startY = e.clientY || e.touches?.[0]?.clientY;
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.start();
            audioChunks = [];
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            overlay.classList.add('show');
            document.addEventListener('mousemove', moveHandler);
            document.addEventListener('touchmove', moveHandler, { passive: false });
            voiceBtn.classList.add('recording');
        }).catch(err => toast('无法录音，请检查麦克风权限'));
    }
    function stopRecord(e) {
        if (!mediaRecorder) return;
        const endY = e.clientY || e.changedTouches?.[0]?.clientY;
        if (startY - endY > 50) { cancelRecord(); return; }
        mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('voice', blob, 'voice.webm');
            const res = await fetch(`${API_BASE}/api/upload/voice`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${currentUser.token}` },
                body: formData
            });
            const data = await res.json();
            if (data.url) {
                toast('语音已上传，单聊暂不支持语音播放，已转为文字链接');
                const text = `[语音消息] ${data.url}`;
                const my = { id: 'm_'+Date.now(), text, mine: true, ts: Date.now() };
                storage.addMessage(name, my);
                history.push(my);
                const reply = { id: 'r_'+Date.now(), text: '已收到您的语音', mine: false, ts: Date.now() };
                storage.addMessage(name, reply);
                history.push(reply);
                renderMsg();
            } else toast('语音上传失败');
        };
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('touchmove', moveHandler);
        overlay.classList.remove('show');
        voiceBtn.classList.remove('recording');
        mediaRecorder = null;
    }
    function cancelRecord() {
        if (mediaRecorder) {
            mediaRecorder.onstop = () => {};
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(t => t.stop());
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('touchmove', moveHandler);
            overlay.classList.remove('show');
            voiceBtn.classList.remove('recording');
            mediaRecorder = null;
            toast('已取消录音');
        }
    }
};

// 群聊列表
PAGES['group-list'] = async (app) => {
    setNavTitle('我的群聊');
    setNavRight('', null);
    app.innerHTML = `<div class="container"><div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">群聊</div><div class="header-subtitle"></div></div><div class="header-add" id="create-group">＋</div></div><div id="groups-list" class="card"></div></div>`;
    const groupsContainer = app.querySelector('#groups-list');
    app.querySelector('#create-group').onclick = () => navigate('group-create');
    try {
        const res = await fetch(`${API_BASE}/api/groups`, { headers: { 'Authorization': `Bearer ${currentUser.token}` } });
        if (res.ok) {
            const groups = await res.json();
            if (groups.length === 0) groupsContainer.innerHTML = '<div class="text-muted" style="text-align:center;padding:20px;">暂无群聊，点击＋创建</div>';
            else groupsContainer.innerHTML = groups.map(g => `<div class="list-item" data-id="${g._id}"><div class="avatar">${g.avatar || '👥'}</div><div class="list-content"><div class="list-name">${escapeHtml(g.name)}</div><div class="list-desc">${escapeHtml(g.lastMessage || '暂无消息')}</div></div><div class="list-time">${new Date(g.lastTime).toLocaleTimeString()}</div></div>`).join('');
            app.querySelectorAll('.list-item').forEach(el => el.onclick = () => navigate('group-chat', { groupId: el.dataset.id }));
        } else toast('加载群聊失败');
    } catch(e) { toast('网络错误，无法加载群聊'); }
};

// 创建群聊
PAGES['group-create'] = async (app) => {
    setNavTitle('创建群聊');
    const contacts = storage.getContacts();
    app.innerHTML = `<div class="container"><div class="card"><div class="card-title">群名称</div><input id="group-name" class="form-input" placeholder="输入群名称" /></div><div class="card"><div class="card-title">选择成员</div><div class="checkbox-group" id="members-list"></div></div><button class="btn btn-primary btn-block" id="submit-create">创建群聊</button></div>`;
    const membersDiv = app.querySelector('#members-list');
    membersDiv.innerHTML = contacts.map(c => `<div class="checkbox-item"><input type="checkbox" value="${escapeHtml(c.name)}" id="chk_${escapeHtml(c.name)}"><label for="chk_${escapeHtml(c.name)}">${c.avatar} ${c.name}</label></div>`).join('');
    app.querySelector('#submit-create').onclick = async () => {
        const name = app.querySelector('#group-name').value.trim();
        if (!name) { toast('请填写群名称'); return; }
        const selectedNames = Array.from(membersDiv.querySelectorAll('input:checked')).map(cb => cb.value);
        const contactsList = storage.getContacts();
        const memberPhones = selectedNames.map(sel => {
            const c = contactsList.find(ct => ct.name === sel);
            return c && c.phone ? c.phone : '';
        }).filter(p => p);
        if (!memberPhones.includes(currentUser.phone)) memberPhones.push(currentUser.phone);
        try {
            const res = await fetch(`${API_BASE}/api/group/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}` },
                body: JSON.stringify({ name, members: memberPhones })
            });
            if (res.ok) { toast('创建成功'); navigate('group-list'); }
            else toast('创建失败');
        } catch(e) { document.getElementById('back-to-em').onclick = function() { navigate('emergency'); };
        toast('网络错误'); }
    };
};

// 群聊聊天室
PAGES['group-chat'] = async (app, params) => {
    const groupId = params.groupId;
    if (!groupId) { navigate('group-list'); return; }
    setNavTitle('群聊');
    // 获取群名称
    let groupName = '群聊';
    try {
        const resGroups = await fetch(`${API_BASE}/api/groups`, { headers: { 'Authorization': `Bearer ${currentUser.token}` } });
        if (resGroups.ok) {
            const groups = await resGroups.json();
            const g = groups.find(g => g._id === groupId);
            if (g) groupName = g.name;
        }
    } catch(e) { console.warn(e); }
    setNavTitle(groupName);
    
    const fontSize = storage.getFontSize();
    setNavRight(`<div class="font-control"><button class="font-btn" id="font-minus">A-</button><span id="font-size-value" style="margin:0 4px;">${fontSize}px</span><button class="font-btn" id="font-plus">A+</button></div>`, null);
    const rightArea = document.getElementById('navbar-right');
    if (rightArea && !rightArea.hasFontListener) {
        rightArea.hasFontListener = true;
        rightArea.addEventListener('click', (e) => {
            const target = e.target;
            if (target.id === 'font-plus') {
                let newSize = storage.getFontSize() + 2;
                if (newSize > 32) newSize = 32;
                storage.setFontSize(newSize);
                const span = document.getElementById('font-size-value');
                if (span) span.textContent = newSize + 'px';
                render();
            } else if (target.id === 'font-minus') {
                let newSize = storage.getFontSize() - 2;
                if (newSize < 12) newSize = 12;
                storage.setFontSize(newSize);
                const span = document.getElementById('font-size-value');
                if (span) span.textContent = newSize + 'px';
                render();
            }
        });
    }

    app.innerHTML = `<div class="chat-page"><div class="chat-list" id="chat-list"></div><div class="chat-input-bar"><input class="chat-input" id="chat-input" placeholder="请输入消息…" /><button class="voice-btn" id="voice-btn">🎤</button><button class="btn btn-secondary" id="send-btn">发送</button></div><div class="voice-overlay" id="voice-overlay"><div class="voice-wave">🎙</div><div class="voice-tip">松开发送 · 上滑取消</div></div></div>`;
    const list = app.querySelector('#chat-list');
    const input = app.querySelector('#chat-input');
    let messages = [];
    async function loadMessages() {
        try {
            const res = await fetch(`${API_BASE}/api/group/messages?groupId=${groupId}`, { headers: { 'Authorization': `Bearer ${currentUser.token}` } });
            if (res.ok) {
                messages = await res.json();
                renderMsgs();
            }
        } catch(e) { toast('加载消息失败'); }
    }
    function renderMsgs() {
        list.innerHTML = messages.map(m => {
            const isMe = m.from === currentUser.phone;
            let content = '';
            if (m.text) content = escapeHtml(m.text);
            else if (m.voiceUrl) content = `<div class="voice-message" data-url="${escapeHtml(m.voiceUrl)}"><span class="voice-icon">🔊</span><span class="voice-duration">语音消息</span></div>`;
            return `<div class="msg ${isMe ? 'me' : 'other'}"><div class="avatar">${isMe ? '👴' : '👤'}</div><div class="bubble">${content}</div></div>`;
        }).join('');
        list.scrollTop = list.scrollHeight;
        list.querySelectorAll('.voice-message').forEach(el => el.onclick = () => {
            const url = el.dataset.url;
            if (url) new Audio(url).play();
        });
    }
    await loadMessages();
    
    app.querySelector('#send-btn').onclick = async () => {
        const text = input.value.trim();
        if (!text) return;
        try {
            const res = await fetch(`${API_BASE}/api/group/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}` },
                body: JSON.stringify({ groupId, text })
            });
            if (res.ok) {
                input.value = '';
                await loadMessages();
            } else toast('发送失败');
        } catch(e) { document.getElementById('back-to-em').onclick = function() { navigate('emergency'); };
        toast('网络错误'); }
    };
    
    // 语音录制
    let mediaRecorder = null, audioChunks = [], startY = 0;
    const voiceBtn = app.querySelector('#voice-btn');
    const overlay = app.querySelector('#voice-overlay');
    const overlayTip = overlay.querySelector('.voice-tip');
    const moveHandler = (e) => {
        const y = e.clientY || e.touches?.[0]?.clientY;
        if (startY - y > 30) {
            overlay.classList.add('cancel');
            overlayTip.textContent = '松手取消';
        } else {
            overlay.classList.remove('cancel');
            overlayTip.textContent = '松开发送 · 上滑取消';
        }
    };
    voiceBtn.addEventListener('mousedown', startRecord);
    voiceBtn.addEventListener('mouseup', stopRecord);
    voiceBtn.addEventListener('mouseleave', () => { if (mediaRecorder && mediaRecorder.state === 'recording') cancelRecord(); });
    voiceBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecord(e); });
    voiceBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopRecord(e); });
    function startRecord(e) {
        startY = e.clientY || e.touches?.[0]?.clientY;
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.start();
            audioChunks = [];
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            overlay.classList.add('show');
            document.addEventListener('mousemove', moveHandler);
            document.addEventListener('touchmove', moveHandler, { passive: false });
            voiceBtn.classList.add('recording');
        }).catch(err => toast('无法录音'));
    }
    async function stopRecord(e) {
        if (!mediaRecorder) return;
        const endY = e.clientY || e.changedTouches?.[0]?.clientY;
        if (startY - endY > 50) { cancelRecord(); return; }
        mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('voice', blob, 'voice.webm');
            try {
                const uploadRes = await fetch(`${API_BASE}/api/upload/voice`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${currentUser.token}` },
                    body: formData
                });
                const data = await uploadRes.json();
                if (data.url) {
                    const msgRes = await fetch(`${API_BASE}/api/group/message`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}` },
                        body: JSON.stringify({ groupId, voiceUrl: data.url })
                    });
                    if (msgRes.ok) await loadMessages();
                    else toast('语音发送失败');
                } else toast('上传失败');
            } catch(e) { document.getElementById('back-to-em').onclick = function() { navigate('emergency'); };
        toast('网络错误'); }
        };
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('touchmove', moveHandler);
        overlay.classList.remove('show');
        voiceBtn.classList.remove('recording');
        mediaRecorder = null;
    }
    function cancelRecord() {
        if (mediaRecorder) {
            mediaRecorder.onstop = () => {};
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(t => t.stop());
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('touchmove', moveHandler);
            overlay.classList.remove('show');
            voiceBtn.classList.remove('recording');
            mediaRecorder = null;
            toast('已取消录音');
        }
    }
};

// 安全助手（修复版：不自动跳转登录）
PAGES.assistant = (app) => {
    setNavTitle('安全助手');
    const fontSize = storage.getFontSize();
    setNavRight(`<div class="font-control"><button class="font-btn" id="font-minus">A-</button><span id="font-size-value" style="margin:0 4px;">${fontSize}px</span><button class="font-btn" id="font-plus">A+</button></div>`, null);
    const rightArea = document.getElementById('navbar-right');
    if (rightArea && !rightArea.hasFontListener) {
        rightArea.hasFontListener = true;
        rightArea.addEventListener('click', (e) => {
            const target = e.target;
            if (target.id === 'font-plus') {
                let newSize = storage.getFontSize() + 2;
                if (newSize > 32) newSize = 32;
                storage.setFontSize(newSize);
                const span = document.getElementById('font-size-value');
                if (span) span.textContent = newSize + 'px';
                render();
            } else if (target.id === 'font-minus') {
                let newSize = storage.getFontSize() - 2;
                if (newSize < 12) newSize = 12;
                storage.setFontSize(newSize);
                const span = document.getElementById('font-size-value');
                if (span) span.textContent = newSize + 'px';
                render();
            }
        });
    }

    app.innerHTML = `<div class="chat-page"><div class="chat-list" id="chat-list"><div class="msg other"><div class="avatar">🤖</div><div class="bubble">您好，我是您的安全健康助手，请问有什么可以帮助您？</div></div></div><div class="chat-input-bar"><input class="chat-input" id="chat-input" placeholder="输入健康问题…" /><button class="voice-btn" id="voice-btn">🎤</button><button class="btn btn-secondary" id="send-btn">发送</button></div><div class="voice-overlay" id="voice-overlay"><div class="voice-wave">🎙</div><div class="voice-tip">松开发送 · 上滑取消</div></div></div>`;
    const list = app.querySelector('#chat-list');
    const input = app.querySelector('#chat-input');
    let history = [{ role: 'assistant', content: '您好，我是您的安全健康助手，请问有什么可以帮助您？' }];
    function addMessage(role, content) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ${role === 'user' ? 'me' : 'other'}`;
        msgDiv.innerHTML = `<div class="avatar">${role === 'user' ? '👴' : '🤖'}</div><div class="bubble">${escapeHtml(content)}</div>`;
        list.appendChild(msgDiv);
        list.scrollTop = list.scrollHeight;
        history.push({ role, content });
    }
    app.querySelector('#send-btn').onclick = async () => {
        const text = input.value.trim();
        if (!text) return;
        addMessage('user', text);
        input.value = '';
        try {
            const res = await fetch(`${API_BASE}/api/assistant`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}` },
                body: JSON.stringify({ message: text, history: history.slice(-10) })
            });
            if (res.ok) {
                const data = await res.json();
                addMessage('assistant', data.reply);
            } else {
                addMessage('assistant', '抱歉，服务暂时不可用，请稍后再试。');
            }
        } catch(e) {
            addMessage('assistant', '网络错误，请检查网络连接。');
        }
    };
    // 语音录制（仅演示，实际未做语音识别）
    let mediaRecorder = null, audioChunks = [], startY = 0;
    const voiceBtn = app.querySelector('#voice-btn');
    const overlay = app.querySelector('#voice-overlay');
    const overlayTip = overlay.querySelector('.voice-tip');
    const moveHandler = (e) => {
        const y = e.clientY || e.touches?.[0]?.clientY;
        if (startY - y > 30) {
            overlay.classList.add('cancel');
            overlayTip.textContent = '松手取消';
        } else {
            overlay.classList.remove('cancel');
            overlayTip.textContent = '松开发送 · 上滑取消';
        }
    };
    voiceBtn.addEventListener('mousedown', startRecord);
    voiceBtn.addEventListener('mouseup', stopRecord);
    voiceBtn.addEventListener('mouseleave', () => { if (mediaRecorder && mediaRecorder.state === 'recording') cancelRecord(); });
    voiceBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecord(e); });
    voiceBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopRecord(e); });
    function startRecord(e) {
        startY = e.clientY || e.touches?.[0]?.clientY;
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.start();
            audioChunks = [];
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            overlay.classList.add('show');
            document.addEventListener('mousemove', moveHandler);
            document.addEventListener('touchmove', moveHandler, { passive: false });
            voiceBtn.classList.add('recording');
        }).catch(err => toast('无法录音'));
    }
    async function stopRecord(e) {
        if (!mediaRecorder) return;
        const endY = e.clientY || e.changedTouches?.[0]?.clientY;
        if (startY - endY > 50) { cancelRecord(); return; }
        mediaRecorder.onstop = () => {
            toast('语音识别暂未开放，请手动输入文字');
            cancelRecord();
        };
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('touchmove', moveHandler);
        overlay.classList.remove('show');
        voiceBtn.classList.remove('recording');
        mediaRecorder = null;
    }
    function cancelRecord() {
        if (mediaRecorder) {
            mediaRecorder.onstop = () => {};
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(t => t.stop());
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('touchmove', moveHandler);
            overlay.classList.remove('show');
            voiceBtn.classList.remove('recording');
            mediaRecorder = null;
            toast('已取消');
        }
    }
};

// 原有其他页面（prescription, courses, emergency, monitor, coin, report, profile-setup, me）
PAGES.prescription = (app) => {
    setNavTitle('运动方案');
    let rx = storage.getPrescription();
    if (!rx) { rx = storage.generatePrescription(storage.getProfile()); storage.setPrescription(rx); }
    app.innerHTML = `<div class="container"><div class="card"><div class="row"><div class="avatar orange">🥗</div><div><div class="fs-36 fw-600">${escapeHtml(rx.doctor)}</div><div class="text-muted">${escapeHtml(rx.hospital)}</div></div></div></div>
        <div class="card"><div class="card-title">运动方案</div><div class="prescription-box"><div>限制心率：≤ ${rx.maxHeartRate} 次/分</div><div>推荐项目：${(rx.items || []).join('、')}</div><div>频率：${rx.frequency}</div><div>时长：${rx.duration}</div><div>强度：${rx.intensity}</div><div>注意事项：${rx.cautions}</div></div></div>
        <div class="card"><button class="btn btn-primary btn-block" >按方案开始运动</button><button class="btn btn-ghost btn-block" data-go="courses">预约线下课程</button></div></div>`;
    app.querySelectorAll('[data-go]').forEach(el => el.onclick = () => navigate(el.dataset.go));
};
PAGES.courses = (app) => {
    setNavTitle('我的课程');
    app.innerHTML = '<div class="container"><div class="card"><div id="courses-content"><div class="chart-placeholder">加载中...</div></div></div></div>';
    if(!currentUser) { document.getElementById('courses-content').innerHTML = '<div class="text-muted" style="padding:20px;text-align:center;">请先登录</div>'; return; }
    fetch(API_BASE + '/api/my-courses', { headers: { Authorization: 'Bearer ' + currentUser.token } })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(d.data && d.data.length) {
          var html = '<div class="card-title">已购课程</div>' +
            d.data.map(function(c) {
              return '<div class="prescription-box" style="margin-bottom:10px;border-color:var(--orange);background:var(--orange-light);color:var(--text);"><div style="display:flex;align-items:center;"><div style="font-size:24px;margin-right:12px;">🎓</div><div><div style="font-size:16px;font-weight:600;">' + escapeHtml(c.name) + '</div><div style="font-size:13px;color:var(--gray);">' + escapeHtml(c.description||'') + '</div></div></div></div>';
            }).join('');
          document.getElementById('courses-content').innerHTML = html;
        } else {
          document.getElementById('courses-content').innerHTML = '<div class="text-muted" style="padding:30px;text-align:center;">暂无已购课程<br><span style="font-size:13px;">请联系子女为您购买课程</span></div>';
        }
      })
      .catch(function(){
        document.getElementById('courses-content').innerHTML = '<div class="text-muted" style="padding:20px;text-align:center;">加载失败</div>';
      });
};

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
        '<div class="card" style="margin-top:8px;"><div class="card-title">添加紧急联系人</div>' +
        '<div class="form-row"><div class="form-label">备注</div><input id="em-name" class="form-input" placeholder="联系人姓名" /></div>' +
        '<div class="form-row"><div class="form-label">手机号</div><input id="em-phone" class="form-input" placeholder="11位手机号" /></div>' +
        '<button class="btn btn-primary btn-block" id="em-add-btn">添加并保存</button></div>' +
        '<button class="btn btn-ghost btn-block" id="manage-ec-btn" style="margin-top:8px;">📋 管理紧急联系人</button></div>';
    app.querySelectorAll('.emergency-call-btn').forEach(el => el.onclick = async () => { if ((await modal({ title: '确认呼叫', content: '拨打 ' + el.querySelector('.name').innerText, confirmColor: '#e8504a' })).confirm) location.href = 'tel:' + el.dataset.tel; });
    var manageBtn = document.getElementById('manage-ec-btn');
    if(manageBtn) manageBtn.onclick = function() { navigate('emergency-contacts'); };
    var emAddBtnOk = document.getElementById('em-add-btn');
    if(emAddBtnOk) emAddBtnOk.onclick = async function() {
      var n = document.getElementById('em-name').value.trim();
      var p = document.getElementById('em-phone').value.trim();
      if (!n || !p) { toast('请填写完整信息'); return; }
      if (!/^1[0-9]{10}$/.test(p)) { toast('请输入正确的手机号'); return; }
      if (!currentUser) { toast('请先登录'); return; }
      try {
        var r = await fetch(API_BASE + '/api/emergency/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentUser.token },
          body: JSON.stringify({ name: n, phone: p })
        });
        var d = await r.json();
        if (d.ok) {
          toast('已保存并可直接拨打 ' + n);
          navigate('emergency');
        } else toast(d.error || '添加失败');
      } catch(e) { toast('网络错误'); }
    };
    } catch(e) {
        app.innerHTML = '<div class="container"><div class="banner orange"><div class="emoji">🆘</div><div><div class="t">遇到紧急情况？直接呼叫</div><div class="s">点击下方按钮立即拨打</div></div></div>' +
        '<button class="emergency-call-btn danger" data-tel="120"><div class="avatar">🚑</div><div class="info"><div class="name">120 急救</div><div class="desc">自动共享位置</div></div><div class="call-ic">📞</div></button>' +
        '<button class="btn btn-ghost btn-block" id="manage-ec-btn-fb" style="margin-top:8px;">📋 管理紧急联系人</button></div>';
        // Also add the emergency add form in catch
        // Already done in the app.innerHTML above
        app.querySelectorAll('.emergency-call-btn').forEach(el => el.onclick = async () => { if ((await modal({ title: '确认呼叫', content: '拨打 ' + el.querySelector('.name').innerText, confirmColor: '#e8504a' })).confirm) location.href = 'tel:' + el.dataset.tel; });
        var fbBtn = document.getElementById('manage-ec-btn-fb');
        if(fbBtn) fbBtn.onclick = function() { navigate('emergency-contacts'); };
    var emAddBtn = document.getElementById('em-add-btn');
    if(emAddBtn) emAddBtn.onclick = async function() {
      var n = document.getElementById('em-name').value.trim();
      var p = document.getElementById('em-phone').value.trim();
      if (!n || !p) { toast('请填写完整信息'); return; }
      if (!/^1[0-9]{10}$/.test(p)) { toast('请输入正确的手机号'); return; }
      if (!currentUser) { toast('请先登录'); return; }
      try {
        var r = await fetch(API_BASE + '/api/emergency/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentUser.token },
          body: JSON.stringify({ name: n, phone: p })
        });
        var d = await r.json();
        if (d.ok) {
          toast('已保存并可直接拨打 ' + n);
          navigate('emergency');
        } else toast(d.error || '添加失败');
      } catch(e) { toast('网络错误'); }
    };
    }
    })();
};

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
                    } catch(e) { document.getElementById('back-to-em').onclick = function() { navigate('emergency'); };
        toast('网络错误'); }
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
            } catch(e) { document.getElementById('back-to-em').onclick = function() { navigate('emergency'); };
        toast('网络错误'); }
        };
    } catch(e) {
        app.innerHTML = '<div class="container"><div class="card"><div class="text-muted" style="text-align:center;padding:20px;">加载失败，请检查网络</div><button class="btn btn-primary btn-block" id="back-to-em">返回</button></div></div>';
        document.getElementById('back-to-em').onclick = function() { navigate('emergency'); };
        toast('网络错误');
    }
}

PAGES.monitor = (app) => {
    setNavTitle('健康监测');
    const h = storage.getHealthData();
    app.innerHTML = `<div class="container"><div class="card"><div class="card-title">血压监测</div><div class="fs-40 fw-600 text-green">${h.bloodPressure}</div></div><div class="card"><div class="card-title">心率监测</div><div class="fs-40 fw-600 text-orange">${h.heartRate} 次/分</div></div><div class="card"><div class="card-title">血氧饱和度</div><div class="fs-40 fw-600 text-green">${h.bloodOxygen}%</div></div></div>`;
};
PAGES.coin = (app) => {
    setNavTitle("健康币");
    app.innerHTML = '<div class="container"><div class="coin-hero" id="coin-hero"><div class="coin-logo">币</div><div class="coin-num" id="coin-num">0</div><div class="coin-label">我的健康币</div></div><div class="card"><div class="card-title">获取记录</div><div class="form-row"><span class="coin-tag get">+1</span><div>今日运动打卡</div></div></div>'+
      '<div class="card"><div class="card-title">充值健康币</div>'+
      '<div class="grid-2" style="margin-bottom:8px;">'+
      '<div class="feature-tile orange" onclick="selectRecharge(10)"><div class="fi">10</div><div class="fn">10 枚</div></div>'+
      '<div class="feature-tile green" onclick="selectRecharge(30)"><div class="fi">30</div><div class="fn">30 枚</div></div>'+
      '<div class="feature-tile orange" onclick="selectRecharge(50)"><div class="fi">50</div><div class="fn">50 枚</div></div>'+
      '<div class="feature-tile green" onclick="selectRecharge(100)"><div class="fi">100</div><div class="fn">100 枚</div></div>'+
      '</div>'+
      '<div style="text-align:center;font-size:16px;margin-bottom:12px;">选择金额: <strong id="selected-amount">50</strong> 枚</div>'+
      '<div style="display:flex;gap:8px;margin-bottom:8px;"><button class="btn btn-secondary" style="flex:1;font-size:16px;" onclick=\'doRecharge("微信")\'>\uD83D\uDCB1 微信支付</button><button class="btn btn-primary" style="flex:1;font-size:16px;" onclick=\'doRecharge("支付宝")\'>\uD83D\uDCB0 支付宝</button></div>'+
      '<div id="recharge-result" style="text-align:center;font-size:14px;"></div></div>'+
'<div style="text-align:center;font-size:12px;color:#999;padding:8px 0;">💡 1健康币 = 1元，可用于兑换课程与服务</div>'+

      '<div class="card"><div class="card-title">付费服务</div><div id="svc-in-coin"><div class="text-muted" style="text-align:center;padding:10px;">无</div></div></div></div>';
    // Load coins from server
    if(currentUser){
      fetch(API_BASE+"/api/coins",{headers:{Authorization:"Bearer "+currentUser.token}}).then(function(r){return r.json();}).then(function(d){
        document.getElementById("coin-num").textContent = d.coins||0;
      });
    }
        window.selectRecharge = function(amount) {
      document.getElementById("selected-amount").textContent = amount;
      window._rechargeAmount = amount;
    };
    window.doRecharge = async function(method) {
      if(!currentUser){toast("请先登录");return;}
      var amount = window._rechargeAmount || 50;
      document.getElementById("recharge-result").innerHTML = '<div class="chart-placeholder">\uD83D\uDD04 正在处理'+method+'支付...</div>';
      try {
        var res = await fetch(API_BASE+"/api/coins/recharge",{
          method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+currentUser.token},
          body:JSON.stringify({amount:amount,method:method})
        });
        var data = await res.json();
        if(data.ok){toast(method+"充值成功 \u2705");}else{toast(data.error||"充值失败");}
        // Refresh coin display
        var cr = await fetch(API_BASE+"/api/coins",{headers:{Authorization:"Bearer "+currentUser.token}});
        var cd = await cr.json();
        document.getElementById("coin-num").textContent = cd.coins||0;
      } catch(e){toast("网络错误");}
    };
    window.selectRecharge(50);
    // Load services
    fetch(API_BASE+"/api/services").then(function(r){return r.json();}).then(function(d){
      if(d.data&&d.data.length){
        var html = d.data.map(function(s){
          return '<div class="form-row" style="cursor:pointer;"><span>\uD83D\uDCB3</span><div style="flex:1"><strong>'+escapeHtml(s.name)+'</strong><br><span style="font-size:13px;color:var(--gray);">\u00a5 '+s.price+' | 已参与 '+(s.enrolled||0)+'/'+s.maxParticipants+' 人</span></div><button class="btn btn-primary" style="font-size:13px;padding:6px 14px;" onclick=\'purchaseService("'+s.id+'")\'>购买</button></div>';
        }).join("");
        document.getElementById("svc-in-coin").innerHTML = html;
      } else {
        document.getElementById("svc-in-coin").innerHTML = '<div class="text-muted" style="font-size:14px;text-align:center;padding:10px;">暂无可用服务</div>';
      }
    });
  };
PAGES['profile-setup'] = (app) => {
    setNavTitle('录入资料');
    const p = storage.getProfile() || {};
    let form = { name: p.name || '', height: p.height || '165', weight: p.weight || '65', age: p.age || '65', hasChronic: !!p.hasChronic };
    var h = parseInt(form.height) || 165;
    var w = parseInt(form.weight) || 65;
    var a = parseInt(form.age) || 65;
    app.innerHTML = '<div class="container"><div class="card"><div class="card-title">基本情况</div>' +
        '<div class="form-row"><div class="form-label">姓名</div><input class="form-input" data-f="name" value="' + escapeHtml(form.name) + '" /></div>' +
        '<div style="margin-bottom:12px;padding:8px 0;border-bottom:1px solid #f0f0f0;">' +
          '<div style="font-size:14px;font-weight:600;margin-bottom:6px;">身高</div>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<input type="range" class="form-input" data-f="height" min="120" max="220" value="' + h + '" style="flex:1;">' +
            '<span class="range-val" data-f="height">' + h + '</span>' +
            '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:45px;text-align:right;">cm</span>' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:12px;padding:8px 0;border-bottom:1px solid #f0f0f0;">' +
          '<div style="font-size:14px;font-weight:600;margin-bottom:6px;">体重</div>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<input type="range" class="form-input" data-f="weight" min="30" max="150" value="' + w + '" style="flex:1;">' +
            '<span class="range-val" data-f="weight">' + w + '</span>' +
            '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:45px;text-align:right;">kg</span>' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:12px;padding:8px 0;border-bottom:1px solid #f0f0f0;">' +
          '<div style="font-size:14px;font-weight:600;margin-bottom:6px;">年龄</div>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<input type="range" class="form-input" data-f="age" min="40" max="100" value="' + a + '" style="flex:1;">' +
            '<span class="range-val" data-f="age">' + a + '</span>' +
            '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:45px;text-align:right;">岁</span>' +
          '</div>' +
        '</div></div>' +
        '<div class="card"><div class="card-title">身体状况</div><div class="check-row" id="chronic-row"><div class="check-box ' + (form.hasChronic ? 'checked' : '') + '">' + (form.hasChronic ? '✓' : '') + '</div><span>有基础病或慢性病史</span></div></div>' +
        '<div class="card"><div class="card-title">健康建议</div><div id="advice-content"><div class="text-muted" style="text-align:center;padding:20px;font-size:15px;">填写数据后点击下方按钮获取建议</div></div></div>' +
        '<button class="btn btn-primary btn-block" id="submit-btn">提交并生成运动方案</button></div>';
    app.querySelectorAll('[data-f]').forEach(function(el) { el.oninput = function() { form[el.dataset.f] = el.value; }; });
    app.querySelectorAll('input[type="range"]').forEach(function(el) {
      el.oninput = function() {
        form[el.dataset.f] = el.value;
        var span = el.parentElement.querySelector('.range-val');
        if(span) span.textContent = el.value;
      };
    });
    app.querySelector('#chronic-row').onclick = function() {
        form.hasChronic = !form.hasChronic;
        var box = app.querySelector('#chronic-row .check-box');
        box.classList.toggle('checked', form.hasChronic);
        box.textContent = form.hasChronic ? '✓' : '';
    };
    app.querySelector('#submit-btn').onclick = function() { storage.setProfile(form); storage.setPrescription(storage.generatePrescription(form)); toast('资料已保存'); navigate('prescription'); };
};

PAGES['ai-chat'] = (app) => {
    setNavTitle('智能算法');
    var adviceText = '';
    var showingForm = false;
    
    function renderMain() {
      showingForm = false;
      app.innerHTML = '<div class="container"><div class="banner orange"><div class="emoji">🧠</div><div><div class="t">智能营养与运动建议</div><div class="s">请先提供您的健康数据，系统将生成个性化建议</div></div></div>' +
        '<div class="card"><div class="card-title">健康建议</div><div id="advice-content"><div class="text-muted" style="text-align:center;padding:20px;font-size:15px;">点击下方按钮，填写健康数据获取建议</div></div></div>' +
        '<div class="card"><button class="btn btn-primary btn-block" id="provide-data-btn">📊 提供健康数据</button></div>' +
        '<div class="card"><button class="btn btn-secondary btn-block" id="refresh-advice-btn">🔄 刷新建议</button></div></div>';
      app.querySelector('#provide-data-btn').onclick = renderForm;
      app.querySelector('#refresh-advice-btn').onclick = function() {
        if(adviceText) {
          var formatted = adviceText.replace(/\\n/g, '<br>');
          document.getElementById('advice-content').innerHTML = '<div class="prescription-box" style="border-color:var(--orange);background:var(--orange-light);color:var(--text);font-size:15px;line-height:1.8;">' + formatted + '</div>';
          toast('已刷新');
        } else {
          toast('暂无建议，请先提供健康数据');
        }
      };
    }
    
    function renderForm() {
      if(!currentUser){toast('请先登录');return;}
      showingForm = true;
      app.innerHTML = '<div class="container"><div class="banner orange"><div class="emoji">🧠</div><div><div class="t">填写健康数据</div><div class="s">通过滑块调整您的健康指标，然后获取建议</div></div></div>' +
        '<div class="card"><div class="card-title">当前健康指标</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">年龄</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-age" min="40" max="100" value="65" style="flex:1;">' +
      '<span class="range-val" data-f="ai-age">65</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">岁</span>' +
      '</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">身高</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-height" min="120" max="220" value="165" style="flex:1;">' +
      '<span class="range-val" data-f="ai-height">165</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">cm</span>' +
      '</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">体重</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-weight" min="30" max="150" value="65" style="flex:1;">' +
      '<span class="range-val" data-f="ai-weight">65</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">kg</span>' +
      '</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">血压(收缩压)</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-bloodPressure" min="80" max="220" value="120" style="flex:1;">' +
      '<span class="range-val" data-f="ai-bloodPressure">120</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">mmHg</span>' +
      '</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">心率</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-heartRate" min="30" max="220" value="72" style="flex:1;">' +
      '<span class="range-val" data-f="ai-heartRate">72</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">次/分</span>' +
      '</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">血氧</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-bloodOxygen" min="60" max="100" value="97" style="flex:1;">' +
      '<span class="range-val" data-f="ai-bloodOxygen">97</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">%</span>' +
      '</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">血糖</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-bloodSugar" min="20" max="200" value="55" style="flex:1;">' +
      '<span class="range-val" data-f="ai-bloodSugar">55</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">mmol/L</span>' +
      '</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">步数</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-steps" min="0" max="50000" value="5000" style="flex:1;">' +
      '<span class="range-val" data-f="ai-steps">5000</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">步</span>' +
      '</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">睡眠时长</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-sleep" min="0" max="24" value="7" style="flex:1;">' +
      '<span class="range-val" data-f="ai-sleep">7</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">小时</span>' +
      '</div>' +
        '</div>' +
        '<div class="card"><div class="card-title">慢性病史</div>' +
        '<div class="check-row" id="ai-chronic-row"><div class="check-box" id="ai-chronic-box"></div><span>有基础病或慢性病史</span></div></div' +
        '<div class="card"><div class="card-title">健康建议</div><div id="advice-content" style="margin-top:8px;"><div class="text-muted" style="text-align:center;padding:20px;font-size:15px;">填写数据后点击下方按钮获取建议</div></div></div>' +
        '<button class="btn btn-primary btn-block" id="submit-advice-btn">💡 获取建议</button>' +
        '<button class="btn btn-ghost btn-block" id="back-to-main-btn" style="margin-top:8px;">← 返回</button></div>';
      
      // Slider value update
      app.querySelectorAll('input[type="range"]').forEach(function(el) {
        el.oninput = function() {
          var span = el.parentElement.querySelector('.range-val');
          if(span) span.textContent = el.value;
        };
      });
      
      // Chronic disease toggle
      var hasChronic = false;
      app.querySelector('#ai-chronic-row').onclick = function() {
        hasChronic = !hasChronic;
        var box = document.getElementById('ai-chronic-box');
        box.classList.toggle('checked', hasChronic);
        box.textContent = hasChronic ? '✓' : '';
      };
      
      // Back button
      app.querySelector('#back-to-main-btn').onclick = renderMain;
      
      // Submit
      app.querySelector('#submit-advice-btn').onclick = async function() {
        var body = {};
        app.querySelectorAll('input[type="range"]').forEach(function(el) {
          var f = el.dataset.f;
          if(f && f.indexOf('ai-') === 0) {
            var fieldName = f.substring(3);
            body[fieldName] = el.value;
          }
        });
        body.chronicDiseases = hasChronic ? '有慢性病史' : '';
        
        document.getElementById('advice-content').innerHTML = '<div class="chart-placeholder">🤔 正在分析您的健康数据...</div>';
        
        try {
          var res = await fetch(API_BASE + '/api/nutrition-advice', {
            method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentUser.token},
            body:JSON.stringify(body)
          });
          var result = await res.json();
          if(result.ok && result.advice) {
            adviceText = result.advice;
            renderMain();
            var formatted = result.advice.replace(/\\n/g, '<br>');
            document.getElementById('advice-content').innerHTML = '<div class="prescription-box" style="border-color:var(--orange);background:var(--orange-light);color:var(--text);font-size:15px;line-height:1.8;">' + formatted + '</div>';
            toast('建议已生成 ✅');
          } else {
            document.getElementById('advice-content').innerHTML = '<div class="text-muted" style="text-align:center;padding:20px;">暂时无法生成建议，请稍后再试</div>';
            toast('生成失败');
          }
        } catch(e) {
          document.getElementById('advice-content').innerHTML = '<div class="text-muted" style="text-align:center;padding:20px;">网络错误，请重试</div>';
          toast('网络错误');
        }
      };
    }
    
    renderMain();
};
PAGES.me = (app) => {
    const p = storage.getProfile() || {};
    const streak = storage.signStreak();
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">我的</div><div class="header-subtitle">个人中心</div></div></div>
            <div class="card"><div class="row"><div class="avatar orange" style="width:65px;height:65px;font-size:35px;">\uD83D\uDC68</div><div><div class="fs-40 fw-600">${escapeHtml(p.name || '张三')}${(currentUser&&currentUser.role?'<span class="tag orange">' + escapeHtml(currentUser.role) + '</span>':'')}${p.hasChronic ? '<span class="tag">慢性病</span>' : ''}<span class="tag orange">VIP</span></div></div><button class="btn btn-ghost" data-go="profile-setup">编辑</button></div><div class="row mt-20"><div class="info-pill green"><div class="fs-36 fw-600">${p.height || '178'} cm</div><div>身高</div></div><div class="info-pill orange"><div class="fs-36 fw-600">${p.weight || '66'} kg</div><div>体重</div></div></div></div>
            <div class="card"><div class="card-title">账号</div><div class="form-row" data-go="profile-setup"><span>\uD83D\uDC68\u200D</span><div style="flex:1">个人资料</div><span>\u203A</span></div><div class="form-row" data-go="monitor"><span>\uD83D\uDCF3</span><div style="flex:1">我的数据</div><span>\u203A</span></div><div class="form-row" data-go="coin"><span>\uD83E\uDE99</span><div style="flex:1">健康币</div><span>${storage.signStreak()+2} 枚 \u203A</span></div><div class="form-row" data-go="services"><span>\uD83D\uDCB3</span><div style="flex:1">付费服务</div><span>\u203A</span></div><div class="form-row" data-go="myrx"><span>\uD83D\uDCCB</span><div style="flex:1">我的处方</div><span>\u203A</span></div><div class="form-row" id="bind-elderly-btn"><span>👴</span><div style="flex:1">绑定老人</div><span>›</span></div><div class="form-row" data-go="volunteer"><span>\uD83E\uDD1D</span><div style="flex:1">志愿者申请</div><span>\u203A</span></div><div class="form-row" data-go="account"><span>\uD83D\uDD10</span><div style="flex:1">账号管理</div><span>\u203A</span></div></div>
            <div class="card"><div class="card-title">更多</div><div class="form-row"><span>\uD83D\uDCDA</span><div style="flex:1">课程与计划</div><span>\u203A</span></div><div class="form-row"><span>\uD83C\uDFC6</span><div style="flex:1">成就</div><span>\u203A</span></div><div class="form-row" data-go="settings"><span>\u2699\uFE0F</span><div style="flex:1">设置</div><span>\u203A</span></div><div class="form-row"><span>\uD83D\uDCAC</span><div style="flex:1">用户反馈</div><span>\u203A</span></div><div class="form-row" onclick="window.customerService()"><span>\uD83C\uDFDE\uFE0F</span><div style="flex:1">联系客服</div><span>\u203A</span></div><div class="form-row"><span>\uD83D\uDEE1\uFE0F</span><div style="flex:1">隐私政策</div><span>\u203A</span></div></div>
            <div class="card"><div class="form-row" id="logout-btn" style="border-bottom:none;justify-content:center;"><span>\uD83D\uDEAA</span><div style="flex:1;text-align:center;color:var(--red);font-size:16px;">退出登录</div><span></span></div></div>
        </div>`;
    app.querySelectorAll('[data-go]').forEach(el => el.onclick = () => navigate(el.dataset.go));
    // Load bound elderly from server
  if(currentUser && !localStorage.getItem('boundElderlyPhone')){
    fetch(API_BASE+'/api/bind/elderly',{headers:{Authorization:'Bearer '+currentUser.token}}).then(function(r){return r.json();}).then(function(d){
      if(d.ok && d.phone) localStorage.setItem('boundElderlyPhone', d.phone);
    });
  }
  app.querySelector('#logout-btn').onclick = logout;
    app.querySelector('#bind-elderly-btn').onclick = showBindElderlyDialog;
};

// ========== 初始化 ==========

// 绑定老人对话框
function showBindElderlyDialog() {
  var d = document.createElement('div');
  d.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  var boundPhone = localStorage.getItem('boundElderlyPhone') || '';
  d.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;width:85%;max-width:340px;box-shadow:0 4px 20px rgba(0,0,0,.2);">' +
    '<div style="font-size:18px;font-weight:600;margin-bottom:16px;">\u7ed1\u5b9a\u8001\u4eba</div>' +
    '<div style="margin-bottom:12px;"><input id="bind-phone-input" class="form-input" placeholder="\u8f93\u5165\u8001\u4eba\u624b\u673a\u53f7" value="' + escapeHtml(boundPhone) + '" style="width:100%;" /></div>' +
    (boundPhone ? '<div style="font-size:13px;color:var(--green);margin-bottom:12px;">\u5df2\u7ed1\u5b9a\uff1a' + escapeHtml(boundPhone) + ' <button class="btn btn-ghost" style="font-size:12px;padding:2px 8px;color:var(--red);" id="unbind-btn">\u89e3\u7ed1</button></div>' : '') +
    '<div style="display:flex;gap:8px;"><button class="btn btn-primary" style="flex:1;padding:10px;" id="bind-confirm-btn">\u4fdd\u5b58</button><button class="btn btn-ghost" style="flex:1;padding:10px;" id="bind-cancel-btn">\u53d6\u6d88</button></div></div>';
  document.body.appendChild(d);
  d.querySelector('#bind-confirm-btn').onclick = function(){
    var phone = d.querySelector('#bind-phone-input').value.trim();
    if(!phone){ toast('\u8bf7\u8f93\u5165\u624b\u673a\u53f7'); return; }
    localStorage.setItem('boundElderlyPhone', phone);
    if(currentUser){
      fetch(API_BASE+'/api/bind/elderly',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentUser.token},body:JSON.stringify({elderlyPhone:phone})});
    }
    toast('\u5df2\u7ed1\u5b9a\u8001\u4eba\uff1a' + phone);
    d.remove();
  };
  d.querySelector('#unbind-btn').onclick = function(){
    if(!confirm('\u786e\u5b9a\u89e3\u7ed1\u5417\uff1f')) return;
    localStorage.removeItem('boundElderlyPhone');
    if(currentUser){
      fetch(API_BASE+'/api/bind/elderly',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentUser.token},body:JSON.stringify({elderlyPhone:''})});
    }
    toast('\u5df2\u89e3\u7ed1');
    d.remove();
  };
  d.querySelector('#bind-cancel-btn').onclick = function(){ d.remove(); };
  d.onclick = function(e){ if(e.target===d) d.remove(); };
}

// ── 付费服务页面 ──
PAGES.services = (app) => {
  setNavTitle("付费服务");
  app.innerHTML = '<div class="container">'+
    '<div class="card"><div class="card-title">我的健康币</div><div id="coin-balance" style="font-size:24px;font-weight:700;color:var(--orange);">¥ 0 枚</div><div style="margin-top:8px;"><button class="btn btn-primary btn-block" onclick="navigate(\'coin\')">充值健康币</button></div></div>'+
    '<div class="card"><div class="card-title">为老人购买</div>'+
    '<div style="margin-bottom:6px;"><input id="elderly-phone-input" class="form-input" placeholder="输入老人手机号" style="width:100%;" value="' + (localStorage.getItem('boundElderlyPhone')||'') + '" /></div>'+
    '<div style="font-size:12px;color:var(--gray);margin-bottom:8px;">已在「我的-绑定老人」中设置过的话，手机号会自动填入</div></div>'+
    '<div class="card"><div class="card-title">为老人购买课程</div>'+
    '<div style="display:flex;gap:8px;margin-bottom:6px;"><button class="btn btn-primary" id="load-courses-btn" style="padding:6px 12px;">查询课程</button></div>'+
    '<div id="courses-for-elderly"><div class="text-muted" style="text-align:center;padding:8px;">点击查询课程按钮查看可购买的课程</div></div></div></div>';
  // Load bound elderly phone from server
  if(currentUser && !localStorage.getItem('boundElderlyPhone')){
    fetch(API_BASE+'/api/bind/elderly',{headers:{Authorization:'Bearer '+currentUser.token}}).then(function(r){return r.json();}).then(function(d){
      if(d.ok && d.phone) localStorage.setItem('boundElderlyPhone', d.phone);
    });
  }
  // Load coin balance from server
  if(currentUser){
    fetch(API_BASE+"/api/coins",{headers:{Authorization:"Bearer "+currentUser.token}}).then(function(r){return r.json();}).then(function(d){
      document.getElementById("coin-balance").innerHTML = "\u00a5 " + (d.coins||0) + " 枚";
    });
  }
  // Load services list
  fetch(API_BASE+"/api/services").then(function(r){return r.json();}).then(function(d){
    if(d.data&&d.data.length){
      var html = d.data.map(function(s){
        return '<div class="prescription-box" style="margin-bottom:10px;border-color:var(--orange);background:var(--orange-light);color:var(--text);"><div style="display:flex;justify-content:space-between;align-items:center;"><div><strong>'+escapeHtml(s.name)+'</strong><br><span style="font-size:14px;">\u00a5 '+s.price+' 健康币</span><br><span style="font-size:13px;color:var(--gray);">'+escapeHtml(s.description||"")+'</span><br><span style="font-size:12px;color:var(--gray);">已参与 '+(s.enrolled||0)+' / '+s.maxParticipants+' 人</span></div><button class="btn btn-primary" style="font-size:14px;padding:8px 16px;" onclick=\'purchaseService("'+s.id+'")\'>立即购买</button></div></div>';
      }).join("");
      document.getElementById("svc-list").innerHTML = html;
    } else {
      document.getElementById("svc-list").innerHTML = '<div class="text-muted" style="text-align:center;padding:10px;">无</div>';
    }
  });
  // Load purchased services
  if(currentUser){
    fetch(API_BASE+"/api/my-services",{headers:{Authorization:"Bearer "+currentUser.token}}).then(function(r){return r.json();}).then(function(d){
      if(d.data&&d.data.length){
        document.getElementById("my-services").innerHTML = d.data.map(function(s){
          return '<div class="badge badge-green" style="font-size:13px;padding:6px 10px;margin:4px;display:inline-block;">\u2705 '+escapeHtml(s.name)+'</div>';
        }).join("");
      } else {
        document.getElementById("my-services").innerHTML = '<div class="text-muted" style="text-align:center;padding:10px;">无</div>';
      }
    });
  }

    // 为老人购买课程 - 绑定查询按钮
    var lcb = document.getElementById('load-courses-btn');
    if(lcb) lcb.onclick = loadCoursesForChildren;
    var epi = document.getElementById('elderly-phone-input');
    if(epi) epi.onkeypress = function(e) { if(e.key==='Enter' && document.getElementById('load-courses-btn')) document.getElementById('load-courses-btn').click(); };
    // 快速选择长辈联系人
    // 绑定查询课程按钮
    var inp = document.getElementById('elderly-phone-input');
    var lcb = document.getElementById('load-courses-btn');
    if(lcb) lcb.onclick = function(){
        var phone = inp ? inp.value.trim() : '';
        if(!phone){ toast('\u8bf7\u5148\u8f93\u5165\u8001\u4eba\u624b\u673a\u53f7'); return; }
        loadCoursesForChildren();
    };
    // 快速选择长辈联系人
    (function(){
        var el = document.getElementById('quick-elderly-contacts');
        if(!el) return;
        var ecs = storage.getContacts().filter(function(c){ return c.phone && (c.relation === '\u957f\u8f88' || c.relation === '\u7236\u6bcd'); });
        if(ecs.length === 0){ el.style.display='none'; return; }
        el.style.display='';
        var h = '<div style="display:flex;flex-wrap:wrap;gap:4px;padding:2px 0 6px;"><span style="font-size:12px;color:var(--text-secondary);line-height:30px;margin-right:2px;">\u957f\u8f88\uff1a</span>';
        ecs.forEach(function(c){ h += '<button class="btn btn-ghost" style="font-size:12px;padding:3px 10px;min-width:auto;margin:0;" onclick="document.getElementById(\'elderly-phone-input\').value=\''+c.phone+'\';document.getElementById(\'load-courses-btn\').click();">'+c.name+'</button>'; });
        h += '</div>';
        el.innerHTML = h;
    })();
};

window.purchaseService = async function(id) {
  var elderlyPhone = '';
  var selEl = document.getElementById('elderly-phone-select');
  if(selEl && selEl.value) elderlyPhone = selEl.value;
  var inpEl = document.getElementById('elderly-phone-input');
  if(inpEl && inpEl.value.trim() && !elderlyPhone) elderlyPhone = inpEl.value.trim();
  if(!currentUser){toast("请先登录");return;}
  var url = elderlyPhone ? API_BASE+'/api/service/purchase-for-elderly' : API_BASE+'/api/service/purchase';
  var res = await fetch(url,{
    method:"POST", headers:{"Content-Type":"application/json",Authorization:"Bearer "+currentUser.token},
    body:JSON.stringify({serviceId:id, elderlyPhone:elderlyPhone})
  });
  var data = await res.json();
  if(data.ok){toast("购买成功 \u2705");navigate("services");}else{toast(data.error||"购买失败");}
};

// ── 我的运动处方页面 ──

async function loadCoursesForChildren() {
  var container = document.getElementById('courses-for-elderly');
  if(!container) return;
  var elderlyPhone = '';
  var inpEl = document.getElementById('elderly-phone-input');
  if(inpEl) elderlyPhone = inpEl.value.trim();
  if(!elderlyPhone){container.innerHTML='<div class="text-muted" style="text-align:center;padding:10px;">\u8bf7\u5148\u8f93\u5165\u8001\u4eba\u624b\u673a\u53f7</div>';return;}
  container.innerHTML = '<div class="text-muted" style="text-align:center;padding:10px;">\u52a0\u8f7d\u4e2d...</div>';
  try {
    var userRes = await fetch(API_BASE + '/api/user/search?phone=' + encodeURIComponent(elderlyPhone), {
      headers: { Authorization: 'Bearer ' + currentUser.token }
    });
    var userData = await userRes.json();
    // Show who we're buying for
    var selName = '';
    var selEl = document.getElementById('elderly-phone-select');
    if(selEl && selEl.selectedIndex > 0) selName = selEl.options[selEl.selectedIndex].text;
    if(!userRes.ok || !userData.user) {
      container.innerHTML = '<div class="text-muted" style="text-align:center;padding:10px;color:var(--red);">\u672a\u627e\u5230\u8be5\u7528\u6237</div>';
      return;
    }
    var res = await fetch(API_BASE + '/api/courses');
    var d = await res.json();
    if(d.data && d.data.length) {
      var html = d.data.map(function(c) {
        return '<div class="prescription-box" style="margin-bottom:10px;border-color:var(--orange);background:var(--orange-light);"><div style="display:flex;justify-content:space-between;align-items:center;"><div><strong>' + escapeHtml(c.name) + '</strong><br><span style="font-size:14px;">' + c.price + ' \u5065\u5eb7\u5e01</span><br><span style="font-size:13px;color:var(--gray);">' + escapeHtml(c.description||'') + '</span></div><button class="btn btn-primary" style="padding:8px 16px;" onclick=\'purchaseCourseForElderly("' + c.id + '","' + escapeHtml(elderlyPhone) + '")\'>\u7acb\u5373\u8d2d\u4e70</button></div></div>';
      }).join('');
      container.innerHTML = html;
    } else {
      container.innerHTML = '<div class="text-muted" style="text-align:center;padding:10px;">\u6682\u65e0\u53ef\u8d2d\u4e70\u7684\u8bfe\u7a0b</div>';
    }
  } catch(e) {
    container.innerHTML = '<div class="text-muted" style="text-align:center;padding:10px;">\u7f51\u7edc\u9519\u8bef</div>';
  }
}
window.purchaseCourseForElderly = async function(courseId, elderlyPhone) {
  if(!currentUser) { toast('\u8bf7\u5148\u767b\u5f55'); return; }
  var res = await fetch(API_BASE + '/api/course/purchase-for-elderly', {
    method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentUser.token},
    body:JSON.stringify({courseId:courseId, elderlyPhone:elderlyPhone})
  });
  var d = await res.json();
  if(d.ok) { toast('\u8d2d\u4e70\u6210\u529f \u2705 \u8bfe\u7a0b\u5df2\u540c\u6b65\u5230\u8001\u4eba\u8d26\u53f7'); loadCoursesForChildren(); }
  else toast(d.error || '\u8d2d\u4e70\u5931\u8d25');
};


PAGES.activity = (app, params) => {
  setNavTitle('\u4eb2\u5b50\u6d3b\u52a8');
  var activityId = params && params.id;
  if(!activityId){ app.innerHTML = '<div class="container"><div class="text-muted" style="padding:20px;text-align:center;">\u7f3a\u5c11\u6d3b\u52a8ID</div></div>'; return; }
  app.innerHTML = '<div class="container"><div class="card"><div class="card-title" id="act-title">\u52a0\u8f7d\u4e2d...</div><div id="act-info"></div></div>' +
    '<div class="card" id="checkin-card" style="display:none;"><div class="card-title">\u6bcf\u65e5\u6253\u5361</div>' +
    '<button class="btn btn-primary btn-block" id="act-checkin-btn">\u70b9\u51fb\u6253\u5361</button></div>' +
    '<div class="card" id="task-card" style="display:none;"><div class="card-title" id="act-task-title">\u6bcf\u65e5\u4efb\u52a1</div>' +
    '<div id="act-task-desc" style="font-size:14px;margin-bottom:8px;"></div>' +
    '<button class="btn btn-primary btn-block" id="act-task-btn">\u5b8c\u6210\u4efb\u52a1</button></div>' +
    '<div class="card"><div class="card-title">\u6211\u7684\u79ef\u5206</div><div id="act-coins" style="font-size:24px;font-weight:700;color:var(--orange);text-align:center;">0 \u5e01</div></div></div>';
  
  var aid = activityId;
  var today = new Date().toISOString().slice(0,10);
  
  // Load activity details
  fetch(API_BASE + '/api/activities').then(function(r){return r.json();}).then(function(d){
    var act = d.data ? d.data.find(function(a){ return a.id === aid; }) : null;
    if(!act) { document.getElementById('act-title').textContent = '\u6d3b\u52a8\u4e0d\u5b58\u5728'; return; }
    document.getElementById('act-title').textContent = act.name;
    document.getElementById('act-info').innerHTML = '<div style="font-size:14px;color:#666;">' + escapeHtml(act.description||'') + '</div><div style="font-size:13px;color:#999;margin-top:4px;">' + (act.startDate||'') + ' ~ ' + (act.endDate||'') + '</div>';
    document.getElementById('act-task-desc').textContent = act.taskDescription || '\u5b8c\u6210\u4eca\u65e5\u5065\u5eb7\u4efb\u52a1';
    document.getElementById('checkin-card').style.display = 'block';
    document.getElementById('task-card').style.display = 'block';
    
    // Load signup data
    if(currentUser){
      fetch(API_BASE + '/api/activity/my', { headers: { Authorization: 'Bearer ' + currentUser.token } }).then(function(r){return r.json();}).then(function(sd){
        var my = sd.data ? sd.data.find(function(x){ return x.activity.id === aid; }) : null;
        if(my && my.signup){
          var coins = my.signup.coinsEarned || 0;
          document.getElementById('act-coins').innerHTML = coins + ' \u5e01';
          var checkedIn = my.signup.checkins && my.signup.checkins.includes(today);
          var taskDone = my.signup.tasks && my.signup.tasks.includes(today);
          document.getElementById('act-checkin-btn').textContent = checkedIn ? '\u2705 \u4eca\u65e5\u5df2\u6253\u5361' : '\u70b9\u51fb\u6253\u5361 (+' + act.checkinReward + '\u5e01)';
          document.getElementById('act-checkin-btn').disabled = checkedIn;
          document.getElementById('act-checkin-btn').style.opacity = checkedIn ? '0.6' : '1';
          document.getElementById('act-task-btn').textContent = taskDone ? '\u2705 \u4eca\u65e5\u4efb\u52a1\u5df2\u5b8c\u6210' : '\u5b8c\u6210\u4efb\u52a1 (+' + act.taskReward + '\u5e01)';
          document.getElementById('act-task-btn').disabled = taskDone;
          document.getElementById('act-task-btn').style.opacity = taskDone ? '0.6' : '1';
        }
      });
    }
  });
  
  // Checkin button
  document.getElementById('act-checkin-btn').onclick = async function(){
    if(!currentUser){ toast('\u8bf7\u5148\u767b\u5f55'); return; }
    var res = await fetch(API_BASE + '/api/activity/checkin', { method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentUser.token}, body:JSON.stringify({activityId:aid}) });
    var d = await res.json();
    if(d.ok){ toast(d.message||'\u6253\u5361\u6210\u529f'); navigate('activity',{id:aid}); }else{ toast(d.error||'\u5931\u8d25'); }
  };
  // Task button
  document.getElementById('act-task-btn').onclick = async function(){
    if(!currentUser){ toast('\u8bf7\u5148\u767b\u5f55'); return; }
    var res = await fetch(API_BASE + '/api/activity/task', { method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentUser.token}, body:JSON.stringify({activityId:aid}) });
    var d = await res.json();
    if(d.ok){ toast(d.message||'\u4efb\u52a1\u5b8c\u6210'); navigate('activity',{id:aid}); }else{ toast(d.error||'\u5931\u8d25'); }
  };
};


PAGES.volunteer = (app) => {
  setNavTitle('\u5FD7\u613F\u8005\u7533\u8BF7');
  app.innerHTML = '<div class="container">'+
    '<div class="card"><div class="card-title">\u53EF\u62A5\u540D\u7684\u5FD7\u613F\u6D3B\u52A8</div><div id="vol-opps"><div class="text-muted" style="text-align:center;padding:12px;">\u52A0\u8F7D\u4E2D...</div></div></div>'+
    '<div class="card"><div class="card-title">\u6211\u7684\u5FD7\u613F\u8BB0\u5F55</div><div id="vol-mine"><div class="text-muted" style="text-align:center;padding:12px;">\u52A0\u8F7D\u4E2D...</div></div></div></div>';
  
  // Load available opportunities
  fetch(API_BASE + '/api/volunteer/list').then(function(r){return r.json();}).then(function(d){
    var el = document.getElementById('vol-opps');
    if(!el) return;
    if(!d.data || !d.data.length){ el.innerHTML = '<div class="text-muted" style="text-align:center;padding:12px;font-size:13px;">\u6682\u65E0\u5FD7\u613F\u6D3B\u52A8</div>'; return; }
    var h = '';
    d.data.forEach(function(v){
      h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0f1f2;">' +
        '<div><div style="font-weight:600;font-size:14px;">' + escapeHtml(v.title) + '</div>' +
        '<div style="font-size:12px;color:#999;">' + (v.location||'') + ' | ' + (v.date||'') + ' ' + (v.time||'') + '</div>' +
        '<div style="font-size:12px;color:#999;">' + (v.description||'') + '</div>' +
        '<div style="font-size:12px;color:var(--green);">\u6BCF\u5C0F\u65F6 ' + v.rewardPerHour + ' \u5065\u5EB7\u5E01</div></div>' +
        '<button class="btn btn-primary" style="padding:6px 12px;font-size:13px;white-space:nowrap;" onclick="applyVolunteer(\'' + v.id + '\')">\u62A5\u540D</button></div>';
    });
    el.innerHTML = h;
  });
  
  // Load my applications
  if(currentUser){
    fetch(API_BASE + '/api/volunteer/my', { headers: { Authorization: 'Bearer ' + currentUser.token } }).then(function(r){return r.json();}).then(function(d){
      var el = document.getElementById('vol-mine');
      if(!el) return;
      if(!d.data || !d.data.length){ el.innerHTML = '<div class="text-muted" style="text-align:center;padding:12px;font-size:13px;">\u5C1A\u672A\u62A5\u540D\u5FD7\u613F\u6D3B\u52A8</div>'; return; }
      var h = '';
      d.data.forEach(function(item){
        var v = item.volunteer;
        var a = item.app;
        if(!v) return;
        h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f1f2;">' +
          '<div><div style="font-size:14px;font-weight:600;">' + escapeHtml(v.title) + '</div>' +
          '<div style="font-size:12px;color:#999;">' + (v.location||'') + ' | ' + (v.date||'') + ' ' + (v.time||'') + '</div></div>' +
          '<div style="font-size:13px;font-weight:600;color:var(--orange);">' + (a.coinsEarned||0) + ' \u5E01</div></div>';
      });
      el.innerHTML = h;
    });
  }
};
window.applyVolunteer = async function(id) {
  if(!currentUser){ toast('\u8BF7\u5148\u767B\u5F55'); return; }
  var res = await fetch(API_BASE + '/api/volunteer/apply', { method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentUser.token}, body:JSON.stringify({volunteerId:id}) });
  var d = await res.json();
  if(d.ok){ toast('\u62A5\u540D\u6210\u529F'); navigate('volunteer'); }else{ toast(d.error||'\u62A5\u540D\u5931\u8D25'); }
};

PAGES.myrx = (app) => {
  setNavTitle("我的运动处方");
  app.innerHTML = '<div class="container"><div id="rx-content"><div class="chart-placeholder">加载中...</div></div></div>';
  if(!currentUser){document.getElementById("rx-content").innerHTML='<div class="text-muted" style="padding:20px;">请先登录</div>';return;}
  fetch(API_BASE+"/api/my-prescription",{headers:{Authorization:"Bearer "+currentUser.token}}).then(function(r){return r.json();}).then(function(d){
    var rx = d.data;
    if(rx&&rx.items){
      document.getElementById("rx-content").innerHTML =
        '<div class="card"><div class="card-title">智能运动处方</div>'+
        '<div class="prescription-box" style="border-color:var(--green);background:var(--green-light);color:var(--green-dark);margin-bottom:12px;">'+
        '<div><strong>运动目标:</strong> '+escapeHtml(rx.goal||"")+'</div>'+
        '<div><strong>强度:</strong> '+escapeHtml(rx.intensity||"")+' | <strong>心率:</strong> \u2264'+escapeHtml(rx.maxHeartRate||"")+'</div>'+
        '<div><strong>频率:</strong> '+escapeHtml(rx.frequency||"")+' | <strong>时长:</strong> '+escapeHtml(rx.duration||"")+'</div></div>'+
        '<div class="card-title">训练项目</div>'+
        (rx.items||[]).map(function(i){return '<div class="prescription-box" style="border-color:var(--orange);background:var(--orange-light);color:var(--text);margin-bottom:8px;"><div style="font-size:18px;font-weight:600;">'+(i.icon||"")+' '+escapeHtml(i.name)+'</div><div style="font-size:15px;color:var(--gray);">'+escapeHtml(i.detail)+'</div></div>';}).join("")+
        (rx.cautions?'<div class="card-title">注意事项</div><div class="prescription-box" style="border-color:var(--red);background:#fffafa;color:var(--red);">'+escapeHtml(rx.cautions)+'</div>':'')+
        (rx.dietAdvice?'<div class="card-title">营养建议</div><div class="prescription-box" style="border-color:#fce4d6;background:#fff8f0;color:#92400e;">'+escapeHtml(rx.dietAdvice)+'</div>':'')+
        '</div>';
    } else {
      document.getElementById("rx-content").innerHTML = '<div class="text-muted" style="padding:20px;">暂无处方，请联系管理员或健康师</div>';
    }
  });
};

// ── 账号管理（含注销） ──

// ── 设置（含注销账户）──
PAGES.settings = (app) => {
  setNavTitle("设置");
  app.innerHTML = '<div class="container"><div class="card"><div class="card-title">账户信息</div>'+
    '<div style="font-size:16px;margin-bottom:4px;">手机号: <strong>'+(currentUser?escapeHtml(currentUser.phone):"")+'</strong></div>'+
    '<div style="font-size:16px;margin-bottom:16px;">身份: <strong>'+(currentUser?escapeHtml(currentUser.role||"银龄用户"):"")+'</strong></div></div>'+
    '<div class="card"><div class="card-title" style="color:var(--red);">危险操作</div>'+
    '<button class="btn btn-danger btn-block" id="delete-account-btn">\uD83D\DDD1\uFE0F 注销账户</button>'+
    '<div style="font-size:12px;color:var(--gray);margin-top:8px;text-align:center;">注销后该手机号可重新注册，但所有数据将被永久删除</div></div></div>';
  document.getElementById("delete-account-btn").onclick = async function(){
    if(!currentUser){toast("请先登录");return;}
    var result = await modal({title:"确认注销",content:"确定要注销账户吗？\n手机号 '+escapeHtml(currentUser.phone)+' 将被释放\n所有数据将被永久删除！",confirmText:"确认注销",confirmColor:"#e8504a"});
    if(result.confirm){
      try {
        var res = await fetch(API_BASE+"/api/account/delete",{method:"POST",headers:{Authorization:"Bearer "+currentUser.token}});
        var data = await res.json();
        if(data.ok){toast("账户已注销，手机号可重新注册 \u2705");logout();}else{toast(data.error||"注销失败");}
      } catch(e){toast("网络错误");}
    }
  };
};

PAGES.account = (app) => {
  setNavTitle("账号管理");
  app.innerHTML = '<div class="container"><div class="card"><div class="card-title">我的身份</div>'+
    '<div style="font-size:18px;margin-bottom:8px;">当前身份: <strong>'+(currentUser?escapeHtml(currentUser.role||"银龄用户"):"")+'</strong></div>'+
    '<div style="font-size:13px;color:var(--gray);margin-bottom:16px;">每个手机号只能绑定一个身份，如需更换请注销账户</div></div>'+
    '<div class="card"><div class="card-title" style="color:var(--red);">危险操作</div>'+
    '<button class="btn btn-danger btn-block" id="delete-account-btn">注销账户</button>'+
    '<div style="font-size:12px;color:var(--gray);margin-top:8px;text-align:center;">注销后账户数据将被永久删除，且不可恢复</div></div></div>';
  document.getElementById("delete-account-btn").onclick = async function(){
    if(!currentUser){toast("请先登录");return;}
    var result = await modal({title:"确认注销",content:"确定要注销账户吗？\n所有数据将被永久删除！",confirmText:"确认注销",confirmColor:"#e8504a"});
    if(result.confirm){
      try {
        var res = await fetch(API_BASE+"/api/account/delete",{method:"POST",headers:{Authorization:"Bearer "+currentUser.token}});
        var data = await res.json();
        if(data.ok){toast("账户已注销");logout();}else{toast(data.error||"注销失败");}
      } catch(e){toast("网络错误");}
    }
  };
};

// ── 健康币充值页面（微信/支付宝）──
PAGES.recharge = (app) => {
  setNavTitle("充值中心");
  app.innerHTML = '<div class="container"><div class="card"><div class="card-title">选择充值金额</div>'+
    '<div class="grid-2">'+
    '<div class="feature-tile orange" onclick="selectRecharge(10)"><div class="fi">10</div><div class="fn">10 枚</div></div>'+
    '<div class="feature-tile green" onclick="selectRecharge(30)"><div class="fi">30</div><div class="fn">30 枚</div></div>'+
    '<div class="feature-tile orange" onclick="selectRecharge(50)"><div class="fi">50</div><div class="fn">50 枚</div></div>'+
    '<div class="feature-tile green" onclick="selectRecharge(100)"><div class="fi">100</div><div class="fn">100 枚</div></div>'+
    '</div>'+
    '<div style="margin-top:12px;text-align:center;font-size:16px;">选择金额: <strong id="selected-amount">50</strong> 枚</div>'+
    '<div class="card"><div class="card-title">选择支付方式</div>'+
    '<div class="form-row" onclick="doRecharge(\'微信\')"><span style="font-size:24px;">\uD83D\uDCB1</span><div style="flex:1;font-size:16px;">微信支付</div><span>\u203A</span></div>'+
    '<div class="form-row" onclick="doRecharge(\'支付宝\')"><span style="font-size:24px;">\uD83D\uDCB0</span><div style="flex:1;font-size:16px;">支付宝</div><span>\u203A</span></div>'+
    '</div><div id="recharge-result" style="margin-top:8px;text-align:center;"></div></div>';
  selectRecharge(50);
};

function selectRecharge(amount) {
  document.getElementById("selected-amount").textContent = amount;
  window._rechargeAmount = amount;
}

async function doRecharge(method) {
  if(!currentUser){toast("请先登录");return;}
  var amount = window._rechargeAmount || 50;
  document.getElementById("recharge-result").innerHTML = '<div class="chart-placeholder">\uD83D\uDD04 正在处理'+method+'支付...</div>';
  try {
    var res = await fetch(API_BASE+"/api/coins/recharge",{
      method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+currentUser.token},
      body:JSON.stringify({amount:amount,method:method})
    });
    var data = await res.json();
    if(data.ok){toast(method+"充值成功 \u2705");navigate("services");}else{toast(data.error||"充值失败");}
  } catch(e){toast("网络错误");}
}


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
        } catch(e) { document.getElementById('back-to-em').onclick = function() { navigate('emergency'); };
        toast('网络错误'); }
      };
    } else {
      resultDiv.innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;">未找到该用户</div>';
    }
  } catch(e) {
    resultDiv.innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;">网络错误</div>';
    document.getElementById('back-to-em').onclick = function() { navigate('emergency'); };
        toast('网络错误');
  }
}




// ── 加载康复报告 ──
async function loadReports(app) {
    if(!currentUser){ return; }
    try {
        var res = await fetch(API_BASE+'/api/messages/reports', {headers:{Authorization:'Bearer '+currentUser.token}});
        var d = await res.json();
        if(d.data && d.data.length){
            var html = '';
            d.data.forEach(function(msg){
                var text = msg.text || '';
                var title = text.split('\\n')[0] || '康复报告';
                var time = msg.timestamp ? new Date(msg.timestamp).toLocaleString('zh-CN') : '';
                html += '<div class="list-item" style="cursor:pointer;"><div class="avatar orange">📋<\/div><div class="list-content"><div class="list-name">'+escapeHtml(title)+'<\/div><div class="list-desc" style="font-size:12px;">'+time+'<\/div><\/div><\/div>';
            });
            app.querySelector('#report-list').innerHTML = html;
            (function(data2){
                app.querySelectorAll('#report-list .list-item').forEach(function(el,i){
                    el.onclick = function(){ showReportContent(data2[i].text); };
                });
            })(d.data);
            app.querySelector('#report-card').style.display = 'block';
        }
    } catch(e){}
}
function showReportContent(text) {
  if(!text) return;
  var d = document.createElement('div');
  d.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  d.innerHTML = '<div style="background:#fff;border-radius:12px;padding:20px;width:85%;max-width:350px;max-height:80vh;overflow-y:auto;"><div style="font-weight:600;margin-bottom:8px;font-size:16px;">📋 康复报告</div><div style="font-size:13px;white-space:pre-wrap;">'+escapeHtml(text)+'</div><button onclick="this.parentNode.parentNode.remove()" style="margin-top:12px;background:#ff6b35;color:#fff;border:none;padding:8px 30px;border-radius:20px;font-size:15px;cursor:pointer;">关闭</button></div>';
  document.body.appendChild(d);
}function init() {
    const tabbar = document.getElementById('tabbar');
    tabbar.innerHTML = TABBAR_LIST.map(t => `<div class="tab-item" data-tab="${t.key}"><div class="ic">${t.icon}</div><div>${t.text}</div></div>`).join('');
    tabbar.querySelectorAll('.tab-item').forEach(el => el.onclick = () => navigate(el.dataset.tab));
    document.getElementById('navbar-back').onclick = () => { if (history.length > 1) history.back(); else navigate('home'); };

    const saved = localStorage.getItem('user');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            // 尝试同步，但不影响登录状态
            pullFromCloud().finally(() => {
                if (!location.hash || location.hash === '#/index') navigate('home');
                else render();
            });
        } catch(e) {
            currentUser = null;
            localStorage.removeItem('user');
            navigate('login');
        }
    } else {
        if (!location.hash || location.hash === '#/index') navigate('index');
        else render();
    }
}

document.addEventListener('DOMContentLoaded', init);

// 联系客服
window.customerService = function() {
  var d = document.createElement("div");
  d.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;";
  d.innerHTML = '<div style="background:#fff;border-radius:16px;padding:30px 24px;width:85%;max-width:300px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.2);">' +
    '<div style="font-size:48px;margin-bottom:12px;">📧</div>' +
    '<div style="font-size:17px;font-weight:600;margin-bottom:12px;">联系客服</div>' +
    '<div style="font-size:15px;color:#666;line-height:1.7;margin-bottom:20px;">返回微信公众号，您可以直接发消息给客服</div>' +
    '<button onclick="this.parentNode.parentNode.remove()" style="background:#ff6b35;color:#fff;border:none;padding:10px 40px;border-radius:24px;font-size:16px;cursor:pointer;">我知道了</button>' +
  '</div>';
  document.body.appendChild(d);
// Friend request actions
function acceptFriend(phone){
  if(!currentUser){toast('请先登录');return;}
  fetch(API_BASE+'/api/friend/accept',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+currentUser.token},body:JSON.stringify({fromPhone:phone})})
    .then(function(r){return r.json();}).then(function(d){if(d.ok){toast('已接受');render();}else toast(d.error||'操作失败');});
}
function rejectFriend(phone){
  if(!currentUser){toast('请先登录');return;}
  fetch(API_BASE+'/api/friend/reject',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+currentUser.token},body:JSON.stringify({fromPhone:phone})})
    .then(function(r){return r.json();}).then(function(d){if(d.ok){toast('已拒绝');render();}else toast(d.error||'操作失败');});
}

  d.onclick = function(e) { if(e.target===d) d.remove(); };
};


