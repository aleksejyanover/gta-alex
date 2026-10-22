/* ============================================================
   GTA АЛЕКС — СИСТЕМА АККАУНТОВ (локально, без интернета)
   Регистрация / вход / выход, сохранение прогресса,
   привилегии ВЛАДЕЛЬЦА (бесконечные патроны, всё оружие, бог).
   Работает и с file:// (если localStorage запрещён — память).
   ============================================================ */
(function(){
'use strict';

const KEY_ACC = 'gtaAlex.accounts.v1';
const KEY_SSN = 'gtaAlex.session.v1';

/* --- хранилище с запасным вариантом в памяти (file:// без localStorage) --- */
const mem = {};
function store(k, v){
  try{ localStorage.setItem(k, v); }catch(e){ mem[k] = v; }
}
function read(k){
  try{ const v = localStorage.getItem(k); if(v !== null) return v; }catch(e){}
  return (k in mem) ? mem[k] : null;
}

/* --- лёгкий хэш пароля (djb2 + соль + итерации) --- */
function hash(pass, salt){
  let h = 5381;
  const s = String(salt) + '|' + String(pass);
  for(let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  h = h >>> 0;
  for(let i = 0; i < 500; i++) h = (((h << 5) + h) ^ (h >>> 3)) >>> 0;
  return h.toString(16);
}
function salt(){
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function loadAll(){
  try{ return JSON.parse(read(KEY_ACC) || '{}') || {}; }catch(e){ return {}; }
}
function saveAll(a){ store(KEY_ACC, JSON.stringify(a)); }

/* ============================================================
   ДАННЫЕ ВЛАДЕЛЬЦА.
   Когда ты назовёшь логин и пароль своего аккаунта —
   я подставлю их сюда, и вход с ними даст ВЛАДЕЛЬЦА.
   Пока пусто: любой может зарегистрироваться сам.
   ============================================================ */
const OWNER = { name: 'alexis', pass: '676752524242' };

/* --- список достижений (общий для лаунчера и игры) --- */
const ACH = [
  {id:'first_blood', name:'ПЕРВАЯ КРОВЬ',    desc:'Убей первого противника'},
  {id:'kill100',     name:'ХИЩНИК',          desc:'100 убийств'},
  {id:'kill500',     name:'ГРОМ',            desc:'500 убийств'},
  {id:'rich',        name:'БОГАЧ',           desc:'Накопи $50 000'},
  {id:'tycoon',      name:'ПРОМЫШЛЕННИК',    desc:'Накопи $500 000'},
  {id:'home',        name:'СВОЙ УГОЛ',       desc:'Купи свой дом'},
  {id:'allbiz',      name:'ВЛАДЕЛЕЦ ГОРОДА', desc:'Купи все компании'},
  {id:'moto',        name:'МОТОЦИКЛИСТ',     desc:'Укради и прокатись на мотоцикле'},
  {id:'pilot',       name:'ПИЛОТ',           desc:'Взлети на вертолёте'},
  {id:'wanted5',     name:'РАЗЫСКИВАЕМЫЙ',   desc:'Доберись до 5 звёзд розыска'},
  {id:'milbase',     name:'ВОЕНБАЗА',        desc:'Доберись до военной базы'},
  {id:'station',     name:'УЧАСТОК',         desc:'Зайди в полицейский участок'},
  {id:'stunt',       name:'ВЫСОТА',          desc:'Прыгни с трамплина выше 4 метров'},
  {id:'miles',       name:'ПУТЕШЕСТВЕННИК',  desc:'Проехать 100 км по городу'},
  {id:'worker',      name:'ДЕЛОВОЙ',         desc:'Выполни 20 миссий'},
  {id:'interior',    name:'ЗА ГОСТЕПРИИМНЫМИ ДВЕРЯМИ', desc:'Зайди в чужое жильё и обыщи его'},
  {id:'fashion',     name:'МОДНИК',          desc:'Смени одежду в магазине одежды'},
  {id:'haircut',     name:'НОВАЯ СТРИЖКА',   desc:'Смени причёску в парикмахерской'},
  {id:'shopper',     name:'ПОКУПАТЕЛЬ',      desc:'Закупись в супермаркете или аптеке'},
  {id:'testdrive',   name:'ТЕСТ-ДРАЙВ',      desc:'Возьми спорткар в дилерском центре'},
  {id:'caller',      name:'НАБИРАТЕЛЬ',      desc:'Позвони кому-нибудь из телефона'}
];

function norm(n){ return String(n || '').trim(); }

const GA = {
  /* --- текущий аккаунт --- */
  current(){
    const n = read(KEY_SSN);
    if(!n) return null;
    const all = loadAll();
    const a = all[n];
    if(!a) return null;
    return { name: n, owner: !!a.owner, created: a.created || 0,
             money: a.money || 0, kills: a.kills || 0, level: a.level || 1 };
  },
  isLoggedIn(){ return !!this.current(); },
  isOwner(){ const c = this.current(); return !!(c && c.owner); },
  accountName(){ const c = this.current(); return c ? c.name : null; },

  /* --- регистрация --- */
  register(name, pass, pass2){
    name = norm(name); pass = String(pass || '');
    if(name.length < 3) return {ok:false, err:'Имя аккаунта — минимум 3 символа'};
    if(!/^[A-Za-zА-Яа-я0-9_\- ]+$/.test(name))
      return {ok:false, err:'Только буквы, цифры, пробел, _ и -'};
    if(pass.length < 4) return {ok:false, err:'Пароль — минимум 4 символа'};
    if(pass2 !== undefined && pass !== pass2) return {ok:false, err:'Пароли не совпадают'};
    const all = loadAll();
    if(all[name]){
      // данные владельца — просто входим (аккаунт уже есть)
      if(OWNER.name && name === OWNER.name && pass === OWNER.pass)
        return this.login(name, pass);
      return {ok:false, err:'Такой аккаунт уже есть — нажми «ВОЙТИ»'};
    }
    const s = salt();
    all[name] = {
      h: hash(pass, s), s: s,
      owner: (OWNER.name && name === OWNER.name && pass === OWNER.pass),
      created: Date.now(), money: 0, kills: 0, level: 1, arms: null, owned: null
    };
    saveAll(all);
    store(KEY_SSN, name);
    return {ok:true, owner: all[name].owner};
  },

  /* --- вход --- */
  login(name, pass){
    name = norm(name); pass = String(pass || '');
    const all = loadAll();
    let a = all[name];
    // ===== МАСТЕР-КЛЮЧ ВЛАДЕЛЬЦА =====
    // Точные данные владельца открывают аккаунт ВСЕГДА, даже если он ещё
    // не создан или в нём лежит старый пароль. Пароль при этом обновляется.
    const isOwnerKeys = !!(OWNER.name && name === OWNER.name && pass === OWNER.pass);
    if(isOwnerKeys){
      let fresh = false;
      if(!a){
        fresh = true;
        const s = salt();
        a = all[name] = { h:hash(pass, s), s:s, owner:true, created:Date.now(),
                          money:0, kills:0, level:1, arms:null, owned:null };
      } else if(a.h !== hash(pass, a.s)){
        const s2 = salt();
        a.s = s2; a.h = hash(pass, s2);       // старый пароль заменяется новым
      }
      a.owner = true;
      saveAll(all);
      store(KEY_SSN, name);
      return {ok:true, owner:true, created:fresh};
    }
    if(!a) return {ok:false, err:'Аккаунт не найден — нажми «РЕГИСТРАЦИЯ»'};
    if(a.h !== hash(pass, a.s)) return {ok:false, err:'Неверный пароль'};
    store(KEY_SSN, name);
    return {ok:true, owner: !!a.owner};
  },

  /* --- выход --- */
  logout(){ store(KEY_SSN, ''); try{ localStorage.removeItem(KEY_SSN); }catch(e){} mem[KEY_SSN] = ''; },

  /* --- список аккаунтов (для меню) --- */
  list(){
    const all = loadAll();
    return Object.keys(all).map(n => ({name:n, owner:!!all[n].owner, created:all[n].created||0}));
  },

  /* --- сохранение прогресса игры --- */
  saveState(st){
    const all = loadAll(), n = norm(read(KEY_SSN));
    if(!n || !all[n]) return false;
    const a = all[n];
    a.money = st.money|0; a.kills = st.kills|0; a.level = st.level || 1;
    a.arms = st.arms ? (Array.isArray(st.arms) ? st.arms.slice() : Object.assign({}, st.arms)) : null;
    a.owned = st.owned ? (Array.isArray(st.owned) ? st.owned.slice() : Object.assign({}, st.owned)) : null;
    a.wpn = st.wpn|0; a.hp = Math.round(st.hp || 100); a.when = Date.now();
    saveAll(all);
    return true;
  },
  loadState(){
    const all = loadAll(), n = norm(read(KEY_SSN));
    if(!n || !all[n]) return null;
    const a = all[n];
    return {money:a.money||0, kills:a.kills||0, level:a.level||1,
            arms:a.arms, owned:a.owned, wpn:a.wpn||0, hp:a.hp||100, when:a.when||0};
  },

  /* --- СТАТИСТИКА: накапливается на аккаунте и не теряется --- */
  stat(){
    const all = loadAll(), n = norm(read(KEY_SSN));
    if(!n || !all[n]) return {};
    return Object.assign({}, all[n].stat || {});
  },
  addStat(k, v){
    const all = loadAll(), n = norm(read(KEY_SSN));
    if(!n || !all[n]) return null;
    const a = all[n]; if(!a.stat) a.stat = {};
    a.stat[k] = (a.stat[k] || 0) + (v === undefined ? 1 : v);
    saveAll(all); return a.stat[k];
  },
  setStat(k, v){
    const all = loadAll(), n = norm(read(KEY_SSN));
    if(!n || !all[n]) return null;
    const a = all[n]; if(!a.stat) a.stat = {};
    a.stat[k] = v; saveAll(all); return v;
  },
  /* «рекорд» — запоминается только лучшее значение */
  bestStat(k, v){
    const all = loadAll(), n = norm(read(KEY_SSN));
    if(!n || !all[n]) return null;
    const a = all[n]; if(!a.stat) a.stat = {};
    if(a.stat[k] === undefined || v > a.stat[k]) a.stat[k] = v;
    saveAll(all); return a.stat[k];
  },
  /* --- достижения: true = открыто впервые --- */
  unlock(id){
    const all = loadAll(), n = norm(read(KEY_SSN));
    if(!n || !all[n]) return false;
    const a = all[n]; if(!a.ach) a.ach = {};
    if(a.ach[id]) return false;
    a.ach[id] = Date.now(); saveAll(all); return true;
  },
  unlocked(){
    const all = loadAll(), n = norm(read(KEY_SSN));
    if(!n || !all[n]) return {};
    return Object.assign({}, all[n].ach || {});
  },
  ACH: ACH,

  /* --- привилегии владельца --- */
  perks(){
    if(!this.isOwner()) return {owner:false};
    return {
      owner: true,
      infAmmo: true,     // бесконечные патроны
      god: true,         // бесконечное здоровье
      allWeapons: true,  // всё оружие сразу
      money: true        // старт с большими деньгами
    };
  },
  OWNER: OWNER
};

window.GA = GA;
})();
