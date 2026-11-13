import {STYLES,COLORS,RIBBONS,SCENES,DEFAULT_LOOK,PRESETS,normalizeLook,parseLook,lookUrl,lookKey,sceneColors,colorizeSvg,normalizeFavorites} from './look-model.js';

const $ = id => document.getElementById(id);
const root=document.documentElement,art=$('hat-art'),stage=$('hat-stage'),tilt=$('hat-tilt'),showcase=$('colors'),greeting=$('hat-greeting');
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const artworkCache=new Map(),storageKey='shlyapa-studio-v2';
let artworkRequest=0,favoritesRequest=0,motionTimer,storageAvailable=true,saved={};
try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch{storageAvailable=false;}
let look=parseLook(location.search)||normalizeLook(saved.look||DEFAULT_LOOK);
let favorites=normalizeFavorites(saved.favorites);
function announce(message){$('studio-status').textContent=message;}
function persist(){
  try{localStorage.setItem(storageKey,JSON.stringify({look,favorites}));storageAvailable=true;return true;}
  catch{storageAvailable=false;return false;}
}
async function getArtwork(style){
  if(!artworkCache.has(style)){
    const promise=fetch(new URL('./'+STYLES[style].file,document.baseURI)).then(async response=>{
      if(!response.ok)throw new Error('Artwork unavailable');
      const source=await response.text(),parsed=new DOMParser().parseFromString(source,'image/svg+xml');
      if(parsed.querySelector('parsererror')||parsed.documentElement.localName!=='svg')throw new Error('Invalid SVG');
      return source;
    });
    artworkCache.set(style,promise);promise.catch(()=>artworkCache.delete(style));
  }
  return artworkCache.get(style);
}
async function renderHat(){
  const request=++artworkRequest,style=look.style;
  art.setAttribute('aria-busy','true');
  try{
    const source=await getArtwork(style);if(request!==artworkRequest)return;
    const parsed=new DOMParser().parseFromString(source,'image/svg+xml');
    const svg=document.importNode(parsed.documentElement,true);
    svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');art.replaceChildren(svg);
  }catch{
    if(request!==artworkRequest)return;
    const image=document.createElement('img');image.src='./'+STYLES[style].file;image.alt='';image.width=900;image.height=650;art.replaceChildren(image);
    announce('Рисунок временно недоступен. Попробуйте другой фасон или обновите страницу.');
  }finally{if(request===artworkRequest)art.removeAttribute('aria-busy');}
}
function applyLook(value,message=''){
  const previousStyle=look.style;
  look=normalizeLook({...look,...value});
  const color=COLORS[look.color],ribbon=RIBBONS[look.ribbon],scene=sceneColors(look);
  for(const key of ['main','light','dark']){
    root.style.setProperty('--hat-'+key,color[key]);root.style.setProperty('--ribbon-'+key,ribbon[key]);
  }
  root.style.setProperty('--scene',scene.background);root.style.setProperty('--circle',scene.circle);
  showcase.style.setProperty('--scene-ink',scene.ink);showcase.style.setProperty('--scene-muted',scene.muted);
  showcase.classList.toggle('is-night',look.scene==='night');
  $('style-code').textContent='ФОРМА № '+STYLES[look.style].number;
  $('color-name').textContent=color.name;
  $('color-code').textContent=String(Object.keys(COLORS).indexOf(look.color)+1).padStart(2,'0')+' / '+color.name.toUpperCase();
  $('look-character').textContent=STYLES[look.style].character;
  $('look-summary').textContent=STYLES[look.style].name+' · '+color.name+' · '+SCENES[look.scene];
  art.setAttribute('aria-label',STYLES[look.style].name+'. Цвет: '+color.name+'. Лента: '+ribbon.name);
  for(const key of ['style','color','ribbon','scene'])document.querySelectorAll('[data-'+key+']').forEach(button=>{
    const selected=button.dataset[key]===look[key];
    button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));
  });
  const isFavorite=favorites.some(item=>lookKey(item)===lookKey(look));
  $('save-look').classList.toggle('is-saved',isFavorite);
  $('save-look').setAttribute('aria-label',isFavorite?'Этот образ уже в избранном':'Сохранить образ в избранное');
  $('share-fallback').hidden=true;
  if(previousStyle!==look.style||!art.querySelector('svg'))renderHat();
  persist();announce(message);
}
for(const key of ['style','color','ribbon','scene'])document.querySelectorAll('[data-'+key+']').forEach(button=>button.addEventListener('click',()=>applyLook({[key]:button.dataset[key]})));
function goToStudio(){showcase.scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth',block:'start'});}
document.querySelectorAll('[data-pick-style]').forEach(button=>button.addEventListener('click',()=>{
  applyLook({style:button.dataset.pickStyle},'Примеряем: '+STYLES[button.dataset.pickStyle].name+'.');goToStudio();
}));
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{
  applyLook(PRESETS[button.dataset.preset],'Готовый образ примерен. Добавьте свой штрих.');goToStudio();
}));
window.addEventListener('hat:recommend',event=>{applyLook(normalizeLook(event.detail),'Ваш образ из теста уже в мастерской.');goToStudio();});
function randomFrom(object){const keys=Object.keys(object);return keys[Math.floor(Math.random()*keys.length)];}
$('random-look').addEventListener('click',()=>{
  const next={style:randomFrom(STYLES),color:randomFrom(COLORS),ribbon:randomFrom(RIBBONS),scene:randomFrom(SCENES)};
  if(lookKey(next)===lookKey(look)){const colors=Object.keys(COLORS);next.color=colors[(colors.indexOf(look.color)+1)%colors.length];}
  applyLook(next,'Случай распорядился красиво. Как вам?');playMotion('tip');
});
stage.addEventListener('pointermove',event=>{
  if(reducedMotion.matches||event.pointerType!=='mouse')return;
  const bounds=stage.getBoundingClientRect();
  tilt.style.setProperty('--tilt-x',(-((event.clientY-bounds.top)/bounds.height-.5)*9)+'deg');
  tilt.style.setProperty('--tilt-y',(((event.clientX-bounds.left)/bounds.width-.5)*12)+'deg');
});
stage.addEventListener('pointerleave',()=>{tilt.style.setProperty('--tilt-x','0deg');tilt.style.setProperty('--tilt-y','0deg');});
const motionClasses=['is-tipping','is-spinning','is-bouncing'];
function playMotion(motion){
  clearTimeout(motionTimer);art.classList.remove(...motionClasses);
  const confetti=$('confetti');confetti.replaceChildren();
  const messages={tip:'Снимаю шляпу перед вами.',spin:'Эффектный поворот событий.',bounce:'Настроение — выше головы.',party:'Повод нашёлся. Это вы.'};
  greeting.textContent=messages[motion]||messages.tip;greeting.classList.add('is-visible');
  if(!reducedMotion.matches){
    void art.offsetWidth;
    art.classList.add(({tip:'is-tipping',spin:'is-spinning',bounce:'is-bouncing',party:'is-bouncing'})[motion]||'is-tipping');
    if(motion==='party')for(let i=0;i<25;i++){
      const piece=document.createElement('i');
      piece.style.setProperty('--piece-x',(Math.random()*100)+'%');
      piece.style.setProperty('--piece-delay',(Math.random()*.45)+'s');
      piece.style.setProperty('--piece-color',['#b94c30','#d1bd73','#f4f0e7','#7a8b60'][i%4]);
      piece.style.setProperty('--piece-turn',(Math.random()*540-270)+'deg');confetti.append(piece);
    }
  }
  motionTimer=setTimeout(()=>{art.classList.remove(...motionClasses);greeting.classList.remove('is-visible');greeting.textContent='';confetti.replaceChildren();},2600);
}
$('tip-hat').addEventListener('click',()=>playMotion('tip'));
document.querySelectorAll('[data-motion]').forEach(button=>button.addEventListener('click',()=>playMotion(button.dataset.motion)));
$('share-look').addEventListener('click',async()=>{
  const url=lookUrl(location.href,look);
  try{await navigator.clipboard.writeText(url);announce('Ссылка на ваш образ скопирована. Можно отправлять.');}
  catch{const input=$('share-url');input.value=url;$('share-fallback').hidden=false;input.focus();input.select();announce('Скопируйте выделенную ссылку на образ.');}
});
$('download-look').addEventListener('click',async()=>{
  const snapshot={...look},button=$('download-look');button.disabled=true;
  try{
    const source=colorizeSvg(await getArtwork(snapshot.style),snapshot);
    const parsed=new DOMParser().parseFromString(source,'image/svg+xml'),svg=parsed.documentElement;
    svg.setAttribute('width','900');svg.setAttribute('height','650');
    const background=parsed.createElementNS('http://www.w3.org/2000/svg','rect');
    background.setAttribute('width','900');background.setAttribute('height','650');
    background.setAttribute('fill',sceneColors(snapshot).background);svg.insertBefore(background,svg.firstChild);
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='shlyapa-'+snapshot.style+'-'+snapshot.color+'.svg';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    announce('Образ сохранён в SVG. Его можно открыть в браузере или редакторе.');
  }catch{announce('Не получилось скачать образ. Попробуйте ещё раз.');}
  finally{button.disabled=false;}
});
function svgDataUrl(source){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(source);}
function renderFavorites(focusIndex=null){
  const request=++favoritesRequest,grid=$('favorites-grid');grid.replaceChildren();
  $('favorites-empty').hidden=favorites.length>0;
  for(const [index,item] of favorites.entries()){
    const card=document.createElement('article');card.className='favorite-card';
    const preview=document.createElement('button');preview.type='button';preview.className='favorite-preview';preview.style.background=sceneColors(item).background;
    preview.setAttribute('aria-label','Примерить: '+STYLES[item.style].name+', '+COLORS[item.color].name);
    const image=document.createElement('img');image.alt='';image.width=900;image.height=650;preview.append(image);
    preview.addEventListener('click',()=>{applyLook(item,'Любимый образ снова с вами.');goToStudio();});
    const title=document.createElement('h3');title.textContent=STYLES[item.style].name+' / '+COLORS[item.color].name;
    const caption=document.createElement('p');caption.textContent=RIBBONS[item.ribbon].name+' · '+SCENES[item.scene];
    const remove=document.createElement('button');remove.type='button';remove.className='favorite-remove';remove.textContent='Убрать ×';
    remove.setAttribute('aria-label','Убрать из избранного: '+title.textContent);
    remove.addEventListener('click',()=>{
      favorites=favorites.filter(value=>lookKey(value)!==lookKey(item));persist();renderFavorites(index);
      applyLook(look,'Образ убран из коллекции.');$('favorites-status').textContent='Образ убран из коллекции.';
    });
    card.append(preview,title,caption,remove);grid.append(card);
    getArtwork(item.style).then(source=>{if(request===favoritesRequest)image.src=svgDataUrl(colorizeSvg(source,item));}).catch(()=>{image.alt=STYLES[item.style].name;});
  }
  if(focusIndex!==null){const buttons=grid.querySelectorAll('.favorite-remove');(buttons[Math.min(focusIndex,buttons.length-1)]||$('favorites-empty').querySelector('a')).focus();}
}
$('save-look').addEventListener('click',()=>{
  if(favorites.some(item=>lookKey(item)===lookKey(look))){announce('Этот образ уже в вашей коллекции.');return;}
  if(favorites.length===8){announce('В коллекции уже восемь образов. Уберите один, чтобы сохранить новый.');return;}
  favorites.push({...look});const ok=persist();renderFavorites();
  applyLook(look,ok?'Образ добавлен в вашу личную коллекцию.':'Образ добавлен на время этой страницы: сохранение в браузере недоступно.');
});
for(const image of document.querySelectorAll('[data-preview]')){
  const preset=PRESETS[image.dataset.preview];
  getArtwork(preset.style).then(source=>{image.src=svgDataUrl(colorizeSvg(source,preset));}).catch(()=>{});
}
applyLook(look);renderFavorites();
if(!storageAvailable)announce('Сохранение в браузере недоступно. Образы можно скачать или отправить ссылкой.');
