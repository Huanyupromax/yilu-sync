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
const TABBAR_PAGES = ['home', 'sport', 'data', 'messages', 'me'];
const TABBAR_LIST = [
    { key: 'home', text: '健康', icon: '❤️' },
    { key: 'sport', text: '运动', icon: '🏃' },
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
    const p = storage.getProfile();
    const name = (p && p.name) ? p.name : '张叔';
    const signed = storage.isSignedToday();
    const streak = storage.signStreak();
    const h = storage.getHealthData();
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">颐路相伴</div><div class="header-subtitle">您好，${escapeHtml(name)} · 今日宜慢走</div></div></div>
            <div class="banner"><div class="emoji">🍎</div><div><div class="t">健康小贴士</div><div class="s">老人健康与饮食的八大原则</div></div></div>
            <div class="card"><div class="card-title">今日打卡</div><div class="row space-between"><div><div class="fs-40 fw-600 text-orange" id="sign-status">${signed ? '今日已签到' : '还未签到'}</div><div class="text-muted mt-12">连续签到 <span id="streak-num">${streak}</span> 天</div></div><button class="btn btn-primary" id="sign-btn">${signed ? '已签到' : '去签到'}</button></div><div class="progress orange mt-20"><div id="sign-bar" style="width:${signed ? 100 : 30}%"></div></div></div>
            <div class="grid-2"><div class="feature-tile orange" data-go="prescription"><div class="fi">🏃</div><div class="fn">运动方案</div></div><div class="feature-tile green" data-go="courses"><div class="fi">📘</div><div class="fn">我的课程</div></div></div>
            <div class="emergency-tile" data-go="emergency"><div class="ei">📞</div><div class="et"><div class="en">一键紧急呼叫</div><div class="ed">同时通知教练、子女与 120 急救</div></div><div class="ec">›</div></div>
            <div class="card"><div class="card-title">今日健康数据</div><div class="ring-metric"><div class="ring"><div class="ring-text"><span class="big">${h.heartRate}</span>次/分</div></div><div><div class="fs-32 fw-600">心率 · 正常</div><div class="text-muted fs-28">今日均值 ${h.heartRate} 次/分</div></div></div><div class="row space-between mt-20"><div><div class="text-muted fs-28">血压</div><div class="fs-36 fw-600 text-green">${h.bloodPressure}</div></div><div><div class="text-muted fs-28">步数</div><div class="fs-36 fw-600 text-orange">${h.steps}</div></div><button class="btn btn-ghost" data-go="monitor" style="padding:6px 12px;">详情</button></div></div>
        </div>`;
    app.querySelectorAll('[data-go]').forEach(el => el.onclick = () => navigate(el.dataset.go));
  // 从服务器加载健康币
  if(typeof currentUser !== 'undefined' && currentUser){
    fetch(API_BASE+"/api/coins",{headers:{Authorization:"Bearer "+currentUser.token}}).then(function(r){return r.json();}).then(function(d){
      var el = document.getElementById("coin-count-me");
      if(el) el.textContent = (d.coins||0) + " 枚";
    });
  }
    app.querySelector('#sign-btn').onclick = () => {
        if (storage.isSignedToday()) { toast('今天已经签到了'); return; }
        if (storage.addSignToday()) {
          // 签到奖励发送到服务器
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

PAGES.sport = (app) => {
    const signed = storage.isSignedToday();
    const streak = storage.signStreak();
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">今日运动</div><div class="header-subtitle">${new Date().toLocaleDateString()}</div></div></div>
            <div class="card" style="text-align:center;"><div class="text-muted">每日签到</div><div style="margin:16px;"><div class="sign-circle ${signed ? 'active' : ''}" id="sign-circle">${signed ? '✓' : '签到'}</div></div><div class="fs-36 fw-600 text-orange" id="sport-sign-text">${signed ? '今日已签到 · +10 健康币' : '点击签到'}</div><div class="text-muted mt-12">连续签到 <span id="sport-streak">${streak}</span> 天</div></div>
            <div class="card"><div class="card-title">今日运动方案</div><div class="course-card"><div class="icon">🥋</div><div class="info"><div class="name">太极拳</div><div class="desc">低强度有氧 · 控制心率 ≤100</div></div><div class="fs-36">30 min</div></div></div>
            <button class="btn btn-secondary btn-block" id="start-btn">我知道了 · 开始运动</button>
        </div>`;
    app.querySelector('#sign-circle').onclick = () => {
        if (storage.isSignedToday()) { toast('今天已签到'); return; }
        storage.addSignToday();
          // 签到奖励
          if(currentUser){
            fetch(API_BASE+"/api/coins/signin",{method:"POST",headers:{Authorization:"Bearer "+currentUser.token}}).then(function(r){return r.json();});
          }
        toast('签到成功 +10 健康币');
        const c = app.querySelector('#sign-circle');
        c.classList.add('active');
        c.textContent = '✓';
        app.querySelector('#sport-sign-text').textContent = '今日已签到 · +10 健康币';
        app.querySelector('#sport-streak').textContent = storage.signStreak();
    };
    app.querySelector('#start-btn').onclick = () => toast('祝您运动愉快');
};

PAGES.data = (app) => {
  const recCount = Object.keys(storage.getDailyRecords()).length;
  app.innerHTML = '<div class="container">'+
    '<div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">健康数据</div><div class="header-subtitle">已记录 '+recCount+' 天</div></div></div>'+
    '<div class="card"><div class="card-title">连接穿戴设备</div>'+
    '<div id="device-status" style="font-size:14px;color:var(--gray);margin-bottom:8px;">未连接</div>'+
    '<button class="btn btn-primary" id="btn-connect-device" style="width:100%;">\uD83D\uDD0C 连接设备</button>'+
    '<div id="device-readings" style="display:none;margin-top:12px;">'+
    '<div class="grid-2"><div class="feature-tile green"><div class="fi" id="dev-hr">--</div><div class="fn">心率 bpm</div></div>'+
    '<div class="feature-tile orange"><div class="fi" id="dev-steps">--</div><div class="fn">步数</div></div>'+
    '<div class="feature-tile" style="background:var(--orange-light);color:var(--orange-dark);"><div class="fi" id="dev-bp">--</div><div class="fn">血压</div></div>'+
    '<div class="feature-tile green"><div class="fi" id="dev-ox">--</div><div class="fn">血氧 %</div></div>'+
    '</div><div style="text-align:center;font-size:13px;color:var(--gray);margin-top:4px;">设备已连接，每3秒自动同步数据</div>'+
    '</div></div>'+
    '<div class="data-entry-tile" data-go="data-entry"><div class="dt-ic">\uD83D\uDCDD</div><div class="dt-info"><div class="dt-name">录入当日数据</div><div class="dt-desc">血压 · 心率 · 步数 · 睡眠</div></div><div class="dt-arrow">\u203A</div></div>'+
    '<div class="data-entry-tile green" data-go="data-summary"><div class="dt-ic">\uD83D\uDCCA</div><div class="dt-info"><div class="dt-name">周/月数据总结</div><div class="dt-desc">一周与一个月的趋势汇总</div></div><div class="dt-arrow">\u203A</div></div>'+
    '</div>';
  app.querySelector('[data-go="data-entry"]').onclick = () => navigate('data-entry');
  app.querySelector('[data-go="data-summary"]').onclick = () => navigate('data-summary');
  // Device connection logic
  var isConnected = false;
  var deviceInterval = null;
  var btnConnect = document.getElementById('btn-connect-device');
  var deviceStatus = document.getElementById('device-status');
  var deviceReadings = document.getElementById('device-readings');
  function startDevice() {
    isConnected = true;
    btnConnect.textContent = "\uD83D\uDD0C 断开设备";
    btnConnect.className = "btn btn-danger";
    deviceStatus.textContent = "\u2705 已连接 - 模拟设备";
    deviceStatus.style.color = "var(--green)";
    deviceReadings.style.display = "block";
    // Simulate device data
    if(deviceInterval) clearInterval(deviceInterval);
    deviceInterval = setInterval(async function(){
      if(!currentUser) return;
      // Simulate readings
      var hr = Math.floor(Math.random() * 30) + 65; // 65-95 bpm
      var steps = Math.floor(Math.random() * 50) + 10; // steps added per interval
      var sys = Math.floor(Math.random() * 20) + 110; // 110-130
      var dia = Math.floor(Math.random() * 10) + 70; // 70-80
      var ox = Math.floor(Math.random() * 4) + 96; // 96-99%
      var cal = (Math.random() * 2 + 0.5).toFixed(1);
      // Update display
      document.getElementById('dev-hr').textContent = hr;
      document.getElementById('dev-steps').textContent = steps;
      document.getElementById('dev-bp').textContent = sys+'/'+dia;
      document.getElementById('dev-ox').textContent = ox;
      // Send to server
      try {
        await fetch(API_BASE+"/api/device/data", {
          method:"POST", headers:{"Content-Type":"application/json",Authorization:"Bearer "+currentUser.token},
          body:JSON.stringify({deviceId:"simulated",heartRate:hr,steps:steps,bloodPressure:sys+"/"+dia,bloodOxygen:ox,calories:cal})
        });
      } catch(e) {}
    }, 3000);
  }
  function stopDevice() {
    isConnected = false;
    if(deviceInterval) { clearInterval(deviceInterval); deviceInterval = null; }
    btnConnect.textContent = "\uD83D\uDD0C 连接设备";
    btnConnect.className = "btn btn-primary";
    deviceStatus.textContent = "未连接";
    deviceStatus.style.color = "var(--gray)";
    deviceReadings.style.display = "none";
  }
  btnConnect.onclick = function(){ if(isConnected) stopDevice(); else startDevice(); };
};;

PAGES['data-entry'] = (app) => {
    setNavTitle('录入当日数据');
    const today = new Date().toISOString().slice(0,10);
    const existed = storage.getDailyRecord(today) || {};
    let form = { bp: existed.bp || '120', heartRate: existed.heartRate || '72', steps: existed.steps || '5000', sleep: existed.sleep || '7', bloodOxygen: existed.bloodOxygen || '97', bloodSugar: existed.bloodSugar || '5.5' };
    const fields = [
        { key: 'bp', label: '血压', min: 60, max: 220, unit: 'mmHg', step: 1 },
        { key: 'heartRate', label: '心率', min: 30, max: 220, unit: '次/分', step: 1 },
        { key: 'steps', label: '步数', min: 0, max: 50000, unit: '步', step: 100 },
        { key: 'sleep', label: '睡眠时长', min: 0, max: 24, unit: '小时', step: 0.5 },
        { key: 'bloodOxygen', label: '血氧', min: 60, max: 100, unit: '%', step: 1 },
        { key: 'bloodSugar', label: '血糖', min: 2, max: 30, unit: 'mmol/L', step: 0.1 }
    ];
    let html = '<div class="container"><div class="card"><div class="card-title">' + today + '</div>';
    fields.forEach(f => {
        html += '<div class="form-row" style="flex-wrap:wrap;"><div class="form-label" style="width:100%;margin-bottom:4px;">' + f.label + '</div><input type="range" data-f="' + f.key + '" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + form[f.key] + '" style="flex:1;"><span class="range-val" data-v="' + f.key + '" style="min-width:50px;text-align:right;font-weight:600;">' + form[f.key] + '</span><span style="width:40px;text-align:right;color:var(--gray);font-size:13px;">' + f.unit + '</span></div>';
    });
    html += '</div><button class="btn btn-primary btn-block" id="save-btn">保存</button></div>';
    app.innerHTML = html;
    app.querySelectorAll('input[type="range"]').forEach(el => {
        el.oninput = () => { form[el.dataset.f] = el.value; var sp = app.querySelector('[data-v="' + el.dataset.f + '"]'); if(sp) sp.textContent = el.value; };
    });
    app.querySelector('#save-btn').onclick = () => { lsSet(KEYS.HEALTH_DATA,{heartRate:form.heartRate,bloodPressure:form.bp,steps:form.steps,sleepHours:form.sleep,bloodOxygen:form.bloodOxygen,bloodSugar:form.bloodSugar}) storage.saveDailyRecord(today, form);  toast('已保存'); navigate('data'); };
};

PAGES['data-summary'] = (app) => {
    setNavTitle('数据总结');
    var allR = storage.getDailyRecords();
    var dates = Object.keys(allR).sort();
    var recent7 = dates.slice(-7);
    if (recent7.length === 0) {
        app.innerHTML = '<div class="container"><div class="card"><div class="card-title">近7天平均</div><div class="text-muted" style="text-align:center;padding:40px;">暂无数据，请先录入</div></div><button class="btn btn-ghost btn-block" data-go="data-entry">去录入</button></div>';
        app.querySelector('[data-go]').onclick = function(){navigate('data-entry');};
        return;
    }
    var bpS=0,hrS=0,stS=0,slS=0, bpN=0,hrN=0,stN=0,slN=0;
    recent7.forEach(function(d){
        var r = allR[d];
        if(r.bp && !isNaN(r.bp)){bpS+=+r.bp;bpN++;}
        if(r.heartRate && !isNaN(r.heartRate)){hrS+=+r.heartRate;hrN++;}
        if(r.steps && !isNaN(r.steps)){stS+=+r.steps;stN++;}
        if(r.sleep && !isNaN(r.sleep)){slS+=+r.sleep;slN++;}
    });
    var avg = function(s,n){return n?(s/n).toFixed(1):'--';};
    var rows = [
        ['血压', avg(bpS,bpN), 'mmHg'],
        ['心率', avg(hrS,hrN), '次/分'],
        ['步数', avg(stS,stN), '步'],
        ['睡眠时长', avg(slS,slN), '小时']
    ];
    var listHtml = '';
    rows.forEach(function(r){listHtml += '<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee;"><span>'+r[0]+'</span><span style="font-weight:600;color:var(--orange);">'+r[1]+' '+r[2]+'</span></div>';});
    var dayHtml = '';
    recent7.slice().reverse().forEach(function(d){var r=allR[d];dayHtml += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;"><span>'+d.slice(5)+'</span><span style="font-size:13px;color:var(--gray);">'+(r.bp||'--')+'/'+(r.heartRate||'--')+'/'+(r.steps||'--')+'/'+(r.sleep||'--')+'</span></div>';});
    app.innerHTML = '<div class="container"><div class="card"><div class="card-title">近7天平均</div>'+listHtml+'<div class="text-muted" style="font-size:12px;margin-top:4px;">基于最近 '+recent7.length+' 天的数据</div></div><div class="card"><div class="card-title">每日记录</div>'+dayHtml+'</div><button class="btn btn-ghost btn-block" data-go="data-entry">录入新数据</button></div>';
    app.querySelector('[data-go]').onclick = function(){navigate('data-entry');};
};

// 单聊相关
const DEFAULT_GREETINGS = { '女儿': [{text:'爸，今天看到您的运动简报啦',mine:false}], '儿子': [{text:'爸，您这两天血压稳定多了',mine:false}] };
function latestMessageDescapeHtml(name) {
    const msgs = storage.getMessages(name);
    if (msgs.length) return msgs[msgs.length-1].text || '';
    const g = DEFAULT_GREETINGS[name];
    return g ? g[g.length-1].text : '';
}
async function showAddContactModal() {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `<div class="modal"><div class="modal-title">添加联系人</div><div style="padding:8px;"><input id="new-name" placeholder="姓名" class="form-input" style="margin-bottom:12px;"><input id="new-avatar" placeholder="头像表情" class="form-input" value="👤"></div><div class="modal-actions"><button class="modal-btn cancel">取消</button><button class="modal-btn confirm" style="color:var(--orange);">添加</button></div></div>`;
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
            <div class="banner orange" id="group-list-btn"><div class="emoji">👥</div><div><div class="t">群聊</div><div class="s">点击查看我的群聊</div></div></div>
            <div class="banner" id="assistant-btn"><div class="emoji">🤖</div><div><div class="t">安全助手</div><div class="s">智能健康顾问（支持语音）</div></div></div>
            <div class="card" id="contacts-list">${contacts.map(c => `<div class="list-item" data-name="${escapeHtml(c.name)}"><div class="avatar ${c.bg || ''}">${c.avatar}</div><div class="list-content"><div class="list-name">${escapeHtml(c.name)}</div><div class="list-desc">${escapeHtml(latestMessageDescapeHtml(c.name))}</div></div><div class="list-time">${c.time}</div></div>`).join('')}</div>
        </div>`;
    app.querySelectorAll('.list-item').forEach(el => el.onclick = () => navigate('chat', { name: el.dataset.name }));
    app.querySelector('#add-contact-btn').onclick = showAddContactModal;
    app.querySelector('#group-list-btn').onclick = () => navigate('group-list');
    app.querySelector('#assistant-btn').onclick = () => navigate('assistant');
};

PAGES.chat = (app, params) => {
    const name = params.name || '对话';
    setNavTitle(name);
    
    // 字体控制
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
        overlay.classList.remove('show');
        voiceBtn.classList.remove('recording');
        mediaRecorder = null;
    }
    function cancelRecord() {
        if (mediaRecorder) {
            mediaRecorder.onstop = () => {};
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(t => t.stop());
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
        } catch(e) { toast('网络错误'); }
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
        } catch(e) { toast('网络错误'); }
    };
    
    // 语音录制
    let mediaRecorder = null, audioChunks = [], startY = 0;
    const voiceBtn = app.querySelector('#voice-btn');
    const overlay = app.querySelector('#voice-overlay');
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
            } catch(e) { toast('网络错误'); }
        };
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
        overlay.classList.remove('show');
        voiceBtn.classList.remove('recording');
        mediaRecorder = null;
    }
    function cancelRecord() {
        if (mediaRecorder) {
            mediaRecorder.onstop = () => {};
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(t => t.stop());
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
        overlay.classList.remove('show');
        voiceBtn.classList.remove('recording');
        mediaRecorder = null;
    }
    function cancelRecord() {
        if (mediaRecorder) {
            mediaRecorder.onstop = () => {};
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(t => t.stop());
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
        <div class="card"><button class="btn btn-primary btn-block" data-go="sport">按方案开始运动</button><button class="btn btn-ghost btn-block" data-go="courses">预约线下课程</button></div></div>`;
    app.querySelectorAll('[data-go]').forEach(el => el.onclick = () => navigate(el.dataset.go));
};
PAGES.courses = (app) => {
    setNavTitle('课程预约');
    let selected = '大班体验课';
    app.innerHTML = `<div class="container"><div class="banner orange"><div class="emoji">🎓</div><div><div class="t">平台智能推荐</div><div class="s">基于您的身体状况匹配</div></div></div>
        <div class="card"><div class="course-card orange" data-name="大班体验课"><div class="icon">🏃</div><div class="info"><div class="name">大班体验课</div><div class="desc">12-16人低强度趣味课</div></div></div>
        <div class="course-card" data-name="普通小班课"><div class="icon">👥</div><div class="info"><div class="name">普通小班课</div><div class="desc">8-10人中高强度训练</div></div></div></div>
        <button class="btn btn-primary btn-block" id="book-btn">立即预约</button></div>`;
    app.querySelectorAll('.course-card').forEach(el => el.onclick = () => { selected = el.dataset.name; toast(`已选择：${selected}`); });
    app.querySelector('#book-btn').onclick = async () => { if ((await modal({ title: '预约确认', content: `是否预约${selected}？` })).confirm) toast('预约成功'); };
};
PAGES.emergency = (app) => {
    setNavTitle('紧急呼叫');
    app.innerHTML = `<div class="container"><div class="banner orange"><div class="emoji">🆘</div><div><div class="t">遇到紧急情况？直接呼叫</div><div class="s">点击下方按钮立即拨打</div></div></div>
        <button class="emergency-call-btn danger" data-tel="120"><div class="avatar">🚑</div><div class="info"><div class="name">120 急救</div><div class="desc">自动共享位置</div></div><div class="call-ic">📞</div></button>
        <button class="emergency-call-btn primary" data-tel="13800001234"><div class="avatar">👩</div><div class="info"><div class="name">女儿</div><div class="desc">138****1234</div></div><div class="call-ic">📞</div></button></div>`;
    app.querySelectorAll('.emergency-call-btn').forEach(el => el.onclick = async () => { if ((await modal({ title: '确认呼叫', content: `拨打 ${el.querySelector('.name').innerText}`, confirmColor: '#e8504a' })).confirm) location.href = 'tel:' + el.dataset.tel; });
};
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
    let form = { name: p.name || '', height: p.height || '', weight: p.weight || '', age: p.age || '', hasChronic: !!p.hasChronic };
    app.innerHTML = `<div class="container"><div class="card"><div class="card-title">基本情况</div>
        <div class="form-row"><div class="form-label">姓名</div><input class="form-input" data-f="name" value="${escapeHtml(form.name)}" /></div>
        <div class="form-row"><div class="form-label">身高</div><input class="form-input" data-f="height" value="${escapeHtml(form.height)}" /></div>
        <div class="form-row"><div class="form-label">体重</div><input class="form-input" data-f="weight" value="${escapeHtml(form.weight)}" /></div>
        <div class="form-row"><div class="form-label">年龄</div><input class="form-input" data-f="age" value="${escapeHtml(form.age)}" /></div></div>
        <div class="card"><div class="card-title">身体状况</div><div class="check-row" id="chronic-row"><div class="check-box ${form.hasChronic ? 'checked' : ''}">${form.hasChronic ? '✓' : ''}</div><span>有基础病或慢性病史</span></div></div>
        <button class="btn btn-primary btn-block" id="submit-btn">提交并生成运动方案</button></div>`;
    app.querySelectorAll('[data-f]').forEach(el => el.oninput = () => form[el.dataset.f] = el.value);
    app.querySelector('#chronic-row').onclick = () => {
        form.hasChronic = !form.hasChronic;
        const box = app.querySelector('#chronic-row .check-box');
        box.classList.toggle('checked', form.hasChronic);
        box.textContent = form.hasChronic ? '✓' : '';
    };
    app.querySelector('#submit-btn').onclick = () => { storage.setProfile(form); storage.setPrescription(storage.generatePrescription(form)); toast('资料已保存'); navigate('prescription'); };
};
PAGES.me = (app) => {
    const p = storage.getProfile() || {};
    const streak = storage.signStreak();
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">我的</div><div class="header-subtitle">个人中心</div></div></div>
            <div class="card"><div class="row"><div class="avatar orange" style="width:65px;height:65px;font-size:35px;">\uD83D\uDC68</div><div><div class="fs-40 fw-600">${escapeHtml(p.name || '张三')}${(currentUser&&currentUser.role?'<span class="tag orange">' + escapeHtml(currentUser.role) + '</span>':'')}${p.hasChronic ? '<span class="tag">慢性病</span>' : ''}<span class="tag orange">VIP</span></div></div><button class="btn btn-ghost" data-go="profile-setup">编辑</button></div><div class="row mt-20"><div class="info-pill green"><div class="fs-36 fw-600">${p.height || '178'} cm</div><div>身高</div></div><div class="info-pill orange"><div class="fs-36 fw-600">${p.weight || '66'} kg</div><div>体重</div></div></div></div>
            <div class="card"><div class="card-title">账号</div><div class="form-row" data-go="profile-setup"><span>\uD83D\uDC68\u200D</span><div style="flex:1">个人资料</div><span>\u203A</span></div><div class="form-row" data-go="monitor"><span>\uD83D\uDCF3</span><div style="flex:1">我的数据</div><span>\u203A</span></div><div class="form-row" data-go="coin"><span>\uD83E\uDE99</span><div style="flex:1">健康币</div><span>${storage.signStreak()+2} 枚 \u203A</span></div><div class="form-row" data-go="services"><span>\uD83D\uDCB3</span><div style="flex:1">付费服务</div><span>\u203A</span></div><div class="form-row" data-go="myrx"><span>\uD83D\uDCCB</span><div style="flex:1">我的处方</div><span>\u203A</span></div><div class="form-row" data-go="account"><span>\uD83D\uDD10</span><div style="flex:1">账号管理</div><span>\u203A</span></div></div>
            <div class="card"><div class="card-title">更多</div><div class="form-row"><span>\uD83D\uDCDA</span><div style="flex:1">课程与计划</div><span>\u203A</span></div><div class="form-row"><span>\uD83C\uDFC6</span><div style="flex:1">成就</div><span>\u203A</span></div><div class="form-row" data-go="settings"><span>\u2699\uFE0F</span><div style="flex:1">设置</div><span>\u203A</span></div><div class="form-row"><span>\uD83D\uDCAC</span><div style="flex:1">用户反馈</div><span>\u203A</span></div><div class="form-row" onclick="window.customerService()"><span>\uD83C\uDFDE\uFE0F</span><div style="flex:1">联系客服</div><span>\u203A</span></div><div class="form-row"><span>\uD83D\uDEE1\uFE0F</span><div style="flex:1">隐私政策</div><span>\u203A</span></div></div>
            <div class="card"><div class="form-row" id="logout-btn" style="border-bottom:none;justify-content:center;"><span>\uD83D\uDEAA</span><div style="flex:1;text-align:center;color:var(--red);font-size:16px;">退出登录</div><span></span></div></div>
        </div>`;
    app.querySelectorAll('[data-go]').forEach(el => el.onclick = () => navigate(el.dataset.go));
    app.querySelector('#logout-btn').onclick = logout;
};

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
  d.onclick = function(e) { if(e.target===d) d.remove(); };
};

