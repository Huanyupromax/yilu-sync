const { MongoClient } = require('mongodb');

async function test() {
  const uri = 'mongodb://localhost:27017';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log('✅ 成功连接到 MongoDB 服务！');
    const db = client.db('test');
    const result = await db.command({ ping: 1 });
    console.log('✅ 数据库 ping 响应正常:', result);
  } catch (err) {
    console.error('❌ 连接失败:', err.message);
    console.error('请确保 MongoDB 服务已启动');
  } finally {
    await client.close();
  }
}

test();