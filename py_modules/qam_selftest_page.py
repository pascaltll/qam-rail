"""Página de la autoprueba del navegador (dev.78): varias «escenas» que el servidor de la prueba va cambiando (`/cmd`):
base (botones, cajas con scroll, desplegable, campo de texto), popups (modal, aviso de cookies, anuncio con ✕ pequeña, enlace a pestaña nueva),
video (reproductor propio con play, barra de progreso, volumen y pantalla completa), audio (reproductor de música) y menu (desplegable largo
y menú de la página con scroll). Todo se sirve desde 127.0.0.1: sin red, sin dependencias; el vídeo va incrustado y el audio se genera."""
from __future__ import annotations

import base64
import math
import struct
import wave
import io

PAGE = """<!doctype html><meta charset=utf-8><title>QAM autoprueba</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#101418;color:#eee;font:20px sans-serif}
.row{display:flex;gap:20px;padding:12px 20px;align-items:center}button,.btn{width:190px;height:72px;font-size:22px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;background:#2a3542;color:#eee;border:1px solid #567;border-radius:6px;text-decoration:none}
.box{width:380px;height:190px;overflow:auto;background:#1b222b;border:2px solid #345}
.box div,.it{height:56px;border-bottom:1px solid #456;padding:14px;box-sizing:border-box}
select,input[type=text]{font-size:24px;height:56px;width:300px}
.scene{position:absolute;inset:0}
.ov{position:fixed;inset:0;background:rgba(0,0,0,.65);visibility:hidden;display:flex;align-items:center;justify-content:center;z-index:5}.ov.on{visibility:visible}
.dlg{position:relative;width:440px;height:200px;background:#fff;color:#111;border-radius:10px;padding:20px;box-sizing:border-box}
.dlg h2{margin:0 0 8px}.x{position:absolute;top:6px;right:6px;width:44px;height:44px;font-size:22px;padding:0}
.x.tiny{width:26px;height:26px;font-size:14px;top:4px;right:4px;visibility:hidden}.x.tiny.on{visibility:visible}
.bn{position:fixed;left:0;right:0;bottom:0;height:70px;background:#223;display:flex;align-items:center;gap:16px;padding:0 20px;visibility:hidden;z-index:4}.bn.on{visibility:visible}
.bn button{width:150px;height:46px;font-size:20px}
#vbox,#abox{width:640px;background:#000;position:relative;margin:8px 20px}
#vbox:fullscreen{width:100vw;height:100vh;margin:0;display:flex;flex-direction:column}#vbox:fullscreen video{flex:1;height:auto;min-height:0;width:100%;object-fit:contain}
video{display:block;width:100%;height:290px;background:#223}
.bar{display:flex;align-items:center;gap:12px;padding:8px 12px;background:#1d2630;height:56px;box-sizing:border-box}.bar button{width:60px;height:40px;font-size:20px}
.seek{flex:1;height:22px;background:#345;border-radius:11px;position:relative;touch-action:none}.seek .fill{height:100%;width:0;background:#5bd;border-radius:11px}
.bar input[type=range]{width:120px;height:34px}.tm{min-width:90px;font-size:16px}
#hmenu{position:absolute;left:340px;top:90px;width:300px;max-height:250px;overflow:auto;background:#1b222b;border:2px solid #5bd;visibility:hidden;z-index:3}#hmenu.on{visibility:visible}
</style>
<div class=scene id=s_base>
<div class=row><button id=b1>B1</button><button id=b2>B2</button><button id=b3>B3</button></div>
<div class=row><div class=box id=box1></div><div class=box id=box2></div></div>
<div class=row><select id=sel><option>uno<option>dos<option>tres</select><input type=text id=inp autocomplete=off></div></div>

<div class=scene id=s_popups style="display:none">
<div class=row><button id=pm1>Pop-up 1</button><button id=pm2>Pop-up 2</button><button id=pm3>Pop-up 3</button><a class=btn id=pl href="/blank" target=_blank>Pestaña nueva</a></div>
<p style="padding:0 20px">Página con ventanas emergentes: un modal con ✕, un aviso de cookies abajo y un anuncio con una ✕ pequeña que aparece al cabo de 1 s.</p>
<div class=ov id=m1><div class=dlg><button class=x id=m1x>✕</button><h2>Suscríbete</h2><p>Recibe novedades en tu correo.</p><button id=m1ok style="width:120px;height:44px">Aceptar</button></div></div>
<div class=bn id=m2><span>Usamos cookies</span><button id=m2no>Rechazar</button><button id=m2ok>Aceptar</button></div>
<div class=ov id=m3><div class=dlg style="background:#fe8"><button class="x tiny" id=m3x>✕</button><h2>ANUNCIO</h2><p>¡Oferta única!</p></div></div></div>

<div class=scene id=s_video style="display:none"><div id=vbox><video id=v src="/v.webm" loop playsinline preload=auto></video>
<div class=bar><button id=vplay>▶</button><div class=seek id=vseek><div class=fill id=vfill></div></div><span class=tm id=vtime>0:00</span><input type=range id=vvol min=0 max=100 value=50><button id=vfs>⛶</button></div></div></div>

<div class=scene id=s_audio style="display:none"><div id=abox><div style="padding:30px 20px;background:#2a2f55;font-size:26px">♪ Pista de prueba</div><audio id=a src="/a.wav" loop preload=auto></audio>
<div class=bar><button id=aplay>▶</button><div class=seek id=aseek><div class=fill id=afill></div></div><span class=tm id=atime>0:00</span><input type=range id=avol min=0 max=100 value=20></div></div></div>

<div class=scene id=s_menu style="display:none"><div class=row><select id=sel2></select><button id=hmb>☰ Menú</button></div><div id=hmenu></div></div>

<script>
const post=(k,d)=>{try{fetch('/ev?k='+k+'&d='+encodeURIComponent(JSON.stringify(d||{})),{keepalive:true,cache:'no-store'})}catch(e){}};
const $=id=>document.getElementById(id);
const rects=()=>{const o={};document.querySelectorAll('[id]').forEach(e=>{const r=e.getBoundingClientRect();if(r.width>0&&r.height>0)o[e.id]=[r.left,r.top,r.width,r.height]});return o};
const geo=()=>({iw:innerWidth,ih:innerHeight,sw:screen.width,sh:screen.height,dpr:window.devicePixelRatio,fe:document.fullscreenEnabled});
let scene='base';
function show(n){for(const s of ['base','popups','video','audio','menu'])$('s_'+s).style.display=(s===n?'':'none');scene=n;setTimeout(()=>post('scene',Object.assign({n:n,rects:rects()},geo())),80)}
let cmdN=0;setInterval(async()=>{try{const r=await fetch('/cmd',{cache:'no-store'});const j=await r.json();if(j.n!==cmdN){cmdN=j.n;show(j.scene)}}catch(e){}},150);
// --- base
for(const id of ['box1','box2']){const b=$(id);for(let i=0;i<60;i++){const d=document.createElement('div');d.textContent=id+' fila '+i;b.appendChild(d)}
 let t=0;b.addEventListener('scroll',()=>{const n=performance.now();if(n-t>40){t=n;post('scroll',{id:id,top:Math.round(b.scrollTop)})}})}
setInterval(()=>{if(scene==='base')for(const id of ['box1','box2'])post('pos',{id:id,top:Math.round($(id).scrollTop)})},250);
document.addEventListener('mousedown',e=>post('down',{id:e.target.id||e.target.tagName}),true);
document.addEventListener('click',e=>post('click',{id:e.target.id||e.target.tagName,cx:e.clientX,cy:e.clientY}),true);
$('inp').addEventListener('input',e=>post('input',{v:e.target.value}));
$('inp').addEventListener('focus',()=>post('focus',{id:'inp'}));
document.addEventListener('visibilitychange',()=>post('vis',{s:document.visibilityState}));
let rt=0;const rz=()=>{post('resize',geo());clearTimeout(rt);rt=setTimeout(()=>post('rects',{rects:rects()}),300)};
addEventListener('resize',rz);document.addEventListener('fullscreenchange',()=>{post('fs',Object.assign({on:!!document.fullscreenElement},geo()));clearTimeout(rt);rt=setTimeout(()=>post('rects',{rects:rects()}),300)});
// --- popups
const pop=(id,open)=>{$(id).classList.toggle('on',open);post('popup',{id:id,open:open})};
$('pm1').onclick=()=>pop('m1',true);$('m1x').onclick=()=>pop('m1',false);$('m1ok').onclick=()=>pop('m1',false);
$('pm2').onclick=()=>pop('m2',true);$('m2no').onclick=()=>pop('m2',false);$('m2ok').onclick=()=>pop('m2',false);
$('pm3').onclick=()=>{pop('m3',true);$('m3x').classList.remove('on');setTimeout(()=>$('m3x').classList.add('on'),1000)};$('m3x').onclick=()=>pop('m3',false);
// --- reproductores (vídeo y audio)
const fmt=s=>isFinite(s)?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';
function player(p,m){const seek=$(p+'seek'),fill=$(p+'fill');let drag=false,moves=0,tl=0;
 const at=e=>{const r=seek.getBoundingClientRect();const f=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width));if(m.duration)m.currentTime=f*m.duration};
 $(p+'play').onclick=()=>{m.paused?m.play():m.pause()};
 m.addEventListener('play',()=>post('media',{id:p,s:'play',t:m.currentTime,d:m.duration||0}));
 m.addEventListener('pause',()=>post('media',{id:p,s:'pause',t:m.currentTime,d:m.duration||0}));
 m.addEventListener('seeked',()=>post('media',{id:p,s:'seeked',t:m.currentTime,d:m.duration||0}));
 m.addEventListener('timeupdate',()=>{const d=m.duration||0;fill.style.width=(d?100*m.currentTime/d:0)+'%';$(p+'time').textContent=fmt(m.currentTime);const n=performance.now();if(n-tl>200){tl=n;post('media',{id:p,s:'time',t:m.currentTime,d:d})}});
 m.addEventListener('error',()=>post('media',{id:p,s:'error',c:m.error&&m.error.code}));
 m.addEventListener('loadedmetadata',()=>post('media',{id:p,s:'meta',d:m.duration}));
 seek.addEventListener('mousedown',e=>{drag=true;moves=0;at(e)});document.addEventListener('mousemove',e=>{if(drag){moves++;at(e)}});
 document.addEventListener('mouseup',()=>{if(drag){drag=false;post('vdrag',{id:p,n:moves})}});
 $(p+'vol').addEventListener('input',e=>{m.volume=e.target.value/100;post('media',{id:p,s:'vol',vol:m.volume})});m.volume=$(p+'vol').value/100}
player('v',$('v'));player('a',$('a'));
$('vfs').onclick=()=>{if(document.fullscreenElement){document.exitFullscreen()}else{post('fs',{stage:'pedido',on:false,fe:document.fullscreenEnabled});try{const p=$('vbox').requestFullscreen();if(p&&p.catch)p.catch(e=>post('fs',{err:String(e).slice(0,80),on:false}))}catch(e){post('fs',{err:String(e).slice(0,80),on:false})}}};
document.addEventListener('fullscreenerror',()=>post('fs',{err:'fullscreenerror',on:false}));
// --- menús
const s2=$('sel2');for(let i=0;i<60;i++){const o=document.createElement('option');o.textContent='Opción '+i;s2.appendChild(o)}
s2.addEventListener('change',()=>post('change',{id:'sel2',v:s2.value,i:s2.selectedIndex}));s2.addEventListener('mousedown',()=>post('down',{id:'sel2'}));
const hm=$('hmenu');for(let i=0;i<40;i++){const d=document.createElement('div');d.className='it';d.textContent='Elemento '+i;d.onclick=()=>post('mitem',{i:i});hm.appendChild(d)}
$('hmb').onclick=()=>{hm.classList.toggle('on');post('menu',{open:hm.classList.contains('on')})};hm.addEventListener('scroll',()=>post('mscroll',{top:Math.round(hm.scrollTop)}));
post('ready',Object.assign({rects:rects()},geo()));
</script>"""

BLANK = "<!doctype html><meta charset=utf-8><title>QAM pestaña</title><body style='background:#223;color:#eee;font:24px sans-serif'>Pestaña de prueba</body>"

_VIDEO_B64 = (
    "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"
)


def video_bytes() -> bytes:
    return base64.b64decode(_VIDEO_B64)


def audio_bytes(secs: float = 6.0, rate: int = 8000) -> bytes:
    """WAV mono de 16 bits: un tono suave que va y viene entre 330 y 520 Hz (sin red ni ficheros)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        n = int(secs * rate)
        frames = bytearray()
        ph = 0.0
        for i in range(n):
            f = 425 + 95 * math.sin(2 * math.pi * i / rate / 2.0)
            ph += 2 * math.pi * f / rate
            frames += struct.pack("<h", int(4500 * math.sin(ph)))
        w.writeframes(bytes(frames))
    return buf.getvalue()
