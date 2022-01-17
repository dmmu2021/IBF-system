#!/usr/bin/env node

const fs = require('fs');
var XLSX = require('xlsx');
var path = 'src/assets/i18n/';
var workbook = XLSX.readFile(path + 'layer-popup-info.xlsx');

var worksheet = workbook.Sheets['Sheet1'];
var data = '';
for (z in worksheet) {
  if (z[0] === '!') continue;
  //parse out the column, row, and value
  var tt = 0;
  for (var i = 0; i < z.length; i++) {
    if (!isNaN(z[i])) {
      tt = i;
      break;
    }
  }
  var col = z.substring(0, tt);
  if (col === 'P') {
    var value = worksheet[z].v;
    data += value;
  }
}
var popupsJson = JSON.parse(data);

var translationFile = JSON.parse(fs.readFileSync(path + 'en.json', 'utf8'));
translationFile['layer-info-popups'] = popupsJson;

fs.writeFile(path + 'en.json', JSON.stringify(translationFile), function (err) {
  if (err) {
    return console.log(err);
  }
  console.log('The file was saved!');
});
