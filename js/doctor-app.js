// ========== ���� ==========
const API_BASE = '';
let currentUser = null;

// ========== ���ش洢 ==========
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
        const items = ['̫��ȭ', '����'];
        if (age < 70) items.push('�˶ν�');
        if (!hasChronic) items.push('������');
        return {
            doctor: 'Ӫ��ʦ������ע��Ӫ��ʦ',
            hospital: '��ʯ������ �� ������������',
            maxHeartRate: maxHr,
            items,
            frequency: hasChronic ? 'ÿ�� 3 ��' : 'ÿ�� 5 ��',
            duration: 'ÿ�� 30 ����',
            intensity: hasChronic ? '��ǿ���������ϸ��������' : '�е�ǿ��������ѭ�򽥽�',
            cautions: '��������������������˶�ǰ���� 10 ���ӡ���������ͷ������ֹͣ��',
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
            { name: 'Ů��', avatar: '??', bg: 'orange', time: '�ո�', phone: '13800001234' },
            { name: '����', avatar: '??', bg: '', time: '10:25', phone: '13900005678' },
            { name: '����', avatar: '??', bg: 'orange', time: '����', phone: '13800000001' },
            { name: '������', avatar: '?????', bg: '', time: '����', phone: '13800000002' },
            { name: '��ʯ������', avatar: '??', bg: '', time: '2 ��ǰ', phone: '' }
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

// ========== ���� ==========
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
function modal({ title, content, showCancel = true, confirmText = 'ȷ��', cancelText = 'ȡ��', confirmColor }) {
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

// ========== �ƶ�ͬ�� ==========
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
    } catch(e) { console.warn('ͬ��ʧ��', e); }
}
async function pullFromCloud() {
    if (!currentUser) return;
    try {
        const res = await fetch(`${API_BASE}/api/sync`, { headers: { 'Authorization': `Bearer ${currentUser.token}` } });
        if (res.ok) {
            const cloud = await res.json();
            for (const k of Object.values(KEYS)) if (cloud[k] !== undefined) lsSet(k, cloud[k]);
            toast('��ͬ����������');
            render();
        } else {
            console.warn('ͬ��ʧ�ܣ�״̬��', res.status);
        }
    } catch(e) {
        console.warn('�������ʹ�ñ�������', e);
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
    currentUser = { phone, token: data.token, role: data.user.role || "�����û�" };
    localStorage.setItem('user', JSON.stringify(currentUser));
    await pullFromCloud();
    navigate('home');
}
function logout() {
    currentUser = null;
    localStorage.removeItem('user');
    navigate('login');
}

// ========== ·�� ==========
const TABBAR_PAGES = ['home', 'sport', 'prescription', 'data', 'messages', 'me'];
const TABBAR_LIST = [
    { key: 'home', text: '����̨', icon: '??' },
    { key: 'sport', text: '����', icon: '??' },
    { key: 'prescription', text: '����', icon: '??' },
    { key: 'data', text: '����', icon: '??' },
    { key: 'messages', text: '��Ϣ', icon: '??' },
    { key: 'me', text: '�ҵ�', icon: '??' }
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

// ========== ҳ�涨�� ==========
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
      '<div class="landing-logo-wrap"><div class="landing-logo-circle"><img src="images/logo-desktop.png" alt="��·���" style="width:110px;height:110px;"></div></div>'+
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
    app.innerHTML = '<div class="container" style="margin-top:40px;"><div class="card"><div class="card-title">'+(isLogin?'��¼':'ע��')+'</div>'+
      '<div class="form-row"><div class="form-label">�ֻ���</div><input id="phone" class="form-input" placeholder="11λ�ֻ���" /></div>'+
      '<div class="form-row"><div class="form-label">����</div><input id="password" type="password" class="form-input" placeholder="����" /></div>'+
      (!isLogin?'<div class="form-row"><div class="form-label">ѡ������</div><select id="role-select" class="form-input"><option value="�����û�">�����û�</option><option value="ҽ����Ӫ��ʦ">ҽ����Ӫ��ʦ</option><option value="��ŮȺ��">��ŮȺ��</option></select></div>':'')+
      '<button class="btn btn-primary btn-block" id="submit-btn">'+(isLogin?'��¼':'ע��')+'</button>'+
      '<div class="text-muted mt-20" style="text-align:center;"><span id="toggle-mode">'+(isLogin?'û���˺ţ�ȥע��':'�����˺ţ�ȥ��¼')+'</span></div>'+
    '</div></div>';
    app.querySelector('#submit-btn').onclick = async () => {
      const phone = app.querySelector('#phone').value.trim();
      const pwd = app.querySelector('#password').value.trim();
      if (!phone || !pwd) { toast("����д����"); return; }
      try {
        if (isLogin) {
          await loginOrRegister(phone, pwd, true);
        } else {
          var sel = document.getElementById("role-select");
          var role = sel ? sel.value : "��ͨ�û�";
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

// ������ҳ (ͼƬ·��������)
PAGES.home = (app) => {
    setNavTitle('����̨');
    const p = storage.getProfile();
    const name = (p && p.name) ? p.name : 'ҽʦ';
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">����̨</div><div class="header-subtitle">���ã�${escapeHtml(name)} �� ���չ���</div></div></div>
            <div class="banner"><div class="emoji">??</div><div><div class="t">��������</div><div class="s">���޴��죬���ע���߶�̬</div></div></div>
            <div class="grid-2">
                <div class="feature-tile orange" data-go="sport"><div class="fi">??</div><div class="fn">���߹���</div></div>
                <div class="feature-tile green" data-go="doctor-patient-data"><div class="fi">??</div><div class="fn">�鿴����</div></div>
                <div class="feature-tile purple" data-go="doctor-send-prescription"><div class="fi">??</div><div class="fn">���ʹ���</div></div>
                <div class="feature-tile blue" data-go="messages"><div class="fi">??</div><div class="fn">��Ϣ</div></div>
            </div>
            <div class="card"><div class="card-title">?? �󶨻���</div>
                <div class="form-row"><input id="bind-patient-input" class="form-input" placeholder="���뻼���ֻ���" style="flex:1;" /><button class="btn btn-primary" id="bind-patient-btn" style="padding:6px 12px;">��</button></div>
                <div id="bind-result"></div>
                <div id="bound-patients"><div class="text-muted" style="text-align:center;padding:12px;" id="no-patients-msg">���ް󶨻���</div></div>
            </div>
            <div class="card"><div class="card-title">����ͳ��</div><div id="work-stat"><div class="text-muted" style="text-align:center;padding:12px;">���ӷ�������ɲ鿴ͳ������</div></div></div>
        </div>`;
    app.querySelectorAll('[data-go]').forEach(el => el.onclick = () => navigate(el.dataset.go));
    renderBoundPatients(app);
    loadTodayStats(app);
    app.querySelector('#bind-patient-btn').onclick = function(){
        var phone = app.querySelector('#bind-patient-input').value.trim();
        if(!phone){ toast('�������ֻ���'); return; }
        if(!currentUser){ toast('���ȵ�¼'); return; }
        app.querySelector('#bind-result').innerHTML = '<div class="text-muted" style="text-align:center;padding:8px;">������...</div>';
        fetch(API_BASE+'/api/user/search?phone='+encodeURIComponent(phone), {headers:{Authorization:'Bearer '+currentUser.token}})
          .then(function(r){return r.json();})
          .then(function(d){
            if(d.user){
              var patients = JSON.parse(localStorage.getItem('dr_patients')||'[]');
              if(patients.some(function(p){return p.phone===phone;})){ app.querySelector('#bind-result').innerHTML = '<div class="text-muted" style="text-align:center;padding:8px;color:var(--orange);">�û����Ѱ�</div>'; return; }
              patients.push({phone:phone, name:d.user.name||'δ����'});
              localStorage.setItem('dr_patients', JSON.stringify(patients));
              app.querySelector('#bind-result').innerHTML = '<div class="text-muted" style="text-align:center;padding:8px;color:green;">�󶨳ɹ�</div>';
              renderBoundPatients(app);
            } else {
              app.querySelector('#bind-result').innerHTML = '<div class="text-muted" style="text-align:center;padding:8px;color:var(--red);">δ�ҵ����û�</div>';
            }
          })
          .catch(function(){ app.querySelector('#bind-result').innerHTML = '<div class="text-muted" style="text-align:center;padding:8px;color:var(--red);">����ʧ��</div>'; });
    };
};

function renderBoundPatients(app) {
    var patients = JSON.parse(localStorage.getItem('dr_patients')||'[]');
    var container = app.querySelector('#bound-patients');
    var noMsg = app.querySelector('#no-patients-msg');
    if(!container) return;
    if(patients.length === 0) {
        container.innerHTML = '<div class="text-muted" style="text-align:center;padding:12px;">���ް󶨻���</div>';
        return;
    }
    container.innerHTML = patients.map(function(p){
        return '<div class="list-item" style="cursor:pointer;" onclick="navigate(\'doctor-patient-data\',{phone:\''+p.phone+'\'})"><div class="avatar orange">\uD83D\uDC64</div><div class="list-content"><div class="list-name">'+escapeHtml(p.name)+'</div><div class="list-desc">'+escapeHtml(p.phone)+'</div></div></div>';
    }).join('');
}

PAGES.sport = (app) => {
    setNavTitle('���߹���');
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">���߹���</div><div class="header-subtitle">�鿴�͹������Ļ���</div></div></div>
            <div class="card"><div class="card-title">��������</div>
                <div class="form-row"><input id="patient-search-input" class="form-input" placeholder="���뻼���ֻ���" style="flex:1;" /><button class="btn btn-primary" id="patient-search-btn" style="padding:6px 12px;">����</button></div>
                <div id="patient-search-result"></div>
            </div>
            <div class="grid-2">
                <div class="feature-tile orange" data-go="doctor-patient-data"><div class="fi">??</div><div class="fn">�鿴�û�����</div></div>
                <div class="feature-tile green" data-go="doctor-send-prescription"><div class="fi">??</div><div class="fn">�����˶�����</div></div><div class="feature-tile purple" data-go="patient-records"><div class="fi">??</div><div class="fn">���Ƶ���</div></div><div class="feature-tile purple" data-go="ai-prescription"><div class="fi">??</div><div class="fn">���ܴ�������</div></div>
            </div>
            <div class="card"><div class="card-title">�����ϵ�Ļ���</div><div id="recent-patients"><div class="text-muted" style="text-align:center;padding:12px;">���޼�¼</div></div></div>
        </div>`;
    app.querySelector('#patient-search-btn').onclick = function(){
        var phone = app.querySelector('#patient-search-input').value.trim();
        if(!phone){ toast('�������ֻ���'); return; }
        if(!currentUser){ toast('���ȵ�¼'); return; }
        fetch(API_BASE+'/api/user/search?phone='+encodeURIComponent(phone), {headers:{Authorization:'Bearer '+currentUser.token}})
          .then(function(r){return r.json();})
          .then(function(d){
            if(d.user){
              app.querySelector('#patient-search-result').innerHTML = '<div class="form-row" style="border:none;"><span>??</span><div style="flex:1;"><div>'+escapeHtml(d.user.name||'')+'</div><div class="text-muted" style="font-size:12px;">'+escapeHtml(phone)+'</div></div><button class="btn btn-sm btn-primary" data-phone="'+phone+'">�鿴����</button></div>';
            } else {
              app.querySelector('#patient-search-result').innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;">δ�ҵ����û�</div>';
            }
          })
          .catch(function(){ toast('����ʧ��'); });
    };
};

PAGES.data = (app) => {
    setNavTitle('���ݿ���');
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">���ݿ���</div><div class="header-subtitle">�鿴���ߵ�ʵʱ��������</div></div></div>
            <div class="card"><div class="card-title">ѡ����</div>
                <div class="form-row"><input id="dash-phone" class="form-input" placeholder="���뻼���ֻ���" style="flex:1;" /><button class="btn btn-primary" id="dash-search-btn" style="padding:6px 12px;">����</button></div>
            </div>
            <div id="dash-refresh-bar" style="display:none;text-align:right;font-size:12px;color:var(--gray);margin-bottom:4px;">
                <span id="dash-update-time">\u2014</span>
                <button class="btn btn-ghost" id="dash-refresh-btn" style="padding:2px 6px;font-size:11px;">\uD83D\uDD04 \u5237\u65B0</button>
            </div>
            <div id="dash-content"></div>
        </div>`;
    app.querySelector('#dash-search-btn').onclick = function(){ loadDashData(app); };
    app.querySelector('#dash-phone').onkeypress = function(e){ if(e.key==='Enter') loadDashData(app); };
    app.querySelector('#dash-refresh-btn').onclick = function(){ if(app.querySelector('#dash-phone').value.trim()) loadDashData(app); };
};

var dashRefreshTimer = null;

async function loadDashData(app) {
    var phone = app.querySelector('#dash-phone').value.trim();
    if(!phone){ toast('�������ֻ���'); return; }
    if(!currentUser){ toast('���ȵ�¼'); return; }
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
        
        // Update refresh time + auto-refresh
        var now = new Date();
        app.querySelector('#dash-refresh-bar').style.display = 'block';
        app.querySelector('#dash-update-time').textContent = '\u6700\u8FD1\u66F4\u65B0: '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')+':'+String(now.getSeconds()).padStart(2,'0');
        if(dashRefreshTimer) clearInterval(dashRefreshTimer);
        dashRefreshTimer = setInterval(function(){
            if(!document.getElementById('dash-phone')||!document.getElementById('dash-phone').value.trim()){ clearInterval(dashRefreshTimer); dashRefreshTimer = null; return; }
            loadDashData(app);
        }, 30000);
    } catch(e){
        app.querySelector('#dash-content').innerHTML = '<div class="card" style="text-align:center;padding:20px;"><div style="font-size:48px;margin-bottom:12px;">\u26A0\uFE0F</div><div class="text-muted" style="color:var(--red);">\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC</div></div>';
    }
}
PAGES.messages = (app) => {
    const contacts = storage.getContacts();
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">��Ϣ</div><div class="header-subtitle">${contacts.length} λ��ϵ��</div></div><div class="header-add" id="add-contact-btn">��</div></div>
            <div class="card" style="margin-bottom:8px;"><div class="form-row" style="border:none;"><span>??</span><input id="friend-search-input" class="form-input" placeholder="�����ֻ�����������" style="flex:1;" /><button class="btn btn-primary" id="search-friend-btn" style="padding:6px 12px;">����</button></div><div id="search-result"></div></div><div class="banner orange" id="group-list-btn"><div class="emoji">??</div><div><div class="t">Ⱥ��</div><div class="s">����鿴�ҵ�Ⱥ��</div></div></div>
            <div class="banner" id="assistant-btn"><div class="emoji">??</div><div><div class="t">��ȫ����</div><div class="s">���ܽ������ʣ�֧��������</div></div></div><div class="banner orange" id="ai-algorithm-btn" style="margin-top:4px;"><div class="emoji">??</div><div><div class="t">�����㷨</div><div class="s">���ڽ������ݵ�Ӫ���˶�����</div></div></div>
            <div class="card" id="friend-requests-card" style="display:none;"><div class="card-title">?? ��������</div><div id="friend-requests-list"></div></div>
            <div class="card" id="friends-card" style="display:none;"><div class="card-title">?? �ҵĺ���</div><div id="friends-list"><div class="text-muted" style="text-align:center;padding:12px;">������...</div></div></div>
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
              html+='<span>?? '+escapeHtml(nm)+'</span>';
              html+='<div><button class="btn btn-primary" style="font-size:12px;padding:4px 10px;margin-right:6px;" onclick="acceptFriend(\''+req.from+'\')">����</button>';
              html+='<button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" onclick="rejectFriend(\''+req.from+'\')">�ܾ�</button></div></div>';
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
              return '<div class="list-item" data-friend="'+escapeHtml(f.phone)+'"><div class="avatar">??</div><div class="list-content"><div class="list-name">'+escapeHtml(nm)+'</div><div class="list-desc">'+escapeHtml(f.lastMessage||'������Ϣ')+'</div></div></div>';
            }).join('');
            list.querySelectorAll('.list-item').forEach(function(el){
              el.onclick=function(){ var nm=this.querySelector('.list-name').textContent; navigate('chat',{name:nm,phone:this.dataset.friend}); };
            });
          } else { if(document.getElementById('friends-card')) document.getElementById('friends-card').style.display='none'; }
        });
    }

};

PAGES.chat = (app, params) => {
    const name = params.name || '�Ի�';
    setNavTitle(name);
    
    // �������
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
    
    app.innerHTML = `<div class="chat-page"><div class="chat-list" id="chat-list"></div><div class="chat-input-bar"><input class="chat-input" id="chat-input" placeholder="��������Ϣ��" /><button class="voice-btn" id="voice-btn">??</button><button class="btn btn-secondary" id="send-btn">����</button></div><div class="voice-overlay" id="voice-overlay"><div class="voice-wave">??</div><div class="voice-tip">�ɿ����� �� �ϻ�ȡ��</div></div></div>`;
    const list = app.querySelector('#chat-list');
    const input = app.querySelector('#chat-input');
    const renderMsg = () => {
        list.innerHTML = history.map(m => `<div class="msg ${m.mine ? 'me' : 'other'}"><div class="avatar">${m.mine ? '??' : '??'}</div><div class="bubble">${escapeHtml(m.text)}</div></div>`).join('');
        list.scrollTop = list.scrollHeight;
    };
    renderMsg();
    
    app.querySelector('#send-btn').onclick = () => {
        const text = input.value.trim();
        if (!text) return;
        const my = { id: 'm_'+Date.now(), text, mine: true, ts: Date.now() };
        storage.addMessage(name, my);
        history.push(my);
        const reply = { id: 'r_'+Date.now(), text: '�յ����һ������ע���Ľ�����', mine: false, ts: Date.now() };
        storage.addMessage(name, reply);
        history.push(reply);
        input.value = '';
        renderMsg();
    };
    
    // ����¼��
    let mediaRecorder = null, audioChunks = [], startY = 0;
    const voiceBtn = app.querySelector('#voice-btn');
    const overlay = app.querySelector('#voice-overlay');
    const overlayTip = overlay.querySelector('.voice-tip');
    const moveHandler = (e) => {
        const y = e.clientY || e.touches?.[0]?.clientY;
        if (startY - y > 30) {
            overlay.classList.add('cancel');
            overlayTip.textContent = '����ȡ��';
        } else {
            overlay.classList.remove('cancel');
            overlayTip.textContent = '�ɿ����� �� �ϻ�ȡ��';
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
        }).catch(err => toast('�޷�¼����������˷�Ȩ��'));
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
                toast('�������ϴ��������ݲ�֧���������ţ���תΪ��������');
                const text = `[������Ϣ] ${data.url}`;
                const my = { id: 'm_'+Date.now(), text, mine: true, ts: Date.now() };
                storage.addMessage(name, my);
                history.push(my);
                const reply = { id: 'r_'+Date.now(), text: '���յ���������', mine: false, ts: Date.now() };
                storage.addMessage(name, reply);
                history.push(reply);
                renderMsg();
            } else toast('�����ϴ�ʧ��');
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
            toast('��ȡ��¼��');
        }
    }
};

// Ⱥ���б�
PAGES['group-list'] = async (app) => {
    setNavTitle('�ҵ�Ⱥ��');
    setNavRight('', null);
    app.innerHTML = `<div class="container"><div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">Ⱥ��</div><div class="header-subtitle"></div></div><div class="header-add" id="create-group">��</div></div><div id="groups-list" class="card"></div></div>`;
    const groupsContainer = app.querySelector('#groups-list');
    app.querySelector('#create-group').onclick = () => navigate('group-create');
    try {
        const res = await fetch(`${API_BASE}/api/groups`, { headers: { 'Authorization': `Bearer ${currentUser.token}` } });
        if (res.ok) {
            const groups = await res.json();
            if (groups.length === 0) groupsContainer.innerHTML = '<div class="text-muted" style="text-align:center;padding:20px;">����Ⱥ�ģ����������</div>';
            else groupsContainer.innerHTML = groups.map(g => `<div class="list-item" data-id="${g._id}"><div class="avatar">${g.avatar || '??'}</div><div class="list-content"><div class="list-name">${escapeHtml(g.name)}</div><div class="list-desc">${escapeHtml(g.lastMessage || '������Ϣ')}</div></div><div class="list-time">${new Date(g.lastTime).toLocaleTimeString()}</div></div>`).join('');
            app.querySelectorAll('.list-item').forEach(el => el.onclick = () => navigate('group-chat', { groupId: el.dataset.id }));
        } else toast('����Ⱥ��ʧ��');
    } catch(e) { toast('��������޷�����Ⱥ��'); }
};

// ����Ⱥ��
PAGES['group-create'] = async (app) => {
    setNavTitle('����Ⱥ��');
    const contacts = storage.getContacts();
    app.innerHTML = `<div class="container"><div class="card"><div class="card-title">Ⱥ����</div><input id="group-name" class="form-input" placeholder="����Ⱥ����" /></div><div class="card"><div class="card-title">ѡ���Ա</div><div class="checkbox-group" id="members-list"></div></div><button class="btn btn-primary btn-block" id="submit-create">����Ⱥ��</button></div>`;
    const membersDiv = app.querySelector('#members-list');
    membersDiv.innerHTML = contacts.map(c => `<div class="checkbox-item"><input type="checkbox" value="${escapeHtml(c.name)}" id="chk_${escapeHtml(c.name)}"><label for="chk_${escapeHtml(c.name)}">${c.avatar} ${c.name}</label></div>`).join('');
    app.querySelector('#submit-create').onclick = async () => {
        const name = app.querySelector('#group-name').value.trim();
        if (!name) { toast('����дȺ����'); return; }
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
            if (res.ok) { toast('�����ɹ�'); navigate('group-list'); }
            else toast('����ʧ��');
        } catch(e) { document.getElementById('back-to-em').onclick = function() { navigate('emergency'); };
        toast('�������'); }
    };
};

// Ⱥ��������
PAGES['group-chat'] = async (app, params) => {
    const groupId = params.groupId;
    if (!groupId) { navigate('group-list'); return; }
    setNavTitle('Ⱥ��');
    // ��ȡȺ����
    let groupName = 'Ⱥ��';
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

    app.innerHTML = `<div class="chat-page"><div class="chat-list" id="chat-list"></div><div class="chat-input-bar"><input class="chat-input" id="chat-input" placeholder="��������Ϣ��" /><button class="voice-btn" id="voice-btn">??</button><button class="btn btn-secondary" id="send-btn">����</button></div><div class="voice-overlay" id="voice-overlay"><div class="voice-wave">??</div><div class="voice-tip">�ɿ����� �� �ϻ�ȡ��</div></div></div>`;
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
        } catch(e) { toast('������Ϣʧ��'); }
    }
    function renderMsgs() {
        list.innerHTML = messages.map(m => {
            const isMe = m.from === currentUser.phone;
            let content = '';
            if (m.text) content = escapeHtml(m.text);
            else if (m.voiceUrl) content = `<div class="voice-message" data-url="${escapeHtml(m.voiceUrl)}"><span class="voice-icon">??</span><span class="voice-duration">������Ϣ</span></div>`;
            return `<div class="msg ${isMe ? 'me' : 'other'}"><div class="avatar">${isMe ? '??' : '??'}</div><div class="bubble">${content}</div></div>`;
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
            } else toast('����ʧ��');
        } catch(e) { document.getElementById('back-to-em').onclick = function() { navigate('emergency'); };
        toast('�������'); }
    };
    
    // ����¼��
    let mediaRecorder = null, audioChunks = [], startY = 0;
    const voiceBtn = app.querySelector('#voice-btn');
    const overlay = app.querySelector('#voice-overlay');
    const overlayTip = overlay.querySelector('.voice-tip');
    const moveHandler = (e) => {
        const y = e.clientY || e.touches?.[0]?.clientY;
        if (startY - y > 30) {
            overlay.classList.add('cancel');
            overlayTip.textContent = '����ȡ��';
        } else {
            overlay.classList.remove('cancel');
            overlayTip.textContent = '�ɿ����� �� �ϻ�ȡ��';
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
        }).catch(err => toast('�޷�¼��'));
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
                    else toast('��������ʧ��');
                } else toast('�ϴ�ʧ��');
            } catch(e) { document.getElementById('back-to-em').onclick = function() { navigate('emergency'); };
        toast('�������'); }
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
            toast('��ȡ��¼��');
        }
    }
};

// ��ȫ���֣��޸��棺���Զ���ת��¼��
PAGES.assistant = (app) => {
    setNavTitle('��ȫ����');
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

    app.innerHTML = `<div class="chat-page"><div class="chat-list" id="chat-list"><div class="msg other"><div class="avatar">??</div><div class="bubble">���ã��������İ�ȫ�������֣�������ʲô���԰�������</div></div></div><div class="chat-input-bar"><input class="chat-input" id="chat-input" placeholder="���뽡�����⡭" /><button class="voice-btn" id="voice-btn">??</button><button class="btn btn-secondary" id="send-btn">����</button></div><div class="voice-overlay" id="voice-overlay"><div class="voice-wave">??</div><div class="voice-tip">�ɿ����� �� �ϻ�ȡ��</div></div></div>`;
    const list = app.querySelector('#chat-list');
    const input = app.querySelector('#chat-input');
    let history = [{ role: 'assistant', content: '���ã��������İ�ȫ�������֣�������ʲô���԰�������' }];
    function addMessage(role, content) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ${role === 'user' ? 'me' : 'other'}`;
        msgDiv.innerHTML = `<div class="avatar">${role === 'user' ? '??' : '??'}</div><div class="bubble">${escapeHtml(content)}</div>`;
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
                addMessage('assistant', '��Ǹ��������ʱ�����ã����Ժ����ԡ�');
            }
        } catch(e) {
            addMessage('assistant', '������������������ӡ�');
        }
    };
    // ����¼�ƣ�����ʾ��ʵ��δ������ʶ��
    let mediaRecorder = null, audioChunks = [], startY = 0;
    const voiceBtn = app.querySelector('#voice-btn');
    const overlay = app.querySelector('#voice-overlay');
    const overlayTip = overlay.querySelector('.voice-tip');
    const moveHandler = (e) => {
        const y = e.clientY || e.touches?.[0]?.clientY;
        if (startY - y > 30) {
            overlay.classList.add('cancel');
            overlayTip.textContent = '����ȡ��';
        } else {
            overlay.classList.remove('cancel');
            overlayTip.textContent = '�ɿ����� �� �ϻ�ȡ��';
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
        }).catch(err => toast('�޷�¼��'));
    }
    async function stopRecord(e) {
        if (!mediaRecorder) return;
        const endY = e.clientY || e.changedTouches?.[0]?.clientY;
        if (startY - endY > 50) { cancelRecord(); return; }
        mediaRecorder.onstop = () => {
            toast('����ʶ����δ���ţ����ֶ���������');
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
            toast('��ȡ��');
        }
    }
};

// ԭ������ҳ�棨prescription, courses, emergency, monitor, coin, report, profile-setup, me��
PAGES.prescription = (app) => {
    setNavTitle('��������');
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">��������</div><div class="header-subtitle">���������˶�����</div></div></div>
            <div class="grid-2">
                <div class="feature-tile orange" data-go="doctor-send-prescription"><div class="fi">??</div><div class="fn">�����˶�����</div></div>
                <div class="feature-tile green" data-go="doctor-patient-data"><div class="fi">??</div><div class="fn">�鿴��������</div></div>
            </div>
            <div class="card"><div class="card-title">�ѷ��͵Ĵ���</div><div id="sent-prescriptions"><div class="text-muted" style="text-align:center;padding:12px;">�����ѷ��͵Ĵ�����¼</div></div></div>
        </div>`;
    app.querySelectorAll('[data-go]').forEach(el => el.onclick = () => navigate(el.dataset.go));
};
PAGES.courses = (app) => {
    setNavTitle('�γ�ԤԼ');
    let selected = '��������';
    app.innerHTML = `<div class="container"><div class="banner orange"><div class="emoji">??</div><div><div class="t">ƽ̨�����Ƽ�</div><div class="s">������������״��ƥ��</div></div></div>
        <div class="card"><div class="course-card orange" data-name="��������"><div class="icon">??</div><div class="info"><div class="name">��������</div><div class="desc">12-16�˵�ǿ��Ȥζ��</div></div></div>
        <div class="course-card" data-name="��ͨС���"><div class="icon">??</div><div class="info"><div class="name">��ͨС���</div><div class="desc">8-10���и�ǿ��ѵ��</div></div></div></div>
        <button class="btn btn-primary btn-block" id="book-btn">����ԤԼ</button></div>`;
    app.querySelectorAll('.course-card').forEach(el => el.onclick = () => { selected = el.dataset.name; toast(`��ѡ��${selected}`); });
    app.querySelector('#book-btn').onclick = async () => { if ((await modal({ title: 'ԤԼȷ��', content: `�Ƿ�ԤԼ${selected}��` })).confirm) toast('ԤԼ�ɹ�'); };
};

PAGES.emergency = (app) => {
    setNavTitle('��������');
    (async function() {
    try {
        var res = await fetch(API_BASE + '/api/emergency/contacts', {
            headers: { Authorization: 'Bearer ' + (currentUser ? currentUser.token : '') }
        });
        var data = await res.json();
        var contacts = data.contacts || [];
        var contactBtns = contacts.map(function(c) {
            return '<button class="emergency-call-btn primary" data-tel="' + escapeHtml(c.phone) + '"><div class="avatar">??</div><div class="info"><div class="name">' + escapeHtml(c.name) + '</div><div class="desc">' + escapeHtml(c.phone) + '</div></div><div class="call-ic">??</div></button>';
        }).join('');
        app.innerHTML = '<div class="container"><div class="banner orange"><div class="emoji">??</div><div><div class="t">�������������ֱ�Ӻ���</div><div class="s">����·���ť��������</div></div></div>' +
        '<button class="emergency-call-btn danger" data-tel="120"><div class="avatar">??</div><div class="info"><div class="name">120 ����</div><div class="desc">�Զ�����λ��</div></div><div class="call-ic">??</div></button>' +
        contactBtns +
        '<div class="card" style="margin-top:8px;"><div class="card-title">���ӽ�����ϵ��</div>' +
        '<div class="form-row"><div class="form-label">��ע</div><input id="em-name" class="form-input" placeholder="��ϵ������" /></div>' +
        '<div class="form-row"><div class="form-label">�ֻ���</div><input id="em-phone" class="form-input" placeholder="11λ�ֻ���" /></div>' +
        '<button class="btn btn-primary btn-block" id="em-add-btn">���Ӳ�����</button></div>' +
        '<button class="btn btn-ghost btn-block" id="manage-ec-btn" style="margin-top:8px;">?? ����������ϵ��</button></div>';
    app.querySelectorAll('.emergency-call-btn').forEach(el => el.onclick = async () => { if ((await modal({ title: 'ȷ�Ϻ���', content: '���� ' + el.querySelector('.name').innerText, confirmColor: '#e8504a' })).confirm) location.href = 'tel:' + el.dataset.tel; });
    var manageBtn = document.getElementById('manage-ec-btn');
    if(manageBtn) manageBtn.onclick = function() { navigate('emergency-contacts'); };
    var emAddBtnOk = document.getElementById('em-add-btn');
    if(emAddBtnOk) emAddBtnOk.onclick = async function() {
      var n = document.getElementById('em-name').value.trim();
      var p = document.getElementById('em-phone').value.trim();
      if (!n || !p) { toast('����д������Ϣ'); return; }
      if (!/^1[0-9]{10}$/.test(p)) { toast('��������ȷ���ֻ���'); return; }
      if (!currentUser) { toast('���ȵ�¼'); return; }
      try {
        var r = await fetch(API_BASE + '/api/emergency/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentUser.token },
          body: JSON.stringify({ name: n, phone: p })
        });
        var d = await r.json();
        if (d.ok) {
          toast('�ѱ��沢��ֱ�Ӳ��� ' + n);
          navigate('emergency');
        } else toast(d.error || '����ʧ��');
      } catch(e) { toast('�������'); }
    };
    } catch(e) {
        app.innerHTML = '<div class="container"><div class="banner orange"><div class="emoji">??</div><div><div class="t">�������������ֱ�Ӻ���</div><div class="s">����·���ť��������</div></div></div>' +
        '<button class="emergency-call-btn danger" data-tel="120"><div class="avatar">??</div><div class="info"><div class="name">120 ����</div><div class="desc">�Զ�����λ��</div></div><div class="call-ic">??</div></button>' +
        '<button class="btn btn-ghost btn-block" id="manage-ec-btn-fb" style="margin-top:8px;">?? ����������ϵ��</button></div>';
        // Also add the emergency add form in catch
        // Already done in the app.innerHTML above
        app.querySelectorAll('.emergency-call-btn').forEach(el => el.onclick = async () => { if ((await modal({ title: 'ȷ�Ϻ���', content: '���� ' + el.querySelector('.name').innerText, confirmColor: '#e8504a' })).confirm) location.href = 'tel:' + el.dataset.tel; });
        var fbBtn = document.getElementById('manage-ec-btn-fb');
        if(fbBtn) fbBtn.onclick = function() { navigate('emergency-contacts'); };
    var emAddBtn = document.getElementById('em-add-btn');
    if(emAddBtn) emAddBtn.onclick = async function() {
      var n = document.getElementById('em-name').value.trim();
      var p = document.getElementById('em-phone').value.trim();
      if (!n || !p) { toast('����д������Ϣ'); return; }
      if (!/^1[0-9]{10}$/.test(p)) { toast('��������ȷ���ֻ���'); return; }
      if (!currentUser) { toast('���ȵ�¼'); return; }
      try {
        var r = await fetch(API_BASE + '/api/emergency/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentUser.token },
          body: JSON.stringify({ name: n, phone: p })
        });
        var d = await r.json();
        if (d.ok) {
          toast('�ѱ��沢��ֱ�Ӳ��� ' + n);
          navigate('emergency');
        } else toast(d.error || '����ʧ��');
      } catch(e) { toast('�������'); }
    };
    }
    })();
};

PAGES['emergency-contacts'] = (app) => {
    setNavTitle('����������ϵ��');
    loadEmergencyContactsPage(app);
};

async function loadEmergencyContactsPage(app) {
    try {
        var res = await fetch(API_BASE + '/api/emergency/contacts', {
            headers: { Authorization: 'Bearer ' + currentUser.token }
        });
        var data = await res.json();
        var contacts = data.contacts || [];
        app.innerHTML = '<div class="container"><div class="banner orange"><div class="emoji">??</div><div><div class="t">������ϵ��</div><div class="s">���������ε���ϵ�ˣ�����ʱһ������</div></div></div>' +
            '<div class="card"><div class="card-title">�ҵĽ�����ϵ��</div><div id="ec-contacts-list">' +
            (contacts.length === 0 ? '<div class="text-muted" style="text-align:center;padding:15px;">���޽�����ϵ��</div>' :
            contacts.map(function(c) {
                return '<div class="form-row" style="border-bottom:1px solid #f0f0f0;padding:8px 0;"><div class="avatar">??</div><div style="flex:1;"><div style="font-weight:600;">' + escapeHtml(c.name) + '</div><div style="font-size:13px;color:var(--gray);">' + escapeHtml(c.phone) + '</div></div><button class="btn btn-danger ec-del-btn" data-phone="' + escapeHtml(c.phone) + '" style="padding:4px 8px;font-size:12px;">ɾ��</button></div>';
            }).join('')) +
            '</div></div>' +
            '<div class="card"><div class="card-title">���ӽ�����ϵ��</div>' +
            '<div class="form-row"><div class="form-label">����</div><input id="ec-name" class="form-input" placeholder="��ϵ������" /></div>' +
            '<div class="form-row"><div class="form-label">�ֻ���</div><input id="ec-phone" class="form-input" placeholder="11λ�ֻ���" /></div>' +
            '<button class="btn btn-primary btn-block" id="add-ec-btn">����</button></div></div>';
        
        app.querySelectorAll('.ec-del-btn').forEach(function(el) {
            el.onclick = async function() {
                var phone = el.dataset.phone;
                if (!phone) return;
                var r2 = await modal({ title: 'ȷ��ɾ��', content: 'ȷ��Ҫɾ���ý�����ϵ����', confirmColor: '#e8504a' });
                if (r2.confirm) {
                    try {
                        var r3 = await fetch(API_BASE + '/api/emergency/contacts/delete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentUser.token },
                            body: JSON.stringify({ phone: phone })
                        });
                        var d2 = await r3.json();
                        if (d2.ok) { toast('��ɾ��'); loadEmergencyContactsPage(app); }
                        else toast(d2.error || 'ɾ��ʧ��');
                    } catch(e) { document.getElementById('back-to-em').onclick = function() { navigate('emergency'); };
        toast('�������'); }
                }
            };
        });
        
        document.getElementById('add-ec-btn').onclick = async function() {
            var name = document.getElementById('ec-name').value.trim();
            var phone = document.getElementById('ec-phone').value.trim();
            if (!name || !phone) { toast('����д������Ϣ'); return; }
            if (!/^1[0-9]{10}$/.test(phone)) { toast('��������ȷ���ֻ���'); return; }
            try {
                var r4 = await fetch(API_BASE + '/api/emergency/contacts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentUser.token },
                    body: JSON.stringify({ name: name, phone: phone })
                });
                var d4 = await r4.json();
                if (d4.ok) { toast('���ӳɹ�'); loadEmergencyContactsPage(app); }
                else toast(d4.error || '����ʧ��');
            } catch(e) { document.getElementById('back-to-em').onclick = function() { navigate('emergency'); };
        toast('�������'); }
        };
    } catch(e) {
        app.innerHTML = '<div class="container"><div class="card"><div class="text-muted" style="text-align:center;padding:20px;">����ʧ�ܣ���������</div><button class="btn btn-primary btn-block" id="back-to-em">����</button></div></div>';
        document.getElementById('back-to-em').onclick = function() { navigate('emergency'); };
        toast('�������');
    }
}

PAGES.monitor = (app) => {
    setNavTitle('�������');
    const h = storage.getHealthData();
    app.innerHTML = `<div class="container"><div class="card"><div class="card-title">Ѫѹ���</div><div class="fs-40 fw-600 text-green">${h.bloodPressure}</div></div><div class="card"><div class="card-title">���ʼ��</div><div class="fs-40 fw-600 text-orange">${h.heartRate} ��/��</div></div><div class="card"><div class="card-title">Ѫ�����Ͷ�</div><div class="fs-40 fw-600 text-green">${h.bloodOxygen}%</div></div></div>`;
};
PAGES.coin = (app) => {
    setNavTitle("������");
    app.innerHTML = '<div class="container"><div class="coin-hero" id="coin-hero"><div class="coin-logo">��</div><div class="coin-num" id="coin-num">0</div><div class="coin-label">�ҵĽ�����</div></div><div class="card"><div class="card-title">��ȡ��¼</div><div class="form-row"><span class="coin-tag get">+1</span><div>�����˶���</div></div></div>'+
      '<div class="card"><div class="card-title">��ֵ������</div>'+
      '<div class="grid-2" style="margin-bottom:8px;">'+
      '<div class="feature-tile orange" onclick="selectRecharge(10)"><div class="fi">10</div><div class="fn">10 ö</div></div>'+
      '<div class="feature-tile green" onclick="selectRecharge(30)"><div class="fi">30</div><div class="fn">30 ö</div></div>'+
      '<div class="feature-tile orange" onclick="selectRecharge(50)"><div class="fi">50</div><div class="fn">50 ö</div></div>'+
      '<div class="feature-tile green" onclick="selectRecharge(100)"><div class="fi">100</div><div class="fn">100 ö</div></div>'+
      '</div>'+
      '<div style="text-align:center;font-size:16px;margin-bottom:12px;">ѡ����: <strong id="selected-amount">50</strong> ö</div>'+
      '<div style="display:flex;gap:8px;margin-bottom:8px;"><button class="btn btn-secondary" style="flex:1;font-size:16px;" onclick=\'doRecharge("΢��")\'>\uD83D\uDCB1 ΢��֧��</button><button class="btn btn-primary" style="flex:1;font-size:16px;" onclick=\'doRecharge("֧����")\'>\uD83D\uDCB0 ֧����</button></div>'+
      '<div id="recharge-result" style="text-align:center;font-size:14px;"></div></div>'+
'<div style="text-align:center;font-size:12px;color:#999;padding:8px 0;">?? 1������ = 1Ԫ�������ڶһ��γ������</div>'+

      '<div class="card"><div class="card-title">���ѷ���</div><div id="svc-in-coin"><div class="text-muted" style="text-align:center;padding:10px;">��</div></div></div></div>';
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
      if(!currentUser){toast("���ȵ�¼");return;}
      var amount = window._rechargeAmount || 50;
      document.getElementById("recharge-result").innerHTML = '<div class="chart-placeholder">\uD83D\uDD04 ���ڴ���'+method+'֧��...</div>';
      try {
        var res = await fetch(API_BASE+"/api/coins/recharge",{
          method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+currentUser.token},
          body:JSON.stringify({amount:amount,method:method})
        });
        var data = await res.json();
        if(data.ok){toast(method+"��ֵ�ɹ� \u2705");}else{toast(data.error||"��ֵʧ��");}
        // Refresh coin display
        var cr = await fetch(API_BASE+"/api/coins",{headers:{Authorization:"Bearer "+currentUser.token}});
        var cd = await cr.json();
        document.getElementById("coin-num").textContent = cd.coins||0;
      } catch(e){toast("�������");}
    };
    window.selectRecharge(50);
    // Load services
    fetch(API_BASE+"/api/services").then(function(r){return r.json();}).then(function(d){
      if(d.data&&d.data.length){
        var html = d.data.map(function(s){
          return '<div class="form-row" style="cursor:pointer;"><span>\uD83D\uDCB3</span><div style="flex:1"><strong>'+escapeHtml(s.name)+'</strong><br><span style="font-size:13px;color:var(--gray);">\u00a5 '+s.price+' | �Ѳ��� '+(s.enrolled||0)+'/'+s.maxParticipants+' ��</span></div><button class="btn btn-primary" style="font-size:13px;padding:6px 14px;" onclick=\'purchaseService("'+s.id+'")\'>����</button></div>';
        }).join("");
        document.getElementById("svc-in-coin").innerHTML = html;
      } else {
        document.getElementById("svc-in-coin").innerHTML = '<div class="text-muted" style="font-size:14px;text-align:center;padding:10px;">���޿��÷���</div>';
      }
    });
  };
PAGES['profile-setup'] = (app) => {
    setNavTitle('¼������');
    const p = storage.getProfile() || {};
    let form = { name: p.name || '', height: p.height || '165', weight: p.weight || '65', age: p.age || '65', hasChronic: !!p.hasChronic };
    var h = parseInt(form.height) || 165;
    var w = parseInt(form.weight) || 65;
    var a = parseInt(form.age) || 65;
    app.innerHTML = '<div class="container"><div class="card"><div class="card-title">�������</div>' +
        '<div class="form-row"><div class="form-label">����</div><input class="form-input" data-f="name" value="' + escapeHtml(form.name) + '" /></div>' +
        '<div style="margin-bottom:12px;padding:8px 0;border-bottom:1px solid #f0f0f0;">' +
          '<div style="font-size:14px;font-weight:600;margin-bottom:6px;">����</div>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<input type="range" class="form-input" data-f="height" min="120" max="220" value="' + h + '" style="flex:1;">' +
            '<span class="range-val" data-f="height">' + h + '</span>' +
            '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:45px;text-align:right;">cm</span>' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:12px;padding:8px 0;border-bottom:1px solid #f0f0f0;">' +
          '<div style="font-size:14px;font-weight:600;margin-bottom:6px;">����</div>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<input type="range" class="form-input" data-f="weight" min="30" max="150" value="' + w + '" style="flex:1;">' +
            '<span class="range-val" data-f="weight">' + w + '</span>' +
            '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:45px;text-align:right;">kg</span>' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:12px;padding:8px 0;border-bottom:1px solid #f0f0f0;">' +
          '<div style="font-size:14px;font-weight:600;margin-bottom:6px;">����</div>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<input type="range" class="form-input" data-f="age" min="40" max="100" value="' + a + '" style="flex:1;">' +
            '<span class="range-val" data-f="age">' + a + '</span>' +
            '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:45px;text-align:right;">��</span>' +
          '</div>' +
        '</div></div>' +
        '<div class="card"><div class="card-title">����״��</div><div class="check-row" id="chronic-row"><div class="check-box ' + (form.hasChronic ? 'checked' : '') + '">' + (form.hasChronic ? '?' : '') + '</div><span>�л����������Բ�ʷ</span></div></div>' +
        '<button class="btn btn-primary btn-block" id="submit-btn">�ύ�������˶�����</button></div>';
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
        box.textContent = form.hasChronic ? '?' : '';
    };
    app.querySelector('#submit-btn').onclick = function() { storage.setProfile(form); storage.setPrescription(storage.generatePrescription(form)); toast('�����ѱ���'); navigate('prescription'); };
};

PAGES['ai-chat'] = (app) => {
    setNavTitle('�����㷨');
    var adviceText = '';
    var showingForm = false;
    
    function renderMain() {
      showingForm = false;
      app.innerHTML = '<div class="container"><div class="banner orange"><div class="emoji">??</div><div><div class="t">����Ӫ�����˶�����</div><div class="s">�����ṩ���Ľ������ݣ�ϵͳ�����ɸ��Ի�����</div></div></div>' +
        '<div class="card"><div class="card-title">��������</div><div id="advice-content"><div class="text-muted" style="text-align:center;padding:20px;font-size:15px;">����·���ť����д�������ݻ�ȡ����</div></div></div>' +
        '<div class="card"><button class="btn btn-primary btn-block" id="provide-data-btn">?? �ṩ��������</button></div>' +
        '<div class="card"><button class="btn btn-secondary btn-block" id="refresh-advice-btn">?? ˢ�½���</button></div></div>';
      app.querySelector('#provide-data-btn').onclick = renderForm;
      app.querySelector('#refresh-advice-btn').onclick = function() {
        if(adviceText) {
          var formatted = adviceText.replace(/\\n/g, '<br>');
          document.getElementById('advice-content').innerHTML = '<div class="prescription-box" style="border-color:var(--orange);background:var(--orange-light);color:var(--text);font-size:15px;line-height:1.8;">' + formatted + '</div>';
          toast('��ˢ��');
        } else {
          toast('���޽��飬�����ṩ��������');
        }
      };
    }
    
    function renderForm() {
      if(!currentUser){toast('���ȵ�¼');return;}
      showingForm = true;
      app.innerHTML = '<div class="container"><div class="banner orange"><div class="emoji">??</div><div><div class="t">��д��������</div><div class="s">ͨ������������Ľ���ָ�꣬Ȼ���ȡ����</div></div></div>' +
        '<div class="card"><div class="card-title">��ǰ����ָ��</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">����</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-age" min="40" max="100" value="65" style="flex:1;">' +
      '<span class="range-val" data-f="ai-age">65</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">��</span>' +
      '</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">����</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-height" min="120" max="220" value="165" style="flex:1;">' +
      '<span class="range-val" data-f="ai-height">165</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">cm</span>' +
      '</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">����</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-weight" min="30" max="150" value="65" style="flex:1;">' +
      '<span class="range-val" data-f="ai-weight">65</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">kg</span>' +
      '</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">Ѫѹ(����ѹ)</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-bloodPressure" min="80" max="220" value="120" style="flex:1;">' +
      '<span class="range-val" data-f="ai-bloodPressure">120</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">mmHg</span>' +
      '</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">����</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-heartRate" min="30" max="220" value="72" style="flex:1;">' +
      '<span class="range-val" data-f="ai-heartRate">72</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">��/��</span>' +
      '</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">Ѫ��</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-bloodOxygen" min="60" max="100" value="97" style="flex:1;">' +
      '<span class="range-val" data-f="ai-bloodOxygen">97</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">%</span>' +
      '</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">Ѫ��</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-bloodSugar" min="20" max="200" value="55" style="flex:1;">' +
      '<span class="range-val" data-f="ai-bloodSugar">55</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">mmol/L</span>' +
      '</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">����</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-steps" min="0" max="50000" value="5000" style="flex:1;">' +
      '<span class="range-val" data-f="ai-steps">5000</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">��</span>' +
      '</div>' +
'<div style="margin-bottom:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">˯��ʱ��</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<input type="range" class="form-input" data-f="ai-sleep" min="0" max="24" value="7" style="flex:1;">' +
      '<span class="range-val" data-f="ai-sleep">7</span>' +
      '<span style="font-size:11px;color:var(--gray);white-space:nowrap;width:55px;text-align:right;">Сʱ</span>' +
      '</div>' +
        '</div>' +
        '<div class="card"><div class="card-title">���Բ�ʷ</div>' +
        '<div class="check-row" id="ai-chronic-row"><div class="check-box" id="ai-chronic-box"></div><span>�л����������Բ�ʷ</span></div></div' +
        '<div class="card"><div class="card-title">��������</div><div id="advice-content" style="margin-top:8px;"><div class="text-muted" style="text-align:center;padding:20px;font-size:15px;">��д���ݺ����·���ť��ȡ����</div></div></div>' +
        '<button class="btn btn-primary btn-block" id="submit-advice-btn">?? ��ȡ����</button>' +
        '<button class="btn btn-ghost btn-block" id="back-to-main-btn" style="margin-top:8px;">�� ����</button></div>';
      
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
        box.textContent = hasChronic ? '?' : '';
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
        body.chronicDiseases = hasChronic ? '�����Բ�ʷ' : '';
        
        document.getElementById('advice-content').innerHTML = '<div class="chart-placeholder">?? ���ڷ������Ľ�������...</div>';
        
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
            toast('���������� ?');
          } else {
            document.getElementById('advice-content').innerHTML = '<div class="text-muted" style="text-align:center;padding:20px;">��ʱ�޷����ɽ��飬���Ժ�����</div>';
            toast('����ʧ��');
          }
        } catch(e) {
          document.getElementById('advice-content').innerHTML = '<div class="text-muted" style="text-align:center;padding:20px;">�������������</div>';
          toast('�������');
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
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">�ҵ�</div><div class="header-subtitle">��������</div></div></div>
            <div class="card"><div class="row"><div class="avatar orange" style="width:65px;height:65px;font-size:35px;">\uD83D\uDC68</div><div><div class="fs-40 fw-600">${escapeHtml(p.name || '����')}${(currentUser&&currentUser.role?'<span class="tag orange">' + escapeHtml(currentUser.role) + '</span>':'')}${p.hasChronic ? '<span class="tag">���Բ�</span>' : ''}<span class="tag orange">VIP</span></div></div><button class="btn btn-ghost" data-go="profile-setup">�༭</button></div><div class="row mt-20"><div class="info-pill green"><div class="fs-36 fw-600">${p.height || '178'} cm</div><div>����</div></div><div class="info-pill orange"><div class="fs-36 fw-600">${p.weight || '66'} kg</div><div>����</div></div></div></div>
            <div class="card"><div class="card-title">��������</div>
                <div class="form-row" data-go="qualifications"><span>??</span><div style="flex:1">���ʹ���</div><span>?</span></div>
                <div class="form-row" data-go="income"><span>??</span><div style="flex:1">�������</div><span>?</span></div>
            </div>
            <div class="card"><div class="card-title">�˺�</div><div class="form-row" data-go="profile-setup"><span>\uD83D\uDC68\u200D</span><div style="flex:1">��������</div><span>\u203A</span></div><div class="form-row" data-go="monitor"><span>\uD83D\uDCF3</span><div style="flex:1">�ҵ�����</div><span>\u203A</span></div><div class="form-row" data-go="coin"><span>\uD83E\uDE99</span><div style="flex:1">������</div><span>${storage.signStreak()+2} ö \u203A</span></div><div class="form-row" data-go="services"><span>\uD83D\uDCB3</span><div style="flex:1">���ѷ���</div><span>\u203A</span></div><div class="form-row" data-go="myrx"><span>\uD83D\uDCCB</span><div style="flex:1">�ҵĴ���</div><span>\u203A</span></div><div class="form-row" data-go="account"><span>\uD83D\uDD10</span><div style="flex:1">�˺Ź���</div><span>\u203A</span></div></div>
            <div class="card"><div class="card-title">����</div><div class="form-row"><span>\uD83D\uDCDA</span><div style="flex:1">�γ���ƻ�</div><span>\u203A</span></div><div class="form-row"><span>\uD83C\uDFC6</span><div style="flex:1">�ɾ�</div><span>\u203A</span></div><div class="form-row" data-go="settings"><span>\u2699\uFE0F</span><div style="flex:1">����</div><span>\u203A</span></div><div class="form-row"><span>\uD83D\uDCAC</span><div style="flex:1">�û�����</div><span>\u203A</span></div><div class="form-row" onclick="window.customerService()"><span>\uD83C\uDFDE\uFE0F</span><div style="flex:1">��ϵ�ͷ�</div><span>\u203A</span></div><div class="form-row"><span>\uD83D\uDEE1\uFE0F</span><div style="flex:1">��˽����</div><span>\u203A</span></div></div>
            <div class="card"><div class="form-row" id="logout-btn" style="border-bottom:none;justify-content:center;"><span>\uD83D\uDEAA</span><div style="flex:1;text-align:center;color:var(--red);font-size:16px;">�˳���¼</div><span></span></div></div>
        </div>`;
    app.querySelectorAll('[data-go]').forEach(el => el.onclick = () => navigate(el.dataset.go));
    app.querySelector('#logout-btn').onclick = logout;
};



// ���� ���ʹ���ҳ�� ����
PAGES.qualifications = (app) => {
    setNavTitle('���ʹ���');
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">���ʹ���</div><div class="header-subtitle">�ϴ�רҵ�����ļ�����˺�ɿ���</div></div></div>
            <div class="card"><div class="card-title">�ϴ�����</div>
                <div class="form-group"><label>��������</label>
                    <select id="qual-type" class="form-input">
                        <option value="doctor_cert">ִҵҽʦ֤</option>
                        <option value="nutritionist_cert">Ӫ��ʦ�ʸ�֤</option>
                        <option value="title_cert">ְ��֤��</option>
                    </select>
                </div>
                <div class="form-group"><label>ѡ���ļ���ͼƬ��</label>
                    <input type="file" id="qual-file" accept="image/*" style="padding:8px;border:1px solid #ddd;border-radius:8px;width:100%;" />
                </div>
                <div id="qual-preview" style="display:none;margin-bottom:8px;"></div>
                <button class="btn btn-primary btn-block" id="qual-upload-btn">�ϴ�����</button>
                <div id="qual-upload-result"></div>
            </div>
            <div class="card"><div class="card-title">�ҵ�����</div><div id="qual-list"><div class="text-muted" style="text-align:center;padding:12px;">������...</div></div></div>
        </div>`;
    
    loadQualList();
    
    document.getElementById('qual-file').onchange = function() {
        var file = this.files[0];
        if(!file) return;
        var reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('qual-preview').style.display = 'block';
            document.getElementById('qual-preview').innerHTML = '<img src="'+e.target.result+'" style="max-width:100%;max-height:200px;border-radius:8px;" />';
        };
        reader.readAsDataURL(file);
    };
    
    document.getElementById('qual-upload-btn').onclick = async function() {
        var type = document.getElementById('qual-type').value;
        var labels = { doctor_cert:'ִҵҽʦ֤', nutritionist_cert:'Ӫ��ʦ�ʸ�֤', title_cert:'ְ��֤��' };
        var input = document.getElementById('qual-file');
        if(!input.files[0]){ toast('��ѡ���ļ�'); return; }
        if(!currentUser){ toast('���ȵ�¼'); return; }
        var reader = new FileReader();
        reader.onload = async function(e) {
            try {
                var res = await fetch(API_BASE+'/api/qualification/upload', {
                    method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentUser.token},
                    body:JSON.stringify({ type, typeLabel:labels[type], fileName:input.files[0].name, fileData:e.target.result })
                });
                var d = await res.json();
                if(d.ok){ toast('�ϴ��ɹ�'); loadQualList(); }else toast(d.error||'�ϴ�ʧ��');
            } catch(e2){ toast('�������'); }
        };
        reader.readAsDataURL(input.files[0]);
    };
};

async function loadQualList() {
    if(!currentUser){ document.getElementById('qual-list').innerHTML = '<div class="text-muted" style="text-align:center;padding:12px;">���ȵ�¼</div>'; return; }
    try {
        var res = await fetch(API_BASE+'/api/qualification/my',{headers:{Authorization:'Bearer '+currentUser.token}});
        var d = await res.json();
        if(d.data && d.data.length){
            document.getElementById('qual-list').innerHTML = d.data.map(function(q){
                var badge = q.status==='approved' ? '<span style="color:green;">\u2705 ��ͨ��</span>' :
                    q.status==='rejected' ? '<span style="color:red;">\u274C δͨ��'+(q.reviewNote?' - '+escapeHtml(q.reviewNote):'')+'</span>' :
                    '<span style="color:orange;">\u23F3 �����</span>';
                return '<div style="border-bottom:1px solid #f0f0f0;padding:8px 0;"><div style="display:flex;align-items:center;gap:8px;"><span>\uD83D\uDCC4</span><div style="flex:1;"><div>'+escapeHtml(q.typeLabel)+'</div><div style="font-size:12px;color:var(--gray);">'+escapeHtml(q.fileName)+'</div></div>'+badge+'</div>'+
                    (q.fileData ? '<div style="margin-top:4px;"><img src="'+q.fileData+'" style="max-width:100%;max-height:150px;border-radius:6px;" /></div>' : '')+'</div>';
            }).join('');
        } else {
            document.getElementById('qual-list').innerHTML = '<div class="text-muted" style="text-align:center;padding:12px;">�������ʼ�¼</div>';
        }
    } catch(e){ document.getElementById('qual-list').innerHTML = '<div class="text-muted" style="text-align:center;padding:12px;color:var(--red);">����ʧ��</div>'; }
}


// ���� �������ҳ�� ����
PAGES.income = (app) => {
    setNavTitle('�������');
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">�������</div><div class="header-subtitle">�鿴���롢���ֽ�����</div></div></div>
            <div class="card" id="income-summary"><div class="card-title">�������</div><div style="text-align:center;padding:16px;"><div class="text-muted">������...</div></div></div>
            <div class="card"><div class="card-title">����</div>
                <div class="form-group"><label>���ַ�ʽ</label>
                    <select id="wd-method" class="form-input">
                        <option value="wechat">΢��</option>
                        <option value="alipay">֧����</option>
                    </select>
                </div>
                <div class="form-group"><label>�տ��˺�</label><input id="wd-account" class="form-input" placeholder="�������տ��˺�" /></div>
                <div class="form-group"><label>���ֽ������ң�</label><input id="wd-amount" class="form-input" type="number" min="10" placeholder="���10������" /></div>
                <button class="btn btn-primary btn-block" id="wd-btn">����</button>
                <div id="wd-result"></div>
            </div>
            <div class="card"><div class="card-title">���ּ�¼</div><div id="wd-history"><div class="text-muted" style="text-align:center;padding:12px;">������...</div></div></div>
        </div>`;
    loadIncome();
    loadWithdrawals();
    
    document.getElementById('wd-btn').onclick = async function() {
        var amount = parseInt(document.getElementById('wd-amount').value);
        var method = document.getElementById('wd-method').value;
        var account = document.getElementById('wd-account').value.trim();
        if(!amount || amount < 10){ toast('��������Ч�����10�����ң�'); return; }
        if(!account){ toast('�������տ��˺�'); return; }
        if(!currentUser){ toast('���ȵ�¼'); return; }
        try {
            var res = await fetch(API_BASE+'/api/doctor/withdraw', {
                method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentUser.token},
                body:JSON.stringify({amount,method,account})
            });
            var d = await res.json();
            if(d.ok){ toast('���ֳɹ���'+d.amount+' ��������ת��'+(d.method==='wechat'?'΢��':'֧����')); loadIncome(); loadWithdrawals(); document.getElementById('wd-amount').value=''; document.getElementById('wd-account').value=''; }
            else toast(d.error||'����ʧ��');
        } catch(e){ toast('�������'); }
    };
};

async function loadIncome() {
    if(!currentUser){ return; }
    try {
        var res = await fetch(API_BASE+'/api/doctor/income',{headers:{Authorization:'Bearer '+currentUser.token}});
        var d = await res.json();
        document.getElementById('income-summary').innerHTML = `
            <div class="card-title">�������</div>
            <div style="display:flex;justify-content:space-around;padding:16px;text-align:center;">
                <div><div style="font-size:28px;font-weight:700;color:var(--orange);">${d.totalIncome||0}</div><div class="text-muted" style="font-size:13px;">�ۼ�����</div></div>
                <div><div style="font-size:28px;font-weight:700;color:var(--green);">${d.coins||0}</div><div class="text-muted" style="font-size:13px;">�������</div></div>
                <div><div style="font-size:28px;font-weight:700;color:var(--gray);">${d.withdrawn||0}</div><div class="text-muted" style="font-size:13px;">������</div></div>
            </div>`;
    } catch(e){}
}

async function loadWithdrawals() {
    if(!currentUser){ return; }
    try {
        var res = await fetch(API_BASE+'/api/doctor/withdrawals',{headers:{Authorization:'Bearer '+currentUser.token}});
        var d = await res.json();
        var container = document.getElementById('wd-history');
        if(d.data && d.data.length){
            container.innerHTML = d.data.map(function(w){
                var badge = w.status==='approved' ? '<span style="color:green;">\u2705 �ѵ���</span>' :
                    w.status==='rejected' ? '<span style="color:red;">\u274C �Ѿܾ�</span>' : '<span style="color:orange;">\u23F3 �����</span>';
                var methodLabel = w.method==='wechat' ? '΢��' : '֧����';
                return '<div class="form-row" style="flex-wrap:wrap;"><span>\uD83D\uDCB0</span><div style="flex:1;"><div>'+methodLabel+' - \u00a5'+w.amount+'</div><div style="font-size:12px;color:var(--gray);">'+(w.createdAt?new Date(w.createdAt).toLocaleString('zh-CN'):'')+'</div></div>'+badge+'</div>';
            }).join('');
        } else {
            container.innerHTML = '<div class="text-muted" style="text-align:center;padding:12px;">�������ּ�¼</div>';
        }
    } catch(e){}
}


// ���� ���ܴ�������ҳ�� ����
PAGES['ai-prescription'] = (app) => {
    setNavTitle('���ܴ�������');
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">���ܴ�������</div><div class="header-subtitle">���뻼���ֻ��ţ�AI�Զ������˶�����</div></div></div>
            <div class="card"><div class="card-title">ѡ����</div>
                <div class="form-row"><input id="ai-patient-input" class="form-input" placeholder="���뻼���ֻ���" style="flex:1;" /><button class="btn btn-primary" id="ai-search-btn" style="padding:6px 12px;">����</button></div>
                <div id="ai-patient-info"></div>
            </div>
            <div id="ai-form" style="display:none;">
                <div class="card"><div class="card-title">��������</div><div id="ai-health-summary"></div></div>
                <button class="btn btn-primary btn-block" id="ai-generate-btn">?? �������ɴ���</button>
                <div id="ai-result" class="card" style="display:none;"><div class="card-title">���ɵĴ���</div><div id="ai-prescription-content"></div>
                <button class="btn btn-primary btn-block" id="ai-send-btn" style="margin-top:8px;">?? ���ʹ���������</button></div>
            </div>
        </div>`;
    
    var currentPatientPhone = '';
    
    app.querySelector('#ai-search-btn').onclick = function(){
        var phone = app.querySelector('#ai-patient-input').value.trim();
        if(!phone){ toast('�������ֻ���'); return; }
        if(!currentUser){ toast('���ȵ�¼'); return; }
        app.querySelector('#ai-patient-info').innerHTML = '<div class="text-muted" style="text-align:center;padding:8px;">������...</div>';
        fetch(API_BASE+'/api/doctor/patient-data?phone='+encodeURIComponent(phone),{headers:{Authorization:'Bearer '+currentUser.token}})
            .then(function(r){return r.json();})
            .then(function(d){
                if(d.patient){
                    currentPatientPhone = d.patient.phone;
                    var records = d.dailyRecords || {};
                    var today = new Date().toISOString().slice(0,10);
                    var h = records[today] || {};
                    app.querySelector('#ai-patient-info').innerHTML = '<div class="form-row" style="border:1px solid var(--orange-light);border-radius:8px;padding:10px;margin-top:8px;"><div class="avatar orange">??</div><div style="flex:1;"><div style="font-weight:600;font-size:16px;">'+escapeHtml(d.patient.name||'δ����')+'</div><div style="font-size:13px;color:var(--gray);">'+escapeHtml(phone)+'</div></div></div>';
                    app.querySelector('#ai-form').style.display = 'block';
                    app.querySelector('#ai-health-summary').innerHTML = `
                        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
                            <div class="info-pill green"><div class="fs-28 fw-600">${h.heartRate||'--'}</div><div style="font-size:12px;">����</div></div>
                            <div class="info-pill orange"><div class="fs-28 fw-600">${h.bloodPressure||'--'}</div><div style="font-size:12px;">Ѫѹ</div></div>
                            <div class="info-pill purple"><div class="fs-28 fw-600">${h.bloodOxygen||'--'}</div><div style="font-size:12px;">Ѫ��</div></div>
                            <div class="info-pill blue"><div class="fs-28 fw-600">${h.bloodSugar||'--'}</div><div style="font-size:12px;">Ѫ��</div></div>
                        </div>
                        <div style="font-size:13px;color:var(--gray);">���Ͻ����������Ի��߽����ϴ���¼</div>`;
                } else {
                    app.querySelector('#ai-patient-info').innerHTML = '<div class="text-muted" style="text-align:center;padding:8px;color:var(--red);">δ�ҵ����û�</div>';
                }
            })
            .catch(function(){ app.querySelector('#ai-patient-info').innerHTML = '<div class="text-muted" style="text-align:center;padding:8px;color:var(--red);">����ʧ��</div>'; });
    };
    
    app.querySelector('#ai-generate-btn').onclick = async function(){
        if(!currentPatientPhone){ toast('������������'); return; }
        if(!currentUser){ toast('���ȵ�¼'); return; }
        app.querySelector('#ai-generate-btn').textContent = '? ������...';
        app.querySelector('#ai-generate-btn').disabled = true;
        try {
            var res = await fetch(API_BASE+'/api/doctor/generate-prescription', {
                method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentUser.token},
                body:JSON.stringify({patientPhone:currentPatientPhone})
            });
            var d = await res.json();
            if(d.ok && d.prescription){
                var rx = d.prescription;
                var itemsHtml = (rx.items||[]).map(function(i){ return '<div class="prescription-box" style="border-color:var(--orange);background:var(--orange-light);margin-bottom:6px;"><div style="font-weight:600;">'+escapeHtml(i.icon)+' '+escapeHtml(i.name)+'</div><div style="font-size:14px;color:var(--gray);">'+escapeHtml(i.detail)+'</div></div>'; }).join('');
                app.querySelector('#ai-prescription-content').innerHTML = `
                    <div style="margin-bottom:8px;"><span class="badge" style="color:${rx.healthLevel==='����'?'green':rx.healthLevel==='һ��'?'orange':'red'};">�����ȼ�: ${rx.healthLevel} (${rx.healthScore}��)</span></div>
                    <div style="margin-bottom:8px;"><strong>��������:</strong> �� ${rx.maxHeartRate} ��/��</div>
                    <div style="margin-bottom:8px;"><strong>Ƶ��:</strong> ${rx.frequency} | <strong>ʱ��:</strong> ${rx.duration}</div>
                    <div style="margin-bottom:8px;"><strong>ǿ��:</strong> ${rx.intensity}</div>
                    <hr style="border:none;border-top:1px solid #f0f0f0;margin:8px 0;">
                    ${itemsHtml}
                    <hr style="border:none;border-top:1px solid #f0f0f0;margin:8px 0;">
                    <div style="margin-bottom:8px;"><strong>ע������:</strong> ${escapeHtml(rx.cautions)}</div>
                    <div><strong>Ӫ������:</strong> ${escapeHtml(rx.dietAdvice)}</div>`;
                app.querySelector('#ai-result').style.display = 'block';
                toast('�������ɳɹ�');
            } else {
                toast(d.error||'����ʧ��');
            }
        } catch(e){ toast('�������'); }
        app.querySelector('#ai-generate-btn').textContent = '?? �������ɴ���';
        app.querySelector('#ai-generate-btn').disabled = false;
    };
    
    app.querySelector('#ai-send-btn').onclick = async function(){
        if(!currentPatientPhone || !currentUser){ toast('�����������������'); return; }
        var rxContent = app.querySelector('#ai-prescription-content').innerHTML;
        var items = [];
        app.querySelectorAll('#ai-prescription-content .prescription-box').forEach(function(el){
            var parts = el.querySelectorAll('div');
            if(parts.length >= 2){
                items.push({name: parts[0].textContent.replace(/[???????????????]/g,'').trim(), detail: parts[1].textContent.trim()});
            }
        });
        app.querySelector('#ai-send-btn').textContent = '? ������...';
        try {
            var res = await fetch(API_BASE+'/api/doctor/send-prescription', {
                method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentUser.token},
                body:JSON.stringify({patientPhone:currentPatientPhone, prescription:{items:items, doctor:'��������', date:new Date().toISOString().slice(0,10)}, doctorNotes:'���ܴ�������'})
            });
            var d = await res.json();
            if(d.ok){ toast('�����ѷ��͵�����'); } else toast(d.error||'����ʧ��');
        } catch(e){ toast('�������'); }
        app.querySelector('#ai-send-btn').textContent = '?? ���ʹ���������';
    };
}


// ���� ��������ͳ�� ����
function loadTodayStats(app) {
    if(!currentUser){ return; }
    fetch(API_BASE+'/api/doctor/today-stats', {headers:{Authorization:'Bearer '+currentUser.token}})
        .then(function(r){return r.json();})
        .then(function(d){
            if(d && d.ok){
                var el = document.getElementById('work-stat');
                if(el) el.innerHTML = '<div style="display:flex;justify-content:space-around;padding:8px;text-align:center;">' +
                    '<div><div style="font-size:28px;font-weight:700;color:var(--orange);">'+d.prescriptionsToday+'</div><div class="text-muted" style="font-size:13px;">���տ���</div></div>' +
                    '<div><div style="font-size:28px;font-weight:700;color:var(--green);">'+d.chatPatientsToday+'</div><div class="text-muted" style="font-size:13px;">��ѯ����</div></div>' +
                    '</div>';
            }
        });
}


// ���� ���Ƶ���ҳ�� ����
PAGES['patient-records'] = (app) => {
    setNavTitle('���Ƶ���');
    app.innerHTML = `
        <div class="container">
            <div class="header"><div class="header-logo"><img src="images/logo.png" onerror="..."></div><div class="header-brand"><div class="header-title">���Ƶ���</div><div class="header-subtitle">�鿴���ߵ������������Ƽ�¼</div></div></div>
            <div class="card"><div class="card-title">ѡ����</div>
                <div class="form-row"><input id="rec-phone" class="form-input" placeholder="���뻼���ֻ���" style="flex:1;" /><button class="btn btn-primary" id="rec-search-btn" style="padding:6px 12px;">����</button></div>
            </div>
            <div id="rec-content"></div>
        </div>`;
    
    app.querySelector('#rec-search-btn').onclick = function(){
        var phone = app.querySelector('#rec-phone').value.trim();
        if(!phone){ toast('�������ֻ���'); return; }
        if(!currentUser){ toast('���ȵ�¼'); return; }
        loadPatientRecords(app, phone);
    };
    
    // Enter key support
    app.querySelector('#rec-phone').onkeypress = function(e){
        if(e.key==='Enter') app.querySelector('#rec-search-btn').click();
    };
};

async function loadPatientRecords(app, phone) {
    var content = app.querySelector('#rec-content');
    content.innerHTML = '<div class="text-muted" style="text-align:center;padding:16px;">������...</div>';
    try {
        var res = await fetch(API_BASE+'/api/doctor/patient-records/'+encodeURIComponent(phone), {headers:{Authorization:'Bearer '+currentUser.token}});
        var d = await res.json();
        if(d.data && d.data.length){
            var html = '<div class="card" style="margin-bottom:8px;background:var(--orange-light);"><div style="text-align:center;padding:8px;"><strong>?? �� '+d.data.length+' �����Ƽ�¼</strong></div></div>';
            d.data.forEach(function(r){
                var rx = r.prescription || {};
                var itemsHtml = '';
                if(rx.items && rx.items.length){
                    itemsHtml = rx.items.map(function(i){ return '<div style="font-size:14px;margin:4px 0;">'+(i.icon||'')+' <strong>'+(i.name||'')+'</strong> - '+(i.detail||'')+'</div>'; }).join('');
                }
                var goalHtml = rx.goal ? '<div style="font-size:14px;margin:4px 0;"><strong>�˶�Ŀ��:</strong> '+escapeHtml(rx.goal)+'</div>' : '';
                var dietHtml = rx.dietAdvice ? '<div style="margin-top:6px;padding:6px;background:#fff8f0;border-radius:6px;font-size:13px;"><strong>Ӫ������:</strong> '+escapeHtml(rx.dietAdvice)+'</div>' : '';
                html += '<div class="card" style="margin-bottom:8px;"><div class="row" style="border-bottom:1px solid #f0f0f0;padding-bottom:8px;margin-bottom:8px;"><div><div style="font-weight:600;font-size:15px;">'+(r.savedAt?new Date(r.savedAt).toLocaleString('zh-CN'):'δ֪ʱ��')+'</div><div style="font-size:12px;color:var(--gray);">�� '+(r.doctorName||'ҽʦ')+' ����</div></div></div>'+goalHtml+itemsHtml+dietHtml+(r.doctorNotes?'<div style="margin-top:6px;padding:6px;background:var(--orange-light);border-radius:6px;font-size:13px;"><strong>ҽʦ��ע:</strong> '+escapeHtml(r.doctorNotes)+'</div>':'')+'</div>';
            });
            content.innerHTML = html;
        } else {
            content.innerHTML = '<div class="card" style="text-align:center;padding:20px;"><div style="font-size:48px;margin-bottom:12px;">??</div><div class="text-muted">�û����������Ƽ�¼</div></div>';
        }
    } catch(e){
        content.innerHTML = '<div class="text-muted" style="text-align:center;padding:16px;color:var(--red);">����ʧ��</div>';
    }
}
// ========== ��ʼ�� ==========

// ���� ���ѷ���ҳ�� ����
PAGES.services = (app) => {
  setNavTitle("���ѷ���");
  app.innerHTML = '<div class="container"><div class="card"><div class="card-title">�ҵĽ�����</div><div id="coin-balance" style="font-size:24px;font-weight:700;color:var(--orange);">�� 0 ö</div><div style="margin-top:8px;"><button class="btn btn-primary btn-block" onclick="navigate(\'coin\')">��ֵ������</button></div></div><div class="card"><div class="card-title">ѡ�����</div><div id="svc-list"></div></div><div class="card"><div class="card-title">�ҵ��ѹ�����</div><div id="my-services"></div></div></div>';
  // Load coin balance from server
  if(currentUser){
    fetch(API_BASE+"/api/coins",{headers:{Authorization:"Bearer "+currentUser.token}}).then(function(r){return r.json();}).then(function(d){
      document.getElementById("coin-balance").innerHTML = "\u00a5 " + (d.coins||0) + " ö";
    });
  }
  // Load services list
  fetch(API_BASE+"/api/services").then(function(r){return r.json();}).then(function(d){
    if(d.data&&d.data.length){
      var html = d.data.map(function(s){
        return '<div class="prescription-box" style="margin-bottom:10px;border-color:var(--orange);background:var(--orange-light);color:var(--text);"><div style="display:flex;justify-content:space-between;align-items:center;"><div><strong>'+escapeHtml(s.name)+'</strong><br><span style="font-size:14px;">\u00a5 '+s.price+' ������</span><br><span style="font-size:13px;color:var(--gray);">'+escapeHtml(s.description||"")+'</span><br><span style="font-size:12px;color:var(--gray);">�Ѳ��� '+(s.enrolled||0)+' / '+s.maxParticipants+' ��</span></div><button class="btn btn-primary" style="font-size:14px;padding:8px 16px;" onclick=\'purchaseService("'+s.id+'")\'>��������</button></div></div>';
      }).join("");
      document.getElementById("svc-list").innerHTML = html;
    } else {
      document.getElementById("svc-list").innerHTML = '<div class="text-muted" style="text-align:center;padding:10px;">��</div>';
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
        document.getElementById("my-services").innerHTML = '<div class="text-muted" style="text-align:center;padding:10px;">��</div>';
      }
    });
  }
};

window.purchaseService = async function(id) {
  if(!currentUser){toast("���ȵ�¼");return;}
  var res = await fetch(API_BASE+"/api/service/purchase",{
    method:"POST", headers:{"Content-Type":"application/json",Authorization:"Bearer "+currentUser.token},
    body:JSON.stringify({serviceId:id})
  });
  var data = await res.json();
  if(data.ok){toast("����ɹ� \u2705");navigate("services");}else{toast(data.error||"����ʧ��");}
};

// ���� �ҵ��˶�����ҳ�� ����
PAGES.myrx = (app) => {
  setNavTitle("�ҵ��˶�����");
  app.innerHTML = '<div class="container"><div id="rx-content"><div class="chart-placeholder">������...</div></div></div>';
  if(!currentUser){document.getElementById("rx-content").innerHTML='<div class="text-muted" style="padding:20px;">���ȵ�¼</div>';return;}
  fetch(API_BASE+"/api/my-prescription",{headers:{Authorization:"Bearer "+currentUser.token}}).then(function(r){return r.json();}).then(function(d){
    var rx = d.data;
    if(rx&&rx.items){
      document.getElementById("rx-content").innerHTML =
        '<div class="card"><div class="card-title">�����˶�����</div>'+
        '<div class="prescription-box" style="border-color:var(--green);background:var(--green-light);color:var(--green-dark);margin-bottom:12px;">'+
        '<div><strong>�˶�Ŀ��:</strong> '+escapeHtml(rx.goal||"")+'</div>'+
        '<div><strong>ǿ��:</strong> '+escapeHtml(rx.intensity||"")+' | <strong>����:</strong> \u2264'+escapeHtml(rx.maxHeartRate||"")+'</div>'+
        '<div><strong>Ƶ��:</strong> '+escapeHtml(rx.frequency||"")+' | <strong>ʱ��:</strong> '+escapeHtml(rx.duration||"")+'</div></div>'+
        '<div class="card-title">ѵ����Ŀ</div>'+
        (rx.items||[]).map(function(i){return '<div class="prescription-box" style="border-color:var(--orange);background:var(--orange-light);color:var(--text);margin-bottom:8px;"><div style="font-size:18px;font-weight:600;">'+(i.icon||"")+' '+escapeHtml(i.name)+'</div><div style="font-size:15px;color:var(--gray);">'+escapeHtml(i.detail)+'</div></div>';}).join("")+
        (rx.cautions?'<div class="card-title">ע������</div><div class="prescription-box" style="border-color:var(--red);background:#fffafa;color:var(--red);">'+escapeHtml(rx.cautions)+'</div>':'')+
        (rx.dietAdvice?'<div class="card-title">Ӫ������</div><div class="prescription-box" style="border-color:#fce4d6;background:#fff8f0;color:#92400e;">'+escapeHtml(rx.dietAdvice)+'</div>':'')+
        '</div>';
    } else {
      document.getElementById("rx-content").innerHTML = '<div class="text-muted" style="padding:20px;">���޴���������ϵ����Ա�򽡿�ʦ</div>';
    }
  });
};

// ���� �˺Ź�������ע���� ����

// ���� ���ã���ע���˻�������
PAGES.settings = (app) => {
  setNavTitle("����");
  app.innerHTML = '<div class="container"><div class="card"><div class="card-title">�˻���Ϣ</div>'+
    '<div style="font-size:16px;margin-bottom:4px;">�ֻ���: <strong>'+(currentUser?escapeHtml(currentUser.phone):"")+'</strong></div>'+
    '<div style="font-size:16px;margin-bottom:16px;">����: <strong>'+(currentUser?escapeHtml(currentUser.role||"�����û�"):"")+'</strong></div></div>'+
    '<div class="card"><div class="card-title" style="color:var(--red);">Σ�ղ���</div>'+
    '<button class="btn btn-danger btn-block" id="delete-account-btn">\uD83D\DDD1\uFE0F ע���˻�</button>'+
    '<div style="font-size:12px;color:var(--gray);margin-top:8px;text-align:center;">ע������ֻ��ſ�����ע�ᣬ���������ݽ�������ɾ��</div></div></div>';
  document.getElementById("delete-account-btn").onclick = async function(){
    if(!currentUser){toast("���ȵ�¼");return;}
    var result = await modal({title:"ȷ��ע��",content:"ȷ��Ҫע���˻���\n�ֻ��� '+escapeHtml(currentUser.phone)+' �����ͷ�\n�������ݽ�������ɾ����",confirmText:"ȷ��ע��",confirmColor:"#e8504a"});
    if(result.confirm){
      try {
        var res = await fetch(API_BASE+"/api/account/delete",{method:"POST",headers:{Authorization:"Bearer "+currentUser.token}});
        var data = await res.json();
        if(data.ok){toast("�˻���ע�����ֻ��ſ�����ע�� \u2705");logout();}else{toast(data.error||"ע��ʧ��");}
      } catch(e){toast("�������");}
    }
  };
};

PAGES.account = (app) => {
  setNavTitle("�˺Ź���");
  app.innerHTML = '<div class="container"><div class="card"><div class="card-title">�ҵ�����</div>'+
    '<div style="font-size:18px;margin-bottom:8px;">��ǰ����: <strong>'+(currentUser?escapeHtml(currentUser.role||"�����û�"):"")+'</strong></div>'+
    '<div style="font-size:13px;color:var(--gray);margin-bottom:16px;">ÿ���ֻ���ֻ�ܰ�һ�����ݣ����������ע���˻�</div></div>'+
    '<div class="card"><div class="card-title" style="color:var(--red);">Σ�ղ���</div>'+
    '<button class="btn btn-danger btn-block" id="delete-account-btn">ע���˻�</button>'+
    '<div style="font-size:12px;color:var(--gray);margin-top:8px;text-align:center;">ע�����˻����ݽ�������ɾ�����Ҳ��ɻָ�</div></div></div>';
  document.getElementById("delete-account-btn").onclick = async function(){
    if(!currentUser){toast("���ȵ�¼");return;}
    var result = await modal({title:"ȷ��ע��",content:"ȷ��Ҫע���˻���\n�������ݽ�������ɾ����",confirmText:"ȷ��ע��",confirmColor:"#e8504a"});
    if(result.confirm){
      try {
        var res = await fetch(API_BASE+"/api/account/delete",{method:"POST",headers:{Authorization:"Bearer "+currentUser.token}});
        var data = await res.json();
        if(data.ok){toast("�˻���ע��");logout();}else{toast(data.error||"ע��ʧ��");}
      } catch(e){toast("�������");}
    }
  };
};

// ���� �����ҳ�ֵҳ�棨΢��/֧����������
PAGES.recharge = (app) => {
  setNavTitle("��ֵ����");
  app.innerHTML = '<div class="container"><div class="card"><div class="card-title">ѡ���ֵ���</div>'+
    '<div class="grid-2">'+
    '<div class="feature-tile orange" onclick="selectRecharge(10)"><div class="fi">10</div><div class="fn">10 ö</div></div>'+
    '<div class="feature-tile green" onclick="selectRecharge(30)"><div class="fi">30</div><div class="fn">30 ö</div></div>'+
    '<div class="feature-tile orange" onclick="selectRecharge(50)"><div class="fi">50</div><div class="fn">50 ö</div></div>'+
    '<div class="feature-tile green" onclick="selectRecharge(100)"><div class="fi">100</div><div class="fn">100 ö</div></div>'+
    '</div>'+
    '<div style="margin-top:12px;text-align:center;font-size:16px;">ѡ����: <strong id="selected-amount">50</strong> ö</div>'+
    '<div class="card"><div class="card-title">ѡ��֧����ʽ</div>'+
    '<div class="form-row" onclick="doRecharge(\'΢��\')"><span style="font-size:24px;">\uD83D\uDCB1</span><div style="flex:1;font-size:16px;">΢��֧��</div><span>\u203A</span></div>'+
    '<div class="form-row" onclick="doRecharge(\'֧����\')"><span style="font-size:24px;">\uD83D\uDCB0</span><div style="flex:1;font-size:16px;">֧����</div><span>\u203A</span></div>'+
    '</div><div id="recharge-result" style="margin-top:8px;text-align:center;"></div></div>';
  selectRecharge(50);
};

function selectRecharge(amount) {
  document.getElementById("selected-amount").textContent = amount;
  window._rechargeAmount = amount;
}

async function doRecharge(method) {
  if(!currentUser){toast("���ȵ�¼");return;}
  var amount = window._rechargeAmount || 50;
  document.getElementById("recharge-result").innerHTML = '<div class="chart-placeholder">\uD83D\uDD04 ���ڴ���'+method+'֧��...</div>';
  try {
    var res = await fetch(API_BASE+"/api/coins/recharge",{
      method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+currentUser.token},
      body:JSON.stringify({amount:amount,method:method})
    });
    var data = await res.json();
    if(data.ok){toast(method+"��ֵ�ɹ� \u2705");navigate("services");}else{toast(data.error||"��ֵʧ��");}
  } catch(e){toast("�������");}
}


async function searchFriend() {
  var input = document.getElementById('friend-search-input');
  var resultDiv = document.getElementById('search-result');
  if(!input||!resultDiv) return;
  var phone = input.value.trim();
  if(!phone) { toast('�������ֻ���'); return; }
  if(!currentUser){toast('���ȵ�¼');return;}
  resultDiv.innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;">������...</div>';
  try {
    var res = await fetch(API_BASE + '/api/user/search?phone=' + encodeURIComponent(phone), {
      headers: { Authorization: 'Bearer ' + currentUser.token }
    });
    var data = await res.json();
    if(data.user) {
      var u = data.user;
      var roleLabel = u.role || '��ͨ�û�';
      if(roleLabel === '�����û�') roleLabel = '������û�';
      else if(roleLabel === '��ŮȺ��') roleLabel = '��Ů���û�';
      else if(roleLabel === 'ҽ����Ӫ��ʦ') roleLabel = 'Ӫ��ʦ���û�';
      var nickname = '';
      try { 
        var pp = typeof u.data && u.data.profile && typeof u.data.profile === 'string' ? JSON.parse(u.data.profile) : (typeof u.data === 'object' && u.data ? u.data.profile || {} : {}); 
        nickname = pp.name || ''; 
      } catch(e) {}
      resultDiv.innerHTML = '<div class="list-item" style="cursor:default;"><div class="avatar">??</div><div class="list-content"><div class="list-name">' + (nickname ? escapeHtml(nickname) + ' (' + escapeHtml(phone) + ')' : escapeHtml(phone)) + '</div><div class="list-desc" style="font-size:12px;color:var(--gray);">' + roleLabel + '</div></div><button class="btn btn-primary" id="add-friend-btn" style="padding:4px 10px;font-size:13px;">���Ӻ���</button></div>';
      document.getElementById('add-friend-btn').onclick = async function() {
        if(!currentUser){toast('���ȵ�¼');return;}
        try {
          var r = await fetch(API_BASE + '/api/friend/request', {
            method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + currentUser.token},
            body:JSON.stringify({toPhone: phone})
          });
          var d = await r.json();
          if(d.ok) { toast('���������ѷ���'); resultDiv.innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;color:var(--green);">���������ѷ���</div>'; }
          else toast(d.error || '����ʧ��');
        } catch(e) { document.getElementById('back-to-em').onclick = function() { navigate('emergency'); };
        toast('�������'); }
      };
    } else {
      resultDiv.innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;">δ�ҵ����û�</div>';
    }
  } catch(e) {
    resultDiv.innerHTML = '<div class="text-muted" style="padding:8px;text-align:center;">�������</div>';
    document.getElementById('back-to-em').onclick = function() { navigate('emergency'); };
        toast('�������');
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
            // ����ͬ��������Ӱ���¼״̬
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

// ��ϵ�ͷ�
window.customerService = function() {
  var d = document.createElement("div");
  d.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;";
  d.innerHTML = '<div style="background:#fff;border-radius:16px;padding:30px 24px;width:85%;max-width:300px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.2);">' +
    '<div style="font-size:48px;margin-bottom:12px;">??</div>' +
    '<div style="font-size:17px;font-weight:600;margin-bottom:12px;">��ϵ�ͷ�</div>' +
    '<div style="font-size:15px;color:#666;line-height:1.7;margin-bottom:20px;">����΢�Ź��ںţ�������ֱ�ӷ���Ϣ���ͷ�</div>' +
    '<button onclick="this.parentNode.parentNode.remove()" style="background:#ff6b35;color:#fff;border:none;padding:10px 40px;border-radius:24px;font-size:16px;cursor:pointer;">��֪����</button>' +
  '</div>';
  document.body.appendChild(d);
// Friend request actions
function acceptFriend(phone){
  if(!currentUser){toast('���ȵ�¼');return;}
  fetch(API_BASE+'/api/friend/accept',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+currentUser.token},body:JSON.stringify({fromPhone:phone})})
    .then(function(r){return r.json();}).then(function(d){if(d.ok){toast('�ѽ���');render();}else toast(d.error||'����ʧ��');});
}
function rejectFriend(phone){
  if(!currentUser){toast('���ȵ�¼');return;}
  fetch(API_BASE+'/api/friend/reject',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+currentUser.token},body:JSON.stringify({fromPhone:phone})})
    .then(function(r){return r.json();}).then(function(d){if(d.ok){toast('�Ѿܾ�');render();}else toast(d.error||'����ʧ��');});
}

  d.onclick = function(e) { if(e.target===d) d.remove(); };
};

