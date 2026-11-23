// Ponte entre o Gestão 360º BKP e esta planilha (taxa de emulsão MRAF).
// Publicado como App da Web: Executar como "Eu", acesso "Qualquer pessoa".
// Só responde a quem envia o TOKEN abaixo (guardado criptografado no Gestão 360º).
var TOKEN = 'TOKEN_SECRETO'; // o valor real está só no Apps Script e, criptografado, no app.enc

function doGet(e) { return saida(tratar((e && e.parameter) || {})); }
function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents); } catch (x) {}
  return saida(tratar(p));
}
function saida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function tratar(p) {
  if (p.token !== TOKEN) return { ok: false, erro: 'Acesso negado.' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lock = LockService.getScriptLock();
  try {
    if (p.acao === 'dados') return dados(ss);
    lock.waitLock(20000);
    if (p.acao === 'registro') return registro(ss, p.r || {});
    if (p.acao === 'usina') return usina(ss, p.u || {});
    if (p.acao === 'obra') return obra(ss, String(p.nome || '').trim());
    return { ok: false, erro: 'Ação desconhecida.' };
  } catch (err) {
    return { ok: false, erro: String(err && err.message || err) };
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function n(v) { return typeof v === 'number' ? v : parseFloat(String(v || '').replace(',', '.')); }
function iso(d) { return d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm") : String(d || ''); }
function ultimaLinha(sh) {
  var a = sh.getRange(1, 1, sh.getMaxRows(), 1).getValues();
  for (var i = a.length - 1; i >= 0; i--) if (a[i][0] !== '' && a[i][0] !== null) return i + 1;
  return 1;
}

function dados(ss) {
  var sh = ss.getSheetByName('Registros'), ult = ultimaLinha(sh), reg = [];
  if (ult > 1) {
    sh.getRange(2, 1, ult - 1, 11).getValues().forEach(function (r, i) {
      if (!r[1]) return;
      var hi = n(r[4]), hf = n(r[5]), tc = n(r[6]), tl = n(r[7]), ac = n(r[8]), al = n(r[9]);
      var lit = (hi - hf) * tc * tl * 1000, area = ac * al;
      reg.push({ linha: i + 2, data: iso(r[0]).slice(0, 10), obra: String(r[1]), usina: String(r[2]), ref: String(r[3] || ''),
        hi: hi, hf: hf, tc: tc, tl: tl, ac: ac, al: al, lit: lit, area: area, taxa: area > 0 ? lit / area : 0, enviado: iso(r[10]) });
    });
  }
  var obras = [], usinas = [];
  var so = ss.getSheetByName('Obras'), lo = ultimaLinha(so);
  if (lo > 1) so.getRange(2, 1, lo - 1, 1).getValues().forEach(function (r) { if (String(r[0]).trim()) obras.push(String(r[0]).trim()); });
  var su = ss.getSheetByName('Usinas'), lu = ultimaLinha(su);
  if (lu > 1) su.getRange(2, 1, lu - 1, 3).getValues().forEach(function (r, i) {
    if (String(r[0]).trim() && n(r[1]) > 0 && n(r[2]) > 0) usinas.push({ nome: String(r[0]).trim(), c: n(r[1]), l: n(r[2]), linha: i + 2 });
  });
  return { ok: true, registros: reg, obras: obras, usinas: usinas, planilha: ss.getUrl() };
}

function registro(ss, r) {
  var hi = n(r.hi), hf = n(r.hf), tc = n(r.tc), tl = n(r.tl), ac = n(r.ac), al = n(r.al);
  if (!r.obra || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.data))) return { ok: false, erro: 'Obra e data são obrigatórias.' };
  if ([hi, hf, tc, tl, ac, al].some(function (v) { return !(v >= 0); }) || !(hi > hf) || !(tc > 0) || !(tl > 0) || !(ac > 0) || !(al > 0))
    return { ok: false, erro: 'Leituras inválidas.' };
  var sh = ss.getSheetByName('Registros'), ult = ultimaLinha(sh);
  // evita lançar a mesma usinada duas vezes (reenvio após falha de rede)
  if (ult > 1) {
    var ini = Math.max(2, ult - 60), rec = sh.getRange(ini, 1, ult - ini + 1, 10).getValues();
    var dup = rec.some(function (x) {
      return iso(x[0]).slice(0, 10) === r.data && String(x[1]) === String(r.obra) && String(x[2]) === String(r.usina || '') &&
        Math.abs(n(x[4]) - hi) < 1e-9 && Math.abs(n(x[5]) - hf) < 1e-9 && Math.abs(n(x[8]) - ac) < 1e-9 && Math.abs(n(x[9]) - al) < 1e-9;
    });
    if (dup) return { ok: true, duplicado: true };
  }
  var d = String(r.data).split('-'), linha = ult + 1;
  if (linha > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 50);
  var alvo = sh.getRange(linha, 1, 1, 11);
  if (linha > 2) sh.getRange(linha - 1, 1, 1, 14).copyTo(sh.getRange(linha, 1, 1, 14), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  alvo.setValues([[new Date(+d[0], +d[1] - 1, +d[2]), String(r.obra), String(r.usina || 'Manual'), String(r.ref || ''),
    hi, hf, tc, tl, ac, al, new Date()]]);
  return { ok: true, linha: linha };
}

function usina(ss, u) {
  var nome = String(u.nome || '').trim(), c = n(u.c), l = n(u.l);
  if (!nome || !(c > 0) || !(l > 0)) return { ok: false, erro: 'Informe nome e medidas do tanque.' };
  var sh = ss.getSheetByName('Usinas'), ult = ultimaLinha(sh);
  if (ult > 1) {
    var nomes = sh.getRange(2, 1, ult - 1, 1).getValues();
    for (var i = 0; i < nomes.length; i++) if (String(nomes[i][0]).trim().toLowerCase() === nome.toLowerCase()) {
      sh.getRange(i + 2, 1, 1, 3).setValues([[nome, c, l]]); return { ok: true, linha: i + 2 };
    }
  }
  sh.getRange(ult + 1, 1, 1, 3).setValues([[nome, c, l]]);
  return { ok: true, linha: ult + 1 };
}

function obra(ss, nome) {
  if (!nome) return { ok: false, erro: 'Informe a obra.' };
  var sh = ss.getSheetByName('Obras'), ult = ultimaLinha(sh);
  if (ult > 1 && sh.getRange(2, 1, ult - 1, 1).getValues().some(function (r) { return String(r[0]).trim().toLowerCase() === nome.toLowerCase(); }))
    return { ok: true, existia: true };
  sh.getRange(ult + 1, 1).setValue(nome);
  return { ok: true };
}
