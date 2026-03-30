import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, AlertTriangle, Clock } from 'lucide-react';
import { Table, User } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { playSFX, playPoolSound } from '../services/sound';
import { Socket } from 'socket.io-client';
import { SocketGameState } from '../types';

interface PoolGameProps {
  table: Table; user: User;
  onGameEnd: (result: 'win'|'loss'|'quit') => void;
  socket?: Socket|null; socketGame?: SocketGameState|null;
}

// ΓöÇΓöÇ Physics constants ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const TW = 900, TH = 450, BR = 11, RAIL = 18;
const PR = 22;          // visual pocket radius
const PD = PR + 4;      // pocket detection radius (larger than visual = no missed pockets)
const FRICTION = 0.986, WALL_REST = 0.72, BALL_REST = 0.93, VEL_THRESH = 0.08, SUB = 8;
const TURN_TIME = 60;   // seconds per turn in P2P

// Corner & side pocket positions
const POCKETS = [
  {x:PR*0.6, y:PR*0.6},           // TL corner
  {x:TW/2,   y:4},                 // Top side (shifted inward slightly to capture better)
  {x:TW-PR*0.6, y:PR*0.6},        // TR corner
  {x:PR*0.6, y:TH-PR*0.6},        // BL corner
  {x:TW/2,   y:TH-4},               // Bottom side
  {x:TW-PR*0.6, y:TH-PR*0.6},     // BR corner
];

const BALL_COLORS: Record<number,string> = {
  0:'#F5F5EA', 1:'#E8B820', 2:'#1A5CE5', 3:'#E5231A', 4:'#6A1DB5',
  5:'#F08020', 6:'#1A8C3B', 7:'#8B1A1A', 8:'#111111',
  9:'#E8B820', 10:'#1A5CE5', 11:'#E5231A', 12:'#6A1DB5',
  13:'#F08020', 14:'#1A8C3B', 15:'#8B1A1A',
};

interface Ball { id:number; x:number; y:number; vx:number; vy:number; pocketed:boolean; rot?:number; }
interface Spark { x:number; y:number; vx:number; vy:number; life:number; maxLife:number; r:number; color:string; }

function buildRack(): Ball[] {
  const balls: Ball[] = [];
  const cx = TW*0.65, cy = TH/2, dx = BR*2.05, dy = BR*1.19;
  [[1],[9,2],[10,8,3],[11,4,12,5],[13,6,14,7,15]].forEach((row,ri) =>
    row.forEach((id,ci) => balls.push({id, x:cx+ri*dx, y:cy+(ci-(row.length-1)/2)*dy*2, vx:0, vy:0, pocketed:false}))
  );
  balls.push({id:0, x:TW*0.25, y:cy, vx:0, vy:0, pocketed:false});
  return balls;
}


function stepPhysics(
  balls: Ball[], sparks: Spark[],
  pottedCb:(id:number)=>void, firstHitCb:(id:number)=>void, shakeCb:(n:number)=>void
): boolean {
  let moving = false;
  const cue = balls.find(b=>b.id===0&&!b.pocketed);

  // tick sparks
  for (let i=sparks.length-1;i>=0;i--) {
    const s=sparks[i]; s.x+=s.vx; s.y+=s.vy; s.vx*=0.93; s.vy*=0.93; s.life--;
    if(s.life<=0) sparks.splice(i,1);
  }

  for (let step=0; step<SUB; step++) {
    const active = balls.filter(b=>!b.pocketed);
    for (const b of active) {
      b.x += b.vx/SUB; b.y += b.vy/SUB;
      // Geometric wall bounce — skips bounce if the ball is inside the literal pocket gaps
      let f=0, bounced=false;
      const gapC = 37, gapM = 30; // Matches visual cushion cutouts C=35, M=28
      
      if (b.y < RAIL+BR) {
        if (!(b.x < gapC || (b.x > TW/2 - gapM && b.x < TW/2 + gapM) || b.x > TW - gapC)) {
          b.y = RAIL+BR; f = Math.abs(b.vy); b.vy = f*WALL_REST; bounced=true;
        }
      }
      if (b.y > TH-RAIL-BR) {
        if (!(b.x < gapC || (b.x > TW/2 - gapM && b.x < TW/2 + gapM) || b.x > TW - gapC)) {
          b.y = TH-RAIL-BR; f = Math.abs(b.vy); b.vy = -f*WALL_REST; bounced=true;
        }
      }
      if (b.x < RAIL+BR) {
        if (!(b.y < gapC || b.y > TH - gapC)) {
          b.x = RAIL+BR; f = Math.abs(b.vx); b.vx = f*WALL_REST; bounced=true;
        }
      }
      if (b.x > TW-RAIL-BR) {
        if (!(b.y < gapC || b.y > TH - gapC)) {
          b.x = TW-RAIL-BR; f = Math.abs(b.vx); b.vx = -f*WALL_REST; bounced=true;
        }
      }
      if(bounced&&step===0&&f>2){playPoolSound('cushion',Math.min(1,f/14));if(f>10)shakeCb(f*0.1);}
    }
    // Ball-ball collisions
    for (let i=0;i<active.length;i++) for (let j=i+1;j<active.length;j++) {
      const a=active[i], b=active[j];
      const dx=b.x-a.x, dy=b.y-a.y, d2=dx*dx+dy*dy, min=BR*2.02;
      if(d2<min*min && d2>0.001) {
        const d=Math.sqrt(d2), nx=dx/d, ny=dy/d, ov=(min-d)/2;
        a.x-=ov*nx; a.y-=ov*ny; b.x+=ov*nx; b.y+=ov*ny;
        const dvx=a.vx-b.vx, dvy=a.vy-b.vy, dot=dvx*nx+dvy*ny;
        if(dot>0){
          const imp=dot*BALL_REST;
          a.vx-=imp*nx; a.vy-=imp*ny; b.vx+=imp*nx; b.vy+=imp*ny;
          if(step===0 && dot>1){ playPoolSound('ball-hit',Math.min(1,dot/18)); if(dot>12) shakeCb(dot*0.12); }
          if(step===0 && dot>14){
            const cx=a.x+nx*BR, cy=a.y+ny*BR;
            for(let k=0;k<5;k++) sparks.push({x:cx,y:cy,vx:(Math.random()-.5)*6,vy:(Math.random()-.5)*6,life:14,maxLife:14,r:1.5,color:'#fff'});
          }
          if(cue){if(a.id===0&&b.id!==0) firstHitCb(b.id); if(b.id===0&&a.id!==0) firstHitCb(a.id);}
        }
      }
    }
    // Pocket detection
    for (const b of active) {
      for (const p of POCKETS) {
        if(Math.hypot(b.x-p.x,b.y-p.y)<PD){
          b.pocketed=true; b.vx=0; b.vy=0; pottedCb(b.id); playPoolSound('pocket');
          // Dramatic multi-ring sparkle burst
          const ballCol=BALL_COLORS[b.id]||'#fff';
          const cols=[ballCol,'#ffffff','#ffffaa','#ffd700',ballCol];
          for(let k=0;k<35;k++){
            const spd=2+Math.random()*8, ang=Math.random()*Math.PI*2;
            sparks.push({x:p.x,y:p.y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,
              life:30+Math.random()*20,maxLife:50,r:1+Math.random()*2.5,
              color:cols[Math.floor(Math.random()*cols.length)]});
          }
          // Ring pulse ΓÇö 6 evenly-spaced slower outer sparks
          for(let k=0;k<8;k++){
            const ang=(k/8)*Math.PI*2;
            sparks.push({x:p.x,y:p.y,vx:Math.cos(ang)*3.5,vy:Math.sin(ang)*3.5,
              life:40,maxLife:40,r:3,color:'#ffd700'});
          }
          break;
        }
      }
    }
  }
  for (const b of balls) {
    if(b.pocketed) continue;
    b.vx*=FRICTION; b.vy*=FRICTION;
    if(Math.abs(b.vx)<VEL_THRESH) b.vx=0; if(Math.abs(b.vy)<VEL_THRESH) b.vy=0;
    if(b.vx||b.vy){ moving=true; b.rot=((b.rot||0)+Math.hypot(b.vx,b.vy)*0.045)%(Math.PI*2); }
  }
  return moving || sparks.length>0;
}

function shade(hex:string, p:number){
  let r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  r=Math.max(0,Math.min(255,Math.trunc(r*(100+p)/100)));
  g=Math.max(0,Math.min(255,Math.trunc(g*(100+p)/100)));
  b=Math.max(0,Math.min(255,Math.trunc(b*(100+p)/100)));
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}

function drawScene(
  ctx:CanvasRenderingContext2D, balls:Ball[], sparks:Spark[],
  angle:number, power:number, showAim:boolean, bih:boolean,
  ghost:{x:number;y:number}|null, strikeOff:number, shake:number,
  targetBallIds?:number[]
){
  // Camera shake
  ctx.save();
  if(shake>0){ ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake); }

  ctx.clearRect(-10,-10,TW+20,TH+20);

  // Felt
  const felt=ctx.createRadialGradient(TW/2,TH/2,0,TW/2,TH/2,Math.max(TW,TH)*0.9);
  felt.addColorStop(0,'#2c8cc4'); felt.addColorStop(0.6,'#175a80'); felt.addColorStop(1,'#0c3650');
  ctx.fillStyle=felt; ctx.fillRect(0,0,TW,TH);

  // Felt micro-grain (batched, very fast)
  ctx.fillStyle='rgba(255,255,255,0.012)';
  for(let x=0;x<TW;x+=14) for(let y=0;y<TH;y+=14){ ctx.fillRect(x+(y%2)*7,y,1,1); }

  // Head string
  ctx.setLineDash([5,5]); ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(TW*.25,14); ctx.lineTo(TW*.25,TH-14); ctx.stroke();
  ctx.setLineDash([]);

  // Spots
  ctx.fillStyle='rgba(255,255,255,0.22)';
  [[TW*.65,TH/2],[TW*.25,TH/2]].forEach(([sx,sy])=>{ ctx.beginPath(); ctx.arc(sx,sy,3,0,Math.PI*2); ctx.fill(); });

  // Cushion rails - Uniform color
  const railColor = '#104462'; // Slightly darker than the mid-felt to look like a raised cushion
  const C=35, M=28;
  const poly = (pts: number[][]) => {
    ctx.fillStyle=railColor; ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
    ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=1; ctx.stroke();
  };
  poly([[C,0], [TW/2-M,0], [TW/2-M+RAIL,RAIL], [C+RAIL,RAIL]]);          // TL
  poly([[TW/2+M,0], [TW-C,0], [TW-C-RAIL,RAIL], [TW/2+M-RAIL,RAIL]]);    // TR
  poly([[C,TH], [TW/2-M,TH], [TW/2-M+RAIL,TH-RAIL], [C+RAIL,TH-RAIL]]);  // BL
  poly([[TW/2+M,TH], [TW-C,TH], [TW-C-RAIL,TH-RAIL], [TW/2+M-RAIL,TH-RAIL]]); // BR
  poly([[0,C], [0,TH-C], [RAIL,TH-C-RAIL], [RAIL,C+RAIL]]);             // L
  poly([[TW,C], [TW,TH-C], [TW-RAIL,TH-C-RAIL], [TW-RAIL,C+RAIL]]);    // R

  // 3-D pocket tunnels
  POCKETS.forEach(p=>{
    const outer=ctx.createRadialGradient(p.x,p.y,PR*0.5,p.x,p.y,PR+8);
    outer.addColorStop(0,'rgba(0,0,0,1)'); outer.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=outer; ctx.beginPath(); ctx.arc(p.x,p.y,PR+8,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#180a01'; ctx.beginPath(); ctx.arc(p.x,p.y,PR+4,0,Math.PI*2); ctx.fill();
    const tunnel=ctx.createRadialGradient(p.x-PR*.3,p.y-PR*.3,1,p.x,p.y,PR+3);
    tunnel.addColorStop(0,'rgba(90,50,10,0.5)'); tunnel.addColorStop(0.5,'rgba(0,0,0,0.92)'); tunnel.addColorStop(1,'#000');
    ctx.fillStyle=tunnel; ctx.beginPath(); ctx.arc(p.x,p.y,PR+3,0,Math.PI*2); ctx.fill();
    const rim=ctx.createLinearGradient(p.x-PR,p.y-PR,p.x+PR,p.y+PR);
    rim.addColorStop(0,'rgba(210,165,70,0.9)'); rim.addColorStop(0.45,'rgba(50,30,5,0.7)'); rim.addColorStop(1,'rgba(110,75,20,0.5)');
    ctx.strokeStyle=rim; ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(p.x,p.y,PR+1,0,Math.PI*2); ctx.stroke();
  });

  // BIH ghost
  const cue=balls.find(b=>b.id===0&&!b.pocketed);
  if(bih && ghost){
    ctx.globalAlpha=0.45; ctx.fillStyle=BALL_COLORS[0]; ctx.beginPath(); ctx.arc(ghost.x,ghost.y,BR,0,Math.PI*2); ctx.fill();
    ctx.setLineDash([4,4]); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(ghost.x,ghost.y,BR+3,0,Math.PI*2); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha=1;
  }

  // Aim guide ΓÇö dashed ghost line
  if(showAim && !bih && cue && strikeOff===0){
    const sdx=Math.cos(angle+Math.PI), sdy=Math.sin(angle+Math.PI);
    let lx=cue.x, ly=cue.y, len=0, hitGhost:{x:number,y:number}|null=null;
    const st=2, mx=(TW+TH)/st;
    for(let s=0;s<mx;s++){
      lx+=sdx*st; ly+=sdy*st;
      if(lx<RAIL+BR||lx>TW-RAIL-BR||ly<RAIL+BR||ly>TH-RAIL-BR){len=s*st; break;}
      const hit=balls.find(b=>!b.pocketed&&b.id!==0&&Math.hypot(b.x-lx,b.y-ly)<BR*2);
      if(hit){len=s*st; hitGhost={x:lx-sdx*st,y:ly-sdy*st}; break;}
      len=s*st;
    }
    // Shadow
    ctx.setLineDash([8,6]); ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(cue.x,cue.y); ctx.lineTo(cue.x+sdx*len,cue.y+sdy*len); ctx.stroke();
    // White dashed core
    ctx.strokeStyle='rgba(255,255,255,0.88)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(cue.x,cue.y); ctx.lineTo(cue.x+sdx*len,cue.y+sdy*len); ctx.stroke();
    ctx.setLineDash([]);
    // Ghost cue ball at impact
    if(hitGhost){
      ctx.globalAlpha=0.3; ctx.strokeStyle='#fff'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(hitGhost.x,hitGhost.y,BR,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=0.12; ctx.fillStyle='#fff'; ctx.fill(); ctx.globalAlpha=1;
    }
  }

  // Sparks with glow (draw twice: soft large glow + crisp core)
  ctx.save();
  sparks.forEach(s=>{
    const t=s.life/s.maxLife;
    // Soft outer glow
    ctx.globalAlpha=t*0.35;
    ctx.fillStyle=s.color;
    ctx.beginPath(); ctx.arc(s.x,s.y,s.r*3,0,Math.PI*2); ctx.fill();
    // Crisp core
    ctx.globalAlpha=t*0.95;
    ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha=1; ctx.restore();

  // Draw balls — 3-D rolling effect
  const time=Date.now();
  balls.forEach(b=>{
    if(b.pocketed) return;
    const col=BALL_COLORS[b.id]||'#888', stripe=b.id>=9;
    const rot=b.rot||0;
    const spd=Math.hypot(b.vx,b.vy);
    // specular offset drifts opposite velocity direction
    const sox=-BR*.33-Math.cos(rot)*BR*.16;
    const soy=-BR*.33-Math.sin(rot)*BR*.16;
    ctx.save(); ctx.translate(b.x,b.y);
    // 3-D contact shadow
    ctx.fillStyle='rgba(0,0,0,0.36)'; ctx.beginPath(); ctx.ellipse(3,BR*0.65,BR*0.88,BR*0.32,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,BR,0,Math.PI*2); ctx.clip();
    if(stripe){
      ctx.fillStyle='#F4F2EC'; ctx.fillRect(-BR,-BR,BR*2,BR*2);
      ctx.save(); ctx.rotate(rot); // stripe rotates with ball
      ctx.fillStyle=col; ctx.fillRect(-BR,-BR*0.52,BR*2,BR*1.04);
      ctx.restore();
      const shd=ctx.createRadialGradient(-BR*.35,-BR*.35,0,0,0,BR*1.15); shd.addColorStop(0,'rgba(255,255,255,0.06)'); shd.addColorStop(0.5,'rgba(0,0,0,0.18)'); shd.addColorStop(1,'rgba(0,0,0,0.72)');
      ctx.fillStyle=shd; ctx.fillRect(-BR,-BR,BR*2,BR*2);
    } else {
      const bg=ctx.createRadialGradient(-BR*.38,-BR*.38,0,0,0,BR); bg.addColorStop(0,shade(col,40)); bg.addColorStop(0.5,shade(col,8)); bg.addColorStop(0.85,col); bg.addColorStop(1,'#000');
      ctx.fillStyle=bg; ctx.fillRect(-BR,-BR,BR*2,BR*2);
    }
    // Rolling equator line (visible when moving)
    if(spd>0.6){
      const ea=Math.atan2(b.vy,b.vx)+Math.PI/2;
      ctx.save(); ctx.rotate(ea);
      ctx.beginPath(); ctx.ellipse(0,Math.sin(rot)*BR*.5,Math.abs(Math.cos(rot))*BR+0.5,BR*.11,0,0,Math.PI*2);
      ctx.fillStyle=stripe?'rgba(0,0,0,0.17)':'rgba(0,0,0,0.2)'; ctx.fill();
      ctx.restore();
    }
    // Number disc
    if(b.id!==0){
      const nr=stripe?BR*.46:BR*.42;
      const nd=ctx.createRadialGradient(0,0,0,0,0,nr);
      nd.addColorStop(0,'rgba(255,255,255,0.98)'); nd.addColorStop(1,'rgba(220,220,220,0.93)');
      ctx.fillStyle=nd; ctx.beginPath(); ctx.arc(0,0,nr,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=stripe?col:'#111'; ctx.font=`bold ${b.id<10?8:7}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(String(b.id),0,0.5);
    }
    // Moving specular
    ctx.globalAlpha=0.7;
    const sp=ctx.createRadialGradient(sox,soy,0.4,sox,soy,BR*.62); sp.addColorStop(0,'rgba(255,255,255,0.95)'); sp.addColorStop(0.5,'rgba(255,255,255,0.18)'); sp.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=sp; ctx.beginPath(); ctx.arc(0,0,BR,0,Math.PI*2); ctx.fill();
    // Rim darkening
    ctx.globalAlpha=0.42; const rim2=ctx.createRadialGradient(0,0,BR*.6,0,0,BR); rim2.addColorStop(0,'rgba(0,0,0,0)'); rim2.addColorStop(1,'rgba(0,0,0,0.68)');
    ctx.fillStyle=rim2; ctx.fillRect(-BR,-BR,BR*2,BR*2);
    ctx.globalAlpha=1; ctx.restore();
    // Target highlight
    if(targetBallIds&&targetBallIds.includes(b.id)){
      ctx.save(); ctx.translate(b.x,b.y);
      const pulse=1+(Math.sin(time/150)*0.15); ctx.scale(pulse,pulse);
      ctx.beginPath(); ctx.arc(0,0,BR+4,0,Math.PI*2);
      ctx.strokeStyle=`rgba(239,68,68,${0.45+Math.sin(time/150)*0.3})`; ctx.lineWidth=2.5; ctx.stroke();
      ctx.globalAlpha=0.12; ctx.fillStyle='#ef4444'; ctx.fill(); ctx.globalAlpha=1;
      ctx.restore();
    }
  });

  // Cue stick
  if(showAim && !bih && cue){
    const pb=(28+power*0.42)-strikeOff;
    ctx.save(); ctx.translate(cue.x,cue.y); ctx.rotate(angle);
    const tx=BR+pb, bx=tx+360;
    const g=ctx.createLinearGradient(tx,0,bx,0);
    g.addColorStop(0,'#4a90e2'); g.addColorStop(0.01,'#d4b06a'); g.addColorStop(0.4,'#e8ca80'); g.addColorStop(0.6,'#1a1a1a'); g.addColorStop(0.88,'#111'); g.addColorStop(1,'#3e1a08');
    const vg=ctx.createLinearGradient(0,-4,0,4); vg.addColorStop(0,'rgba(255,255,255,0.28)'); vg.addColorStop(0.5,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.45)');
    ctx.beginPath(); ctx.moveTo(tx,-1.5); ctx.lineTo(tx+55,-3.2); ctx.lineTo(bx,-5); ctx.lineTo(bx,5); ctx.lineTo(tx+55,3.2); ctx.lineTo(tx,1.5); ctx.closePath();
    ctx.fillStyle=g; ctx.fill(); ctx.fillStyle=vg; ctx.fill();
    ctx.restore();
  }

  ctx.restore(); // end shake
}

// Smarter bot: Considers cut angles, target-to-pocket blocked paths, and prefers easier shots
function findBotShot(balls:Ball[], grp:'solids'|'stripes'|null){
  const cue=balls.find(b=>b.id===0&&!b.pocketed); if(!cue) return null;
  // Determine which balls to target
  const myBalls=grp
    ? balls.filter(b=>!b.pocketed&&((grp==='solids'&&b.id>=1&&b.id<=7)||(grp==='stripes'&&b.id>=9&&b.id<=15)))
    : balls.filter(b=>!b.pocketed&&b.id!==0&&b.id!==8);
  const targets=myBalls.length>0?myBalls:(grp&&myBalls.length===0
    ? balls.filter(b=>b.id===8&&!b.pocketed)
    : balls.filter(b=>!b.pocketed&&b.id!==0&&b.id!==8)
  );
  if(!targets.length) return null;

  let best:{angle:number;power:number;score:number}|null=null;

  for(const target of targets){
    for(const pocket of POCKETS){
      const tpd=Math.hypot(pocket.x-target.x,pocket.y-target.y);
      if(tpd<1) continue;
      const tpnx=(pocket.x-target.x)/tpd, tpny=(pocket.y-target.y)/tpd;
      
      // Ghost ball position: cue hits target toward pocket
      const ghostX=target.x-tpnx*(BR*2.02), ghostY=target.y-tpny*(BR*2.02);
      
      // Direction cue must travel
      const cgd=Math.hypot(ghostX-cue.x,ghostY-cue.y);
      if(cgd<1) continue;
      const angle=Math.atan2(ghostY-cue.y,ghostX-cue.x);
      
      // Calculate Cut Angle: Difference between Cue path and Target path
      const cutAngle = Math.abs(Math.atan2(tpny, tpnx) - angle);
      let normCut = cutAngle % (Math.PI*2);
      if(normCut > Math.PI) normCut = Math.PI*2 - normCut;
      
      // Max cut angle is roughly ~81 degrees. Very hard to hit if close to 90
      if(normCut > Math.PI/2.2) continue; // Physically impossible or too thin

      // Ray-Sphere intersection helper
      const isBlocked = (start:{x:number, y:number}, end:{x:number, y:number}, dirDist:number, ignoreIds:number[]) => {
        return balls.some(b => {
          if(b.pocketed || ignoreIds.includes(b.id)) return false;
          const t2 = (b.x-start.x)*(end.x-start.x) + (b.y-start.y)*(end.y-start.y);
          const t = t2 / (dirDist*dirDist);
          if(t<0 || t>1.02) return false;
          const px = start.x + t*(end.x-start.x), py = start.y + t*(end.y-start.y);
          return Math.hypot(b.x-px,b.y-py) < BR*2.05;
        });
      };

      // Penalise if cue path is blocked
      const cueBlocked = isBlocked(cue, {x:ghostX, y:ghostY}, cgd, [0, target.id]);
      // Penalise if path from target to pocket is blocked
      const targetBlocked = isBlocked(target, pocket, tpd, [target.id]);

      let score = 0;
      if (cueBlocked || targetBlocked) score -= 2000;
      
      // Score: Prefer shorter cue travel, shorter target travel, straight cuts
      score -= (cgd * 0.4); 
      score -= (tpd * 0.5); 
      score -= Math.pow(normCut * 300, 1.2); // Extremely heavy penalty for thin angles

      // Scratch risk: penalty if straight on
      if (normCut < 0.05) score -= 150; 

      if(!best||score>best.score){
        const power=Math.min(95, 35 + cgd*0.04 + tpd*0.06 + normCut*25);
        best={angle,power,score};
      }
    }
  }

  // Backup Safety Play: If NO clear pocket shot exists, find any legal unblocked ball to hit to prevent a foul
  if (best && best.score < -1000) {
    for(const target of targets){
       const cgd=Math.hypot(target.x-cue.x,target.y-cue.y);
       const angle=Math.atan2(target.y-cue.y,target.x-cue.x);
       const tDirX=(target.x-cue.x)/cgd, tDirY=(target.y-cue.y)/cgd;
       
       // Aim for a slightly glancing blow
       const safeAngle = angle + (Math.random()>0.5?0.15:-0.15);
       
       const isBlocked = balls.some(b => {
          if(b.pocketed || b.id===0 || b.id===target.id) return false;
          const t2 = (b.x-cue.x)*(target.x-cue.x) + (b.y-cue.y)*(target.y-cue.y);
          const t = t2 / (cgd*cgd);
          if(t<0 || t>1) return false;
          const px = cue.x + t*(target.x-cue.x), py = cue.y + t*(target.y-cue.y);
          return Math.hypot(b.x-px,b.y-py) < BR*2.1;
       });
       
       if (!isBlocked) {
         return { angle: safeAngle, power: 25 + Math.random()*15 }; // Gentle hit
       }
    }
  }

  if(!best) return null;
  // Tiny aim jitter for realism
  const jitter=(Math.random()-.5)*0.02;
  return {angle:best.angle+jitter, power:best.power};
}

export const PoolGame: React.FC<PoolGameProps> = ({table,user,onGameEnd,socket,socketGame}) => {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const ballsRef=useRef<Ball[]>(buildRack());
  const sparksRef=useRef<Spark[]>([]);
  const animRef=useRef<number|null>(null);
  const pottedRef=useRef<number[]>([]);
  const fhRef=useRef<number|null>(null), fhLocked=useRef(false);

  const players=socketGame?.players||[], roomId=(socketGame as any)?.roomId||(socketGame as any)?.id||'';
  const myId=user.id, oppId=players.find(p=>p!==myId)||'';
  const isP2P=Boolean(players.length>=2&&oppId&&socket&&roomId);
  const iAmP1=players[0]===myId;
  const initTurn=isP2P?(players[0]||myId):myId;

  const [balls,setBalls]=useState<Ball[]>(ballsRef.current);
  const [moving,setMoving]=useState(false);
  const [myGroup,setMyGroup]=useState<'solids'|'stripes'|null>(null);
  const [botGroup,setBotGroup]=useState<'solids'|'stripes'|null>(null);
  const [msg,setMsg]=useState('');
  const [bih,setBih]=useState(false);
  const [forfeit,setForfeit]=useState(false);
  const [ghost,setGhost]=useState<{x:number;y:number}|null>(null);
  const [turnId,setTurnId]=useState(initTurn);
  const [angle,setAngle]=useState(Math.PI);
  const [power,setPower]=useState(0);
  const [strikeOff,setStrikeOff]=useState(0);
  const [shake,setShake]=useState(0);
  const [portrait,setPortrait]=useState(false);
  const [countdown,setCountdown]=useState(TURN_TIME);
  // pocketFlash removed ΓÇö sparkles now drawn on canvas

  const drag=useRef(false), dragStart=useRef<{x:number;y:number}|null>(null);

  const isMyTurn=turnId===myId, isBot=!isP2P&&turnId==='bot';
  const myGrRef=useRef(myGroup); myGrRef.current=myGroup;
  const bgRef=useRef(botGroup); bgRef.current=botGroup;
  const movRef=useRef(moving); movRef.current=moving;
  const bihRef=useRef(bih); bihRef.current=bih;
  const turnRef=useRef(turnId); turnRef.current=turnId;

  const name2=(id:string)=>isP2P?((socketGame as any)?.profiles?.[id]?.name||'Opponent'):'Bot ≡ƒñû';
  const av2=(id:string)=>isP2P?((socketGame as any)?.profiles?.[id]?.avatar||`https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`):`https://api.dicebear.com/7.x/bottts/svg?seed=katika_bot`;

  // Orientation
  useEffect(()=>{
    const fn=()=>setPortrait(window.innerHeight>window.innerWidth);
    window.addEventListener('resize',fn); fn();
    return ()=>window.removeEventListener('resize',fn);
  },[]);

  // Init
  useEffect(()=>{
    if(isP2P&&socketGame){
      const gs=(socketGame as any).gameState;
      // Only apply server balls if they have geometry (initial server state is geometry-less)
      if(gs?.balls&&gs.balls[0]?.x!==undefined){ballsRef.current=gs.balls;setBalls([...gs.balls]);}
      const st=gs?.turn||players[0]||myId; setTurnId(st);
      setMsg(st===myId?'🎱 Your Break!':`⏳ ${name2(oppId)}'s Break`);
    } else setMsg('🎱 Your Break! Hold & drag to aim');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // P2P socket
  useEffect(()=>{
    if(!socket||!isP2P) return;
    const h=(data:any)=>{
      if(data.roomId!==roomId&&data.id!==roomId) return;
      const gs=data.gameState; if(!gs) return;
      if(gs.balls){ballsRef.current=gs.balls as Ball[];setBalls([...gs.balls]);}
      if(gs.turn){setTurnId(gs.turn as string);setCountdown(TURN_TIME);}
      const k=iAmP1?'myGroupP1':'myGroupP2'; if(gs[k]) setMyGroup(gs[k] as 'solids'|'stripes');
      if(gs.ballInHand&&gs.turn===myId) setBih(true);
      if(gs.message) setMsg(gs.message);
    };
    socket.on('game_update',h); return ()=>{socket.off('game_update',h);};
  },[socket,isP2P,roomId,myId,iAmP1]);

  // Countdown timer
  useEffect(()=>{
    if(!isP2P||moving||!isMyTurn) return;
    if(countdown<=0){
      // Time up ΓÇö forfeit this turn
      setMsg('ΓÅ░ Time up! Forfeited turn.');
      if(socket&&roomId) socket.emit('game_action',{roomId,action:{type:'FORFEIT'}});
      onGameEnd('loss'); return;
    }
    const t=setTimeout(()=>setCountdown(c=>c-1),1000);
    return ()=>clearTimeout(t);
  },[isP2P,moving,isMyTurn,countdown,socket,roomId]);

  // Reset countdown on turn change
  useEffect(()=>{setCountdown(TURN_TIME);},[turnId]);

  const send=(nextTurn:string,gBih:boolean,myGrp:'solids'|'stripes'|null,oppGrp:'solids'|'stripes'|null)=>{
    if(!socket||!roomId) return;
    // Send BOTH groups so each client can update their own assignment
    socket.emit('game_action',{roomId,action:{type:'MOVE',newState:{
      balls:ballsRef.current, turn:nextTurn, ballInHand:gBih,
      myGroupP1: iAmP1 ? myGrp : oppGrp,
      myGroupP2: iAmP1 ? oppGrp : myGrp,
    }}});
  };

  // Physics loop — no React re-renders in hot path
  const shakeRef=useRef(0);
  const runPhysics=useCallback(()=>{
    const m=stepPhysics(
      ballsRef.current, sparksRef.current,
      id=>{pottedRef.current.push(id);},
      id=>{ if(!fhLocked.current){fhRef.current=id;fhLocked.current=true;} },
      n=>{ shakeRef.current=Math.min(7,shakeRef.current+n); }
    );
    shakeRef.current=shakeRef.current>0.4?shakeRef.current*0.82:0;
    if(m){ animRef.current=requestAnimationFrame(runPhysics); }
    else { setBalls([...ballsRef.current]); setMoving(false); handleTurnEnd(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const startPhysics=useCallback(()=>{
    pottedRef.current=[]; fhRef.current=null; fhLocked.current=false;
    setMoving(true); animRef.current=requestAnimationFrame(runPhysics);
  },[runPhysics]);

  useEffect(()=>()=>{if(animRef.current) cancelAnimationFrame(animRef.current);},[]);

  const endGame=(r:'win'|'loss',m:string)=>{
    setMsg(m);
    if(isP2P&&socket&&roomId) socket.emit('game_action',{roomId,action:{type:'MOVE',newState:{winner:r==='win'?myId:oppId,balls:ballsRef.current}}});
    setTimeout(()=>onGameEnd(r),3000);
  };

  const handleTurnEnd=()=>{
    const pot=pottedRef.current, cuePot=pot.includes(0), eightPot=pot.includes(8);
    const fh=fhRef.current, botShot=turnRef.current==='bot';
    const actGrp=botShot?bgRef.current:myGrRef.current;

    if(eightPot){
      playSFX(cuePot?'loss':'win');
      if(botShot){
        if(cuePot){endGame('win','≡ƒÄ▒ Bot scratched on 8! You win!');return;}
        const bl=ballsRef.current.filter(b=>!b.pocketed&&b.id!==0&&b.id!==8&&((bgRef.current==='solids'&&b.id<8)||(bgRef.current==='stripes'&&b.id>8)));
        endGame(bl.length===0&&bgRef.current?'loss':'win', bl.length===0&&bgRef.current?'Γ¼¢ Bot sinks 8! You lose.':'Bot early 8! You win!'); return;
      } else {
        if(cuePot){endGame('loss','≡ƒÿ¼ Scratched on 8! You lose.');return;}
        const ml=ballsRef.current.filter(b=>!b.pocketed&&b.id!==0&&b.id!==8&&((myGrRef.current==='solids'&&b.id<8)||(myGrRef.current==='stripes'&&b.id>8)));
        endGame(ml.length===0&&myGrRef.current?'win':'loss',ml.length===0&&myGrRef.current?'≡ƒÄ▒ 8-ball sunk! You win!':'8-ball sunk early! You lose.'); return;
      }
    }

    let foul=false, fr='';
    if(cuePot){foul=true;fr='Scratch!';}
    else if(fh===null){foul=true;fr='No ball contacted!';}
    else if(actGrp){
      if(actGrp==='solids'&&fh>8){foul=true;fr='Hit opponent ball first!';}
      if(actGrp==='stripes'&&fh<8&&fh!==0){foul=true;fr='Hit opponent ball first!';}
    } else if(fh===8){foul=true;fr='Cannot hit 8 on open table!';}

    if(foul) playSFX('error');
    if(cuePot){const c=ballsRef.current.find(b=>b.id===0)!; c.pocketed=false;c.x=TW*.25;c.y=TH/2;c.vx=0;c.vy=0;}

    let nmg=myGrRef.current, nbg=bgRef.current;
    if(!foul&&!botShot&&!nmg){const fl=pot.find(id=>id!==0&&id!==8); if(fl!==undefined){nmg=fl<8?'solids':'stripes';nbg=nmg==='solids'?'stripes':'solids';setMyGroup(nmg);setBotGroup(nbg);}}
    if(!foul&&botShot&&!nbg){const fl=pot.find(id=>id!==0&&id!==8); if(fl!==undefined){nbg=fl<8?'solids':'stripes';nmg=nbg==='solids'?'stripes':'solids';setBotGroup(nbg);setMyGroup(nmg);}}

    const validPot=pot.some(id=>{ if(id===0||id===8) return false; const g=botShot?nbg:nmg; return !g||(g==='solids'&&id<8)||(g==='stripes'&&id>8); });
    const keep=validPot&&!foul;
    const nextP2P=keep?myId:oppId, nextBot=keep?(botShot?'bot':myId):(botShot?myId:'bot');
    const next=isP2P?nextP2P:nextBot;

    if(foul) setMsg(`ΓÜá∩╕Å FOUL: ${fr}`);
    else if(keep) setMsg(botShot?`${name2(oppId)} continues...`:'Γ£à Good shot! Continue...');
    else {playSFX('turn'); setMsg(next===myId?'≡ƒÄ▒ Your turn!':`${name2(oppId)}'s turn`);}

    const oppBih=foul&&!keep, humBih=foul&&botShot;
    if(!isP2P){if(humBih) setBih(true);}
    else {
      const myGrp=myGrRef.current, oppGrp=myGrp==='solids'?'stripes':myGrp?'solids':null;
      if(oppBih&&next===myId) setBih(true);
      send(next,oppBih,myGrp,oppGrp);
    }
    setTurnId(next);
    if(!isP2P&&next==='bot') setTimeout(()=>botShot && humBih?execBot(true,nbg):execBot(false,nbg), 900+Math.random()*700);
  };

  const execBot=(hasBih:boolean,bg:'solids'|'stripes'|null)=>{
    const c=ballsRef.current.find(b=>b.id===0); if(!c) return;
    if(hasBih){c.pocketed=false;c.x=TW*.3+Math.random()*TW*.1;c.y=TH*.3+Math.random()*TH*.4;c.vx=0;c.vy=0;setBalls([...ballsRef.current]);}
    const shot=findBotShot(ballsRef.current,bg);
    if(!shot){c.vx=20;c.vy=(Math.random()-.5)*4;playPoolSound('cue-hit',1);startPhysics();return;}
    
    // Smooth Aim Animation
    const currentAngle = angleRef.current;
    let diff = shot.angle - currentAngle;
    while(diff < -Math.PI) diff += Math.PI*2;
    while(diff > Math.PI) diff -= Math.PI*2;
    
    let f=0; const steps=45; // ~500ms aiming
    const aimIv = setInterval(()=>{
      f++;
      setAngle(currentAngle + diff * (f/steps));
      if(f>=steps){
        clearInterval(aimIv);
        // Smooth Power Pullback
        let pf=0; const psteps=25; // ~300ms pullback
        const pbIv = setInterval(()=>{
          pf++;
          setPower(shot.power * (pf/psteps));
          if(pf>=psteps){
            clearInterval(pbIv);
            animStrike(shot.angle,shot.power);
          }
        }, 12);
      }
    }, 12);
  };

  const animStrike=(a:number,p:number)=>{
    let f=0; const tot=8;
    const iv=setInterval(()=>{
      f++; setStrikeOff((p*.42+28)*(f/tot));
      if(f>=tot){
        clearInterval(iv); setStrikeOff(0); setPower(0);
        const c=ballsRef.current.find(b=>b.id===0);
        if(c&&!c.pocketed){c.vx=Math.cos(a+Math.PI)*(p*.3);c.vy=Math.sin(a+Math.PI)*(p*.3);playPoolSound('cue-hit',p/100);startPhysics();}
      }
    },12);
  };

  const getPos=(e:React.MouseEvent|React.TouchEvent)=>{
    const c=canvasRef.current; if(!c) return {x:0,y:0};
    const r=c.getBoundingClientRect();
    let cx,cy;
    if('touches' in e&&e.touches.length>0){cx=e.touches[0].clientX;cy=e.touches[0].clientY;}
    else{cx=(e as React.MouseEvent).clientX;cy=(e as React.MouseEvent).clientY;}
    if(portrait){
      const rx=cx-r.left, ry=cy-r.top;
      return {x:ry*(TW/r.height), y:(r.width-rx)*(TH/r.width)};
    }
    return {x:(cx-r.left)*(TW/r.width), y:(cy-r.top)*(TH/r.height)};
  };

  const onDown=(e:React.MouseEvent|React.TouchEvent)=>{
    if(!isMyTurn||movRef.current) return;
    const pos=getPos(e);
    if(bihRef.current){
      const ok=!ballsRef.current.some(b=>b.id!==0&&!b.pocketed&&Math.hypot(b.x-pos.x,b.y-pos.y)<BR*2.1);
      if(ok&&pos.x>RAIL+BR&&pos.x<TW-RAIL-BR&&pos.y>RAIL+BR&&pos.y<TH-RAIL-BR){
        const c=ballsRef.current.find(b=>b.id===0)!; c.pocketed=false;c.x=pos.x;c.y=pos.y;c.vx=0;c.vy=0;
        setBalls([...ballsRef.current]); setBih(false); bihRef.current=false; playSFX('click'); setMsg('≡ƒÄ▒ Take your shot!');
      }
      return;
    }
    drag.current=true; dragStart.current=pos; setStrikeOff(0);
  };

  const onMove=(e:React.MouseEvent|React.TouchEvent)=>{
    if(!isMyTurn||movRef.current) return;
    const pos=getPos(e);
    const c=ballsRef.current.find(b=>b.id===0&&!b.pocketed);
    if(c) setAngle(Math.atan2(pos.y-c.y,pos.x-c.x));
    if(bihRef.current){setGhost(pos);return;}
    if(drag.current&&dragStart.current) setPower(Math.min(100,Math.hypot(pos.x-dragStart.current.x,pos.y-dragStart.current.y)/1.3));
  };

  const onUp=()=>{
    if(!isMyTurn||movRef.current||bihRef.current) return;
    if(drag.current&&power>3) animStrike(angle,power);
    drag.current=false;
  };

  // Persistent render loop — reads from refs, avoids React re-renders
  const angleRef=useRef(angle); angleRef.current=angle;
  const powerRef=useRef(power); powerRef.current=power;
  const bihRef2=useRef(bih); bihRef2.current=bih;
  const ghostRef=useRef(ghost); ghostRef.current=ghost;
  const strikeOffRef=useRef(strikeOff); strikeOffRef.current=strikeOff;
  const myGroupRef2=useRef(myGroup); myGroupRef2.current=myGroup;
  const isMyTurnRef=useRef(isMyTurn); isMyTurnRef.current=isMyTurn;
  const isBotRef=useRef(isBot); isBotRef.current=isBot;
  const movingRef2=useRef(moving); movingRef2.current=moving;
  const renderRaf=useRef<number|null>(null);

  useEffect(()=>{
    const cv=canvasRef.current; if(!cv) return;
    const ctx=cv.getContext('2d'); if(!ctx) return;
    const loop=()=>{
      const mt=isMyTurnRef.current, ib=isBotRef.current, mv=movingRef2.current;
      const grp=myGroupRef2.current;
      const tids=mt&&!mv
        ?(grp==='solids'?[1,2,3,4,5,6,7]:grp==='stripes'?[9,10,11,12,13,14,15]:[1,2,3,4,5,6,7,9,10,11,12,13,14,15])
          .filter(id=>!ballsRef.current.find(b=>b.id===id)?.pocketed)
        :[];
      const targetBallIds=(tids.length===0&&grp)?[8]:tids;
      drawScene(ctx,ballsRef.current,sparksRef.current,angleRef.current,powerRef.current,(mt||ib)&&!mv,bihRef2.current,ghostRef.current,strikeOffRef.current,shakeRef.current,targetBallIds);
      renderRaf.current=requestAnimationFrame(loop);
    };
    loop();
    return ()=>{ if(renderRaf.current) cancelAnimationFrame(renderRaf.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const myPot=myGroup?balls.filter(b=>b.pocketed&&b.id!==0&&b.id!==8&&((myGroup==='solids'&&b.id<8)||(myGroup==='stripes'&&b.id>8))).length:0;
  const oppPot=myGroup?balls.filter(b=>b.pocketed&&b.id!==0&&b.id!==8&&((myGroup==='solids'&&b.id>8)||(myGroup==='stripes'&&b.id<8))).length:0;

  // Compute scale so table fills screen properly in both orientations
  const [pScale,setPScale]=useState(1);
  const [lScale,setLScale]=useState(1);
  useEffect(()=>{
    const upd=()=>{
      if(portrait) setPScale(Math.min(window.innerWidth/TH,(window.innerHeight-108)/TW)*0.97);
      else setLScale(Math.min((window.innerWidth-40)/TW,(window.innerHeight-108)/TH)*0.97);
    };
    upd(); window.addEventListener('resize',upd); return ()=>window.removeEventListener('resize',upd);
  },[portrait]);

  const countdownUrgent=isP2P&&isMyTurn&&!moving&&countdown<=10;

  return (
    <div style={{width:'100vw',height:'100dvh',overflow:'hidden',background:'#0a1218',display:'flex',flexDirection:'column'}} className="select-none">

        {/* Forfeit Modal */}
        <AnimatePresence>
          {forfeit&&(
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={()=>setForfeit(false)}/>
              <motion.div initial={{scale:.9,y:20}} animate={{scale:1,y:0}} exit={{scale:.9,opacity:0}} className="relative z-10 bg-[#1c2a35] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm">
                <div className="flex flex-col items-center text-center mb-5">
                  <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mb-3"><AlertTriangle className="text-red-400" size={26}/></div>
                  <h2 className="text-xl font-bold text-white">Forfeit Match?</h2>
                  <p className="text-sm text-slate-400 mt-1">This counts as a loss.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={()=>setForfeit(false)} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl border border-white/10 transition-colors">Stay</button>
                  <button onClick={()=>{if(isP2P&&socket&&roomId) socket.emit('game_action',{roomId,action:{type:'FORFEIT'}});onGameEnd('quit');}} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-colors">Forfeit</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* HUD */}
        <div className="w-full flex items-center gap-2 px-3 py-2 bg-black/50 border-b border-white/5 flex-shrink-0">
          <button onClick={()=>setForfeit(true)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 flex-shrink-0"><ArrowLeft size={15}/></button>

          {/* My plate */}
          <div className={`flex items-center gap-2 flex-1 min-w-0 p-2 rounded-xl border transition-all duration-300 ${isMyTurn?'border-emerald-500/60 bg-emerald-900/20':'border-white/8 bg-white/3'}`}>
            <div className="relative flex-shrink-0">
              <img src={user.avatar||`https://api.dicebear.com/7.x/avataaars/svg?seed=${myId}`} alt="" className="w-9 h-9 rounded-full border-2 border-emerald-500/70"/>
              {isMyTurn&&<span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-black animate-pulse"/>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-xs truncate">{user.name}</p>
              <div className="flex gap-0.5 mt-0.5 flex-wrap">
                {myGroup?Array.from({length:7}).map((_,i)=>{const bid=myGroup==='solids'?i+1:i+9,pk=balls.find(b=>b.id===bid)?.pocketed;return(<motion.div key={bid} className="w-3 h-3 rounded-full" animate={pk?{scale:[1.4,1]}:{}} style={{backgroundColor:pk?BALL_COLORS[bid]:'transparent',border:pk?'none':'1px solid #334155'}}/>);}): <span className="text-[9px] text-slate-500">Open table</span>}
              </div>
            </div>
            <div className="text-xl font-black font-mono text-white flex-shrink-0">{myPot}</div>
          </div>

          {/* Center */}
          <div className="flex flex-col items-center flex-shrink-0 px-2 gap-0.5">
            <div className="text-[8px] text-yellow-400 font-black uppercase tracking-widest">Pot</div>
            <div className="text-xs font-mono font-bold text-white">≡ƒÆ░{(table.stake*2).toLocaleString()}</div>
            {isP2P&&isMyTurn&&!moving&&(
              <motion.div animate={countdownUrgent?{scale:[1,1.1,1]}:{}} transition={{repeat:Infinity,duration:.5}} className={`flex items-center gap-1 text-[10px] font-mono font-black ${countdown<=10?'text-red-400':'text-slate-300'}`}>
                <Clock size={9}/>{countdown}s
              </motion.div>
            )}
          </div>

          {/* Opp plate */}
          <div className={`flex items-center gap-2 flex-1 min-w-0 flex-row-reverse p-2 rounded-xl border transition-all duration-300 ${(!isMyTurn&&!isBot)?'border-red-500/60 bg-red-900/20':isBot?'border-orange-500/60 bg-orange-900/20':'border-white/8 bg-white/3'}`}>
            <div className="relative flex-shrink-0">
              <img src={av2(oppId)} alt="" className="w-9 h-9 rounded-full border-2 border-red-500/70"/>
              {(!isMyTurn&&!isBot||isBot)&&<span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-red-400 rounded-full border-2 border-black animate-pulse"/>}
            </div>
            <div className="flex-1 min-w-0 text-right">
              <p className="text-white font-bold text-xs truncate">{name2(oppId)}</p>
              <div className="flex gap-0.5 mt-0.5 flex-wrap justify-end">
                {myGroup?Array.from({length:7}).map((_,i)=>{const bid=myGroup==='stripes'?i+1:i+9,pk=balls.find(b=>b.id===bid)?.pocketed;return(<motion.div key={bid} className="w-3 h-3 rounded-full" animate={pk?{scale:[1.4,1]}:{}} style={{backgroundColor:pk?BALL_COLORS[bid]:'transparent',border:pk?'none':'1px solid #334155'}}/>);}): <span className="text-[9px] text-slate-500">Waiting</span>}
              </div>
            </div>
            <div className="text-xl font-black font-mono text-white flex-shrink-0">{oppPot}</div>
          </div>
        </div>

        {/* Status + Power */}
        <div className="w-full px-3 py-1.5 flex flex-col gap-1 flex-shrink-0">
          <div className={`text-center text-xs font-bold py-1 px-4 rounded-full border mx-auto max-w-xs ${isMyTurn?'bg-emerald-900/30 border-emerald-500/30 text-emerald-300':isBot?'bg-orange-900/30 border-orange-500/30 text-orange-300':'bg-slate-900/50 border-white/10 text-slate-400'}`}>
            {msg||'ΓÇª'}{moving&&<span className="ml-2 animate-pulse text-slate-500">ΓùÅΓùÅ</span>}
          </div>
          {power>2&&isMyTurn&&(
            <div className="flex items-center gap-2 mx-auto w-full max-w-xs px-2">
              <span className="text-[9px] text-slate-400 w-10">FORCE</span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-800">
                <motion.div className="h-full rounded-full" style={{width:`${power}%`,background:power>75?'#ef4444':power>45?'#f59e0b':'#22c55e'}} animate={{opacity:[0.8,1,0.8]}} transition={{repeat:Infinity,duration:.6}}/>
              </div>
              <span className="text-[9px] font-mono text-white w-8 text-right">{Math.round(power)}%</span>
            </div>
          )}
        </div>

        {/* Table — fills remaining space; portrait: rotated canvas, landscape: centered scale */}
        <div className="flex-1 flex items-center justify-center min-h-0 overflow-hidden" style={{padding: portrait?'2px':'8px'}}>
          <div style={portrait ? {
            position:'relative', width:TW, height:TH, flexShrink:0,
            transform:`rotate(90deg) scale(${pScale})`,
            transformOrigin:'center',
          } : {
            position:'relative', width:TW, height:TH, flexShrink:0,
            transform:`scale(${lScale})`,
            transformOrigin:'center',
          }}>
            {/* Premium Mahogany Rail Frame */}
            <div className="absolute inset-0 rounded-xl" style={{
              background:'linear-gradient(145deg,#7a3e10 0%,#4a2008 18%,#2d1005 40%,#4a2008 72%,#7a3e10 100%)',
              boxShadow:'0 30px 70px rgba(0,0,0,.95), 0 0 0 1px rgba(255,180,80,0.12), inset 0 0 0 20px #3a1a07, inset 0 0 0 21px rgba(0,0,0,0.6), inset 0 1px 8px 21px rgba(0,0,0,.9)'
            }}>
              {/* Wood grain highlight */}
              <div className="absolute inset-0 rounded-xl" style={{boxShadow:'inset 0 1px 0 rgba(220,160,70,0.25), inset 0 -1px 0 rgba(0,0,0,0.7), inset 1px 0 0 rgba(180,120,50,0.15), inset -1px 0 0 rgba(0,0,0,0.5)'}} />
              {/* Horizontal wood grain lines */}
              {[20,40,60,80].map(p=>(<div key={p} className="absolute" style={{top:`${p}%`,left:'4%',right:'4%',height:'1px',background:'rgba(0,0,0,0.18)'}}/>))}
                {/* Diamonds top ΓÇö now diamond-shaped rotated squares */}
                {[25,37.5,50,62.5,75].map(pct=>(
                  <div key={pct} className="absolute w-2.5 h-2.5" style={{top:'4px',left:`${pct}%`,transform:'translateX(-50%) rotate(45deg)',background:'linear-gradient(135deg,#d4a84b,#8a6020)',boxShadow:'0 0 4px rgba(200,140,40,0.6)'}}/>
                ))}
                {/* Diamonds bottom */}
                {[25,37.5,50,62.5,75].map(pct=>(
                  <div key={pct} className="absolute w-2.5 h-2.5" style={{bottom:'4px',left:`${pct}%`,transform:'translateX(-50%) rotate(45deg)',background:'linear-gradient(135deg,#d4a84b,#8a6020)',boxShadow:'0 0 4px rgba(200,140,40,0.6)'}}/>
                ))}
                {/* Diamonds left */}
                {[33,67].map(pct=>(
                  <div key={pct} className="absolute w-2.5 h-2.5" style={{left:'4px',top:`${pct}%`,transform:'translateY(-50%) rotate(45deg)',background:'linear-gradient(135deg,#d4a84b,#8a6020)',boxShadow:'0 0 4px rgba(200,140,40,0.6)'}}/>
                ))}
                {/* Diamonds right */}
                {[33,67].map(pct=>(
                  <div key={pct} className="absolute w-2.5 h-2.5" style={{right:'4px',top:`${pct}%`,transform:'translateY(-50%) rotate(45deg)',background:'linear-gradient(135deg,#d4a84b,#8a6020)',boxShadow:'0 0 4px rgba(200,140,40,0.6)'}}/>
                ))}
              {/* Canvas inset */}
              <div className="absolute rounded-lg overflow-hidden" style={{inset:'20px',boxShadow:'inset 0 0 40px 10px rgba(0,0,0,.8)'}}>
                <canvas ref={canvasRef} width={TW} height={TH}
                  className="w-full h-full block touch-none"
                  style={{cursor:isMyTurn&&!moving?'crosshair':'default'}}
                  onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
                  onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}/>
              </div>{/* canvas inset */}
            </div>{/* frame */}

            {/* Overlays */}
            {(!isMyTurn&&!isBot&&!moving&&isP2P)&&(
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-black/60 backdrop-blur rounded-full px-5 py-2 flex gap-2 items-center">
                  {[0,150,300].map(d=><div key={d} className="w-2.5 h-2.5 rounded-full bg-red-400 animate-bounce" style={{animationDelay:`${d}ms`}}/>)}
                  <span className="text-sm font-bold text-white ml-1">{name2(oppId)}'s turn</span>
                </div>
              </div>
            )}
            {isBot&&!moving&&(
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-black/60 backdrop-blur rounded-full px-5 py-2 flex gap-2 items-center">
                  {[0,150,300].map(d=><div key={d} className="w-2.5 h-2.5 rounded-full bg-orange-400 animate-bounce" style={{animationDelay:`${d}ms`}}/>)}
                  <span className="text-sm font-bold text-white ml-1">🤖 Planning shot...</span>
                </div>
              </div>
            )}
            {bih&&isMyTurn&&(
              <div className="absolute inset-0 flex items-end justify-center pointer-events-none pb-4">
                <motion.div animate={{opacity:[.65,1,.65]}} transition={{repeat:Infinity,duration:1.4}} className="bg-blue-900/80 border border-blue-400/50 rounded-full px-5 py-1.5 text-blue-200 text-sm font-bold">
                  🖐 Tap anywhere to place ball
                </motion.div>
              </div>
            )}
          </div>{/* portrait/landscape wrapper */}
        </div>{/* table flex container */}
    </div>
  );
};
