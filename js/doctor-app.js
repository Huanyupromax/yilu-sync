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
                <div class="feature-tile green" data-go="doctor-send-prescription"><div class="fi">📋</div><div class="fn">发送运动处方</div></div>
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
  const recCount = Object.keys(storage.getDailyRecords()).length;
  app.innerHTML = '<div class="container">'+
    '<div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">健康数据</div><div class="header-subtitle">已记录 '+recCount+' 天</div></div></div>'+
    '<div class="data-entry-tile" data-go="data-entry"><div class="dt-ic">📝</div><div class="dt-info"><div class="dt-name">录入当日数据</div><div class="dt-desc">血压 · 心率 · 步数 · 睡眠</div></div><div class="dt-arrow">›</div></div>'+
    '<div class="data-entry-tile green" data-go="data-summary"><div class="dt-ic">📊</div><div class="dt-info"><div class="dt-name">周/月数据总结</div><div class="dt-desc">一周与一个月的趋势汇总</div></div><div class="dt-arrow">›</div></div>'+
    '<div class="data-entry-tile orange" data-go="doctor-patient-data"><div class="dt-ic">👥</div><div class="dt-info"><div class="dt-name">查看用户数据</div><div class="dt-desc">查看老年用户的运动健康数据</div></div><div class="dt-arrow">›</div></div>'+
    '<div class="data-entry-tile orange" data-go="doctor-send-prescription" style="margin-top:4px;"><div class="dt-ic">📋</div><div class="dt-info"><div class="dt-name">发送运动处方</div><div class="dt-desc">为老年用户制定并发送运动处方</div></div><div class="dt-arrow">›</div></div>'+
    '</div>';
  app.querySelector('[data-go="data-entry"]').onclick = () => navigate('data-entry');
  app.querySelector('[data-go="data-summary"]').onclick = () => navigate('data-summary');
  app.querySelector('[data-go="doctor-patient-data"]').onclick = () => navigate('doctor-patient-data');
  app.querySelector('[data-go="doctor-send-prescription"]').onclick = () => navigate('doctor-send-prescription');
};


PAGES['doctor-patient-data'] = (app, params) => {
    setNavTitle('查看用户数据');
    app.innerHTML = '<div class="container"><div class="banner orange"><div class="emoji">👥</div><div><div class="t">老年用户健康数据</div><div class="s">输入手机号查看用户的运动健康记录</div></div></div>' +
      '<div class="card"><div class="card-title">搜索用户</div>' +
      '<div class="form-row"><input id="patient-search-input" class="form-input" placeholder="输入用户手机号" style="flex:1;" /><button class="btn btn-primary" id="patient-search-btn" style="padding:6px 12px;">搜索</button></div>' +
      '<div id="patient-info"></div></div>' +
      '<div id="patient-data-card" class="card" style="display:none;"><div class="card-title">健康数据记录</div>' +
      '<div class="tab-bar" id="data-tab-bar" style="display:flex;gap:4px;margin-bottom:8px;">' +
        '<button class="btn btn-primary" id="tab-today" style="flex:1;font-size:13px;padding:6px;">今日数据</button>' +
        '<button class="btn btn-secondary" id="tab-week" style="flex:1;font-size:13px;padding:6px;">近7天</button>' +
        '<button class="btn btn-secondary" id="tab-month" style="flex:1;font-size:13px;padding:6px;">近30天</button>' +
      '</div><div id="patient-data-content"><div class="text-muted" style="text-align:center;padding:15px;">请先搜索用户</div></div></div>' +
      '<button class="btn btn-ghost btn-block" id="back-from-patient-data" style="margin-top:8px;">← 返回</button></div>';
    
    var currentPatientPhone = '';
    var patientDailyRecords = {};
    
    
    // Auto-search if phone param provided
    if(params && params.phone){
        document.getElementById('patient-search-input').value = params.phone;
        setTimeout(searchPatient, 100);
    }
    app.querySelector('#back-from-patient-data').onclick = function() { navigate('home'); };
    
    app.querySelector('#patient-search-btn').onclick = searchPatient;
    document.getElementById('patient-search-input').onkeypress = function(e) { if(e.key==='Enter') searchPatient(); };
    
    async function searchPatient() {
      var phone = document.getElementById('patient-search-input').value.trim();
      if(!phone) { toast('请输入手机号'); return; }
      if(!currentUser) { toast('请先登录'); return; }
      
      document.getElementById('patient-info').innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;">搜索中...</div>';
      document.getElementById('patient-data-card').style.display = 'none';
      
      try {
        var res = await fetch(API_BASE + '/api/doctor/patient-data?phone=' + encodeURIComponent(phone), {
          headers: { Authorization: 'Bearer ' + currentUser.token }
        });
        var data = await res.json();
        
        if(!res.ok) {
          document.getElementById('patient-info').innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;color:var(--red);">' + (data.error || '查询失败') + '</div>';
          return;
        }
        
        currentPatientPhone = data.patient.phone;
        patientDailyRecords = data.dailyRecords || {};
        
        var roleLabel = data.patient.role || '普通用户';
        if(roleLabel === '银龄用户') roleLabel = '老年端用户';
        else if(roleLabel === '子女群体') roleLabel = '子女端用户';
        
        document.getElementById('patient-info').innerHTML = 
          '<div class="form-row" style="border:1px solid var(--orange-light);border-radius:8px;padding:10px;margin-top:8px;">' +
          '<div class="avatar orange">👤</div>' +
          '<div style="flex:1;"><div style="font-weight:600;font-size:16px;">' + (data.patient.name || '未设置昵称') + '</div>' +
          '<div style="font-size:13px;color:var(--gray);">' + escapeHtml(phone) + ' · ' + roleLabel + '</div>' +
          '<div style="font-size:12px;color:var(--gray);">共 ' + (data.recordCount || 0) + ' 条记录</div></div></div>';
        
        document.getElementById('patient-data-card').style.display = 'block';
        showTodayData();
      } catch(e) {
        document.getElementById('patient-info').innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;color:var(--red);">网络错误</div>';
        toast('网络错误');
      }
    }
    
    function showTodayData() {
      var today = new Date().toISOString().slice(0,10);
      var record = patientDailyRecords[today];
      if(!record) {
        document.getElementById('patient-data-content').innerHTML = '<div class="text-muted" style="text-align:center;padding:15px;">今日暂无数据记录</div>';
        return;
      }
      document.getElementById('patient-data-content').innerHTML =
        '<div style="padding:8px;"><div style="font-weight:600;color:var(--orange);margin-bottom:8px;">' + today + ' 的数据</div>' +
        '<div class="form-row"><span class="tag" style="min-width:70px;">血压</span><span>' + escapeHtml(record.bp || '--') + ' mmHg</span></div>' +
        '<div class="form-row"><span class="tag" style="min-width:70px;">心率</span><span>' + escapeHtml(record.heartRate || '--') + ' 次/分</span></div>' +
        '<div class="form-row"><span class="tag" style="min-width:70px;">血氧</span><span>' + escapeHtml(record.bloodOxygen || '--') + ' %</span></div>' +
        '<div class="form-row"><span class="tag" style="min-width:70px;">血糖</span><span>' + escapeHtml(record.bloodSugar || '--') + ' mmol/L</span></div>' +
        '<div class="form-row"><span class="tag" style="min-width:70px;">步数</span><span>' + escapeHtml(record.steps || '--') + ' 步</span></div>' +
        '<div class="form-row" style="border:none;"><span class="tag" style="min-width:70px;">睡眠</span><span>' + escapeHtml(record.sleep || '--') + ' 小时</span></div></div>';
      
      document.getElementById('tab-today').className = 'btn btn-primary';
      document.getElementById('tab-week').className = 'btn btn-secondary';
      document.getElementById('tab-month').className = 'btn btn-secondary';
    }
    
    function calcAvg(arr) {
      if(!arr || arr.length === 0) return '--';
      var sum = arr.reduce(function(a, b) { return a + (parseFloat(b) || 0); }, 0);
      return (sum / arr.length).toFixed(1);
    }
    
    function showWeekData() {
      var records = [];
      for(var i = 0; i < 7; i++) {
        var d = new Date();
        d.setDate(d.getDate() - i);
        var ds = d.toISOString().slice(0,10);
        if(patientDailyRecords[ds]) records.push({date: ds, data: patientDailyRecords[ds]});
      }
      if(records.length === 0) {
        document.getElementById('patient-data-content').innerHTML = '<div class="text-muted" style="text-align:center;padding:15px;">近7天暂无数据</div>';
        return;
      }
      var bpArr = [], hrArr = [], oxArr = [], bsArr = [], stArr = [], slArr = [];
      var detailHtml = records.map(function(r) {
        bpArr.push(r.data.bp); hrArr.push(r.data.heartRate); oxArr.push(r.data.bloodOxygen);
        bsArr.push(r.data.bloodSugar); stArr.push(r.data.steps); slArr.push(r.data.sleep);
        return '<div style="font-size:12px;padding:4px 0;border-bottom:1px solid #f0f0f0;">' +
          '<span style="font-weight:600;">' + r.date + '</span>: 血压 ' + (r.data.bp || '--') + ' | 心率 ' + (r.data.heartRate || '--') + ' | 步数 ' + (r.data.steps || '--') + '</div>';
      }).join('');
      
      document.getElementById('patient-data-content').innerHTML =
        '<div style="padding:8px;"><div style="font-weight:600;color:var(--green);margin-bottom:8px;">近7天汇总 (共' + records.length + '条记录)</div>' +
        '<div class="form-row"><span class="tag">平均血压</span><span>' + calcAvg(bpArr) + ' mmHg</span></div>' +
        '<div class="form-row"><span class="tag">平均心率</span><span>' + calcAvg(hrArr) + ' 次/分</span></div>' +
        '<div class="form-row"><span class="tag">平均血氧</span><span>' + calcAvg(oxArr) + ' %</span></div>' +
        '<div style="margin-top:8px;padding:8px;background:#f9f9f9;border-radius:6px;">' +
        '<div style="font-size:13px;font-weight:600;margin-bottom:4px;">详细记录</div>' + detailHtml + '</div></div>';
      
      document.getElementById('tab-today').className = 'btn btn-secondary';
      document.getElementById('tab-week').className = 'btn btn-primary';
      document.getElementById('tab-month').className = 'btn btn-secondary';
    }
    
    function showMonthData() {
      var records = [];
      for(var i = 0; i < 30; i++) {
        var d = new Date();
        d.setDate(d.getDate() - i);
        var ds = d.toISOString().slice(0,10);
        if(patientDailyRecords[ds]) records.push({date: ds, data: patientDailyRecords[ds]});
      }
      if(records.length === 0) {
        document.getElementById('patient-data-content').innerHTML = '<div class="text-muted" style="text-align:center;padding:15px;">近30天暂无数据</div>';
        return;
      }
      var bpArr = [], hrArr = [], oxArr = [], bsArr = [], stArr = [], slArr = [];
      records.forEach(function(r) {
        bpArr.push(r.data.bp); hrArr.push(r.data.heartRate); oxArr.push(r.data.bloodOxygen);
        bsArr.push(r.data.bloodSugar); stArr.push(r.data.steps); slArr.push(r.data.sleep);
      });
      // Calculate percentage of days with data
      var pct = Math.round(records.length / 30 * 100);
      
      document.getElementById('patient-data-content').innerHTML =
        '<div style="padding:8px;"><div style="font-weight:600;color:var(--green);margin-bottom:8px;">' +
        '近30天汇总 (共' + records.length + '天有记录, ' + pct + '%)</div>' +
        '<div class="form-row"><span class="tag">平均血压</span><span>' + calcAvg(bpArr) + ' mmHg</span></div>' +
        '<div class="form-row"><span class="tag">平均心率</span><span>' + calcAvg(hrArr) + ' 次/分</span></div>' +
        '<div class="form-row"><span class="tag">平均血氧</span><span>' + calcAvg(oxArr) + ' %</span></div>' +
        '<div class="form-row"><span class="tag">平均血糖</span><span>' + calcAvg(bsArr) + ' mmol/L</span></div>' +
        '<div class="form-row"><span class="tag">平均步数</span><span>' + calcAvg(stArr) + ' 步</span></div>' +
        '<div class="form-row" style="border:none;"><span class="tag">平均睡眠</span><span>' + calcAvg(slArr) + ' 小时</span></div></div>';
      
      document.getElementById('tab-today').className = 'btn btn-secondary';
      document.getElementById('tab-week').className = 'btn btn-secondary';
      document.getElementById('tab-month').className = 'btn btn-primary';
    }
    
    document.getElementById('tab-today').onclick = showTodayData;
    document.getElementById('tab-week').onclick = showWeekData;
    document.getElementById('tab-month').onclick = showMonthData;
};

PAGES['doctor-send-prescription'] = (app) => {
    setNavTitle('发送运动处方');
    var selectedPatientPhone = '';
    var selectedPatientName = '';
    var items = [{icon:'🏃',name:'',detail:''}];
    
    app.innerHTML = '<div class="container"><div class="banner orange"><div class="emoji">📋</div><div><div class="t">发送运动处方</div><div class="s">选择老年用户并制定个性化运动处方</div></div></div>' +
      '<div class="card"><div class="card-title">选择接收用户</div>' +
      '<div class="form-row"><input id="rx-patient-input" class="form-input" placeholder="输入用户手机号" style="flex:1;" /><button class="btn btn-primary" id="rx-search-btn" style="padding:6px 12px;">搜索</button></div>' +
      '<div id="rx-patient-info"></div></div>' +
      '<div id="rx-form-card" class="card" style="display:none;"><div class="card-title">运动处方内容</div>' +
      '<div class="form-row"><div class="form-label">运动目标</div><input id="rx-goal" class="form-input" placeholder="如：改善心肺功能" /></div>' +
      '<div class="form-row"><div class="form-label">强度</div><select id="rx-intensity" class="form-input"><option value="低强度">低强度</option><option value="中低强度">中低强度</option><option value="中等强度">中等强度</option><option value="中高强度">中高强度</option><option value="高强度">高强度</option></select></div>' +
      '<div class="form-row"><div class="form-label">最大心率</div><input id="rx-hr" class="form-input" placeholder="如：100" type="number" /></div>' +
      '<div class="form-row"><div class="form-label">频率</div><input id="rx-frequency" class="form-input" placeholder="如：每周3-5次" /></div>' +
      '<div class="form-row"><div class="form-label">每次时长</div><input id="rx-duration" class="form-input" placeholder="如：30-45分钟" /></div>' +
      '<div class="form-row" style="flex-direction:column;align-items:stretch;"><div class="form-label">训练项目</div><div id="rx-items-list"></div><button class="btn btn-ghost" id="add-item-btn" style="margin-top:4px;font-size:13px;">＋ 添加项目</button></div>' +
      '<div class="form-row" style="flex-direction:column;align-items:stretch;"><div class="form-label">注意事项</div><textarea id="rx-cautions" class="form-input" rows="2" placeholder="如：运动前需热身5分钟"></textarea></div>' +
      '<div class="form-row" style="flex-direction:column;align-items:stretch;"><div class="form-label">营养建议</div><textarea id="rx-diet" class="form-input" rows="2" placeholder="如：增加蛋白质摄入"></textarea></div>' +
      '<div class="form-row" style="flex-direction:column;align-items:stretch;"><div class="form-label">医生备注</div><textarea id="rx-notes" class="form-input" rows="2" placeholder="医生补充说明"></textarea></div></div>' +
      '<button class="btn btn-primary btn-block" id="rx-send-btn" style="display:none;">📤 发送处方</button>' +
      '<button class="btn btn-ghost btn-block" id="back-from-rx" style="margin-top:8px;">← 返回</button></div>';
    
    app.querySelector('#back-from-rx').onclick = function() { navigate('data'); };
    renderItems();
    
    function renderItems() {
      var html = items.map(function(item, idx) {
        return '<div class="item-entry" style="padding:6px;border:1px solid #f0f0f0;border-radius:6px;margin-bottom:6px;">' +
          '<div style="display:flex;gap:4px;margin-bottom:4px;"><input class="form-input" id="item-icon-' + idx + '" placeholder="图标" value="' + escapeHtml(item.icon) + '" style="width:50px;flex-shrink:0;" /><input class="form-input" id="item-name-' + idx + '" placeholder="项目名称" value="' + escapeHtml(item.name) + '" style="flex:1;" />' +
          (idx > 0 ? '<button class="btn btn-danger" onclick="removeItem(' + idx + ')" style="padding:4px 8px;font-size:12px;">✕</button>' : '') + '</div>' +
          '<input class="form-input" id="item-detail-' + idx + '" placeholder="详细说明" value="' + escapeHtml(item.detail) + '" />' +
        '</div>';
      }).join('');
      document.getElementById('rx-items-list').innerHTML = html;
    }
    
    window.removeItem = function(idx) {
      items.splice(idx, 1);
      renderItems();
    };
    
    document.getElementById('add-item-btn').onclick = function() {
      items.push({icon:'🏃',name:'',detail:''});
      renderItems();
    };
    
    app.querySelector('#rx-search-btn').onclick = searchPatient;
    document.getElementById('rx-patient-input').onkeypress = function(e) { if(e.key==='Enter') searchPatient(); };
    
    async function searchPatient() {
      var phone = document.getElementById('rx-patient-input').value.trim();
      if(!phone) { toast('请输入手机号'); return; }
      if(!currentUser) { toast('请先登录'); return; }
      
      document.getElementById('rx-patient-info').innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;">搜索中...</div>';
      document.getElementById('rx-form-card').style.display = 'none';
      document.getElementById('rx-send-btn').style.display = 'none';
      
      try {
        var res = await fetch(API_BASE + '/api/user/search?phone=' + encodeURIComponent(phone), {
          headers: { Authorization: 'Bearer ' + currentUser.token }
        });
        var data = await res.json();
        
        if(!res.ok || !data.user) {
          document.getElementById('rx-patient-info').innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;color:var(--red);">未找到该用户</div>';
          return;
        }
        
        var u = data.user;
        var roleLabel = u.role || '普通用户';
        if(roleLabel === '银龄用户') roleLabel = '老年端用户';
        else if(roleLabel === '子女群体') roleLabel = '子女端用户';
        
        var nickname = '';
        try { var pp = typeof u.data === 'object' && u.data ? (u.data.profile || {}) : {}; nickname = pp.name || ''; } catch(e) {}
        
        selectedPatientPhone = phone;
        selectedPatientName = nickname || phone;
        
        document.getElementById('rx-patient-info').innerHTML = 
          '<div class="form-row" style="border:1px solid var(--orange-light);border-radius:8px;padding:10px;margin-top:8px;">' +
          '<div class="avatar orange">👤</div>' +
          '<div style="flex:1;"><div style="font-weight:600;font-size:16px;">' + (nickname || '未设置昵称') + ' (' + escapeHtml(phone) + ')</div>' +
          '<div style="font-size:13px;color:var(--gray);">' + roleLabel + '</div></div></div>';
        
        document.getElementById('rx-form-card').style.display = 'block';
        document.getElementById('rx-send-btn').style.display = 'block';
      } catch(e) {
        document.getElementById('rx-patient-info').innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;color:var(--red);">网络错误</div>';
        toast('网络错误');
      }
    }
    
    document.getElementById('rx-send-btn').onclick = async function() {
      if(!selectedPatientPhone) { toast('请先选择用户'); return; }
      if(!currentUser) { toast('请先登录'); return; }
      
      // Collect items from inputs
      var itemsCollect = [];
      for(var i = 0; i < items.length; i++) {
        var iconEl = document.getElementById('item-icon-' + i);
        var nameEl = document.getElementById('item-name-' + i);
        var detailEl = document.getElementById('item-detail-' + i);
        var itemName = nameEl ? nameEl.value.trim() : '';
        if(itemName) {
          itemsCollect.push({
            icon: iconEl ? iconEl.value.trim() : '🏃',
            name: itemName,
            detail: detailEl ? detailEl.value.trim() : ''
          });
        }
      }
      
      if(itemsCollect.length === 0) { toast('请至少添加一个训练项目'); return; }
      
      var prescription = {
        goal: document.getElementById('rx-goal').value.trim(),
        intensity: document.getElementById('rx-intensity').value,
        maxHeartRate: document.getElementById('rx-hr').value,
        frequency: document.getElementById('rx-frequency').value.trim(),
        duration: document.getElementById('rx-duration').value.trim(),
        items: itemsCollect,
        cautions: document.getElementById('rx-cautions').value.trim(),
        dietAdvice: document.getElementById('rx-diet').value.trim()
      };
      var doctorNotes = document.getElementById('rx-notes').value.trim();
      
      document.getElementById('rx-send-btn').textContent = '⏳ 发送中...';
      document.getElementById('rx-send-btn').disabled = true;
      
      try {
        var res = await fetch(API_BASE + '/api/doctor/send-prescription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentUser.token },
          body: JSON.stringify({ patientPhone: selectedPatientPhone, prescription: prescription, doctorNotes: doctorNotes })
        });
        var data = await res.json();
        if(data.ok) {
          toast('处方已发送至 ' + selectedPatientName + ' ✅');
          navigate('data');
        } else {
          toast(data.error || '发送失败');
          document.getElementById('rx-send-btn').textContent = '📤 发送处方';
          document.getElementById('rx-send-btn').disabled = false;
        }
      } catch(e) {
        toast('网络错误');
        document.getElementById('rx-send-btn').textContent = '📤 发送处方';
        document.getElementById('rx-send-btn').disabled = false;
      }
    };
};
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
    app.querySelector('#save-btn').onclick = () => { lsSet(KEYS.HEALTH_DATA,{heartRate:form.heartRate,bloodPressure:form.bp,steps:form.steps,sleepHours:form.sleep,bloodOxygen:form.bloodOxygen,bloodSugar:form.bloodSugar}); storage.saveDailyRecord(today, form);  toast('已保存'); navigate('data'); };
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
            <div class="card" style="margin-bottom:8px;"><div class="form-row" style="border:none;"><span>🔍</span><input id="friend-search-input" class="form-input" placeholder="输入手机号搜索好友" style="flex:1;" /><button class="btn btn-primary" id="search-friend-btn" style="padding:6px 12px;">搜索</button></div><div id="search-result"></div></div><div class="banner orange" id="group-list-btn"><div class="emoji">👥</div><div><div class="t">群聊</div><div class="s">点击查看我的群聊</div></div></div>
            <div class="banner" id="assistant-btn"><div class="emoji">🤖</div><div><div class="t">安全助手</div><div class="s">智能健康顾问（支持语音）</div></div></div><div class="banner orange" id="ai-algorithm-btn" style="margin-top:4px;"><div class="emoji">🧠</div><div><div class="t">智能算法</div><div class="s">基于健康数据的营养运动建议</div></div></div>
            <div class="card" id="friend-requests-card" style="display:none;"><div class="card-title">📩 好友请求</div><div id="friend-requests-list"></div></div>
            <div class="card" id="friends-card" style="display:none;"><div class="card-title">👥 我的好友</div><div id="friends-list"><div class="text-muted" style="text-align:center;padding:12px;">加载中...</div></div></div>
            <div class="card" id="contacts-list">${contacts.map(c => `<div class="list-item" data-name="${escapeHtml(c.name)}"><div class="avatar ${c.bg || ''}">${c.avatar}</div><div class="list-content"><div class="list-name">${escapeHtml(c.name)}</div><div class="list-desc">${escapeHtml(latestMessageDescapeHtml(c.name))}</div></div><div class="list-time">${c.time}</div></div>`).join('')}</div>
        </div>`;
    app.querySelectorAll('.list-item').forEach(el => el.onclick = () => navigate('chat', { name: el.dataset.name }));
    app.querySelector('#add-contact-btn').onclick = showAddContactModal;
    app.querySelector('#group-list-btn').onclick = () => navigate('group-list');
    app.querySelector('#assistant-btn').onclick = () => navigate('assistant');
    app.querySelector('#ai-algorithm-btn').onclick = () => navigate('ai-chat');
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
    setNavTitle('处方管理');
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">处方管理</div><div class="header-subtitle">管理患者运动处方</div></div></div>
            <div class="grid-2">
                <div class="feature-tile orange" data-go="doctor-send-prescription"><div class="fi">📋</div><div class="fn">发送运动处方</div></div>
                <div class="feature-tile green" data-go="doctor-patient-data"><div class="fi">👥</div><div class="fn">查看患者数据</div></div>
            </div>
            <div class="card"><div class="card-title">已发送的处方</div><div id="sent-prescriptions"><div class="text-muted" style="text-align:center;padding:12px;">暂无已发送的处方记录</div></div></div>
        </div>`;
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

