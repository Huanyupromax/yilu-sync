const fs = require("fs");
const base = "C:/Users/Lenovo/Desktop/yilu-sync/yilu-sync";
const backup = fs.readFileSync(base + "/js/app-backup.js", "utf8");

const userFiles = ["js/elderly-app.js", "js/children-app.js", "js/doctor-app.js"];

// Functions we need to add
const featuresCode = `

// ── 紧急联系人管理 ──
PAGES.emergency = (app) => {
  setNavTitle("紧急呼叫");
  app.innerHTML = '<div class="container">' +
    '<div class="banner danger"><div class="emoji">\uD83D\uDE92</div><div><div class="t" style="font-size:20px;">一键紧急呼叫</div><div class="s">一键通知紧急联系人与120急救</div></div></div>' +
    '<div class="card" style="text-align:center;">' +
      '<button class="btn btn-danger" style="width:80%;padding:15px 20px;font-size:20px;border-radius:20px;margin-bottom:10px;" onclick="location.href=\\'tel:120\\'">\uD83D\uDE92 一键呼叫120</button>' +
      '<button class="btn btn-warning" style="width:80%;padding:15px 20px;font-size:18px;border-radius:20px;background:var(--orange);color:#fff;border:none;" onclick="callEmergencyContact()">\uD83D\uDCDE 呼叫紧急联系人</button>' +
      '<div style="margin-top:12px;font-size:14px;color:var(--gray);">120急救与紧急联系人分开呼叫</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">紧急联系人</div>' +
      '<div id="em-contacts-list"><div class="chart-placeholder">加载中...</div></div>' +
      '<button class="btn btn-secondary btn-block" onclick="navigate(\\'emergency-contacts\\')">管理紧急联系人</button>' +
    '</div>' +
  '</div>';
  loadEmergencyContacts();
};

PAGES["emergency-contacts"] = (app) => {
  setNavTitle("管理紧急联系人");
  app.innerHTML = '<div class="container">' +
    '<div class="card">' +
      '<div class="card-title">添加联系人</div>' +
      '<div class="form-row"><div class="form-label">姓名</div><input id="ec-name" class="form-input" placeholder="如：女儿、儿子" /></div>' +
      '<div class="form-row"><div class="form-label">手机号</div><input id="ec-phone" class="form-input" placeholder="11位手机号" type="tel" /></div>' +
      '<button class="btn btn-primary btn-block" onclick="addEmergencyContact()">\u2795 添加联系人</button>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">我的联系人</div>' +
      '<div id="ec-list"><div class="chart-placeholder">加载中...</div></div>' +
    '</div>' +
  '</div>';
  loadEmergencyContacts();
};
`;

const helpersCode = `
async function loadEmergencyContacts() {
  if (!currentUser) return;
  try {
    const res = await fetch(API_BASE + "/api/emergency/contacts", { headers: { Authorization: "Bearer " + currentUser.token } });
    const d = await res.json();
    const list = document.getElementById("em-contacts-list") || document.getElementById("ec-list");
    if (!list) return;
    if (!d.contacts || d.contacts.length === 0) {
      list.innerHTML = '<div class="text-muted" style="text-align:center;padding:30px;color:var(--gray);">暂无紧急联系人<br><span style="font-size:14px;">请添加紧急联系人</span></div>';
      return;
    }
    let html = "";
    d.contacts.forEach(function(c) {
      html += '<div class="form-row" style="align-items:center;">' +
        '<div style="flex:1;"><strong>' + escapeHtml(c.name || c.phone) + '</strong>' +
        '<br><span style="font-size:13px;color:var(--gray);">' + escapeHtml(c.phone) + '</span></div>' +
        '<button class="btn btn-ghost" style="font-size:13px;padding:4px 8px;border-color:var(--red);color:var(--red);" onclick="deleteEmergencyContact(\\'' + c.phone + '\\')">\uD83D\uDDD1 删除</button></div>';
    });
    list.innerHTML = html;
  } catch(e) { console.warn(e); }
}

async function addEmergencyContact() {
  if (!currentUser) { toast("请先登录"); return; }
  const name = document.getElementById("ec-name").value.trim();
  const phone = document.getElementById("ec-phone").value.trim();
  if (!name || !phone) { toast("请填写完整信息"); return; }
  try {
    const res = await fetch(API_BASE + "/api/emergency/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + currentUser.token },
      body: JSON.stringify({ name: name, phone: phone })
    });
    const d = await res.json();
    if (d.ok) { toast("添加成功"); loadEmergencyContacts(); document.getElementById("ec-name").value = ""; document.getElementById("ec-phone").value = ""; }
    else { toast(d.error || "添加失败"); }
  } catch(e) { toast("网络错误"); }
}

async function deleteEmergencyContact(phone) {
  if (!currentUser) { toast("请先登录"); return; }
  try {
    const res = await fetch(API_BASE + "/api/emergency/contacts/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + currentUser.token },
      body: JSON.stringify({ phone: phone })
    });
    const d = await res.json();
    if (d.ok) { toast("已删除"); loadEmergencyContacts(); }
    else { toast(d.error || "删除失败"); }
  } catch(e) { toast("网络错误"); }
}

async function callEmergencyContact() {
  if (!currentUser) { toast("请先登录"); return; }
  try {
    const res = await fetch(API_BASE + "/api/emergency/contacts", { headers: { Authorization: "Bearer " + currentUser.token } });
    const d = await res.json();
    const contacts = d.contacts || [];
    if (contacts.length === 0) {
      const r = await modal({ title: "提示", content: "您还没有设置紧急联系人，是否前往设置？", confirmText: "去设置", cancelText: "取消" });
      if (r && r.confirm) navigate("emergency-contacts");
      return;
    }
    location.href = "tel:" + contacts[0].phone;
  } catch(e) { toast("网络错误"); }
}

// ── 智能算法 ──
PAGES["ai-chat"] = (app) => {
  setNavTitle("智能算法");
  app.innerHTML = '<div class="chat-page">' +
    '<div class="chat-list" id="ai-chat-list">' +
      '<div class="msg other"><div class="avatar">\uD83E\uDDE0</div><div class="bubble">您好，我是智能营养算法助手。我可以根据您的健康数据提供个性化的营养和运动建议。</div></div>' +
    '</div>' +
    '<div class="chat-input-bar" style="justify-content:center;padding:10px;">' +
      '<button class="btn btn-primary btn-block" onclick="navigate(\\'data-entry\\')" style="margin-right:8px;">\uD83D\uDCCA 提供健康数据</button>' +
      '<button class="btn btn-secondary btn-block" onclick="getAdviceWithLatestData()">\uD83E\uDDE0 获取智能建议</button>' +
    '</div>' +
  '</div>';
};

async function getAdviceWithLatestData() {
  if (!currentUser) { toast("请先登录"); return; }
  const today = new Date().toISOString().split("T")[0];
  const records = storage.getDailyRecords();
  const re = records ? records[today] : null;
  if (!re) { toast("请先录入今日健康数据"); navigate("data-entry"); return; }
  const list = document.getElementById("ai-chat-list");
  if (list) {
    list.innerHTML += "<div class=\"msg me\"><div class=\"avatar\">\uD83D\uDC68</div><div class=\"bubble\">正在分析...</div></div>";
    list.scrollTop = list.scrollHeight;
    try {
      const res = await fetch(API_BASE + "/api/nutrition-advice", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + currentUser.token },
        body: JSON.stringify({
          age: re.age || "", height: re.height || "", weight: re.weight || "",
          bloodPressure: re.bp || "", heartRate: re.heartRate || "",
          bloodOxygen: re.bloodOxygen || "", bloodSugar: re.bloodSugar || ""
        })
      });
      const d = await res.json();
      if (list.lastChild && list.lastChild.textContent.includes("正在分析")) list.removeChild(list.lastChild);
      if (d.ok && d.advice) {
        var lines = d.advice.split("\\n");
        list.innerHTML += "<div class=\"msg other\"><div class=\"avatar\">\uD83E\uDDE0</div><div class=\"bubble\">" + lines.filter(l=>l.trim()).join("<br>") + "</div></div>";
      } else {
        list.innerHTML += "<div class=\"msg other\"><div class=\"avatar\">\uD83E\uDDE0</div><div class=\"bubble\">服务不可用</div></div>";
      }
    } catch(e) {
      if (list.lastChild && list.lastChild.textContent.includes("正在分析")) list.removeChild(list.lastChild);
      list.innerHTML += "<div class=\"msg other\"><div class=\"avatar\">\uD83E\uDDE0</div><div class=\"bubble\">网络错误</div></div>";
    }
    list.scrollTop = list.scrollHeight;
  }
}

// ── 好友搜索 ──
async function searchFriend() {
  const input = document.getElementById("friend-search-input");
  if (!input) return;
  const phone = input.value.trim();
  if (!phone) { toast("请输入手机号"); return; }
  try {
    const res = await fetch(API_BASE + "/api/friend/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + currentUser.token },
      body: JSON.stringify({ phone: phone })
    });
    const d = await res.json();
    const rd = document.getElementById("search-result");
    if (!rd) return;
    if (d.user) {
      const rl = { "银龄用户":"老年端", "子女群体":"子女端", "医生与营养师":"营养师端" };
      const rt = rl[d.user.role] || d.user.role || "用户";
      const nn = d.user.name || "";
      rd.innerHTML = '<div class="form-row" style="align-items:center;background:var(--orange-light);border-radius:8px;padding:8px;">' +
        '<div style="flex:1;"><strong>' + escapeHtml(phone) + '</strong>' +
        (nn ? '<br><span style="font-size:13px;color:var(--gray);">昵称: ' + escapeHtml(nn) + '</span>' : "") +
        '<br><span style="font-size:12px;color:var(--orange);">' + rt + '</span></div>' +
        '<button class="btn btn-primary" style="padding:4px 10px;font-size:13px;" onclick="addFriend(\\'' + phone + '\\')">添加好友</button></div>';
    } else {
      rd.innerHTML = '<div class="text-muted" style="text-align:center;padding:8px;">未找到该用户</div>';
    }
  } catch(e) {
    const r2 = document.getElementById("search-result");
    if (r2) r2.innerHTML = '<div class="text-muted" style="text-align:center;padding:8px;color:var(--red);">网络错误</div>';
  }
}

async function addFriend(phone) {
  if (!currentUser) { toast("请先登录"); return; }
  try {
    const res = await fetch(API_BASE + "/api/friend/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + currentUser.token },
      body: JSON.stringify({ toPhone: phone })
    });
    const d = await res.json();
    if (d.ok) { toast("好友请求已发送"); }
    else { toast(d.error || "发送失败"); }
  } catch(e) { toast("网络错误"); }
}
`;

for (const f of userFiles) {
  let code = backup;
  
  // 1. Login/Register fix
  code = code.replace(
    "localStorage.setItem('user', JSON.stringify(currentUser));\n    await pullFromCloud();",
    "localStorage.setItem('user', JSON.stringify(currentUser));\n    localStorage.removeItem('profile');\n    localStorage.removeItem('dailyRecords');\n    await pullFromCloud();"
  );
  
  // 2. Logout fix
  code = code.replace(
    "localStorage.removeItem('user');\n    navigate('login');",
    "localStorage.removeItem('user');\n    var accs=JSON.parse(localStorage.getItem('accounts')||'[]');\n    accs.forEach(function(a){a.active=false;});\n    localStorage.setItem('accounts',JSON.stringify(accs));\n    navigate('login');"
  );
  
  // 3. Fix "教练" in home page emergency tile
  code = code.replace("同时通知教练、子女与 120 急救", "一键通知紧急联系人与120急救");
  
  // 4. Remove default contacts from getContacts
  code = code.replace(
    "return [\n        { name: '\u5973\u513f', avatar: '\uD83D\uDC69', bg: 'orange', time: '\u521a\u521a', phone: '13800001234' },\n        { name: '\u513f\u5b50', avatar: '\uD83D\uDC68', bg: '', time: '10:25', phone: '13900005678' },\n        { name: '\u8001\u674e', avatar: '\uD83D\uDC74', bg: 'orange', time: '\u6628\u5929', phone: '13800000001' },\n        { name: '\u738b\u6559\u7ec3', avatar: '\uD83E\uDDD1\u200D\uD83C\uDFEB', bg: '', time: '\u6628\u5929', phone: '13800000002' },\n        { name: '\u9ed1\u77f3\u7901\u793e\u533a', avatar: '\uD83C\uDFD8', bg: '', time: '2 \u5929\u524d', phone: '' }\n    ];",
    "return [];"
  );
  
  // 5. Add friend search + AI button in messages page
  code = code.replace(
    '<div class="banner orange" id="group-list-btn">',
    '<div class="card" style="margin-bottom:8px;"><div class="form-row" style="border:none;"><span>\uD83D\uDD0D</span><input id="friend-search-input" class="form-input" placeholder="输入手机号搜索好友" style="flex:1;" /><button class="btn btn-primary" id="search-friend-btn" style="padding:6px 12px;">搜索</button></div><div id="search-result"></div></div>' +
    '<div class="banner orange" id="group-list-btn">'
  );
  code = code.replace(
    '<div class="banner" id="assistant-btn"><div class="emoji">\uD83E\uDD16</div><div><div class="t">安全助手</div><div class="s">智能健康顾问（支持语音）</div></div></div>',
    '<div class="banner" id="assistant-btn"><div class="emoji">\uD83E\uDD16</div><div><div class="t">安全助手</div><div class="s">智能健康顾问（支持语音）</div></div></div>' +
    '<div class="banner orange" id="ai-algorithm-btn" style="margin-top:4px;"><div class="emoji">\uD83E\uDDE0</div><div><div class="t">智能算法</div><div class="s">基于健康数据的营养运动建议</div></div></div>'
  );
  code = code.replace(
    "app.querySelector('#assistant-btn').onclick = () => navigate('assistant');",
    "app.querySelector('#assistant-btn').onclick = () => navigate('assistant');\n    app.querySelector('#ai-algorithm-btn').onclick = () => navigate('ai-chat');\n    app.querySelector('#search-friend-btn').onclick = searchFriend;\n    document.getElementById('friend-search-input').onkeypress = function(e) { if(e.key==='Enter') searchFriend(); };"
  );
  
  // 6. Remove device HTML + logic from PAGES.data
  // Remove button and device-readings lines
  code = code.replace(/.*btn-connect-device.*\n/g, "");
  code = code.replace(/.*device-readings.*\n/g, "");
  code = code.replace(/.*dev-(hr|steps|bp|ox).*\n/g, "");
  // Remove device connection logic section
  code = code.replace(/\/\/ Device connection logic[\s\S]*?(?=\n\s*app\.querySelector\('[^']*data-entry'\))/, "");
  code = code.replace(/\n{3,}/g, "\n\n");
  
  // 7. Insert features before init section
  const initIdx = code.indexOf("// ========== \u521d\u59cb\u5316");
  code = code.substring(0, initIdx) + featuresCode + helpersCode + "\n" + code.substring(initIdx);
  
  // Verify and write
  try { new Function(code); console.log("✅ " + f); fs.writeFileSync(base + "/" + f, code, "utf8"); }
  catch(e) { console.log("❌ " + f + ": " + e.message.substring(0, 60)); }
}
console.log("Done");
