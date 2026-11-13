export const STYLES = Object.freeze({
  fedora: {name:'Федора',file:'artwork/hat.svg',number:'001',character:'Невозмутимый классик'},
  cowboy: {name:'Ковбойская',file:'artwork/cowboy.svg',number:'002',character:'Искатель новых дорог'},
  bucket: {name:'Панама',file:'artwork/bucket.svg',number:'003',character:'Мастер лёгкой походки'},
  'top-hat': {name:'Цилиндр',file:'artwork/top-hat.svg',number:'004',character:'Главный герой вечера'}
});
export const COLORS = Object.freeze({
  graphite:{name:'Графит',main:'#454840',light:'#74776b',dark:'#22271f',scene:'#e9e6da',circle:'#d5d8b9'},
  clay:{name:'Терракота',main:'#a8563e',light:'#d48c69',dark:'#663225',scene:'#eee1d5',circle:'#dfbaa0'},
  olive:{name:'Олива',main:'#727948',light:'#a0a873',dark:'#3f472c',scene:'#e4e7d8',circle:'#c6cda9'},
  sand:{name:'Песок',main:'#bdaa86',light:'#e2d5b6',dark:'#7d694b',scene:'#eee7d9',circle:'#dfcfad'},
  wine:{name:'Вишня',main:'#8d394c',light:'#bc7180',dark:'#4f1e2c',scene:'#eee0df',circle:'#d8b7bd'},
  navy:{name:'Полночь',main:'#344c67',light:'#718aa3',dark:'#1a2c40',scene:'#e2e6e9',circle:'#bfcbd2'},
  cream:{name:'Ваниль',main:'#d3c8aa',light:'#f4ecd6',dark:'#9c8c65',scene:'#e9e7da',circle:'#d7d3ba'},
  plum:{name:'Слива',main:'#795576',light:'#b28dad',dark:'#452e43',scene:'#e9e1e8',circle:'#cfc0ce'}
});
export const RIBBONS = Object.freeze({
  ink:{name:'Чернила',main:'#23251f',light:'#43463a',dark:'#10120e'},
  rust:{name:'Медь',main:'#a6482e',light:'#cc7d50',dark:'#60251b'},
  cream:{name:'Шампань',main:'#d6c79d',light:'#f5e9c9',dark:'#a4946f'}
});
export const SCENES = Object.freeze({day:'День',sunset:'Закат',night:'Ночь'});
export const DEFAULT_LOOK = Object.freeze({style:'fedora',color:'graphite',ribbon:'ink',scene:'day'});
export const PRESETS = Object.freeze({
  morning:{style:'bucket',color:'cream',ribbon:'rust',scene:'day'},
  road:{style:'cowboy',color:'clay',ribbon:'cream',scene:'sunset'},
  evening:{style:'top-hat',color:'plum',ribbon:'cream',scene:'night'}
});
const owns = (object,key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(object,key);
export function normalizeLook(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    style:owns(STYLES,input.style)?input.style:DEFAULT_LOOK.style,
    color:owns(COLORS,input.color)?input.color:DEFAULT_LOOK.color,
    ribbon:owns(RIBBONS,input.ribbon)?input.ribbon:DEFAULT_LOOK.ribbon,
    scene:owns(SCENES,input.scene)?input.scene:DEFAULT_LOOK.scene
  };
}
export function parseLook(search) {
  const params=new URLSearchParams(search);
  if(!['hat','color','ribbon','scene'].some(key=>params.has(key)))return null;
  return normalizeLook({style:params.get('hat'),color:params.get('color'),ribbon:params.get('ribbon'),scene:params.get('scene')});
}
export function lookUrl(base,value) {
  const look=normalizeLook(value),url=new URL(base);
  url.search=new URLSearchParams({hat:look.style,color:look.color,ribbon:look.ribbon,scene:look.scene}).toString();
  url.hash='';return url.href;
}
export function lookKey(value) {
  const look=normalizeLook(value);return [look.style,look.color,look.ribbon,look.scene].join(':');
}
export function sceneColors(value) {
  const look=normalizeLook(value);
  if(look.scene==='night')return {background:'#243139',circle:'#3c4a54',ink:'#f0eddf',muted:'#c1c7bc'};
  if(look.scene==='sunset')return {background:'#ecd0bb',circle:'#d5a27f',ink:'#473526',muted:'#765b43'};
  return {background:COLORS[look.color].scene,circle:COLORS[look.color].circle,ink:'#25281f',muted:'#646c57'};
}
export function colorizeSvg(source,value) {
  const look=normalizeLook(value),color=COLORS[look.color],ribbon=RIBBONS[look.ribbon];
  const variables={'--hat-main':color.main,'--hat-light':color.light,'--hat-dark':color.dark,'--ribbon-main':ribbon.main,'--ribbon-light':ribbon.light,'--ribbon-dark':ribbon.dark};
  return source.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g,(match,key,fallback)=>variables[key]??fallback?.trim()??match);
}
export function normalizeFavorites(value) {
  if(!Array.isArray(value))return [];
  const unique=new Map();
  for(const entry of value){
    if(!entry||typeof entry!=='object')continue;
    const look=normalizeLook(entry);
    if(!Object.keys(DEFAULT_LOOK).every(key=>entry[key]===look[key]))continue;
    unique.set(lookKey(look),look);if(unique.size===8)break;
  }
  return [...unique.values()];
}
