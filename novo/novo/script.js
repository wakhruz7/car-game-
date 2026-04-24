// ===== SCENE =====
var scene    = new THREE.Scene();
var camera   = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 2000);
var renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("c"), antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
scene.fog = new THREE.Fog(0x0a0a14, 100, 350);

// ===== AUDIO =====
var ac = new (window.AudioContext || window.webkitAudioContext)();
var engineOsc, engineGain;

function startEngine() {
  try {
    engineOsc  = ac.createOscillator();
    engineGain = ac.createGain();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.setValueAtTime(60, ac.currentTime);
    engineGain.gain.setValueAtTime(0.04, ac.currentTime);
    engineOsc.connect(engineGain);
    engineGain.connect(ac.destination);
    engineOsc.start();
  } catch(e) {}
}

function updateEngineSound(speed, rpm) {
  if (!engineOsc) return;
  try {
    engineOsc.frequency.setTargetAtTime(60 + rpm * 180, ac.currentTime, 0.1);
    engineGain.gain.setTargetAtTime(speed > 2 ? 0.06 : 0.02, ac.currentTime, 0.1);
  } catch(e) {}
}

function playShift() {
  try {
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(300, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(150, ac.currentTime + 0.1);
    g.gain.setValueAtTime(0.08, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 0.1);
  } catch(e) {}
}

function playCheckpoint() {
  try {
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(880, ac.currentTime);
    o.frequency.setValueAtTime(1100, ac.currentTime + 0.1);
    g.gain.setValueAtTime(0.15, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 0.25);
  } catch(e) {}
}

// ===== LIGHTING =====
scene.add(new THREE.AmbientLight(0x334466, 1.4));

var sun = new THREE.DirectionalLight(0xfff5e0, 2.2);
sun.position.set(80, 120, 60);
sun.castShadow = true;
sun.shadow.mapSize.width  = 4096;
sun.shadow.mapSize.height = 4096;
sun.shadow.camera.near = 1;
sun.shadow.camera.far  = 600;
sun.shadow.camera.left = sun.shadow.camera.bottom = -180;
sun.shadow.camera.right = sun.shadow.camera.top  =  180;
scene.add(sun);

var fillLight = new THREE.DirectionalLight(0x4466aa, 0.7);
fillLight.position.set(-60, 30, -80);
scene.add(fillLight);

var carHL = new THREE.PointLight(0xffffaa, 2.5, 25);
scene.add(carHL);

// ===== TRACK =====
var RAW_PTS = [
  [0,0],[35,-5],[70,-18],[110,-12],[145,5],
  [165,28],[162,58],[148,84],[125,102],
  [95,112],[62,108],[35,96],[14,76],
  [-6,52],[-14,28],[-10,8]
];
var trackCurve = new THREE.CatmullRomCurve3(
  RAW_PTS.map(function(p){ return new THREE.Vector3(p[0],0,p[1]); }), true
);
var TRACK_W = 16;
var NSEG    = 300;

// Checkpoints for lap detection
var CHECKPOINTS = [0, 0.25, 0.5, 0.75];
var nextCheckpoint = 0;

(function buildTrack() {
  // Road mesh
  var pts=[], uvs=[], idx=[];
  for (var i=0; i<=NSEG; i++) {
    var t    = i/NSEG;
    var pt   = trackCurve.getPoint(t);
    var tang = trackCurve.getTangent(t).normalize();
    var right= new THREE.Vector3(-tang.z,0,tang.x);
    var L=pt.clone().addScaledVector(right,-TRACK_W/2);
    var R=pt.clone().addScaledVector(right, TRACK_W/2);
    L.y=0.05; R.y=0.05;
    pts.push(L.x,L.y,L.z, R.x,R.y,R.z);
    var u=i/NSEG*30; uvs.push(0,u,1,u);
    if(i<NSEG){var b=i*2; idx.push(b,b+1,b+2,b+1,b+3,b+2);}
  }
  var geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(pts,3));
  geo.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  geo.setIndex(idx); geo.computeVertexNormals();
  var road=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color:0x1c1c1c}));
  road.receiveShadow=true; scene.add(road);

  // Center dashes
  for(var j=0;j<NSEG;j+=5){
    var t2=j/NSEG;
    var pt2=trackCurve.getPoint(t2);
    var tang2=trackCurve.getTangent(t2).normalize();
    var ang2=Math.atan2(tang2.x,tang2.z);
    var dm=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.02,2.8),
      new THREE.MeshLambertMaterial({color:0xdddddd}));
    dm.position.set(pt2.x,0.07,pt2.z); dm.rotation.y=ang2; scene.add(dm);
  }

  // Curbs
  for(var k=0;k<=NSEG;k++){
    var tk=k/NSEG;
    var ptk=trackCurve.getPoint(tk);
    var tangk=trackCurve.getTangent(tk).normalize();
    var rightk=new THREE.Vector3(-tangk.z,0,tangk.x);
    var cCol=(Math.floor(k/3)%2===0)?0xff2200:0xffffff;
    [-1,1].forEach(function(side){
      var cp=ptk.clone().addScaledVector(rightk,side*(TRACK_W/2+0.7));
      cp.y=0.14;
      var cm=new THREE.Mesh(new THREE.BoxGeometry(1.0,0.22,1.0),
        new THREE.MeshLambertMaterial({color:cCol}));
      cm.position.copy(cp); scene.add(cm);
    });
  }

  // Barriers
  for(var b2=0;b2<NSEG;b2+=3){
    var tb=b2/NSEG;
    var ptb=trackCurve.getPoint(tb);
    var tangb=trackCurve.getTangent(tb).normalize();
    var rightb=new THREE.Vector3(-tangb.z,0,tangb.x);
    var angb=Math.atan2(tangb.x,tangb.z);
    [-1,1].forEach(function(side){
      var bp=ptb.clone().addScaledVector(rightb,side*(TRACK_W/2+2.0));
      bp.y=0.6;
      var col=side===1?0x2244cc:0xcc2222;
      var bm=new THREE.Mesh(new THREE.BoxGeometry(1.0,1.2,1.8),
        new THREE.MeshLambertMaterial({color:col}));
      bm.position.copy(bp); bm.rotation.y=angb; scene.add(bm);
    });
  }

  // Ground
  var gnd=new THREE.Mesh(new THREE.PlaneGeometry(800,800),
    new THREE.MeshLambertMaterial({color:0x1a3310}));
  gnd.rotation.x=-Math.PI/2; gnd.receiveShadow=true; scene.add(gnd);

  // Grandstands
  [[80,118],[120,115],[40,115]].forEach(function(p){
    var gs=new THREE.Mesh(new THREE.BoxGeometry(24,10,5),
      new THREE.MeshLambertMaterial({color:0x334466}));
    gs.position.set(p[0],5,p[1]); scene.add(gs);
    // seats
    var sm=new THREE.Mesh(new THREE.BoxGeometry(22,0.3,3),
      new THREE.MeshLambertMaterial({color:0xff2200}));
    sm.position.set(p[0],10.2,p[1]); scene.add(sm);
  });

  // Start/Finish line
  var sf=new THREE.Mesh(new THREE.BoxGeometry(TRACK_W,0.06,1.2),
    new THREE.MeshLambertMaterial({color:0xffffff}));
  sf.position.set(0,0.08,0); scene.add(sf);
  // Checkered pattern
  for(var ci=0;ci<8;ci++){
    for(var cj=0;cj<2;cj++){
      if((ci+cj)%2===1){
        var cb=new THREE.Mesh(new THREE.BoxGeometry(TRACK_W/8,0.07,0.6),
          new THREE.MeshLambertMaterial({color:0x000000}));
        cb.position.set(-TRACK_W/2+TRACK_W/16+ci*(TRACK_W/8),0.09,(cj===0?-0.3:0.3));
        scene.add(cb);
      }
    }
  }

  // Pit lane sign
  var sign=new THREE.Mesh(new THREE.BoxGeometry(3,2,0.2),
    new THREE.MeshLambertMaterial({color:0xffcc00}));
  sign.position.set(-5,3,5); scene.add(sign);

  // Trees
  for(var t3=0;t3<1;t3+=0.04){
    var pt3=trackCurve.getPoint(t3);
    var tang3=trackCurve.getTangent(t3).normalize();
    var right3=new THREE.Vector3(-tang3.z,0,tang3.x);
    [-1,1].forEach(function(side){
      var off=TRACK_W/2+6+Math.random()*12;
      var tp=pt3.clone().addScaledVector(right3,side*off);
      addTree(tp.x,tp.z);
    });
  }

  // Lamp posts
  for(var lp=0;lp<NSEG;lp+=20){
    var tlp=lp/NSEG;
    var plp=trackCurve.getPoint(tlp);
    var tanglp=trackCurve.getTangent(tlp).normalize();
    var rightlp=new THREE.Vector3(-tanglp.z,0,tanglp.x);
    [-1].forEach(function(side){
      var lpos=plp.clone().addScaledVector(rightlp,side*(TRACK_W/2+3));
      var pole=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.12,8,8),
        new THREE.MeshLambertMaterial({color:0x666666}));
      pole.position.set(lpos.x,4,lpos.z); scene.add(pole);
      var lamp=new THREE.Mesh(new THREE.SphereGeometry(0.3,8,8),
        new THREE.MeshLambertMaterial({color:0xffffcc,emissive:0xffffcc,emissiveIntensity:0.8}));
      lamp.position.set(lpos.x,8.2,lpos.z); scene.add(lamp);
      var pl2=new THREE.PointLight(0xffffcc,0.8,20);
      pl2.position.set(lpos.x,8,lpos.z); scene.add(pl2);
    });
  }
})();

function addTree(x,z){
  var h=4+Math.random()*5;
  var trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.28,h*0.4,6),
    new THREE.MeshLambertMaterial({color:0x5c3a1e}));
  trunk.position.set(x,h*0.2,z); scene.add(trunk);
  var top=new THREE.Mesh(new THREE.ConeGeometry(1.5+Math.random()*0.8,h*0.7,7),
    new THREE.MeshLambertMaterial({color:0x1a5c1a}));
  top.position.set(x,h*0.65,z); scene.add(top);
}

// ===== SKY =====
(function(){
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(900,16,8),
    new THREE.MeshBasicMaterial({color:0x070714,side:THREE.BackSide})));
  var sp=[];
  for(var i=0;i<2000;i++) sp.push((Math.random()-0.5)*1600,50+Math.random()*400,(Math.random()-0.5)*1600);
  var sg=new THREE.BufferGeometry();
  sg.setAttribute("position",new THREE.Float32BufferAttribute(sp,3));
  scene.add(new THREE.Points(sg,new THREE.PointsMaterial({color:0xffffff,size:0.6})));

  // Moon
  var moon=new THREE.Mesh(new THREE.SphereGeometry(15,16,16),
    new THREE.MeshBasicMaterial({color:0xeeeedd}));
  moon.position.set(200,300,-400); scene.add(moon);
})();

// ===== MODERN CAR =====
var car=new THREE.Group();
scene.add(car);

(function buildCar(){
  var body  = new THREE.MeshLambertMaterial({color:0xff2200});
  var dark  = new THREE.MeshLambertMaterial({color:0x0d0d0d});
  var glass = new THREE.MeshLambertMaterial({color:0x88ccff,transparent:true,opacity:0.35});
  var chrome= new THREE.MeshLambertMaterial({color:0xcccccc});
  var light = new THREE.MeshLambertMaterial({color:0xffffaa,emissive:0xffffaa,emissiveIntensity:1});
  var tail  = new THREE.MeshLambertMaterial({color:0xff0000,emissive:0xff0000,emissiveIntensity:1});
  var brake = new THREE.MeshLambertMaterial({color:0xff3300});

  // Lower body
  var lb=new THREE.Mesh(new THREE.BoxGeometry(2.1,0.32,4.8),body);
  lb.position.y=0.42; lb.castShadow=true; car.add(lb);

  // Upper body
  var ub=new THREE.Mesh(new THREE.BoxGeometry(1.78,0.26,3.4),body);
  ub.position.set(0,0.74,-0.1); ub.castShadow=true; car.add(ub);

  // Roof
  var rf=new THREE.Mesh(new THREE.BoxGeometry(1.52,0.2,1.9),body);
  rf.position.set(0,1.02,-0.18); rf.castShadow=true; car.add(rf);

  // Hood slope
  var hood=new THREE.Mesh(new THREE.BoxGeometry(1.92,0.07,1.6),body);
  hood.position.set(0,0.62,1.5); hood.rotation.x=0.07; car.add(hood);

  // Hood scoop
  var scoop=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.1,0.6),dark);
  scoop.position.set(0,0.7,1.2); car.add(scoop);

  // Trunk
  var trunk=new THREE.Mesh(new THREE.BoxGeometry(1.92,0.07,0.9),body);
  trunk.position.set(0,0.62,-1.92); trunk.rotation.x=-0.05; car.add(trunk);

  // Windshield
  var ws=new THREE.Mesh(new THREE.BoxGeometry(1.44,0.5,0.08),glass);
  ws.position.set(0,0.88,0.78); ws.rotation.x=-0.38; car.add(ws);

  // Rear glass
  var rg=new THREE.Mesh(new THREE.BoxGeometry(1.44,0.4,0.08),glass);
  rg.position.set(0,0.88,-1.1); rg.rotation.x=0.38; car.add(rg);

  // Side windows
  [-0.89,0.89].forEach(function(x){
    var sw=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.3,1.3),glass);
    sw.position.set(x,0.9,-0.16); car.add(sw);
  });

  // Front bumper
  var fb=new THREE.Mesh(new THREE.BoxGeometry(2.12,0.26,0.24),dark);
  fb.position.set(0,0.3,2.42); car.add(fb);

  // Front splitter
  var fs=new THREE.Mesh(new THREE.BoxGeometry(1.9,0.06,0.38),dark);
  fs.position.set(0,0.18,2.4); car.add(fs);

  // Front grille
  var grille=new THREE.Mesh(new THREE.BoxGeometry(1.3,0.24,0.07),dark);
  grille.position.set(0,0.44,2.43); car.add(grille);
  for(var gi=0;gi<5;gi++){
    var gs=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.03,0.06),chrome);
    gs.position.set(0,0.3+gi*0.05,2.44); car.add(gs);
  }

  // Rear bumper
  var rb=new THREE.Mesh(new THREE.BoxGeometry(2.12,0.26,0.24),dark);
  rb.position.set(0,0.3,-2.42); car.add(rb);

  // Diffuser
  var diff=new THREE.Mesh(new THREE.BoxGeometry(1.7,0.12,0.32),dark);
  diff.position.set(0,0.18,-2.4); diff.rotation.x=0.28; car.add(diff);

  // Spoiler
  var sw2=new THREE.Mesh(new THREE.BoxGeometry(1.95,0.08,0.5),dark);
  sw2.position.set(0,1.26,-2.1); car.add(sw2);
  [-0.75,0.75].forEach(function(x){
    var sp2=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.42,0.18),dark);
    sp2.position.set(x,1.0,-2.1); car.add(sp2);
  });

  // Side skirts
  [-1.06,1.06].forEach(function(x){
    var sk=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.16,4.0),dark);
    sk.position.set(x,0.22,0); car.add(sk);
  });

  // Headlights (modern LED style)
  [-0.65,0.65].forEach(function(x){
    var hl=new THREE.Mesh(new THREE.BoxGeometry(0.46,0.16,0.08),light);
    hl.position.set(x,0.52,2.43); car.add(hl);
    var drl=new THREE.Mesh(new THREE.BoxGeometry(0.46,0.04,0.07),light);
    drl.position.set(x,0.66,2.43); car.add(drl);
    var pl=new THREE.PointLight(0xffffcc,1.5,22);
    pl.position.set(x,0.52,2.7); car.add(pl);
  });

  // Tail lights (full width LED strip)
  var tlstrip=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.06,0.07),tail);
  tlstrip.position.set(0,0.6,-2.43); car.add(tlstrip);
  [-0.68,0.68].forEach(function(x){
    var tl=new THREE.Mesh(new THREE.BoxGeometry(0.36,0.18,0.07),tail);
    tl.position.set(x,0.48,-2.43); car.add(tl);
  });

  // Exhaust (quad tips)
  [-0.36,-0.14,0.14,0.36].forEach(function(x){
    var ep=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.28,10),chrome);
    ep.rotation.x=Math.PI/2; ep.position.set(x,0.2,-2.44); car.add(ep);
  });

  // Side mirrors
  [-1.08,1.08].forEach(function(x){
    var mir=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.1,0.22),body);
    mir.position.set(x,0.96,0.7); car.add(mir);
  });

  // ===== WHEELS =====
  car.wheelGroups=[];
  var wpos=[
    {x:-1.06,y:0.38,z:1.52,s:true},
    {x: 1.06,y:0.38,z:1.52,s:true},
    {x:-1.06,y:0.38,z:-1.52,s:false},
    {x: 1.06,y:0.38,z:-1.52,s:false},
  ];

  wpos.forEach(function(wp){
    var wg=new THREE.Group();
    wg.position.set(wp.x,wp.y,wp.z);
    wg.isSteerable=wp.s;

    // Tire
    var tire=new THREE.Mesh(
      new THREE.CylinderGeometry(0.4,0.4,0.3,24),
      new THREE.MeshLambertMaterial({color:0x111111})
    );
    tire.rotation.z=Math.PI/2; tire.castShadow=true; wg.add(tire);

    // Tire sidewall text strip
    var sw3=new THREE.Mesh(
      new THREE.TorusGeometry(0.36,0.025,8,24),
      new THREE.MeshLambertMaterial({color:0x333333})
    );
    sw3.rotation.y=Math.PI/2; wg.add(sw3);

    // Rim group (spins)
    var rg2=new THREE.Group();
    rg2.rotation.z=Math.PI/2;
    wg.rimGroup=rg2; wg.add(rg2);

    // Rim face (center)
    var rimFace=new THREE.Mesh(
      new THREE.CylinderGeometry(0.08,0.08,0.32,10),
      new THREE.MeshLambertMaterial({color:0x888888})
    );
    rg2.add(rimFace);

    // 10 spokes (modern multi-spoke)
    for(var si=0;si<10;si++){
      var ang=si/10*Math.PI*2;
      var spoke=new THREE.Mesh(
        new THREE.BoxGeometry(0.055,0.3,0.055),
        new THREE.MeshLambertMaterial({color:0xaaaaaa})
      );
      spoke.position.x=Math.cos(ang)*0.2;
      spoke.position.z=Math.sin(ang)*0.2;
      spoke.rotation.y=-ang;
      rg2.add(spoke);
    }

    // Rim outer ring
    var rring=new THREE.Mesh(
      new THREE.TorusGeometry(0.34,0.04,8,24),
      new THREE.MeshLambertMaterial({color:0xbbbbbb})
    );
    rg2.add(rring);

    // Brake disc
    var disc=new THREE.Mesh(
      new THREE.CylinderGeometry(0.3,0.3,0.04,16),
      new THREE.MeshLambertMaterial({color:0x555555})
    );
    disc.rotation.z=Math.PI/2; wg.add(disc);

    // Brake caliper
    var caliper=new THREE.Mesh(
      new THREE.BoxGeometry(0.12,0.16,0.3),brake
    );
    caliper.position.set(wp.x>0?0.2:-0.2,-0.14,0);
    wg.add(caliper);

    car.add(wg);
    car.wheelGroups.push(wg);
  });

  // Suspension arms
  wpos.forEach(function(wp){
    var arm=new THREE.Mesh(
      new THREE.BoxGeometry(0.06,0.06,1.0),
      new THREE.MeshLambertMaterial({color:0x333333})
    );
    arm.position.set(wp.x*0.5,wp.y+0.05,wp.z);
    arm.rotation.z=wp.x>0?-0.18:0.18;
    car.add(arm);
  });

  car.position.set(2,0,1);
})();

// ===== AI CARS =====
var aiCars=[];
function buildAICar(color, startT){
  var g=new THREE.Group();
  var mat=new THREE.MeshLambertMaterial({color:color});
  var dk =new THREE.MeshLambertMaterial({color:0x111111});

  var lb=new THREE.Mesh(new THREE.BoxGeometry(2.0,0.32,4.6),mat);
  lb.position.y=0.42; g.add(lb);
  var ub=new THREE.Mesh(new THREE.BoxGeometry(1.7,0.24,3.2),mat);
  ub.position.set(0,0.72,-0.1); g.add(ub);
  var rf=new THREE.Mesh(new THREE.BoxGeometry(1.45,0.18,1.8),mat);
  rf.position.set(0,0.98,-0.2); g.add(rf);

  // Wheels
  [[-1,0.38,1.4],[1,0.38,1.4],[-1,0.38,-1.4],[1,0.38,-1.4]].forEach(function(w){
    var tw=new THREE.Mesh(new THREE.CylinderGeometry(0.38,0.38,0.28,16),dk);
    tw.rotation.z=Math.PI/2; tw.position.set(w[0],w[1],w[2]); g.add(tw);
  });

  var pt=trackCurve.getPoint(startT);
  g.position.set(pt.x,0,pt.z);

  scene.add(g);
  aiCars.push({mesh:g, t:startT, speed:0.0018+Math.random()*0.0004, number:aiCars.length+2});
  return g;
}

buildAICar(0x0033ff, 0.35);
buildAICar(0x00aa00, 0.6);
buildAICar(0xffcc00, 0.82);

function updateAI(){
  aiCars.forEach(function(ai){
    ai.t=(ai.t+ai.speed)%1;
    var pt=trackCurve.getPoint(ai.t);
    var pt2=trackCurve.getPoint((ai.t+0.01)%1);
    ai.mesh.position.set(pt.x,0,pt.z);
    ai.mesh.rotation.y=Math.atan2(pt2.x-pt.x, pt2.z-pt.z);
  });
}

// ===== PHYSICS STATE =====
var phy={
  x:2, z:1,
  vx:0, vz:0,
  angle:Math.PI,   // <-- start facing correct direction
  speed:0,
  steer:0,
  gear:1,
  prevGear:1,
  rpm:0,
  lap:1,
  lapTime:0,
  bestLap:Infinity,
  totalTime:0,
  wheelRot:0,
  checkpointIdx:0,
  cpPassed:[false,false,false,false],
};

var KEYS={};
var gameActive=false;

function updatePhysics(dt){
  if(!gameActive) return;

  var gas  =KEYS["w"]||KEYS["W"]||KEYS["ArrowUp"];
  var brake=KEYS["s"]||KEYS["S"]||KEYS["ArrowDown"];
  var left =KEYS["a"]||KEYS["A"]||KEYS["ArrowLeft"];
  var right=KEYS["d"]||KEYS["D"]||KEYS["ArrowRight"];
  var hb   =KEYS[" "];

  // Forward vector (car faces +Z when angle=0)
  var sinA=Math.sin(phy.angle), cosA=Math.cos(phy.angle);
  var fwdX=sinA, fwdZ=cosA;

  // Current forward speed (signed)
  var fwdSpd=phy.vx*fwdX + phy.vz*fwdZ;

  // Drive force
  var engineF = gas   ? 32  : 0;
  var brakeF  = brake ? 45  : 0;

  if(gas){
    phy.vx+=fwdX*engineF*dt;
    phy.vz+=fwdZ*engineF*dt;
  }
  if(brake && fwdSpd>0.5){
    phy.vx-=fwdX*brakeF*dt;
    phy.vz-=fwdZ*brakeF*dt;
  }
  // Reverse
  if(brake && fwdSpd<0.5 && !gas){
    phy.vx-=fwdX*12*dt;
    phy.vz-=fwdZ*12*dt;
  }

  // Handbrake
  if(hb){ phy.vx*=0.91; phy.vz*=0.91; }

  // Overall friction
  var friction=hb?0.93:0.978;
  phy.vx*=friction;
  phy.vz*=friction;

  // Lateral grip (stop sideways sliding)
  var latX=cosA, latZ=-sinA;
  var latSpd=phy.vx*latX+phy.vz*latZ;
  var grip=hb?0.55:0.80;
  phy.vx-=latX*latSpd*grip;
  phy.vz-=latZ*latSpd*grip;

  // Speed in km/h
  phy.speed=Math.sqrt(phy.vx*phy.vx+phy.vz*phy.vz)*3.6;

  // Max speed cap: 220 km/h
  var maxV=220/3.6;
  var curV=Math.sqrt(phy.vx*phy.vx+phy.vz*phy.vz);
  if(curV>maxV){ phy.vx=(phy.vx/curV)*maxV; phy.vz=(phy.vz/curV)*maxV; }

  // ===== STEERING — A=left, D=right =====
  var steerInput=0;
  if(left)  steerInput=+1;   // A → turn left (positive angle change)
  if(right) steerInput=-1;   // D → turn right (negative angle change)

  phy.steer+=(steerInput-phy.steer)*9*dt;

  // Steering rate: more speed = less rotation
  var spdRatio=Math.min(1, phy.speed/80);
  var steerRate=2.8*(1-spdRatio*0.65);
  if(hb) steerRate*=1.5;

  if(phy.speed>1){
    var dir=fwdSpd>=0?1:-1;
    phy.angle+=phy.steer*steerRate*dt*dir;
  }

  // Move
  phy.x+=phy.vx*dt;
  phy.z+=phy.vz*dt;

  // Wheel spin
  phy.wheelRot+=curV*dt*2.8;
  car.wheelGroups.forEach(function(wg){
    if(wg.rimGroup) wg.rimGroup.rotation.x=phy.wheelRot;
    if(wg.isSteerable) wg.rotation.y=phy.steer*0.44;
  });

  // Gear
  var spd=phy.speed;
  var g=1;
  if(spd>35) g=2;
  if(spd>65) g=3;
  if(spd>95) g=4;
  if(spd>130) g=5;
  if(spd>165) g=6;
  if(g!==phy.prevGear){ playShift(); phy.prevGear=g; }
  phy.gear=g;
  phy.rpm=Math.min(1,(spd%40)/40+0.08);

  // Engine sound
  updateEngineSound(spd, phy.rpm);

  // Apply to car mesh
  car.position.set(phy.x,0,phy.z);
  car.rotation.y=phy.angle;
  // Body roll
  car.rotation.z=-phy.steer*0.038*(phy.speed/60);

  // Moving headlight
  carHL.position.set(phy.x,2,phy.z);

  // Lap timing
  phy.lapTime+=dt;
  phy.totalTime+=dt;

  // Checkpoint + lap detection
  var sf=Math.sqrt(phy.x*phy.x+phy.z*phy.z);
  if(sf<12 && phy.lapTime>8 && phy.cpPassed[1] && phy.cpPassed[2]){
    playCheckpoint();
    if(phy.bestLap>phy.lapTime) phy.bestLap=phy.lapTime;
    phy.lap++;
    phy.lapTime=0;
    phy.cpPassed=[false,false,false,false];
    if(phy.lap>3){ endRace(); return; }
  }

  // Mid-track checkpoints
  var nearest=trackCurve.getPoint(0.5);
  var d2=Math.sqrt(Math.pow(phy.x-nearest.x,2)+Math.pow(phy.z-nearest.z,2));
  if(d2<15 && !phy.cpPassed[1]){ phy.cpPassed[1]=true; playCheckpoint(); }
  var nearest2=trackCurve.getPoint(0.25);
  var d3=Math.sqrt(Math.pow(phy.x-nearest2.x,2)+Math.pow(phy.z-nearest2.z,2));
  if(d3<15 && !phy.cpPassed[2]){ phy.cpPassed[2]=true; }

  updateHUD();
}

// ===== CAMERA =====
var camPos=new THREE.Vector3(2,4,-8);
var camTgt=new THREE.Vector3();

function updateCamera(){
  var sinA=Math.sin(phy.angle), cosA=Math.cos(phy.angle);
  // Camera behind car
  var desired=new THREE.Vector3(
    phy.x-sinA*9.5,
    4.2,
    phy.z-cosA*9.5
  );
  camPos.lerp(desired,0.09);
  camera.position.copy(camPos);

  // Look slightly ahead of car
  camTgt.set(
    phy.x+sinA*4,
    1.3,
    phy.z+cosA*4
  );
  camera.lookAt(camTgt);

  // Dynamic FOV
  camera.fov=65+phy.speed*0.08;
  camera.updateProjectionMatrix();
}

// ===== HUD =====
function pad(n){ return n<10?"0"+n:""+n; }
function pad3(n){ return n<100?(n<10?"00"+n:"0"+n):""+n; }

function updateHUD(){
  document.getElementById("speed").textContent=Math.round(phy.speed);
  document.getElementById("gear").textContent=phy.gear;
  document.getElementById("lap").textContent=Math.min(phy.lap,3);

  var s=phy.lapTime;
  document.getElementById("lap-time").textContent=
    Math.floor(s/60)+":"+pad(Math.floor(s%60))+"."+pad3(Math.floor((s%1)*1000));

  if(phy.bestLap<Infinity){
    var b=phy.bestLap;
    document.getElementById("best-time").textContent=
      "BEST "+Math.floor(b/60)+":"+pad(Math.floor(b%60))+"."+pad3(Math.floor((b%1)*1000));
  }

  var segs=document.querySelectorAll(".rpm-seg");
  var active=Math.round(phy.rpm*10);
  segs.forEach(function(seg,i){
    seg.classList.remove("active","red");
    if(i<active){ i>=8?seg.classList.add("red"):seg.classList.add("active"); }
  });
}

// ===== EXHAUST PARTICLES =====
var exhaust=[];
function spawnExhaust(){
  if(!gameActive||phy.speed<5) return;
  var sinA=Math.sin(phy.angle), cosA=Math.cos(phy.angle);
  [-0.36,0.36].forEach(function(ox){
    var geo=new THREE.SphereGeometry(0.07,4,4);
    var mat=new THREE.MeshBasicMaterial({color:0x888888,transparent:true,opacity:0.4});
    var p=new THREE.Mesh(geo,mat);
    p.position.set(
      phy.x-sinA*2.4+ox,
      0.22,
      phy.z-cosA*2.4+(Math.random()-0.5)*0.2
    );
    p.life=1; p.vy=0.014+Math.random()*0.012;
    p.vx=(Math.random()-0.5)*0.025;
    p.vz=(Math.random()-0.5)*0.025;
    scene.add(p); exhaust.push(p);
  });
}

function updateExhaust(){
  exhaust=exhaust.filter(function(p){
    p.life-=0.022;
    p.position.y+=p.vy; p.position.x+=p.vx; p.position.z+=p.vz;
    p.material.opacity=p.life*0.3;
    p.scale.setScalar(1+(1-p.life)*2.5);
    if(p.life<=0){ scene.remove(p); return false; }
    return true;
  });
}

// ===== RACE CONTROL =====
function startRace(){
  if(ac.state==="suspended") ac.resume();
  startEngine();

  document.getElementById("overlay").classList.add("hidden");
  document.getElementById("hud").classList.add("show");

  phy.x=2; phy.z=1; phy.vx=0; phy.vz=0;
  phy.angle=Math.PI; phy.speed=0;
  phy.lap=1; phy.lapTime=0; phy.totalTime=0; phy.bestLap=Infinity;
  phy.cpPassed=[false,false,false,false];

  car.position.set(2,0,1);
  car.rotation.y=Math.PI;

  var cd=document.getElementById("countdown");
  var n=3; cd.textContent=n; cd.classList.add("show");

  var iv=setInterval(function(){
    n--;
    if(n>0){ cd.textContent=n; }
    else if(n===0){ cd.textContent="GO!"; cd.style.color="#00ff80"; }
    else{
      cd.classList.remove("show"); cd.style.color="#ff6400";
      gameActive=true; clearInterval(iv);
    }
  },900);
}

function endRace(){
  gameActive=false;
  if(engineOsc) try{ engineOsc.stop(); engineOsc=null; }catch(e){}
  var ov=document.getElementById("overlay");
  ov.classList.remove("hidden");
  ov.querySelector(".logo").innerHTML="FINISH<span>!</span>";
  var total=phy.totalTime, best=phy.bestLap;
  document.getElementById("overlay-info").innerHTML=
    "Total Time: "+Math.floor(total/60)+":"+pad(Math.floor(total%60))+"<br>"+
    "Best Lap: "+Math.floor(best/60)+":"+pad(Math.floor(best%60))+"."+pad3(Math.floor((best%1)*1000))+"<br>"+
    "Top Speed: "+Math.round(phy.speed)+" KM/H";
  document.getElementById("start-btn").textContent="RACE AGAIN";
}

// ===== INPUT =====
document.addEventListener("keydown",function(e){
  KEYS[e.key]=true;
  if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
});
document.addEventListener("keyup",function(e){ KEYS[e.key]=false; });
document.getElementById("start-btn").addEventListener("click",function(){
  document.getElementById("overlay-info").textContent="";
  startRace();
});

// ===== GAME LOOP =====
var clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  var dt=Math.min(clock.getDelta(),0.05);
  updatePhysics(dt);
  updateCamera();
  updateAI();
  if(Math.random()<0.5) spawnExhaust();
  updateExhaust();
  renderer.render(scene,camera);
}
animate();

window.addEventListener("resize",function(){
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});
