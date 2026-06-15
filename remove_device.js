var fs = require('fs');
var base = 'C:\\Users\\Lenovo\\Desktop\\yilu-sync\\yilu-sync';
var files = ['js/elderly-app.js', 'js/children-app.js', 'js/doctor-app.js'];

var newCode = "PAGES.data = (app) => {\n  const recCount = Object.keys(storage.getDailyRecords()).length;\n  app.innerHTML = '<div class=\"container\">'+\n    '<div class=\"header\"><div class=\"header-logo\"><img src=\"images/logo.png\" onerror=\"...\"></div><div class=\"header-brand\"><div class=\"header-title\">健康数据</div><div class=\"header-subtitle\">已记录 '+recCount+' 天</div></div></div>'+\n    '<div class=\"data-entry-tile\" data-go=\"data-entry\"><div class=\"dt-ic\">📝</div><div class=\"dt-info\"><div class=\"dt-name\">录入当日数据</div><div class=\"dt-desc\">血压 · 心率 · 步数 · 睡眠</div></div><div class=\"dt-arrow\">›</div></div>'+\n    '<div class=\"data-entry-tile green\" data-go=\"data-summary\"><div class=\"dt-ic\">📊</div><div class=\"dt-info\"><div class=\"dt-name\">周/月数据总结</div><div class=\"dt-desc\">一周与一个月的趋势汇总</div></div><div class=\"dt-arrow\">›</div></div>'+\n    '</div>';\n  app.querySelector('[data-go=\"data-entry\"]').onclick = () => navigate('data-entry');\n  app.querySelector('[data-go=\"data-summary\"]').onclick = () => navigate('data-summary');\n};\n";

files.forEach(function(fp) {
  var filepath = base + '\\' + fp;
  var code = fs.readFileSync(filepath, 'utf8');
  var start = code.indexOf("PAGES.data = (app) => {");
  if (start < 0) { console.log(fp + ': PAGES.data not found'); return; }
  var end = code.indexOf("PAGES['data-entry']", start);
  if (end < 0) { console.log(fp + ': data-entry not found'); return; }
  code = code.substring(0, start) + newCode + '\n' + code.substring(end);
  fs.writeFileSync(filepath, code, 'utf8');
  console.log(fp + ' - Updated, device connection removed');
});
console.log('All files updated!');
