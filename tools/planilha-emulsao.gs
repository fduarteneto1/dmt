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
    if (p.acao === 'lerObras') return lerObras(ss);
    if (p.acao === 'lerEquipamentos') return lerEquipamentos(ss);
    if (p.acao === 'lerDiarias') return lerDiarias(ss);
    if (p.acao === 'lerClima') return lerClima(ss);
    if (p.acao === 'lerCotacoes') return lerCotacoes(ss);
    lock.waitLock(20000);
    if (p.acao === 'registro') return registro(ss, p.r || {});
    if (p.acao === 'usina') return usina(ss, p.u || {});
    if (p.acao === 'obra') return obra(ss, String(p.nome || '').trim());
    if (p.acao === 'gravarObras') return gravarObras(ss, p.obras);
    if (p.acao === 'gravarEquipamentos') return gravarEquipamentos(ss, p.dados);
    if (p.acao === 'gravarDiarias') return gravarDiarias(ss, p.dados);
    if (p.acao === 'gravarClima') return gravarClima(ss, p.cfg, p.usuario);
    if (p.acao === 'gravarCotacoes') return gravarCotacoes(ss, p.dados);
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

// ---------- Obras do Gestão 360º (valores, situação etc.) ----------
// Guardadas como texto JSON na aba oculta "Gestao360", para todos os computadores
// verem a mesma lista. A1 = 'obras', B1 = lista, C1 = quando foi gravada.
function abaG360(ss) {
  var sh = ss.getSheetByName('Gestao360');
  if (!sh) { sh = ss.insertSheet('Gestao360'); sh.getRange(1, 1).setValue('obras'); sh.hideSheet(); }
  return sh;
}
function lerObras(ss) {
  var sh = abaG360(ss), txt = String(sh.getRange(1, 2).getValue() || '');
  var obras = null;
  try { obras = txt ? JSON.parse(txt) : null; } catch (x) {}
  return { ok: true, obras: Array.isArray(obras) ? obras : null, quando: iso(sh.getRange(1, 3).getValue()) };
}
function gravarObras(ss, obras) {
  if (!Array.isArray(obras)) return { ok: false, erro: 'Lista de obras inválida.' };
  var txt = JSON.stringify(obras);
  if (txt.length > 45000) return { ok: false, erro: 'Lista de obras grande demais para a planilha.' };
  var sh = abaG360(ss);
  sh.getRange(1, 1, 1, 3).setValues([['obras', txt, new Date()]]);
  return { ok: true };
}

// ---------- Equipamentos do Gestão 360º (cadastro e alocação nas obras) ----------
// Mesma aba oculta "Gestao360": A2 = 'equipamentos', B2 = {equip:[...], hist:[...]}, C2 = quando foi gravada.
function lerEquipamentos(ss) {
  var sh = abaG360(ss), txt = String(sh.getRange(2, 2).getValue() || '');
  var d = null;
  try { d = txt ? JSON.parse(txt) : null; } catch (x) {}
  return { ok: true, dados: d && Array.isArray(d.equip) ? d : null, quando: iso(sh.getRange(2, 3).getValue()) };
}
function gravarEquipamentos(ss, d) {
  if (!d || !Array.isArray(d.equip)) return { ok: false, erro: 'Lista de equipamentos inválida.' };
  var txt = JSON.stringify(d);
  if (txt.length > 49000) return { ok: false, erro: 'Dados de equipamentos grandes demais para a planilha.' };
  var sh = abaG360(ss);
  sh.getRange(2, 1, 1, 3).setValues([['equipamentos', txt, new Date()]]);
  return { ok: true };
}

// ---------- Critérios do semáforo da aba Clima (valem para todos os computadores) ----------
// Mesma aba oculta "Gestao360": A3 = 'clima', B3 = {tmin, tcalor, p1, ...}, C3 = quando, D3 = quem alterou.
function lerClima(ss) {
  var sh = abaG360(ss), txt = String(sh.getRange(3, 2).getValue() || '');
  var c = null;
  try { c = txt ? JSON.parse(txt) : null; } catch (x) {}
  return { ok: true, cfg: c && typeof c === 'object' ? c : null, quando: iso(sh.getRange(3, 3).getValue()), usuario: String(sh.getRange(3, 4).getValue() || '') };
}
function gravarClima(ss, c, usuario) {
  if (!c || typeof c !== 'object') return { ok: false, erro: 'Critérios inválidos.' };
  var limpo = {};
  Object.keys(c).forEach(function (k) { var v = n(c[k]); if (/^[a-zA-Z0-9]{1,12}$/.test(k) && isFinite(v)) limpo[k] = v; });
  var sh = abaG360(ss);
  sh.getRange(3, 1, 1, 4).setValues([['clima', JSON.stringify(limpo), new Date(), String(usuario || '').slice(0, 60)]]);
  return { ok: true };
}

// ---------- Diárias do Gestão 360º (lançamentos, fechamentos, diaristas, PIX, feriados) ----------
// Os dados completos ficam como texto JSON na aba oculta "G360Diarias", dividido em pedaços
// (coluna A, a partir da linha 2), porque uma célula aceita no máximo 50 mil caracteres.
// B1 = quando foi gravado. A cada gravação, as abas "Diárias" e "Diárias – Fechamentos"
// são refeitas em formato de tabela, só para consulta (não edite por lá).
var PEDACO = 40000;
function abaDiarias(ss) {
  var sh = ss.getSheetByName('G360Diarias');
  if (!sh) { sh = ss.insertSheet('G360Diarias'); sh.getRange(1, 1).setValue('diarias'); sh.hideSheet(); }
  return sh;
}
function lerDiarias(ss) {
  var sh = abaDiarias(ss), ult = ultimaLinha(sh), txt = '';
  if (ult > 1) txt = sh.getRange(2, 1, ult - 1, 1).getValues().map(function (r) { return String(r[0] || '').replace(/^~/, ''); }).join('');
  var d = null;
  try { d = txt ? JSON.parse(txt) : null; } catch (x) {}
  return { ok: true, dados: d && Array.isArray(d.lanc) ? d : null, quando: iso(sh.getRange(1, 2).getValue()) };
}
function gravarDiarias(ss, d) {
  if (!d || !Array.isArray(d.lanc) || !Array.isArray(d.fech)) return { ok: false, erro: 'Dados de diárias inválidos.' };
  var txt = JSON.stringify(d), partes = [];
  for (var i = 0; i < txt.length; i += PEDACO) partes.push(['~' + txt.slice(i, i + PEDACO)]); // "~" evita que um pedaço vire fórmula
  var sh = abaDiarias(ss), ult = ultimaLinha(sh);
  if (partes.length + 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), partes.length + 10);
  if (ult > 1) sh.getRange(2, 1, ult - 1, 1).clearContent();
  sh.getRange(2, 1, partes.length, 1).setNumberFormat('@').setValues(partes);
  sh.getRange(1, 1, 1, 2).setValues([['diarias', new Date()]]);
  try { tabelasDiarias(ss, d); } catch (x) {}
  return { ok: true };
}
function tabelasDiarias(ss, d) {
  var SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var fech = {}, pix = d.pix || {};
  (d.fech || []).forEach(function (f) { if (!f.del) fech[f.id] = f; });
  var br = function (s) { s = String(s || ''); return s.length >= 10 ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; };
  var lin = [['Data', 'Dia', 'Nome', 'Função', 'Obra', 'Período', 'Tipo de dia', 'Valor', 'Chave PIX', 'Fechamento', 'Situação', 'Lançado por', 'Observação']];
  d.lanc.filter(function (x) { return !x.del; }).sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; }).forEach(function (x) {
    var p = String(x.d).split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]), f = x.fx && fech[x.fx];
    lin.push([dt, SEM[dt.getDay()], x.n, x.f, x.o, x.t === 'I' ? 'Inteira' : 'Meia',
      x.fer || ({ sab: 'Sábado', dom: 'Domingo', util: 'Dia útil' })[x.k] || '', +x.v || 0,
      (f && f.pix && f.pix[x.p]) || (pix[x.p] && pix[x.p].v) || '', f ? 'Nº ' + f.n : '',
      f ? (f.st === 'pago' ? 'Pago' : 'Pagamento solicitado') : 'Em aberto', x.u || '', x.obs || '']);
  });
  var sh = ss.getSheetByName('Diárias') || ss.insertSheet('Diárias');
  sh.clearContents();
  sh.getRange(1, 1, lin.length, lin[0].length).setValues(lin);
  sh.getRange(2, 1, Math.max(1, lin.length - 1), 1).setNumberFormat('dd/MM/yyyy');
  sh.getRange(2, 8, Math.max(1, lin.length - 1), 1).setNumberFormat('"R$" #,##0.00');
  sh.getRange(1, 1, 1, lin[0].length).setFontWeight('bold'); sh.setFrozenRows(1);

  var fl = [['Nº', 'Período', 'Obra', 'Diárias', 'Total', 'Fechado em', 'Por', 'Situação', 'Pago em']];
  Object.keys(fech).map(function (k) { return fech[k]; }).sort(function (a, b) { return (b.n || 0) - (a.n || 0); }).forEach(function (f) {
    fl.push([f.n, br(f.ini) + ' a ' + br(f.fim), f.o || 'Todas', f.qtd, +f.tot || 0, br(f.q) + ' ' + String(f.q || '').slice(11, 16), f.u || '',
      f.st === 'pago' ? 'Pago' : 'Pagamento solicitado', br(f.pg)]);
  });
  var sf = ss.getSheetByName('Diárias – Fechamentos') || ss.insertSheet('Diárias – Fechamentos');
  sf.clearContents();
  sf.getRange(1, 1, fl.length, fl[0].length).setValues(fl);
  sf.getRange(2, 5, Math.max(1, fl.length - 1), 1).setNumberFormat('"R$" #,##0.00');
  sf.getRange(1, 1, 1, fl[0].length).setFontWeight('bold'); sf.setFrozenRows(1);
}

// ---------- Cotações do Gestão 360º (mapas de cotação e fornecedores) ----------
// Mesmo formato das diárias: JSON completo na aba oculta "G360Cotacoes", em pedaços (coluna A, da linha 2).
// A cada gravação, as abas "Cotações" (uma linha por cotação) e "Cotações – Preços"
// (uma linha por item × fornecedor) são refeitas só para consulta (não edite por lá).
function abaCotacoes(ss) {
  var sh = ss.getSheetByName('G360Cotacoes');
  if (!sh) { sh = ss.insertSheet('G360Cotacoes'); sh.getRange(1, 1).setValue('cotacoes'); sh.hideSheet(); }
  return sh;
}
function lerCotacoes(ss) {
  var sh = abaCotacoes(ss), ult = ultimaLinha(sh), txt = '';
  if (ult > 1) txt = sh.getRange(2, 1, ult - 1, 1).getValues().map(function (r) { return String(r[0] || '').replace(/^~/, ''); }).join('');
  var d = null;
  try { d = txt ? JSON.parse(txt) : null; } catch (x) {}
  return { ok: true, dados: d && Array.isArray(d.cot) ? d : null, quando: iso(sh.getRange(1, 2).getValue()) };
}
function gravarCotacoes(ss, d) {
  if (!d || !Array.isArray(d.cot) || !Array.isArray(d.forn)) return { ok: false, erro: 'Dados de cotações inválidos.' };
  var txt = JSON.stringify(d), partes = [];
  for (var i = 0; i < txt.length; i += PEDACO) partes.push(['~' + txt.slice(i, i + PEDACO)]);
  var sh = abaCotacoes(ss), ult = ultimaLinha(sh);
  if (partes.length + 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), partes.length + 10);
  if (ult > 1) sh.getRange(2, 1, ult - 1, 1).clearContent();
  sh.getRange(2, 1, partes.length, 1).setNumberFormat('@').setValues(partes);
  sh.getRange(1, 1, 1, 2).setValues([['cotacoes', new Date()]]);
  try { tabelasCotacoes(ss, d); } catch (x) {}
  return { ok: true };
}
function tabelasCotacoes(ss, d) {
  var SIT = { aberta: 'Em cotação', aprovacao: 'Aguardando aprovação', aprovada: 'Aprovada', pedido: 'Pedido emitido', cancelada: 'Cancelada' };
  var dt = function (s) { s = String(s || ''); if (s.length < 10) return ''; var p = s.slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var nr = function (c) { return 'COT-' + c.ano + '-' + ('00' + c.n).slice(-3); };
  var lin = [['Nº', 'Data', 'Título', 'Obra', 'Solicitante', 'Comprador', 'Situação', 'Itens', 'Fornecedores', 'Fornecedor(es) escolhido(s)', 'Total escolhido', 'Aprovado por', 'Aprovado em']];
  var pre = [['Nº', 'Data', 'Obra', 'Situação', 'Item', 'Un', 'Qtd', 'Fornecedor', 'Marca', 'Preço unit.', 'Total', 'Escolhido']];
  d.cot.filter(function (c) { return !c.del; }).sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : (b.n || 0) - (a.n || 0); }).forEach(function (c) {
    var r = c.res || {};
    lin.push([nr(c), dt(c.d), c.tit || '', c.o || '', c.sol || '', c.u || '', SIT[c.st] || c.st, (c.itens || []).length, (c.fs || []).length,
      (r.forn || []).join(', '), +r.tot || 0, c.apr || '', dt(c.aprd)]);
    // cada item pode ter linhas de marca (preço da linha k em f.p[id + '~' + k]); só uma é a escolhida
    var nao = r.nao || [];
    (c.itens || []).forEach(function (i) {
      var sl = Math.max(1, +i.sl || 1), q = n(i.q) || 0, raiz = i.alt || i.id;
      (c.fs || []).forEach(function (f) {
        for (var k = 0; k < sl; k++) {
          var ch = k ? i.id + '~' + k : i.id, p = n(f.p && f.p[ch]); if (!(p > 0)) continue;
          var esc = r.esc && r.esc[i.id] === f.id && (+((r.escK || {})[i.id]) || 0) === k;
          pre.push([nr(c), dt(c.d), c.o || '', SIT[c.st] || c.st, i.desc || '', i.un || '', q, f.nome || '', (f.mk && f.mk[ch]) || '', p, p * q,
            esc ? 'sim' : nao.indexOf(raiz) >= 0 ? 'não será comprado' : '']);
        }
      });
    });
  });
  var escreve = function (nome, t, datas, reais) {
    var s = ss.getSheetByName(nome) || ss.insertSheet(nome);
    s.clearContents();
    s.getRange(1, 1, t.length, t[0].length).setValues(t);
    var nl = Math.max(1, t.length - 1);
    datas.forEach(function (c) { s.getRange(2, c, nl, 1).setNumberFormat('dd/MM/yyyy'); });
    reais.forEach(function (c) { s.getRange(2, c, nl, 1).setNumberFormat('"R$" #,##0.00'); });
    s.getRange(1, 1, 1, t[0].length).setFontWeight('bold'); s.setFrozenRows(1);
  };
  escreve('Cotações', lin, [2, 13], [11]);
  escreve('Cotações – Preços', pre, [2], [10, 11]);
}
