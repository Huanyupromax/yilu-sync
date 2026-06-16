require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 配置文件上传
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'voice-' + unique + (ext || '.wav'));
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// MongoDB 连接
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const client = new MongoClient(MONGO_URI);
let db;
let usersCollection;
let groupsCollection;
let groupMessagesCollection;

async function connectDB() {
    await client.connect();
    db = client.db('yilu');
    usersCollection = db.collection('users');
    groupsCollection = db.collection('groups');
    groupMessagesCollection = db.collection('group_messages');
    servicesCollection = db.collection('services');
    coursesCollection = db.collection('courses');
    friendsCollection = db.collection('friends');
    messagesCollection = db.collection('messages');
    activitiesCollection = db.collection('activities');
    activitySignupsCollection = db.collection('activity_signups');
    volunteerCollection = db.collection('volunteer');
    volunteerAppCollection = db.collection('volunteer_apps');
    qualificationsCollection = db.collection('qualifications');
    withdrawalsCollection = db.collection('withdrawals');
    await usersCollection.createIndex({ phone: 1 }, { unique: true });
    await groupsCollection.createIndex({ members: 1 });
    await groupMessagesCollection.createIndex({ groupId: 1, timestamp: -1 });
    console.log('✅ MongoDB 连接成功');
}

let serverReady = false;
connectDB()
  .then(() => { serverReady = true; })
  .catch(err => { console.error('❌ MongoDB连接失败:', err.message); });

function waitDB(req, res, next) {
    if (serverReady) return next();
    res.status(503).json({ error: '服务初始化中' });
}

// 认证中间件
// JWT密钥
const JWT_SECRET = process.env.JWT_SECRET || 'yilu-secret-key-2024';

async function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.phone = decoded.phone;
        next();
    } catch {
        res.status(401).json({ error: 'token无效' });
    }
}

// -------------------- 用户相关 --------------------
// 健康检查（Railway 需要）
app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
app.get('/health', (req, res) => { res.json({ status: 'ok', serverReady: serverReady }); });

app.post('/api/register', waitDB, async (req, res) => {
    try {
        const { phone, password, role } = req.body;
        if (!phone || !password) return res.status(400).json({ error: '手机号和密码不能为空' });
        const exist = await usersCollection.findOne({ phone });
        if (exist) { var existingRole = {"银龄用户":"老年端","普通用户":"老年端","子女群体":"子女端","医生与营养师":"营养师端","健康师":"营养师端","营养师":"营养师端","医师":"营养师端"}[exist.role] || exist.role || "其他"; return res.status(400).json({ error: "此手机号已注册为"+existingRole+"用户，如需更换请先注销账户" }); }
        const hash = await bcrypt.hash(password, 10);
        const newUser = { phone, password: hash, role: role || '银龄用户', data: {}, updatedAt: new Date() };
        await usersCollection.insertOne(newUser);
        const token = jwt.sign({ phone }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { phone, role: role || '银龄用户' } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', waitDB, async (req, res) => {
    try {
        const { phone, password, role } = req.body;
        const user = await usersCollection.findOne({ phone });
        if (!user) return res.status(401).json({ error: '用户不存在' });
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ error: '密码错误' });
        const token = jwt.sign({ phone }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { phone, role: user.role || '银龄用户' } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sync', waitDB, auth, async (req, res) => {
    try {
        const { allData } = req.body;
        await usersCollection.updateOne(
            { phone: req.phone },
            { $set: { data: allData, updatedAt: new Date() } }
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sync', waitDB, auth, async (req, res) => {
    try {
        const user = await usersCollection.findOne({ phone: req.phone });
        res.json(user?.data || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -------------------- 群聊 --------------------
// 创建群聊
app.post('/api/group/create', waitDB, auth, async (req, res) => {
    try {
        const { name, avatar, members } = req.body; // members 是手机号数组，包含创建者自己
        const allMembers = [...new Set([req.phone, ...(members || [])])];
        const group = {
            name: name || '新群聊',
            avatar: avatar || '👥',
            owner: req.phone,
            members: allMembers,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        const result = await groupsCollection.insertOne(group);
        res.json({ groupId: result.insertedId, group });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 获取我的群聊列表
app.get('/api/groups', waitDB, auth, async (req, res) => {
    try {
        const groups = await groupsCollection.find({ members: req.phone }).toArray();
        // 获取每个群的最新一条消息（用于显示预览）
        const groupsWithLastMsg = await Promise.all(groups.map(async (g) => {
            const lastMsg = await groupMessagesCollection.findOne(
                { groupId: g._id },
                { sort: { timestamp: -1 } }
            );
            return { ...g, lastMessage: lastMsg?.text || '', lastTime: lastMsg?.timestamp || g.createdAt };
        }));
        res.json(groupsWithLastMsg);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 发送群消息
app.post('/api/group/message', waitDB, auth, async (req, res) => {
    try {
        const { groupId, text, voiceUrl } = req.body; // voiceUrl 可选，由前端上传语音后得到
        if (!groupId) return res.status(400).json({ error: '缺少群组ID' });
        const group = await groupsCollection.findOne({ _id: new ObjectId(groupId) });
        if (!group || !group.members.includes(req.phone)) {
            return res.status(403).json({ error: '你不是群成员' });
        }
        const msg = {
            groupId: new ObjectId(groupId),
            from: req.phone,
            text: text || '',
            voiceUrl: voiceUrl || null,
            timestamp: new Date(),
            readBy: [req.phone]
        };
        const result = await groupMessagesCollection.insertOne(msg);
        res.json({ ok: true, msgId: result.insertedId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 获取群消息历史
app.get('/api/group/messages', waitDB, auth, async (req, res) => {
    try {
        const { groupId, limit = 50, before } = req.query;
        if (!groupId) return res.status(400).json({ error: '缺少群组ID' });
        const group = await groupsCollection.findOne({ _id: new ObjectId(groupId) });
        if (!group || !group.members.includes(req.phone)) {
            return res.status(403).json({ error: '无权限' });
        }
        const query = { groupId: new ObjectId(groupId) };
        if (before) {
            query.timestamp = { $lt: new Date(before) };
        }
        const messages = await groupMessagesCollection.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .toArray();
        res.json(messages.reverse()); // 按时间正序
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 添加群成员
app.post('/api/group/addMember', waitDB, auth, async (req, res) => {
    try {
        const { groupId, phone } = req.body;
        if (!groupId || !phone) return res.status(400).json({ error: '参数不足' });
        const group = await groupsCollection.findOne({ _id: new ObjectId(groupId) });
        if (!group) return res.status(404).json({ error: '群聊不存在' });
        if (group.owner !== req.phone && !group.members.includes(req.phone)) {
            return res.status(403).json({ error: '无权限添加成员' });
        }
        if (group.members.includes(phone)) return res.json({ ok: true, message: '已在群中' });
        await groupsCollection.updateOne(
            { _id: new ObjectId(groupId) },
            { $push: { members: phone }, $set: { updatedAt: new Date() } }
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -------------------- 语音消息上传 --------------------
app.post('/api/upload/voice', waitDB, auth, upload.single('voice'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '没有文件' });
        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        res.json({ url: fileUrl, filename: req.file.filename });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 静态文件服务（用于访问上传的语音）
app.use('/uploads', express.static('uploads'));

app.use(express.static(__dirname));


// DeepSeek API nutrition advisor
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

async function callDeepSeek(messages) {
  if (!DEEPSEEK_API_KEY) {
    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.ZHIPU_API_KEY },
      body: JSON.stringify({ model: 'glm-4-flash', messages: messages, stream: false })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error('Zhipu AI error: ' + response.status + ' ' + errText);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DEEPSEEK_API_KEY },
      body: JSON.stringify({ model: 'deepseek-chat', messages: messages, stream: false })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error('DeepSeek error: ' + response.status + ' ' + errText);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch(e) {
    console.error('DeepSeek call failed:', e.message);
    // Fallback to Zhipu
    throw e;
  }
}



// -------------------- 智谱AI安全知识助手 --------------------
// 你需要配置智谱的 API Key 和 Secret
const ZHIPU_API_KEY = '34c3f2985feb404ea56f9b5cbbeaad23.QvORzAKtnsR3Vi4Y'; // 例如 'your-api-key'
const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

async function callZhipu(messages) {
    if (!ZHIPU_API_KEY) {
        return { error: '请配置智谱API Key' };
    }
    const response = await fetch(ZHIPU_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ZHIPU_API_KEY}`
        },
        body: JSON.stringify({
            model: 'glm-4-flash', // 免费模型，也可以用 glm-3-turbo
            messages: messages,
            stream: false
        })
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`智谱API错误: ${errText}`);
    }
    const data = await response.json();
    return data.choices[0].message.content;
}

// 安全助手接口（支持连续对话，需前端传递历史消息）
app.post('/api/assistant', waitDB, auth, async (req, res) => {
    try {
        const { message, history } = req.body; // history 是可选的聊天记录
        if (!message) return res.status(400).json({ error: '消息不能为空' });
        // 构建给智谱的 messages
        let messages = [];
        if (history && Array.isArray(history)) {
            messages = history.slice(-10); // 保留最近10条
        }
        messages.push({ role: 'user', content: message });
        // 可以添加系统提示词，让助手扮演安全健康顾问
        if (messages[0]?.role !== 'system') {
            messages.unshift({
                role: 'system',
                content: '你是一个专业的老年健康安全助手，回答要通俗易懂、语气亲切、注重安全。如果用户提到疾病症状，提醒及时就医。'
            });
        }
        const reply = await callZhipu(messages);
        res.json({ reply });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', dbReady: serverReady });
});

const PORT = process.env.PORT || 3000;

// ── 管理后台 API ──
const ADMIN_PWD = 'admin123';
let DB_prescriptions = [];

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || !token.startsWith('admin-')) return res.status(401).json({ error: '未授权' });
  try {
    const user = Buffer.from(token.split('-')[1], 'base64').toString();
    if (user === 'admin') { req.adminUser = user; next(); } else res.status(401).json({ error: 'token无效' });
  } catch { res.status(401).json({ error: 'token无效' }); }
}

// 统计数据
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const totalUsers = await usersCollection.countDocuments();
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayActive = await usersCollection.countDocuments({ updatedAt: { $gte: todayStart } });
    const totalPrescriptions = DB_prescriptions ? DB_prescriptions.length : 0;
    const allUsers = await usersCollection.find({}, { projection: { coins: 1 } }).toArray();
    let totalCoins = 0, count = 0, maxCoins = 0;
    allUsers.forEach(u => { const c = u.coins || 0; totalCoins += c; if (c > 0) count++; if (c > maxCoins) maxCoins = c; });
    const avgCoins = count > 0 ? (totalCoins / count).toFixed(1) : 0;
    res.json({ totalUsers, todayActive, totalPrescriptions, totalCoins, avgCoins, maxCoins, userCount: allUsers.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 用户管理
app.get('/api/admin/users', adminAuth, async (req, res) => { try { const users = await usersCollection.find({}).toArray(); res.json({ data: users }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/admin/users/:phone', adminAuth, async (req, res) => { try { const user = await usersCollection.findOne({ phone: req.params.phone }); if (!user) return res.status(404).json({ error: '用户不存在' }); res.json({ user }); } catch (err) { res.status(500).json({ error: err.message }); } });

// 服务管理
app.get('/api/admin/services', adminAuth, async (req, res) => { try { const s = await servicesCollection.find({}).sort({ createdAt: -1 }).toArray(); res.json({ data: s }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/admin/service/create', adminAuth, async (req, res) => {
  try { const { name, price, description, maxParticipants } = req.body; if (!name || !price) return res.status(400).json({ error: "名称和费用不能为空" }); const service = { id: String(Date.now()), name, price: parseFloat(price), description: description || "", maxParticipants: parseInt(maxParticipants) || 100, enrolled: 0, active: true, createdAt: new Date().toISOString() }; await servicesCollection.insertOne(service); res.json({ ok: true, service }); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/admin/service/update', adminAuth, async (req, res) => {
  try { const { id, name, price, description, maxParticipants, active } = req.body; if (!id) return res.status(400).json({ error: "缺少服务ID" }); const u={}; if(name)u.name=name; if(price!==undefined)u.price=parseFloat(price); if(description!==undefined)u.description=description; if(maxParticipants!==undefined)u.maxParticipants=parseInt(maxParticipants); if(active!==undefined)u.active=active; await servicesCollection.updateOne({id:id},{$set:u}); res.json({ ok: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/admin/service/delete', adminAuth, async (req, res) => { try { const { id } = req.body; if (!id) return res.status(400).json({ error: "缺少服务ID" }); await servicesCollection.deleteOne({ id: id }); res.json({ ok: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/services', async (req, res) => { try { const s = await servicesCollection.find({ active: { $ne: false } }).toArray(); res.json({ data: s }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/service/purchase-for-elderly', auth, async (req, res) => {
  try {
    const { serviceId, elderlyPhone } = req.body;
    if (!serviceId) return res.status(400).json({ error: '缺少服务ID' });
    if (!elderlyPhone) return res.status(400).json({ error: '缺少老人手机号' });
    const service = await servicesCollection.findOne({ id: serviceId });
    if (!service) return res.status(404).json({ error: '服务不存在' });
    if (service.active === false) return res.status(400).json({ error: '服务已下架' });
    if (service.enrolled >= service.maxParticipants) return res.status(400).json({ error: '参与人数已满' });
    const user = await usersCollection.findOne({ phone: req.phone });
    if (!user) return res.status(401).json({ error: '用户不存在' });
    const userCoins = (user.coins || 0);
    if (userCoins < service.price) return res.status(400).json({ error: '健康币不足，请先充值' });
    await usersCollection.updateOne({ phone: req.phone }, { $inc: { coins: -service.price }, $push: { elderlyPurchases: { elderlyPhone, serviceName: service.name, serviceId, time: new Date().toISOString() } }, $set: { updatedAt: new Date() } });
    await servicesCollection.updateOne({ id: serviceId }, { $inc: { enrolled: 1 } });
    await usersCollection.updateOne({ phone: elderlyPhone }, { $push: { purchasedServices: serviceId }, $set: { updatedAt: new Date() } });
    res.json({ ok: true, message: '购买成功', coinsLeft: (userCoins - service.price) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/service/purchase', auth, async (req, res) => {
  try { const { serviceId } = req.body; if (!serviceId) return res.status(400).json({ error: "缺少服务ID" }); const service = await servicesCollection.findOne({ id: serviceId }); if (!service) return res.status(404).json({ error: "服务不存在" }); if (service.active === false) return res.status(400).json({ error: "服务已下架" }); if (service.enrolled >= service.maxParticipants) return res.status(400).json({ error: "参与人数已满" }); const user = await usersCollection.findOne({ phone: req.phone }); if (!user) return res.status(401).json({ error: "用户不存在" }); if (user.purchasedServices && user.purchasedServices.includes(serviceId)) return res.json({ ok: true, message: "已购买过该服务" }); const userCoins = (user.coins || 0); if (userCoins < service.price) return res.status(400).json({ error: "健康币不足，请先充值" }); await usersCollection.updateOne({ phone: req.phone }, { $inc: { coins: -service.price }, $push: { purchasedServices: serviceId }, $set: { updatedAt: new Date() } }); await servicesCollection.updateOne({ id: serviceId }, { $inc: { enrolled: 1 } }); res.json({ ok: true, message: "购买成功", coinsLeft: (userCoins - service.price) }); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/my-services', auth, async (req, res) => { try { const user = await usersCollection.findOne({ phone: req.phone }); if (!user || !user.purchasedServices) return res.json({ data: [], coins: user?.coins || 0 }); const my = await servicesCollection.find({ id: { $in: user.purchasedServices } }).toArray(); res.json({ data: my, coins: user.coins || 0 }); } catch (err) { res.status(500).json({ error: err.message }); } });

// 处方管理
app.post('/api/admin/generate-prescription', adminAuth, async (req, res) => {
  try {
    const { profile, healthData, doctorNotes } = req.body;
    const age = parseInt(profile.age) || 65; const hasChronic = !!profile.hasChronic;
    const hr = parseInt(healthData.heartRate) || 75; const ox = parseInt(healthData.bloodOxygen) || 97;
    const sugar = parseFloat(healthData.bloodSugar) || 5.5; const weight = parseFloat(profile.weight) || 65; const height = parseFloat(profile.height) || 165;
    const bmi = weight / ((height/100)*(height/100)); const maxHR = 220 - age;
    const targetHRHigh = Math.round(hasChronic ? maxHR*0.6 : maxHR*0.75);
    let score = 0;
    if (hr>=60&&hr<=80) score+=3; else if (hr>=50&&hr<=100) score+=1;
    if (ox>=96) score+=3; else if (ox>=93) score+=1;
    if (sugar>=3.9&&sugar<=6.1) score+=2; else if (sugar<=7.0) score+=1;
    const bps = parseInt(healthData.bloodPressure?.split('/')[0])||120;
    if (bps>=90&&bps<=130) score+=3; else if (bps<=140) score+=1;
    if (bmi>=18.5&&bmi<=24.9) score+=2; else if (bmi<=29.9) score+=1;
    if (hasChronic) score-=2;
    const level = score>=10?'良好':score>=6?'一般':'需关注';
    const exercises=[];
    exercises.push({name:'热身运动',icon:'\uD83C\uDFC3',detail:'关节活动+慢走5-10分钟'});
    if(level==='良好'){exercises.push({name:'快走',icon:'\uD83D\uDEB6',detail:'4-5km/h，20-30分钟'});exercises.push({name:'太极拳',icon:'\uD83E\uDDD8',detail:'24式太极拳，15-20分钟'});
exercises.push({name:'八段锦',icon:'\uD83E\uDDD8',detail:'完整八段锦一套，15分钟'});}
    else if(level==='一般'){exercises.push({name:'慢走',icon:'\uD83D\uDEB6',detail:'3-4km/h，20分钟'});exercises.push({name:'坐姿体操',icon:'\uD83E\uDDCE',detail:'坐位抬腿+上肢伸展，3组'});exercises.push({name:'手指操',icon:'\uD83E\uDD1C',detail:'手指开合，5分钟'});}
    else{exercises.push({name:'床上活动',icon:'\uD83D\uDECF',detail:'脚踝泵+膝关节屈伸'});exercises.push({name:'上肢拉伸',icon:'\uD83D\uDE46',detail:'坐姿手臂上举'});}
    exercises.push({name:'整理放松',icon:'\uD83E\uDDD8',detail:'全身拉伸+深呼吸，5-10分钟'});
    const cautions=['运动前需热身','出现胸闷头晕立即停止','饭后1小时运动']; if(hasChronic)cautions.push('运动前后测血压/血糖');
    res.json({doctor:doctorNotes?'专业医师/营养师':'智能系统',goal:level==='良好'?'维持健康水平':level==='一般'?'改善体质':'恢复基础活动能力',
intensity:level==='良好'?'中低强度':level==='一般'?'低强度':'极低强度',maxHeartRate:targetHRHigh,frequency:level==='良好'?'每周5-7次':'每周3-5次',
duration:'每次20-30分钟',items:exercises,cautions:cautions.join('；'),healthLevel:level,healthScore:score,bmi:bmi.toFixed(1),
dietAdvice:hasChronic?'控制盐分(<5g/天)，增加膳食纤维':'均衡营养，多吃蔬果',createdAt:new Date().toISOString()});
  } catch(err){res.status(500).json({error:err.message});}
});
app.post('/api/admin/prescription/save', adminAuth, async (req, res) => { try { const {phone,prescription,doctorNotes}=req.body; if(!phone||!prescription)return res.status(400).json({error:'参数不足'}); DB_prescriptions.push({phone,prescription,doctorNotes,savedAt:new Date().toISOString()}); await usersCollection.updateOne({phone},{$set:{prescription:JSON.stringify(prescription),updatedAt:new Date()}}); res.json({ok:true}); } catch(err){res.status(500).json({error:err.message});} });
app.get('/api/admin/prescription/:phone', adminAuth, async (req, res) => { try { const rx = DB_prescriptions.filter(p=>p.phone===req.params.phone).sort((a,b)=>b.savedAt>a.savedAt?1:-1); res.json({data:rx[0]?rx[0].prescription:null}); } catch(err){res.status(500).json({error:err.message});} });
app.get('/api/my-prescription', auth, async (req, res) => { try { const user = await usersCollection.findOne({phone:req.phone}); const rx = user.prescription?JSON.parse(user.prescription):null; res.json({data:rx}); } catch(err){res.status(500).json({error:err.message});} });

// 健康币
app.post('/api/coins/recharge', auth, async (req, res) => { try { const amount=parseInt(req.body.amount)||0; if(amount<=0)return res.status(400).json({error:"充值金额无效"}); await usersCollection.updateOne({phone:req.phone},{$inc:{coins:amount},$push:{coinRecords:{type:"recharge",amount:amount,method:req.body.method||"微信",time:new Date().toISOString()}},$set:{updatedAt:new Date()}}); const user=await usersCollection.findOne({phone:req.phone}); res.json({ok:true,message:"充值成功",coins:user.coins}); }catch(err){res.status(500).json({error:err.message});} });
app.get('/api/coins', auth, async (req, res) => { try { const user=await usersCollection.findOne({phone:req.phone}); res.json({coins:user?.coins||0,records:user?.coinRecords||[]}); }catch(err){res.status(500).json({error:err.message});} });

// ── 获取签到状态 ──
app.get('/api/sign/status', auth, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ phone: req.phone });
    const today = new Date().toISOString().slice(0,10);
    const signedIn = user?.lastSigninDate === today;
    var hist = user?.signHistory || [];
    var streak = 0; var d = new Date();
    while(true){var ds=d.toISOString().slice(0,10); if(hist.includes(ds)){streak++;d.setDate(d.getDate()-1);}else break;}
    res.json({ signedIn, streak: Math.max(1, streak), history: hist });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/coins/signin', auth, async (req, res) => { try { const user=await usersCollection.findOne({phone:req.phone}); const today=new Date().toISOString().slice(0,10); if(user.lastSigninDate===today)return res.status(400).json({error:"今日已签到"}); var hist=user.signHistory||[]; if(hist[hist.length-1]!==today)hist.push(today); var streak=0; var d=new Date(); while(true){var ds=d.toISOString().slice(0,10); if(hist.includes(ds)){streak++;d.setDate(d.getDate()-1);}else break;} await usersCollection.updateOne({phone:req.phone},{$inc:{coins:10},$set:{lastSigninDate:today,signHistory:hist,updatedAt:new Date()},$push:{coinRecords:{type:"signin",amount:10,time:new Date().toISOString()}}}); res.json({ok:true,message:"签到成功+10健康币",streak:Math.max(1,streak)}); }catch(err){res.status(500).json({error:err.message});} });
app.get('/api/admin/coins', adminAuth, async (req, res) => { try { const users=await usersCollection.find({},{projection:{phone:1,coins:1,updatedAt:1}}).toArray(); res.json({data:users}); }catch(err){res.status(500).json({error:err.message});} });
app.get('/api/admin/coin-records', adminAuth, async (req, res) => { try { const users=await usersCollection.find({},{projection:{phone:1,coinRecords:1}}).toArray(); const records=[]; users.forEach(u=>{if(u.coinRecords)u.coinRecords.forEach(r=>records.push({phone:u.phone,...r}));}); records.sort((a,b)=>(b.time||"").localeCompare(a.time||"")); res.json({data:records}); }catch(err){res.status(500).json({error:err.message});} });
app.post('/api/admin/coins/reset', adminAuth, async (req, res) => { try { const{phone,amount}=req.body; if(!phone)return res.status(400).json({error:"缺少手机号"}); await usersCollection.updateOne({phone:phone},{$set:{coins:parseInt(amount)||0},$push:{coinRecords:{type:"admin_reset",amount:parseInt(amount)||0,time:new Date().toISOString()}}}); res.json({ok:true}); }catch(err){res.status(500).json({error:err.message});} });
app.post('/api/admin/export-report', adminAuth, async (req, res) => { try { const{users}=req.body; if(!users||!users.length)return res.json({ok:true,report:'暂无用户数据'}); let r='颐路相伴数据报告\n'; r+='用户总数:'+users.length+'人\n'; res.json({ok:true,report:r}); }catch(err){res.status(500).json({error:err.message});} });

// 账户
app.post('/api/account/delete', auth, async (req, res) => { try { await usersCollection.deleteOne({phone:req.phone}); res.json({ok:true,message:"账户已注销"}); }catch(err){res.status(500).json({error:err.message});} });

// ── 好友系统 ──
app.post('/api/friend/search', auth, async (req, res) => { try { const{phone}=req.body; if(!phone)return res.status(400).json({error:"请输入手机号"}); const user=await usersCollection.findOne({phone},{projection:{phone:1,role:1,data:1}}); if(!user)return res.status(404).json({error:"用户不存在"}); if(user.phone===req.phone)return res.status(400).json({error:"不能添加自己为好友"}); let profile=user.data?.profile||{}; if(typeof profile==='string'){try{profile=JSON.parse(profile);}catch(e){profile={};}} let name=profile.name||''; res.json({user:{phone:user.phone,role:user.role,name}}); }catch(err){res.status(500).json({error:err.message});} });
app.post('/api/friend/request', auth, async (req, res) => { try { const{toPhone}=req.body; if(!toPhone)return res.status(400).json({error:"缺少目标手机号"}); const exist=await friendsCollection.findOne({from:req.phone,to:toPhone}); if(exist)return res.status(400).json({error:"已经发送过请求"}); const rev=await friendsCollection.findOne({from:toPhone,to:req.phone}); if(rev){if(rev.status==='accepted')return res.status(400).json({error:"已经是好友"}); if(rev.status==='pending'){await friendsCollection.updateOne({_id:rev._id},{$set:{status:'accepted'}}); return res.json({ok:true,message:"对方已邀请过您，已自动成为好友"});}} await friendsCollection.insertOne({from:req.phone,to:toPhone,status:'pending',createdAt:new Date().toISOString()}); res.json({ok:true}); }catch(err){res.status(500).json({error:err.message});} });

// ── 好友备注 ──
app.post('/api/friend/alias', auth, async (req, res) => {
  try {
    const { friendPhone, alias } = req.body;
    if (!friendPhone) return res.status(400).json({ error: "缺少好友手机号" });
    if (alias && alias.trim()) {
      await usersCollection.updateOne({ phone: req.phone }, { $set: { ["aliases."+friendPhone]: alias.trim() } });
    } else {
      await usersCollection.updateOne({ phone: req.phone }, { $unset: { ["aliases."+friendPhone]: "" } });
    }
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/friends', auth, async (req, res) => { try { const accepted=await friendsCollection.find({$or:[{from:req.phone,status:'accepted'},{to:req.phone,status:'accepted'}]}).toArray(); const phones=[]; accepted.forEach(r=>{phones.push(r.from===req.phone?r.to:r.from);}); const users=await usersCollection.find({phone:{$in:phones}},{projection:{phone:1,role:1,data:1}}).toArray(); const friendsWithMsg=[]; for(const u of users){const lastMsg=await messagesCollection.findOne({$or:[{from:req.phone,to:u.phone},{from:u.phone,to:req.phone}]},{sort:{timestamp:-1}}); let p=u.data?.profile||{}; if(typeof p==='string'){try{p=JSON.parse(p);}catch(e){p={};}} let nm=p.name||''; friendsWithMsg.push({phone:u.phone,role:u.role,name:nm,lastMessage:lastMsg?lastMsg.text:'',lastTime:lastMsg?lastMsg.timestamp:''});} res.json({data:friendsWithMsg}); }catch(err){res.status(500).json({error:err.message});} });
app.get('/api/friend/requests', auth, async (req, res) => { try { const requests=await friendsCollection.find({to:req.phone,status:'pending'}).sort({createdAt:-1}).toArray(); const fromPhones=requests.map(r=>r.from); const users=await usersCollection.find({phone:{$in:fromPhones}},{projection:{phone:1,role:1,data:1}}).toArray(); const result=requests.map(r=>{const u=users.find(u=>u.phone===r.from); let pp=u?.data?.profile||{}; if(typeof pp==='string'){try{pp=JSON.parse(pp);}catch(e){pp={};}} let nm=pp.name||''; return{...r,fromRole:u?.role||'',fromName:nm};}); res.json({data:result}); }catch(err){res.status(500).json({error:err.message});} });
app.post('/api/friend/accept', auth, async (req, res) => { try { await friendsCollection.updateOne({from:req.body.fromPhone,to:req.phone,status:'pending'},{$set:{status:'accepted'}}); res.json({ok:true}); }catch(err){res.status(500).json({error:err.message});} });
app.post('/api/friend/reject', auth, async (req, res) => { try { await friendsCollection.updateOne({from:req.body.fromPhone,to:req.phone,status:'pending'},{$set:{status:'rejected'}}); res.json({ok:true}); }catch(err){res.status(500).json({error:err.message});} });

// ── 聊天系统 ──
app.post('/api/chat/send', auth, async (req, res) => { try { const{to,text}=req.body; if(!to||!text)return res.status(400).json({error:"参数不足"}); const msg={from:req.phone,to,text,timestamp:new Date().toISOString(),read:false}; await messagesCollection.insertOne(msg); res.json({ok:true,msg}); }catch(err){res.status(500).json({error:err.message});} });
app.get('/api/chat/messages', auth, async (req, res) => { try { const{friend}=req.query; if(!friend)return res.status(400).json({error:"缺少好友手机号"}); const msgs=await messagesCollection.find({$or:[{from:req.phone,to:friend},{from:friend,to:req.phone}]}).sort({timestamp:1}).toArray(); await messagesCollection.updateMany({from:friend,to:req.phone,read:false},{$set:{read:true}}); res.json({data:msgs}); }catch(err){res.status(500).json({error:err.message});} });


// ── 更新个人资料 ──
app.post('/api/profile/update', auth, async (req, res) => {
  try {
    const { name, height, weight, age, hasChronic } = req.body;
    const profile = { name: name || '', height: height || '', weight: weight || '', age: age || '', hasChronic: !!hasChronic };
    const user = await usersCollection.findOne({ phone: req.phone });
    const data = user?.data || {};
    data.profile = profile;
    await usersCollection.updateOne({ phone: req.phone }, { $set: { data: data, updatedAt: new Date() } });
    res.json({ ok: true, profile });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ── 紧急联系人 ──
app.get('/api/emergency/contacts', waitDB, auth, async (req, res) => {
  try { const user=await usersCollection.findOne({phone:req.phone}); res.json({contacts:user?.emergencyContacts||[]}); } catch(err){res.status(500).json({error:err.message});}
});
app.post('/api/emergency/contacts', waitDB, auth, async (req, res) => {
  try { const{name,phone:cp,priority}=req.body; if(!name||!cp)return res.status(400).json({error:"姓名和手机号不能为空"}); const user=await usersCollection.findOne({phone:req.phone}); let contacts=user?.emergencyContacts||[]; const idx=contacts.findIndex(function(c){return c.phone===cp;}); const ct={name,phone:cp,priority:priority||(contacts.length+1)}; if(idx>=0) contacts[idx]=ct; else contacts.push(ct); await usersCollection.updateOne({phone:req.phone},{$set:{emergencyContacts:contacts}}); res.json({ok:true,contacts}); } catch(err){res.status(500).json({error:err.message});}
});
app.post('/api/emergency/contacts/delete', waitDB, auth, async (req, res) => {
  try { const{phone:cp}=req.body; const user=await usersCollection.findOne({phone:req.phone}); let contacts=(user?.emergencyContacts||[]).filter(function(c){return c.phone!==cp;}); await usersCollection.updateOne({phone:req.phone},{$set:{emergencyContacts:contacts}}); res.json({ok:true,contacts}); } catch(err){res.status(500).json({error:err.message});}
});


// Verify user exists (for clearing stale localStorage on startup)
app.get('/api/verify-user', auth, async (req, res) => {
  try {
    const user = await usersCollection.findOne({phone: req.phone});
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({ ok: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});



// ── 智能算法 - 营养建议 ──
app.post("/api/nutrition-advice", auth, async (req, res) => {
  try {
    const { age, height, weight, bloodPressure, heartRate, bloodOxygen, bloodSugar, chronicDiseases, gender } = req.body;
    let prompt = "请根据以下用户健康数据提供个性化的营养建议和运动建议：\n";
    if (age) prompt += "年龄：" + age + "岁\n";
    if (height) prompt += "身高：" + height + "cm\n";
    if (weight) prompt += "体重：" + weight + "kg\n";
    if (gender) prompt += "性别：" + gender + "\n";
    if (bloodPressure) prompt += "血压：" + bloodPressure + "mmHg\n";
    if (heartRate) prompt += "心率：" + heartRate + "次/分\n";
    if (bloodOxygen) prompt += "血氧：" + bloodOxygen + "%\n";
    if (bloodSugar) prompt += "血糖：" + bloodSugar + "mmol/L\n";
    if (chronicDiseases) prompt += "慢性病史：" + chronicDiseases + "\n";
    prompt += "\n请提供：\n1. 当前健康状态评估\n2. 饮食营养建议\n3. 运动方案建议\n4. 注意事项\n\n以上推送仅供参考，以实际营养师为参考标准。";

    if (process.env.DEEPSEEK_API_KEY) {
      try {
        const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.DEEPSEEK_API_KEY },
          body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "user", content: prompt }], temperature: 0.7, max_tokens: 2000 })
        });
        const data = await resp.json();
        if (data.choices && data.choices[0])
          return res.json({ ok: true, advice: data.choices[0].message.content });
      } catch(e) { console.warn("DeepSeek error:", e.message); }
    }

    const bmi = weight && height ? (weight / ((height/100)*(height/100))).toFixed(1) : null;
    let advice = "【健康评估报告】\n\n";
    advice += "个人健康数据：\n";
    if (age) advice += "• 年龄：" + age + "岁\n";
    if (bmi) advice += "• BMI：" + bmi + "\n";
    if (bloodPressure) advice += "• 血压：" + bloodPressure + " mmHg\n";
    if (heartRate) advice += "• 心率：" + heartRate + " 次/分\n";
    if (bloodOxygen) advice += "• 血氧：" + bloodOxygen + "%\n";
    if (bloodSugar) advice += "• 血糖：" + bloodSugar + " mmol/L\n";
    advice += "\n【营养建议】\n• 合理控制总热量摄入\n• 增加优质蛋白和膳食纤维\n• 减少高盐高脂高糖食物\n• 每日饮水1500-2000ml\n";
    advice += "\n【运动建议】\n• 每周3-5次有氧运动\n• 每次30-45分钟\n• 心率控制在最大心率的60%-70%\n";
    if (chronicDiseases) advice += "• 注意慢性病管理，运动前咨询医生\n";
    advice += "\n【注意事项】\n• 以上建议仅供参考，具体请咨询专业医师或营养师\n• 如有不适请及时就医";

    res.json({ ok: true, advice: advice });
  } catch(err) { res.status(500).json({ error: err.message }); }
});


// 用户搜索
app.get("/api/user/search", auth, async (req, res) => {
  try {
    const phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: "请输入手机号" });
    const user = await usersCollection.findOne({ phone: phone }, { projection: { phone: 1, role: 1, data: 1 } });
    if (!user) return res.json({ user: null });
    res.json({ user: { phone: user.phone, role: user.role, data: user.data } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 获取今日健康数据
app.get("/api/health-data/today", auth, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ phone: req.phone });
    const dailyRecords = (user && user.data && user.data.dailyRecords) || {};
    const today = new Date().toISOString().slice(0, 10);
    const record = dailyRecords[today] || null;
    res.json({ data: record });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 获取用户资料
app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ phone: req.phone });
    const data = (user && user.data) || {};
    const profile = data.profile || {};
    if (typeof profile === "string") {
      try { var pp = JSON.parse(profile); res.json({ profile: pp }); return; } catch (e) {}
    }
    res.json({ profile: profile });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 保存今日健康数据
app.post("/api/health-data/save", auth, async (req, res) => {
  try {
    const { bp, heartRate, steps, sleep, bloodOxygen, bloodSugar } = req.body;
    const today = new Date().toISOString().slice(0, 10);
    const user = await usersCollection.findOne({ phone: req.phone });
    let dailyRecords = (user && user.data && user.data.dailyRecords) || {};
    dailyRecords[today] = { bp: bp || "", heartRate: heartRate || "", steps: steps || "", sleep: sleep || "", bloodOxygen: bloodOxygen || "", bloodSugar: bloodSugar || "" };
    const data = (user && user.data) || {};
    data.dailyRecords = dailyRecords;
    await usersCollection.updateOne({ phone: req.phone }, { $set: { data: data, updatedAt: new Date() } });
    res.json({ ok: true, record: dailyRecords[today] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 同步数据到服务器
app.post("/api/data/sync", auth, async (req, res) => {
  try {
    const { healthData, dailyRecords, profile, contacts } = req.body;
    const user = await usersCollection.findOne({ phone: req.phone });
    const data = (user && user.data) || {};
    if (healthData) data.healthData = healthData;
    if (dailyRecords) data.dailyRecords = dailyRecords;
    if (profile) data.profile = profile;
    if (contacts) data.contacts = contacts;
    await usersCollection.updateOne({ phone: req.phone }, { $set: { data: data, updatedAt: new Date() } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// 营养师端 - 查看患者数据
app.get('/api/doctor/patient-data', auth, async (req, res) => {
  try {
    const doctor = await usersCollection.findOne({ phone: req.phone });
    if (!doctor || doctor.role !== '医生与营养师') {
      return res.status(403).json({ error: '仅限营养师端使用' });
    }
    const patientPhone = req.query.phone;
    if (!patientPhone) return res.status(400).json({ error: '请输入患者手机号' });
    
    const patient = await usersCollection.findOne({ phone: patientPhone });
    if (!patient) return res.status(404).json({ error: '未找到该用户' });
    
    let profile = patient.data?.profile || {};
    if (typeof profile === 'string') { try { profile = JSON.parse(profile); } catch(e) { profile = {}; } }
    
    const dailyRecords = patient.data?.dailyRecords || {};
    const allRecords = Object.keys(dailyRecords);
    
    res.json({
      patient: {
        phone: patient.phone,
        role: patient.role,
        name: profile.name || '',
        profile: profile
      },
      dailyRecords: dailyRecords,
      recordCount: allRecords.length
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 营养师端 - 发送运动处方
app.post('/api/doctor/send-prescription', auth, async (req, res) => {
  try {
    const doctor = await usersCollection.findOne({ phone: req.phone });
    if (!doctor || doctor.role !== '医生与营养师') {
      return res.status(403).json({ error: '仅限营养师端使用' });
    }
    const { patientPhone, prescription, doctorNotes } = req.body;
    if (!patientPhone || !prescription) {
      return res.status(400).json({ error: '参数不足' });
    }
    // Verify patient exists
    const patient = await usersCollection.findOne({ phone: patientPhone });
    if (!patient) {
      return res.status(404).json({ error: '未找到该用户' });
    }
    // Save prescription to patient record
    await usersCollection.updateOne(
      { phone: patientPhone },
      { $set: { prescription: JSON.stringify(prescription), updatedAt: new Date() } }
    );
    // Also record it in the prescription history
    DB_prescriptions.push({
      phone: patientPhone,
      prescription: prescription,
      doctorNotes: doctorNotes || '',
      doctorName: doctor.data?.profile?.name || '营养师',
      doctorPhone: req.phone,
      doctorPhone: req.phone,
      savedAt: new Date().toISOString()
    });
    res.json({ ok: true, message: '处方已发送' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 课程管理
app.post('/api/admin/course/create', adminAuth, async (req, res) => {
  try { const { name, price, description, maxParticipants } = req.body; if (!name || !price) return res.status(400).json({ error: '名称和费用不能为空' }); const course = { id: String(Date.now()), name, price: parseFloat(price), description: description || '', maxParticipants: parseInt(maxParticipants) || 100, enrolled: 0, active: true, createdAt: new Date().toISOString() }; await coursesCollection.insertOne(course); res.json({ ok: true, course }); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/admin/courses', adminAuth, async (req, res) => { try { const c = await coursesCollection.find({}).sort({ createdAt: -1 }).toArray(); res.json({ data: c }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/admin/course/delete', adminAuth, async (req, res) => { try { const { id } = req.body; if (!id) return res.status(400).json({ error: '缺少课程ID' }); await coursesCollection.deleteOne({ id: id }); res.json({ ok: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/courses', async (req, res) => { try { const c = await coursesCollection.find({ active: { $ne: false } }).toArray(); res.json({ data: c }); } catch (err) { res.status(500).json({ error: err.message }); } });
// 子女端为老人购买课程
app.post('/api/course/create', async (req, res) => {
  try {
    const { name, price, description, maxParticipants } = req.body;
    if (!name) return res.status(400).json({ error: '缺少课程名称' });
    const id = 'course_' + Date.now();
    await coursesCollection.insertOne({ id, name, price: parseInt(price) || 0, description: description || '', maxParticipants: parseInt(maxParticipants) || 20, enrolled: 0, active: true, createdAt: new Date().toISOString() });
    res.json({ ok: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/course/delete', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: '缺少课程ID' });
    await coursesCollection.deleteOne({ id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/course/purchase-for-elderly', auth, async (req, res) => {
  try {
    const { courseId, elderlyPhone } = req.body;
    if (!courseId || !elderlyPhone) return res.status(400).json({ error: '参数不足' });
    const course = await coursesCollection.findOne({ id: courseId });
    if (!course) return res.status(404).json({ error: '课程不存在' });
    if (course.active === false) return res.status(400).json({ error: '课程已下架' });
    if (course.enrolled >= course.maxParticipants) return res.status(400).json({ error: '人数已满' });
    const elderly = await usersCollection.findOne({ phone: elderlyPhone });
    if (!elderly) return res.status(404).json({ error: '用户不存在' });
    if (elderly.purchasedCourses && elderly.purchasedCourses.includes(courseId)) return res.json({ ok: true, message: '该用户已拥有此课程' });
    const buyer = await usersCollection.findOne({ phone: req.phone });
    const userCoins = (buyer.coins || 0);
    if (userCoins < course.price) return res.status(400).json({ error: '健康币不足' });
    await usersCollection.updateOne({ phone: req.phone }, { $inc: { coins: -course.price }, $set: { updatedAt: new Date() } });
    await usersCollection.updateOne({ phone: elderlyPhone }, { $push: { purchasedCourses: courseId }, $set: { updatedAt: new Date() } });
    // Record child's purchase
    await usersCollection.updateOne({ phone: req.phone }, { $push: { elderlyPurchases: { elderlyPhone, courseName: course.name, courseId, time: new Date().toISOString() } } });
    await coursesCollection.updateOne({ id: courseId }, { $inc: { enrolled: 1 } });
    res.json({ ok: true, message: '购买成功', coinsLeft: (userCoins - course.price) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/my-elderly-purchases', auth, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ phone: req.phone });
    if (!user || !user.elderlyPurchases) return res.json({ data: [] });
    res.json({ data: user.elderlyPurchases });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/my-courses', auth, async (req, res) => { try { const user = await usersCollection.findOne({ phone: req.phone }); if (!user || !user.purchasedCourses) return res.json({ data: [] }); const my = await coursesCollection.find({ id: { $in: user.purchasedCourses } }).toArray(); res.json({ data: my }); } catch (err) { res.status(500).json({ error: err.message }); } });

// Elderly dashboard for children
app.get('/api/elderly/dashboard/:phone', auth, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ phone: req.params.phone });
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const profile = user.data && user.data.profile || {};
    const healthData = user.data && user.data.healthData || {};
    const dailyRecords = user.data && user.data.dailyRecords || {};
    const today = new Date().toISOString().slice(0,10);
    const todayRecord = dailyRecords[today] || {};
    const courses = user.purchasedCourses ? await coursesCollection.find({ id: { $in: user.purchasedCourses } }).toArray() : [];
    // Return recent records (last 7 days)
    const dates = Object.keys(dailyRecords).sort().slice(-30);
    const recentRecords = {};
    dates.forEach(function(date){ recentRecords[date] = dailyRecords[date]; });
    var rx = user.prescription ? JSON.parse(user.prescription) : null;
    res.json({ ok: true, name: profile.name || user.phone, phone: user.phone, profile, healthData, todayRecord, recentRecords, courses, prescription: rx });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 绑定/解绑老人
app.post('/api/bind/elderly', auth, async (req, res) => {
  try {
    const { elderlyPhone } = req.body;
    await usersCollection.updateOne({ phone: req.phone }, { $set: { boundElderlyPhone: elderlyPhone || '' } });
    res.json({ ok: true, phone: elderlyPhone || '' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/bind/elderly', auth, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ phone: req.phone }, { projection: { boundElderlyPhone: 1 } });
    res.json({ ok: true, phone: (user && user.boundElderlyPhone) || '' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});


// ── 亲子互动活动 ──
app.post('/api/activity/create', async (req, res) => {
  try {
    const { name, description, startDate, endDate, checkinReward, taskReward, taskDescription } = req.body;
    if (!name) return res.status(400).json({ error: '缺少活动名称' });
    const id = 'activity_' + Date.now();
    await activitiesCollection.insertOne({ id, name, description: description || '', startDate: startDate || '', endDate: endDate || '', checkinReward: parseInt(checkinReward) || 5, taskReward: parseInt(taskReward) || 10, taskDescription: taskDescription || '完成今日健康任务', active: true, participants: 0, createdAt: new Date().toISOString() });
    res.json({ ok: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/activities', async (req, res) => {
  try { const acts = await activitiesCollection.find({ active: { $ne: false } }).sort({ createdAt: -1 }).toArray(); res.json({ data: acts }); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/activity/signup', auth, async (req, res) => {
  try {
    const { activityId } = req.body;
    if (!activityId) return res.status(400).json({ error: '缺少活动ID' });
    const exist = await activitySignupsCollection.findOne({ activityId, phone: req.phone });
    if (exist) return res.json({ ok: true, message: '已报名' });
    await activitySignupsCollection.insertOne({ activityId, phone: req.phone, signedUpAt: new Date().toISOString(), checkins: [], tasks: [], coinsEarned: 0 });
    await activitiesCollection.updateOne({ id: activityId }, { $inc: { participants: 1 } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/activity/my', auth, async (req, res) => {
  try {
    const signups = await activitySignupsCollection.find({ phone: req.phone }).toArray();
    const ids = signups.map(function(s){ return s.activityId; });
    const acts = ids.length > 0 ? await activitiesCollection.find({ id: { $in: ids } }).toArray() : [];
    var result = [];
    acts.forEach(function(a){
      var s = signups.find(function(x){ return x.activityId === a.id; });
      if(s) result.push({ activity: a, signup: s });
    });
    res.json({ data: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/activity/checkin', auth, async (req, res) => {
  try {
    const { activityId } = req.body;
    if (!activityId) return res.status(400).json({ error: '缺少活动ID' });
    const today = new Date().toISOString().slice(0,10);
    var signup = await activitySignupsCollection.findOne({ activityId, phone: req.phone });
    if (!signup) return res.status(400).json({ error: '未报名' });
    if (signup.checkins && signup.checkins.includes(today)) return res.json({ ok: true, message: '今日已打卡' });
    const activity = await activitiesCollection.findOne({ id: activityId });
    var reward = (activity && activity.checkinReward) || 5;
    await activitySignupsCollection.updateOne({ _id: signup._id }, { $push: { checkins: today }, $inc: { coinsEarned: reward } });
    await usersCollection.updateOne({ phone: req.phone }, { $inc: { coins: reward } });
    res.json({ ok: true, message: '打卡成功 +' + reward + ' 健康币', reward: reward });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/activity/task', auth, async (req, res) => {
  try {
    const { activityId } = req.body;
    if (!activityId) return res.status(400).json({ error: '缺少活动ID' });
    const today = new Date().toISOString().slice(0,10);
    var signup = await activitySignupsCollection.findOne({ activityId, phone: req.phone });
    if (!signup) return res.status(400).json({ error: '未报名' });
    if (signup.tasks && signup.tasks.includes(today)) return res.json({ ok: true, message: '今日任务已完成' });
    const activity = await activitiesCollection.findOne({ id: activityId });
    var reward = (activity && activity.taskReward) || 10;
    await activitySignupsCollection.updateOne({ _id: signup._id }, { $push: { tasks: today }, $inc: { coinsEarned: reward } });
    await usersCollection.updateOne({ phone: req.phone }, { $inc: { coins: reward } });
    res.json({ ok: true, message: '任务完成 +' + reward + ' 健康币', reward: reward });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── 志愿者管理 ──
app.post('/api/volunteer/create', adminAuth, async (req, res) => {
  try {
    const { title, description, location, date, time, rewardPerHour } = req.body;
    if (!title) return res.status(400).json({ error: '缺少标题' });
    const id = 'vol_' + Date.now();
    await volunteerCollection.insertOne({ id, title, description: description || '', location: location || '', date: date || '', time: time || '', rewardPerHour: parseInt(rewardPerHour) || 10, active: true, createdAt: new Date().toISOString() });
    res.json({ ok: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/volunteer/list', async (req, res) => {
  try { const v = await volunteerCollection.find({ active: { $ne: false } }).sort({ createdAt: -1 }).toArray(); res.json({ data: v }); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/volunteer/apply', auth, async (req, res) => {
  try {
    const { volunteerId } = req.body;
    if (!volunteerId) return res.status(400).json({ error: '缺少ID' });
    const exist = await volunteerAppCollection.findOne({ volunteerId, phone: req.phone });
    if (exist) return res.json({ ok: true, message: '已报名' });
    await volunteerAppCollection.insertOne({ volunteerId, phone: req.phone, status: 'pending', hours: 0, coinsEarned: 0, appliedAt: new Date().toISOString() });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/volunteer/my', auth, async (req, res) => {
  try {
    const apps = await volunteerAppCollection.find({ phone: req.phone }).toArray();
    const ids = apps.map(function(a){ return a.volunteerId; });
    const vols = ids.length > 0 ? await volunteerCollection.find({ id: { $in: ids } }).toArray() : [];
    var result = [];
    apps.forEach(function(a){
      var v = vols.find(function(x){ return x.id === a.volunteerId; });
      result.push({ volunteer: v || null, app: a });
    });
    res.json({ data: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// Admin: get all volunteer opportunities with applicants
app.get('/api/admin/volunteer/data', adminAuth, async (req, res) => {
  try {
    const vols = await volunteerCollection.find({}).sort({ createdAt: -1 }).toArray();
    const apps = await volunteerAppCollection.find({}).toArray();
    const result = vols.map(function(v) {
      const relevantApps = apps.filter(function(a) { return a.volunteerId === v.id; });
      return Object.assign({}, v, { applicants: relevantApps });
    });
    res.json({ data: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});



// ── 医师收入管理 ──
app.get('/api/doctor/income', auth, async (req, res) => {
  try { const user = await usersCollection.findOne({ phone: req.phone }); res.json({ totalIncome: user?.doctorIncome || 0, coins: user?.coins || 0, withdrawn: user?.doctorWithdrawn || 0 }); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/doctor/withdraw', auth, async (req, res) => {
  try {
    const { amount, method, account } = req.body;
    if (!amount || !method || !account) return res.status(400).json({ error: '缺少参数' });
    var amt = parseInt(amount);
    if (amt < 10) return res.status(400).json({ error: '最低提现10健康币' });
    const user = await usersCollection.findOne({ phone: req.phone });
    if ((user?.coins || 0) < amt) return res.status(400).json({ error: '健康币不足' });
    // Deduct immediately and record as approved
    await usersCollection.updateOne({ phone: req.phone }, { $inc: { coins: -amt, doctorWithdrawn: amt }, $push: { coinRecords: { type: 'withdraw', amount: -amt, method: method, time: new Date().toISOString() } } });
    const wd = { id: 'wd_' + Date.now(), phone: req.phone, amount: amt, method, account, status: 'approved', createdAt: new Date().toISOString(), processedAt: new Date().toISOString() };
    await withdrawalsCollection.insertOne(wd);
    res.json({ ok: true, amount: amt, method: method });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/doctor/withdrawals', auth, async (req, res) => {
  try { const wds = await withdrawalsCollection.find({ phone: req.phone }).sort({ createdAt: -1 }).toArray(); res.json({ data: wds }); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/admin/withdrawals', adminAuth, async (req, res) => {
  try { const wds = await withdrawalsCollection.find({}).sort({ createdAt: -1 }).toArray(); res.json({ data: wds }); } catch (err) { res.status(500).json({ error: err.message }); }
});
// Withdrawals are now processed automatically without admin review


// ── 医师端智能处方生成 ──
app.post('/api/doctor/generate-prescription', auth, async (req, res) => {
  try {
    const { patientPhone } = req.body;
    if (!patientPhone) return res.status(400).json({ error: '缺少患者手机号' });
    const patient = await usersCollection.findOne({ phone: patientPhone });
    if (!patient) return res.status(404).json({ error: '未找到患者' });
    const profile = patient.data?.profile || {};
    const healthData = patient.data?.dailyRecords || {};
    const today = new Date().toISOString().slice(0,10);
    const h = healthData[today] || {};
    const age = parseInt(profile.age) || 65;
    const hasChronic = !!profile.hasChronic;
    const hr = parseInt(h.heartRate) || 75;
    const ox = parseInt(h.bloodOxygen) || 97;
    const sugar = parseFloat(h.bloodSugar) || 5.5;
    const weight = parseFloat(profile.weight) || 65;
    const height = parseFloat(profile.height) || 165;
    const bmi = weight / ((height/100)*(height/100));
    const maxHR = 220 - age;
    const targetHR = Math.round(hasChronic ? maxHR*0.6 : maxHR*0.75);
    let score = 0;
    if (hr>=60&&hr<=80) score+=3; else if (hr>=50&&hr<=100) score+=1;
    if (ox>=96) score+=3; else if (ox>=93) score+=1;
    if (sugar>=3.9&&sugar<=6.1) score+=2; else if (sugar<=7.0) score+=1;
    const bps = parseInt((h.bloodPressure||'/').split('/')[0])||120;
    if (bps>=90&&bps<=130) score+=3; else if (bps<=140) score+=1;
    if (bmi>=18.5&&bmi<=24.9) score+=2; else if (bmi<=29.9) score+=1;
    if (hasChronic) score-=2;
    const level = score>=10?'良好':score>=6?'一般':'需关注';
    const exercises=[];
    exercises.push({name:'热身运动',icon:'🏃',detail:'关节活动+慢走5-10分钟'});
    if(level==='良好'){exercises.push({name:'快走',icon:'🚶',detail:'4-5km/h，20-30分钟'});exercises.push({name:'太极拳',icon:'🥋',detail:'24式太极拳，15-20分钟'});exercises.push({name:'八段锦',icon:'🧘',detail:'完整八段锦一套，15分钟'});}
    else if(level==='一般'){exercises.push({name:'慢走',icon:'🚶',detail:'3-4km/h，15-20分钟'});exercises.push({name:'伸展运动',icon:'🙆',detail:'全身拉伸，10-15分钟'});exercises.push({name:'坐姿运动',icon:'🧘',detail:'坐姿抬腿+手臂运动，10分钟'});}
    else{exercises.push({name:'床边活动',icon:'🛏️',detail:'坐起、抬腿，5-10分钟'});exercises.push({name:'呼吸训练',icon:'🫁',detail:'腹式呼吸，5-10分钟'});}
    const freq = level==='良好'?'每周5-6次':level==='一般'?'每周3-4次':'每周2-3次';
    const dur = level==='良好'?'30-45分钟/次':level==='一般'?'20-30分钟/次':'10-15分钟/次';
    const cautions = hasChronic?'注意监测心率，不超过'+targetHR+'次/分。如有不适应立即停止。':'运动前热身5分钟，运动后拉伸。循序渐进，量力而行。';
    res.json({ ok: true, prescription: {
      doctor: profile.name || '医师', hospital: '平台医师', date: today,
      age, hasChronic, bmi: Math.round(bmi*10)/10,
      healthScore: score, healthLevel: level,
      maxHeartRate: targetHR,
      intensity: level==='良好'?'中等强度':level==='一般'?'低强度':'极低强度',
      items: exercises, frequency: freq, duration: dur,
      cautions, dietAdvice: '均衡饮食，多摄入蛋白质和膳食纤维'
    }});
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── 医师今日统计 ──
app.get('/api/doctor/today-stats', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0,10);
    // Count prescriptions sent today by this doctor
    var rxToday = DB_prescriptions.filter(function(p){ return p.doctorPhone === req.phone && p.savedAt && p.savedAt.slice(0,10) === today; }).length;
    // Count unique patients who chatted today
    var fromSet = await messagesCollection.distinct('from', { to: req.phone, timestamp: { $gte: today+'T00:00:00.000Z', $lte: today+'T23:59:59.999Z' } });
    var toSet = await messagesCollection.distinct('to', { from: req.phone, timestamp: { $gte: today+'T00:00:00.000Z', $lte: today+'T23:59:59.999Z' } });
    var all = {};
    fromSet.forEach(function(p){ if(p !== req.phone) all[p] = true; });
    toSet.forEach(function(p){ if(p !== req.phone) all[p] = true; });
    var chatCount = Object.keys(all).length;
    res.json({ ok: true, prescriptionsToday: rxToday, chatPatientsToday: chatCount });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── 患者诊疗档案 ──
app.get('/api/doctor/patient-records/:phone', auth, async (req, res) => {
  try {
    var records = DB_prescriptions.filter(function(p){ return p.phone === req.params.phone; });
    records.sort(function(a,b){ return (b.savedAt||'').localeCompare(a.savedAt||''); });
    res.json({ data: records });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── 患者数据趋势 ──
app.get('/api/doctor/patient-trends/:phone', auth, async (req, res) => {
  try {
    const patient = await usersCollection.findOne({ phone: req.params.phone });
    if (!patient) return res.status(404).json({ error: '未找到患者' });
    const records = patient.data?.dailyRecords || {};
    const period = req.query.period || 'week';
    const today = new Date();
    var start = new Date(today);
    if (period === 'day') start.setDate(start.getDate() - 1);
    else if (period === 'week') start.setDate(start.getDate() - 7);
    else if (period === 'month') start.setMonth(start.getMonth() - 1);
    else if (period === 'quarter') start.setMonth(start.getMonth() - 3);
    const startStr = start.toISOString().slice(0,10);
    const endStr = today.toISOString().slice(0,10);
    var result = {};
    Object.keys(records).forEach(function(date){
      if (date >= startStr && date <= endStr) result[date] = records[date];
    });
    var dates = Object.keys(result).sort();
    var trends = { dates: dates, heartRate: [], bloodPressure: [], bloodSugar: [], steps: [], sleepHours: [], bloodOxygen: [], bodyFat: [], exerciseMinutes: [] };
    dates.forEach(function(d){
      var r = result[d] || {};
      trends.heartRate.push(r.heartRate || null);
      trends.bloodPressure.push(r.bloodPressure || null);
      trends.bloodSugar.push(r.bloodSugar || null);
      trends.steps.push(r.steps || null);
      trends.sleepHours.push(r.sleepHours || null);
      trends.bloodOxygen.push(r.bloodOxygen || null);
      trends.bodyFat.push(r.bodyFat || null);
      trends.exerciseMinutes.push(r.exerciseMinutes || null);
    });
    res.json({ data: result, trends: trends, period: period, startDate: startStr, endDate: endStr });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── 康复报告生成 ──
app.post('/api/doctor/generate-report', auth, async (req, res) => {
  try {
    const { phone, period } = req.body;
    if (!phone || !period) return res.status(400).json({ error: '缺少参数' });
    const patient = await usersCollection.findOne({ phone });
    if (!patient) return res.status(404).json({ error: '未找到患者' });
    const records = patient.data?.dailyRecords || {};
    const profile = patient.data?.profile || {};
    const today = new Date();
    var start = new Date(today);
    if (period === 'month') start.setMonth(start.getMonth() - 1);
    else if (period === 'quarter') start.setMonth(start.getMonth() - 3);
    const startStr = start.toISOString().slice(0,10);
    const endStr = today.toISOString().slice(0,10);
    var vals = []; var bpSis = []; var steps = []; var sleeps = []; var hrs = [];
    Object.keys(records).forEach(function(date){
      if (date >= startStr && date <= endStr) {
        var r = records[date];
        if(r.bloodSugar) vals.push(parseFloat(r.bloodSugar));
        if(r.bloodPressure) bpSis.push(parseInt((r.bloodPressure+'/').split('/')[0]));
        if(r.steps) steps.push(parseInt(r.steps));
        if(r.sleepHours) sleeps.push(parseFloat(r.sleepHours));
        if(r.heartRate) hrs.push(parseInt(r.heartRate));
      }
    });
    var avg = function(arr){ return arr.length ? Math.round(arr.reduce(function(a,b){return a+b;},0)/arr.length*10)/10 : 0; };
    var report = {
      patientName: profile.name || phone, patientPhone: phone,
      period: period, startDate: startStr, endDate: endStr,
      generatedAt: today.toISOString(),
      stats: {
        heartRate: { avg: avg(hrs), min: Math.min.apply(null,hrs)||0, max: Math.max.apply(null,hrs)||0, days: hrs.length },
        bloodSugar: { avg: avg(vals), min: Math.min.apply(null,vals)||0, max: Math.max.apply(null,vals)||0, days: vals.length },
        bloodPressure: { avgSys: avg(bpSis), days: bpSis.length },
        steps: { avg: avg(steps), total: steps.reduce(function(a,b){return a+b;},0), days: steps.length },
        sleep: { avg: avg(sleeps), days: sleeps.length }
      },
      summary: '',
      problems: '',
      nextPlan: ''
    };
    var healthLevel = report.stats.heartRate.avg >= 60 && report.stats.heartRate.avg <= 80 ? '良好' :
      report.stats.heartRate.avg > 0 ? '一般' : '无数据';
    report.summary = '本周期内共记录健康数据 '+Math.max(hrs.length,vals.length,bpSis.length)+' 天。'+
      '平均心率 '+(report.stats.heartRate.avg||'--')+' 次/分，'+
      '平均血糖 '+(report.stats.bloodSugar.avg||'--')+' mmol/L，'+
      '平均步数 '+(report.stats.steps.avg||'--')+' 步，'+
      '平均睡眠 '+(report.stats.sleep.avg||'--')+' 小时。整体健康等级为「'+healthLevel+'」。';
    report.problems = hrs.length && report.stats.heartRate.avg > 80 ? '心率偏高，建议适当降低运动强度。' : '';
    if(vals.length && report.stats.bloodSugar.avg > 6.1) report.problems += '血糖偏高，建议控制饮食并加强运动。';
    if(!report.problems) report.problems = '各项指标基本正常，请继续保持。';
    report.nextPlan = '1. 继续保持规律运动\n2. 定期监测健康数据\n3. 按时完成运动处方\n4. 如有不适及时就医';
    res.json({ ok: true, report: report });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── 发送康复报告 ──
app.post('/api/doctor/send-report', auth, async (req, res) => {
  try {
    const { patientPhone, report } = req.body;
    if (!patientPhone || !report) return res.status(400).json({ error: '缺少参数' });
    var summary = '【康复报告】'+report.patientName+' '+(report.period==='month'?'月度':'季度')+'康复报告：'+report.summary.slice(0,50)+'...';
    // Send to patient
    await messagesCollection.insertOne({ from: req.phone, to: patientPhone, text: summary, timestamp: new Date().toISOString(), read: false });
    res.json({ ok: true, message: '报告已发送' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── 资质管理 ──
app.post('/api/qualification/upload', auth, async (req, res) => {
  try {
    const { type, typeLabel, fileName, fileData } = req.body;
    if (!type || !fileData) return res.status(400).json({ error: '缺少参数' });
    const user = await usersCollection.findOne({ phone: req.phone });
    const qual = { id: 'qual_' + Date.now(), phone: req.phone, userName: (user?.data?.profile?.name) || '', type, typeLabel: typeLabel || type, fileName: fileName || '未命名', fileData, status: 'pending', reviewNote: '', uploadedAt: new Date().toISOString(), reviewedAt: '' };
    await qualificationsCollection.insertOne(qual);
    res.json({ ok: true, id: qual.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/qualification/my', auth, async (req, res) => {
  try { const quals = await qualificationsCollection.find({ phone: req.phone }).sort({ uploadedAt: -1 }).toArray(); res.json({ data: quals }); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/qualification/certified', auth, async (req, res) => {
  try { const user = await usersCollection.findOne({ phone: req.phone }); res.json({ certified: user?.certified === true }); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/admin/qualifications', adminAuth, async (req, res) => {
  try { const quals = await qualificationsCollection.find({}).sort({ uploadedAt: -1 }).toArray(); res.json({ data: quals }); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/admin/qualification/review', adminAuth, async (req, res) => {
  try {
    const { id, status, reviewNote } = req.body;
    if (!id || !status) return res.status(400).json({ error: '缺少参数' });
    await qualificationsCollection.updateOne({ id }, { $set: { status, reviewNote: reviewNote || '', reviewedAt: new Date().toISOString() } });
    if (status === 'approved') {
      const qual = await qualificationsCollection.findOne({ id });
      if (qual) { await usersCollection.updateOne({ phone: qual.phone }, { $set: { certified: true } }); }
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});