const fs = require("fs");
const c = fs.readFileSync("C:/Users/Lenovo/Desktop/yilu-sync/yilu-sync/js/elderly-app.js", "utf8");
console.log("has range:", c.includes('type="range"'));
console.log("has profile fix:", c.includes("removeItem('profile')"));
console.log("has logout fix:", c.includes("a.active=false"));
console.log("has emergency:", c.includes("PAGES.emergency"));
console.log("has ai:", c.includes("PAGES['ai-chat']") || c.includes('PAGES["ai-chat"]'));
console.log("has connect:", c.includes("连接"));
console.log("file length:", c.length);
