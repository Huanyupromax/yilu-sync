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
            { name: '女儿', avatar: '👩', bg: 'orange', time: '刚刚', phone: '13800001234' },
            { name: '儿子', avatar: '👨', bg: '', time: '10:25', phone: '13900005678' },
            { name: '老李', avatar: '👴', bg: 'orange', time: '昨天', phone: '13800000001' },
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
            </div>`;
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
async function loginOrRegister(phone, password, isLogin) {
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
const TABBAR_PAGES = ['home', 'sport', 'prescription', 'data', 'messages', 'me'];
const TABBAR_LIST = [
    { key: 'home', text: '工作台', icon: '💼' },
    { key: 'sport', text: '患者', icon: '👥' },
    { key: 'prescription', text: '处方', icon: '📋' },
    { key: 'data', text: '数据', icon: '📈' },
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
    setNavTitle('工作台');
    const p = storage.getProfile();
    const name = (p && p.name) ? p.name : '医师';
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">工作台</div><div class="header-subtitle">您好，${escapeHtml(name)} · 今日工作</div></div></div>
            <div class="banner"><div class="emoji">💼</div><div><div class="t">待办事项</div><div class="s">暂无待办，请关注患者动态</div></div></div>
            <div class="grid-2">
                <div class="feature-tile orange" data-go="sport"><div class="fi">👥</div><div class="fn">患者管理</div></div>
                <div class="feature-tile green" data-go="doctor-patient-data"><div class="fi">📊</div><div class="fn">查看数据</div></div>
                <div class="feature-tile purple" data-go="doctor-send-prescription"><div class="fi">📋</div><div class="fn">发送处方</div></div>
                <div class="feature-tile blue" data-go="messages"><div class="fi">💬</div><div class="fn">消息</div></div>
            </div>
            <div class="card"><div class="card-title">📋 绑定患者</div>
                <div class="form-row"><input id="bind-patient-input" class="form-input" placeholder="输入患者手机号" style="flex:1;" /><button class="btn btn-primary" id="bind-patient-btn" style="padding:6px 12px;">绑定</button></div>
                <div id="bind-result"></div>
                <div id="bound-patients"><div class="text-muted" style="text-align:center;padding:12px;" id="no-patients-msg">暂无绑定患者</div></div>
            </div>
            <div class="card"><div class="card-title">快速统计</div><div id="work-stat"><div class="text-muted" style="text-align:center;padding:12px;">连接服务器后可查看统计数据</div></div></div>
        </div>`;
    app.querySelectorAll('[data-go]').forEach(el => el.onclick = () => navigate(el.dataset.go));
    renderBoundPatients(app);
    loadTodayStats(app);
    app.querySelector('#bind-patient-btn').onclick = function(){
        var phone = app.querySelector('#bind-patient-input').value.trim();
        if(!phone){ toast('请输入手机号'); return; }
        if(!currentUser){ toast('请先登录'); return; }
        app.querySelector('#bind-result').innerHTML = '<div class="text-muted" style="text-align:center;padding:8px;">搜索中...</div>';
        fetch(API_BASE+'/api/user/search?phone='+encodeURIComponent(phone), {headers:{Authorization:'Bearer '+currentUser.token}})
          .then(function(r){return r.json();})
          .then(function(d){
            if(d.user){
              var patients = JSON.parse(localStorage.getItem('dr_patients')||'[]');
              if(patients.some(function(p){return p.phone===phone;})){ app.querySelector('#bind-result').innerHTML = '<div class="text-muted" style="text-align:center;padding:8px;color:var(--orange);">该患者已绑定</div>'; return; }
              patients.push({phone:phone, name:d.user.name||'未命名'});
              localStorage.setItem('dr_patients', JSON.stringify(patients));
              app.querySelector('#bind-result').innerHTML = '<div class="text-muted" style="text-align:center;padding:8px;color:green;">绑定成功</div>';
              renderBoundPatients(app);
            } else {
              app.querySelector('#bind-result').innerHTML = '<div class="text-muted" style="text-align:center;padding:8px;color:var(--red);">未找到该用户</div>';
            }
          })
          .catch(function(){ app.querySelector('#bind-result').innerHTML = '<div class="text-muted" style="text-align:center;padding:8px;color:var(--red);">搜索失败</div>'; });
    };
};

function renderBoundPatients(app) {
    var patients = JSON.parse(localStorage.getItem('dr_patients')||'[]');
    var container = app.querySelector('#bound-patients');
    var noMsg = app.querySelector('#no-patients-msg');
    if(!container) return;
    if(patients.length === 0) {
        container.innerHTML = '<div class="text-muted" style="text-align:center;padding:12px;">暂无绑定患者</div>';
        return;
    }
    container.innerHTML = patients.map(function(p){
        return '<div class="list-item" style="cursor:pointer;" onclick="navigate(\'doctor-patient-data\',{phone:\''+p.phone+'\'})"><div class="avatar orange">\uD83D\uDC64</div><div class="list-content"><div class="list-name">'+escapeHtml(p.name)+'</div><div class="list-desc">'+escapeHtml(p.phone)+'</div></div></div>';
    }).join('');
}

PAGES.sport = (app) => {
    setNavTitle('患者管理');
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">患者管理</div><div class="header-subtitle">查看和管理您的患者</div></div></div>
            <div class="card"><div class="card-title">搜索患者</div>
                <div class="form-row"><input id="patient-search-input" class="form-input" placeholder="输入患者手机号" style="flex:1;" /><button class="btn btn-primary" id="patient-search-btn" style="padding:6px 12px;">搜索</button></div>
                <div id="patient-search-result"></div>
            </div>
            <div class="grid-2">
                <div class="feature-tile orange" data-go="doctor-patient-data"><div class="fi">👥</div><div class="fn">查看用户数据</div></div>
                <div class="feature-tile green" data-go="doctor-send-prescription"><div class="fi">📋</div><div class="fn">发送运动处方</div></div><div class="feature-tile purple" data-go="patient-records"><div class="fi">📋</div><div class="fn">诊疗档案</div></div><div class="feature-tile purple" data-go="ai-prescription"><div class="fi">🤖</div><div class="fn">智能处方生成</div></div>
            </div>
            <div class="card"><div class="card-title">最近联系的患者</div><div id="recent-patients"><div class="text-muted" style="text-align:center;padding:12px;">暂无记录</div></div></div>
        </div>`;
    app.querySelector('#patient-search-btn').onclick = function(){
        var phone = app.querySelector('#patient-search-input').value.trim();
        if(!phone){ toast('请输入手机号'); return; }
        if(!currentUser){ toast('请先登录'); return; }
        fetch(API_BASE+'/api/user/search?phone='+encodeURIComponent(phone), {headers:{Authorization:'Bearer '+currentUser.token}})
          .then(function(r){return r.json();})
          .then(function(d){
            if(d.user){
              app.querySelector('#patient-search-result').innerHTML = '<div class="form-row" style="border:none;"><span>👤</span><div style="flex:1;"><div>'+escapeHtml(d.user.name||'')+'</div><div class="text-muted" style="font-size:12px;">'+escapeHtml(phone)+'</div></div><button class="btn btn-sm btn-primary" data-phone="'+phone+'">查看数据</button></div>';
            } else {
              app.querySelector('#patient-search-result').innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;">未找到该用户</div>';
            }
          })
          .catch(function(){ toast('搜索失败'); });
    };
};

PAGES.data = (app) => {
    setNavTitle('数据看板');
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">数据看板</div><div class="header-subtitle">查看患者的实时健康数据</div></div></div>
            <div class="card"><div class="card-title">选择患者</div>
                <div class="form-row"><input id="dash-phone" class="form-input" placeholder="输入患者手机号" style="flex:1;" /><button class="btn btn-primary" id="dash-search-btn" style="padding:6px 12px;">搜索</button></div>
            </div>
            <div id="dash-content"></div>
        </div>`;
    app.querySelector('#dash-search-btn').onclick = function(){ loadDashData(app); };
    app.querySelector('#dash-phone').onkeypress = function(e){ if(e.key==='Enter') loadDashData(app); };
};

async function loadDashData(app) {
    var phone = app.querySelector('#dash-phone').value.trim();
    if(!phone){ toast('请输入手机号'); return; }
    if(!currentUser){ toast('请先登录'); return; }
    app.querySelector('#dash-content').innerHTML = '<div class="text-muted" style="text-align:center;padding:20px;">\u67E5\u8BE2\u4E2D...</div>';
    try {
        var res = await fetch(API_BASE+'/api/doctor/patient-data?phone='+encodeURIComponent(phone), {headers:{Authorization:'Bearer '+currentUser.token}});
        var d = await res.json();
        if(!d.patient){
            app.querySelector('#dash-content').innerHTML = '<div class="card" style="text-align:center;padding:20px;"><div style="font-size:48px;margin-bottom:12px;">\uD83D\uDC64</div><div class="text-muted">\u672A\u627E\u5230\u8BE5\u60A3\u8005</div></div>';
            return;
        }
        var records = d.dailyRecords || {};
        var today = new Date().toISOString().slice(0,10);
        var h = records[today] || {};
        var name = d.patient.name || '\u672A\u8BBE\u7F6E';
        var html = '<div class="card" style="margin-bottom:8px;"><div class="row"><div class="avatar orange" style="width:50px;height:50px;font-size:28px;">\uD83D\uDC64</div><div style="flex:1;"><div style="font-weight:600;font-size:18px;">'+escapeHtml(name)+'</div><div style="font-size:13px;color:var(--gray);">'+escapeHtml(phone)+' \u00B7 \u4ECA\u65E5\u5065\u5EB7\u6570\u636E</div></div></div></div>';
        html += '<div class="card" style="margin-bottom:8px;"><div class="card-title">\uD83D\uDCCA \u4ECA\u65E5\u5065\u5EB7\u6307\u6807</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="info-pill green"><div class="fs-28 fw-600">'+(h.heartRate||'\u2014')+'</div><div style="font-size:12px;">\u5FC3\u7387 (\u6B21/\u5206)</div></div>' +
            '<div class="info-pill orange"><div class="fs-28 fw-600">'+(h.bloodPressure||'\u2014')+'</div><div style="font-size:12px;">\u8840\u538B (mmHg)</div></div>' +
            '<div class="info-pill purple"><div class="fs-28 fw-600">'+(h.bloodOxygen||'\u2014')+'</div><div style="font-size:12px;">\u8840\u6C27 (%)</div></div>' +
            '<div class="info-pill blue"><div class="fs-28 fw-600">'+(h.bloodSugar||'\u2014')+'</div><div style="font-size:12px;">\u8840\u7CD6 (mmol/L)</div></div>' +
            '<div class="info-pill" style="background:#fef3c7;"><div class="fs-28 fw-600">'+(h.steps||'\u2014')+'</div><div style="font-size:12px;">\u6B65\u6570</div></div>' +
            '<div class="info-pill" style="background:#ede9fe;"><div class="fs-28 fw-600">'+(h.sleepHours||'\u2014')+'</div><div style="font-size:12px;">\u7761\u7720 (\u5C0F\u65F6)</div></div>' +
            '</div></div>';
        html += '<button class="btn btn-ghost btn-block" onclick="navigate(\'patient-records\')">\uD83D\uDCCB \u67E5\u770B\u8BCA\u7597\u6863\u6848</button>';
        app.querySelector('#dash-content').innerHTML = html;
    } catch(e){
        app.querySelector('#dash-content').innerHTML = '<div class="card" style="text-align:center;padding:20px;"><div style="font-size:48px;margin-bottom:12px;">\u26A0\uFE0F</div><div class="text-muted" style="color:var(--red);">\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC</div></div>';
    }
}
// ========== 初始化 ==========

// ── 付费服务页面 ──
PAGES.services = (app) => {
  setNavTitle("付费服务");
  app.innerHTML = '<div class="container"><div class="card"><div class="card-title">我的健康币</div><div id="coin-balance" style="font-size:24px;font-weight:700;color:var(--orange);">¥ 0 枚</div><div style="margin-top:8px;"><button class="btn btn-primary btn-block" onclick="navigate(\'coin\')">充值健康币</button></div></div><div class="card"><div class="card-title">选择服务</div><div id="svc-list"></div></div><div class="card"><div class="card-title">我的已购服务</div><div id="my-services"></div></div></div>';
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
};

window.purchaseService = async function(id) {
  if(!currentUser){toast("请先登录");return;}
  var res = await fetch(API_BASE+"/api/service/purchase",{
    method:"POST", headers:{"Content-Type":"application/json",Authorization:"Bearer "+currentUser.token},
    body:JSON.stringify({serviceId:id})
  });
  var data = await res.json();
  if(data.ok){toast("购买成功 \u2705");navigate("services");}else{toast(data.error||"购买失败");}
};

// ── 我的运动处方页面 ──
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


function init() {
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

