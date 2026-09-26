  const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const hdr=document.getElementById('hdr');
  addEventListener('scroll',()=>hdr.classList.toggle('scrolled',scrollY>20));

  // mobile menu toggle
  (function(){
    const btn=document.getElementById('menuBtn');
    const nav=document.getElementById('navLinks');
    if(!btn||!nav)return;
    function closeMenu(){
      nav.classList.remove('open');
      btn.setAttribute('aria-expanded','false');
      nav.setAttribute('aria-hidden','true');
    }
    function openMenu(){
      nav.classList.add('open');
      btn.setAttribute('aria-expanded','true');
      nav.setAttribute('aria-hidden','false');
    }
    btn.addEventListener('click',()=>{
      nav.classList.contains('open')?closeMenu():openMenu();
    });
    nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
    document.addEventListener('click',e=>{
      if(nav.classList.contains('open')&&!nav.contains(e.target)&&!btn.contains(e.target))closeMenu();
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
    addEventListener('resize',()=>{if(innerWidth>960)closeMenu();});
  })();

  // reveal
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{threshold:.15});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

  // live dashboard demo — animates connect -> biometrics -> readiness -> performance -> AI analysis, then loops
  (function(){
    const root=document.getElementById('liveDash');
    if(!root)return;
    const CIRC=264;
    const nums=[...root.querySelectorAll('.num')];
    const statusEl=root.querySelector('#dStatus');
    const ring=root.querySelector('#readyRing');
    const readyPct=root.querySelector('#readyPct');
    const alertsEl=root.querySelector('#dAlerts');
    const aiEl=root.querySelector('#dAI');
    const AI_PLACEHOLDER='AI analysis will appear here after session completes…';
    const AI_TEXT='Cognitive readiness is optimal for complex tasks. Focus and performance are strong, with manageable stress levels.';
    const ALERTS=[
      ['14:08:18','Connected to session ABC123. Waiting for astronaut…'],
      ['14:08:20','Biometrics stream initialized.'],
      ['14:09:12','Mental math protocol started (Easy tier).'],
      ['14:11:47','Session complete. Compiling analysis…']
    ];

    function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

    function animateNum(el,to,decimals,dur){
      if(reduce){el.textContent=decimals?to.toFixed(decimals):Math.round(to);return;}
      let s=null;
      function step(t){
        if(!s)s=t;
        const p=Math.min((t-s)/(dur||900),1);
        const v=to*(1-Math.pow(1-p,3));
        el.textContent=decimals?v.toFixed(decimals):Math.round(v);
        if(p<1)requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
    function animateRingPct(to,dur){
      if(reduce){readyPct.textContent=to+'%';return;}
      let s=null;
      function step(t){
        if(!s)s=t;
        const p=Math.min((t-s)/(dur||1200),1);
        readyPct.textContent=Math.round(to*(1-Math.pow(1-p,3)))+'%';
        if(p<1)requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
    function addAlert(ts,msg){
      const d=document.createElement('div');
      d.className='dalert';
      d.innerHTML='<span class="ts">['+ts+']</span>'+msg;
      alertsEl.appendChild(d);
    }
    function resetDash(){
      nums.forEach(n=>{const dec=n.dataset.decimals?+n.dataset.decimals:0;n.textContent=dec?(0).toFixed(dec):'0';});
      root.querySelectorAll('.fill').forEach(f=>f.style.width='0%');
      ring.style.strokeDashoffset=CIRC;
      readyPct.textContent='0%';
      statusEl.classList.remove('active');statusEl.classList.add('waiting');
      statusEl.innerHTML='<span class="sdot"></span>Waiting';
      alertsEl.innerHTML='';
      aiEl.textContent=AI_PLACEHOLDER;
      aiEl.classList.remove('ready');
    }
    function setFinalState(){
      nums.forEach(n=>{const dec=n.dataset.decimals?+n.dataset.decimals:0;n.textContent=dec?(+n.dataset.target).toFixed(dec):n.dataset.target;});
      root.querySelectorAll('.fill').forEach(f=>f.style.width=f.dataset.target+'%');
      ring.style.strokeDashoffset=CIRC*(1-.72);
      readyPct.textContent='72%';
      statusEl.classList.remove('waiting');statusEl.classList.add('active');
      statusEl.innerHTML='<span class="sdot"></span>Active';
      alertsEl.innerHTML='';
      ALERTS.forEach(([ts,msg])=>addAlert(ts,msg));
      aiEl.textContent=AI_TEXT;
      aiEl.classList.add('ready');
    }

    if(reduce){ setFinalState(); return; }

    let stopped=true, running=false;
    async function sequence(){
      if(running)return;
      running=true;
      while(!stopped){
        resetDash();
        await sleep(900); if(stopped)break;

        statusEl.classList.remove('waiting');statusEl.classList.add('active');
        statusEl.innerHTML='<span class="sdot"></span>Active';
        root.querySelectorAll('.dbio .num').forEach(n=>{
          const dec=n.dataset.decimals?+n.dataset.decimals:0;
          animateNum(n,+n.dataset.target,dec);
        });
        addAlert(...ALERTS[0]);
        await sleep(650); if(stopped)break;

        addAlert(...ALERTS[1]);
        await sleep(900); if(stopped)break;

        ring.style.strokeDashoffset=CIRC*(1-.72);
        animateRingPct(72,1200);
        root.querySelectorAll('.dready-bars .fill').forEach(f=>f.style.width=f.dataset.target+'%');
        root.querySelectorAll('.dready-bars .num').forEach(n=>animateNum(n,+n.dataset.target,0,1100));
        await sleep(650); if(stopped)break;

        addAlert(...ALERTS[2]);
        await sleep(900); if(stopped)break;

        root.querySelectorAll('.dgrid2 .fill').forEach(f=>f.style.width=f.dataset.target+'%');
        root.querySelectorAll('.dperf-row .num').forEach(n=>animateNum(n,+n.dataset.target,0,1000));
        await sleep(700); if(stopped)break;

        addAlert(...ALERTS[3]);
        await sleep(900); if(stopped)break;

        aiEl.classList.add('ready');
        aiEl.textContent=AI_TEXT;
        await sleep(5500);
      }
      running=false;
    }

    const dashObs=new IntersectionObserver(es=>es.forEach(e=>{
      if(e.isIntersecting){stopped=false;sequence();}
      else{stopped=true;}
    }),{threshold:.25});
    dashObs.observe(root);
  })();

  // app phone mockup — cycles through Calibration -> Connect Wearable -> Protocol screens
  (function(){
    const frame=document.querySelector('.phone-frame');
    const scr=[...document.querySelectorAll('.app-screen')];
    if(!frame||!scr.length||reduce)return;
    let idx=0,timer=null,active=false;
    function tick(){
      scr[idx].classList.remove('active');
      idx=(idx+1)%scr.length;
      scr[idx].classList.add('active');
    }
    function start(){if(active)return;active=true;timer=setInterval(tick,3400);}
    function stop(){active=false;clearInterval(timer);}
    new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting?start():stop()),{threshold:.25}).observe(frame);
  })();
