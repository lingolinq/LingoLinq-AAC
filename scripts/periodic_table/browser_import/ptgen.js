// In-page port of generate_periodic_table.py + build_symbol_pack.py (board pictures only).
// ptBuild(theme, G) returns {path: text} for one package; G is the glyph table subset.
// transfer/check_port2.js proves every entry is byte-identical to the validated .obz files.
function ptBuild(theme,G){
var HC=theme=="high-contrast";
var TH=HC?{ink:"#FFFFFF",nf:"#000000",nb:"#FFFFFF",idle:"#4A4A4A",ms:"#FFFFFF"}:{ink:"#111111",nf:"#E5E5E5",nb:"#59606B",idle:"#CDD1D6",ms:"#222222"};
var ROOT=HC?"periodic-table-hc":"periodic-table",TITLE=HC?"Periodic Table (High Contrast)":"Periodic Table",PREFIX=HC?"Periodic Table HC:":"Periodic Table:";
var NB="#E5E5E5",NAVBG="#D5DCE5",NAVB="#5B6472",GB="#59606B";
var LIC={type:"private",author_name:"LingoLinq",author_url:"https://www.lingolinq.com"};
var ILIC={type:"public domain",copyright_notice_url:"https://creativecommons.org/publicdomain/zero/1.0/",author_name:"LingoLinq",author_url:"https://www.lingolinq.com"};
var TINT={"#DCEBFF":"#00264D","#FFF1C9":"#3D2E00","#DDF3D6":"#0B3311","#F6DCF5":"#3A0A3A","#FFFFFF":"#000000","#ECECEC":"#222222"};
var CATS=[["Alkali metal","alkali-metals","Alkali metals","Alkali","#E5A0A0","circle"],["Alkaline earth metal","alkaline-earth","Alkaline earth metals","Alkaline earth","#E5BE82","square"],["Transition metal","transition","Transition metals","Transition","#E5D878","diamond"],["Post-transition metal","post-transition","Post-transition metals","Post-transition","#B4D896","tri_up"],["Metalloid","metalloids","Metalloids","Metalloid","#8FD3C2","pentagon"],["Nonmetal","nonmetals","Nonmetals","Nonmetal","#9CC7E5","hexagon"],["Halogen","halogens","Halogens","Halogen","#B4B0E5","tri_down"],["Noble gas","noble-gases","Noble gases","Noble gas","#D7ACE5","ring"],["Lanthanide","lanthanides","Lanthanides","Lanthanide","#E5ACC8","star"],["Actinide","actinides","Actinides","Actinide","#C9BBA6","plus"]];
var CAT={},FAM={};CATS.forEach(function(c){CAT[c[0]]={slug:c[1],plural:c[2],short:c[3],bg:c[4],shape:c[5]};FAM[c[4]]=1;});
var D="H Hydrogen 5,He Helium 7,Li Lithium 0,Be Beryllium 1,B Boron 4,C Carbon 5,N Nitrogen 5,O Oxygen 5,F Fluorine 6,Ne Neon 7,Na Sodium 0,Mg Magnesium 1,Al Aluminum 3,Si Silicon 4,P Phosphorus 5,S Sulfur 5,Cl Chlorine 6,Ar Argon 7,K Potassium 0,Ca Calcium 1,Sc Scandium 2,Ti Titanium 2,V Vanadium 2,Cr Chromium 2,Mn Manganese 2,Fe Iron 2,Co Cobalt 2,Ni Nickel 2,Cu Copper 2,Zn Zinc 2,Ga Gallium 3,Ge Germanium 4,As Arsenic 4,Se Selenium 5,Br Bromine 6,Kr Krypton 7,Rb Rubidium 0,Sr Strontium 1,Y Yttrium 2,Zr Zirconium 2,Nb Niobium 2,Mo Molybdenum 2,Tc Technetium 2,Ru Ruthenium 2,Rh Rhodium 2,Pd Palladium 2,Ag Silver 2,Cd Cadmium 2,In Indium 3,Sn Tin 3,Sb Antimony 4,Te Tellurium 4,I Iodine 6,Xe Xenon 7,Cs Cesium 0,Ba Barium 1,La Lanthanum 8,Ce Cerium 8,Pr Praseodymium 8,Nd Neodymium 8,Pm Promethium 8,Sm Samarium 8,Eu Europium 8,Gd Gadolinium 8,Tb Terbium 8,Dy Dysprosium 8,Ho Holmium 8,Er Erbium 8,Tm Thulium 8,Yb Ytterbium 8,Lu Lutetium 8,Hf Hafnium 2,Ta Tantalum 2,W Tungsten 2,Re Rhenium 2,Os Osmium 2,Ir Iridium 2,Pt Platinum 2,Au Gold 2,Hg Mercury 2,Tl Thallium 3,Pb Lead 3,Bi Bismuth 3,Po Polonium 4,At Astatine 6,Rn Radon 7,Fr Francium 0,Ra Radium 1,Ac Actinium 9,Th Thorium 9,Pa Protactinium 9,U Uranium 9,Np Neptunium 9,Pu Plutonium 9,Am Americium 9,Cm Curium 9,Bk Berkelium 9,Cf Californium 9,Es Einsteinium 9,Fm Fermium 9,Md Mendelevium 9,No Nobelium 9,Lr Lawrencium 9,Rf Rutherfordium 2,Db Dubnium 2,Sg Seaborgium 2,Bh Bohrium 2,Hs Hassium 2,Mt Meitnerium 2,Ds Darmstadtium 2,Rg Roentgenium 2,Cn Copernicium 2,Nh Nihonium 3,Fl Flerovium 3,Mc Moscovium 3,Lv Livermorium 3,Ts Tennessine 6,Og Oganesson 7";
function pos(z){if(z==1)return[1,1,null];if(z==2)return[1,18,null];if(z<=4)return[2,z-2,null];if(z<=10)return[2,z+8,null];if(z<=12)return[3,z-10,null];if(z<=18)return[3,z,null];if(z<=36)return[4,z-18,null];if(z<=54)return[5,z-36,null];if(z<=56)return[6,z-54,null];if(z<=71)return[6,null,z-57];if(z<=86)return[6,z-68,null];if(z<=88)return[7,z-86,null];if(z<=103)return[7,null,z-89];return[7,z-100,null];}
var E=D.split(",").map(function(s,i){var p=s.split(" "),q=pos(i+1);return{z:i+1,symbol:p[0],name:p[1],category:CATS[+p[2]][0],period:q[0],group:q[1],f:q[2]};});
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1);}
function fact(e){var w=e.group?("Group "+e.group+", period "+e.period+"."):("Period "+e.period+".");return cap(e.name.toLowerCase())+". Symbol "+e.symbol.toUpperCase().split("").join(" ")+". Atomic number "+e.z+". "+cap(e.category.toLowerCase())+". "+w;}
function hex(h){h=h.replace("#","");return[0,2,4].map(function(i){return parseInt(h.substr(i,2),16);});}
function rgb(h){var c=hex(h);return"rgb("+c[0]+", "+c[1]+", "+c[2]+")";}
function dk(h){return"#"+hex(h).map(function(c){var v=Math.floor(c*0.55).toString(16).toUpperCase();return v.length<2?"0"+v:v;}).join("");}
// Python's "%.2f" rounds exact ties to even; toFixed rounds them up. Exact ties are the odd eighths.
function f2(x){var a=Math.abs(x),e=a*8;if(e===Math.floor(e)&&e%2===1){var b=Math.floor(a)*100+[0,12,0,38,0,62,0,88][e%8];return(x<0?"-":"")+(b/100).toFixed(2);}return x.toFixed(2);}
function f1(x){return x.toFixed(1);}
function num(v){return f2(v).replace(/0+$/,"").replace(/\.$/,"");}
function esc(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function svg(title,desc,body){return'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512" role="img"><title>'+esc(title)+'</title><desc>'+esc(desc)+' CC0 1.0 Universal, LingoLinq. https://creativecommons.org/publicdomain/zero/1.0/</desc>'+body+'</svg>';}
function frame(fill,border,w){if(!w)w=3;var i=w/2.0+0.5;return'<rect x="'+f1(i)+'" y="'+f1(i)+'" width="'+f1(100-2*i)+'" height="'+f1(100-2*i)+'" rx="9" fill="'+fill+'" stroke="'+border+'" stroke-width="'+w+'"/>';}
function mkO(tbl){var upm=G.upm;function width(s,size){var t=0;for(var i=0;i<s.length;i++)t+=tbl[s.charAt(i)].adv;return t*size/upm;}
function path(s,size,x,y,mid){if(mid)x-=width(s,size)/2.0;var sc=size/upm,o="";for(var i=0;i<s.length;i++){var g=tbl[s.charAt(i)];for(var j=0;j<g.d.length;j++){var q=g.d[j];if(q[0]=="Z")o+="Z";else if(q[0]=="Q")o+="Q"+num(x+q[1]*sc)+" "+num(y-q[2]*sc)+" "+num(x+q[3]*sc)+" "+num(y-q[4]*sc);else o+=q[0]+num(x+q[1]*sc)+" "+num(y-q[2]*sc);}x+=g.adv*sc;}return o;}
return{width:width,path:path};}
var BO=mkO(G.bold),RE=mkO(G.regular);
function fit(o,s,size,max){var w=o.width(s,size);return w<=max?size:size*max/w;}
function ink(d,c){return'<path d="'+d+'" fill="'+c+'"/>';}
function poly(pts,c){return'<polygon points="'+pts.map(function(p){return f2(p[0])+","+f2(p[1]);}).join(" ")+'" fill="'+c+'"/>';}
var RAD=Math.PI/180;
function ngon(cx,cy,r,n,rot){if(rot===undefined)rot=-90;var o=[];for(var i=0;i<n;i++){var a=(rot+i*360.0/n)*RAD;o.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}return o;}
function marker(s,cx,cy,r,c){
if(s=="circle")return'<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+c+'"/>';
if(s=="ring")return'<circle cx="'+cx+'" cy="'+cy+'" r="'+f2(r*0.8)+'" fill="none" stroke="'+c+'" stroke-width="'+f2(r*0.4)+'"/>';
if(s=="square")return'<rect x="'+f2(cx-r*0.9)+'" y="'+f2(cy-r*0.9)+'" width="'+f2(r*1.8)+'" height="'+f2(r*1.8)+'" fill="'+c+'"/>';
if(s=="diamond")return poly(ngon(cx,cy,r*1.15,4),c);
if(s=="tri_up")return poly(ngon(cx,cy+r*0.15,r*1.2,3),c);
if(s=="tri_down")return poly(ngon(cx,cy-r*0.15,r*1.2,3,90),c);
if(s=="pentagon")return poly(ngon(cx,cy,r*1.1,5),c);
if(s=="hexagon")return poly(ngon(cx,cy,r*1.1,6,0),c);
if(s=="star"){var a=ngon(cx,cy,r*1.25,5),b=ngon(cx,cy,r*0.55,5,-54),p=[];for(var i=0;i<5;i++){p.push(a[i]);p.push(b[i]);}return poly(p,c);}
if(s=="plus"){var t=r*0.42;return'<rect x="'+f2(cx-r)+'" y="'+f2(cy-t)+'" width="'+f2(2*r)+'" height="'+f2(2*t)+'" fill="'+c+'"/><rect x="'+f2(cx-t)+'" y="'+f2(cy-r)+'" width="'+f2(2*t)+'" height="'+f2(2*r)+'" fill="'+c+'"/>';}
throw new Error(s);}
function famFrame(c){return HC?[frame("#000000",c.bg,6),"#FFFFFF",c.bg]:[frame(c.bg,dk(c.bg)),TH.ink,TH.ink];}
function elTile(e){var c=CAT[e.category],f=famFrame(c),b=f[0];b+=ink(BO.path(String(e.z),21,10,28),f[1]);b+=marker(c.shape,82,21,7,f[2]);var size=fit(BO,e.symbol,54,80);b+=ink(BO.path(e.symbol,size,50,82,true),f[1]);
return svg(e.name+", symbol "+e.symbol+", atomic number "+e.z,e.category+".",b);}
function rangeTile(k,n,s){var c=CAT[k],f=famFrame(c),b=f[0]+marker(c.shape,82,21,7,f[2]);b+=ink(BO.path(n,fit(BO,n,25,80),50,60,true),f[1]);b+=ink(RE.path(s,18,50,84,true),f[1]);
return svg(c.plural+", elements "+n.replace("–"," to "),"Link tile for the "+c.plural.toLowerCase()+" row.",b);}
function famTile(k){var c=CAT[k],f=famFrame(c);return svg(c.plural+" family marker","Shape and color used for "+c.plural.toLowerCase()+".",f[0]+marker(c.shape,50,50,24,f[2]));}
function formulaTile(name,tk){var u=0;tk.forEach(function(t){u+=(t[1]?0.62:1.0)*BO.width(t[0],1.0);});var size=Math.min(40.0,80.0/u),x=50-u*size/2.0,b=frame(TH.nf,TH.nb,HC?6:3),fm="";
tk.forEach(function(t){var s=size*(t[1]?0.62:1.0);b+=ink(BO.path(t[0],s,x,50+size*0.33+(t[1]?size*0.22:0)),TH.ink);x+=BO.width(t[0],s);fm+=t[0];});
return svg(name+", formula "+fm,"Chemical formula tile.",b);}
function mapTile(hl,label){var cw=4.6,ch=7.4,gap=0.3,ox=6.05,oy=14.0,b=frame(TH.nf,TH.nb,HC?6:3);
E.forEach(function(e){var col,row,y;if(e.group){col=e.group-1;row=e.period-1;y=oy+row*(ch+gap);}else{col=e.f+2;row=e.period+1;y=oy+row*(ch+gap)+3.0;}var x=ox+col*(cw+gap);
if(hl[e.z])b+='<rect x="'+f2(x)+'" y="'+f2(y)+'" width="'+f1(cw)+'" height="'+f1(ch)+'" fill="'+CAT[e.category].bg+'" stroke="'+TH.ms+'" stroke-width="0.7"/>';
else b+='<rect x="'+f2(x)+'" y="'+f2(y)+'" width="'+f1(cw)+'" height="'+f1(ch)+'" fill="'+TH.idle+'"/>';});
return svg("Periodic table map: "+label,"Small picture of the periodic table with "+label.toLowerCase()+" filled in.",b);}
function iconTile(k,label){var I=TH.ink,b=frame(HC?"#000000":"#D5DCE5",HC?"#FFFFFF":"#5B6472",HC?6:3),s='stroke="'+I+'" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"';
if(k=="menu"){for(var r=0;r<3;r++)for(var c=0;c<3;c++)b+='<rect x="'+(21+c*20)+'" y="'+(21+r*20)+'" width="18" height="18" rx="3" fill="'+I+'"/>';}
else if(k=="back")b+='<path d="M78 50 H26 M46 28 L24 50 L46 72" '+s+'/>';
else if(k=="words"){var o='stroke="'+I+'" stroke-width="5" fill="none"';b+='<ellipse cx="50" cy="50" rx="34" ry="13" transform="rotate(35 50 50)" '+o+'/>';b+='<ellipse cx="50" cy="50" rx="34" ry="13" transform="rotate(-35 50 50)" '+o+'/>';b+='<circle cx="50" cy="50" r="8" fill="'+I+'"/>';}
else if(k=="talk")b+='<path d="M22 24 H78 V62 H48 L32 78 V62 H22 Z" '+s+'/>';
else if(k=="facts"){b+='<circle cx="50" cy="50" r="30" stroke="'+I+'" stroke-width="6" fill="none"/>';b+='<circle cx="50" cy="35" r="5" fill="'+I+'"/>';b+='<path d="M50 47 V68" '+s+'/>';}
else if(k=="names"){b+='<rect x="18" y="30" width="64" height="40" rx="7" stroke="'+I+'" stroke-width="6" fill="none"/>';b+=ink(BO.path("Na",26,50,59.5,true),I);}
return svg(label,"Navigation icon.",b);}
var IMG={};function addImg(id,s){IMG[id]=s;return id;}
var B={},HUB="periodic-table",WORDS="periodic-table-words",TALK="periodic-table-talk";
function board(id,name,rows,cols,desc,textOnly){var cells=[];for(var r=0;r<rows;r++){var row=[];for(var c=0;c<cols;c++)row.push(null);cells.push(row);}return B[id]={id:id,name:name,rows:rows,cols:cols,desc:desc,textOnly:!!textOnly,cells:cells};}
function put(b,r,c,x){if(b.cells[r][c])throw new Error("dup "+b.id);b.cells[r][c]=x;}
function pad3(z){return("00"+z).slice(-3);}
function elBtn(e,facts,hide){var c=CAT[e.category];return{label:e.name,say:facts?fact(e):e.name.toLowerCase(),bg:c.bg,border:dk(c.bg),element:e.z,hide:!!hide,image:addImg("el-"+pad3(e.z),elTile(e))};}
function link(label,target,image,bg,border,hide){return{label:label,link:target,bg:bg||NAVBG,border:border||NAVB,image:image,hide:!!hide};}
function word(label,say,bg,border,image){return{label:label,say:say||label,bg:bg||NB,border:border||GB,image:image};}
var ico={};[["menu","Menu"],["back","Back"],["words","Science words"],["talk","Class talk"],["facts","Say facts"],["names","Say names"]].forEach(function(k){ico[k[0]]=addImg("icon-"+k[0],iconTile(k[0],k[1]));});
function nav(b,twin,twinIsFacts){var r=b.rows-1,last=b.cols-1;
if(b.id!=HUB)put(b,r,0,link("Menu",HUB,ico.menu));
put(b,r,1,{label:"Back",action:":back",bg:NAVBG,border:NAVB,image:ico.back});
if(twin)put(b,r,last-2,twinIsFacts?link("Facts",twin,ico.facts):link("Names",twin,ico.names));
if(b.id!=WORDS)put(b,r,last-1,link("Words",WORDS,ico.words));
if(b.id!=TALK)put(b,r,last,link("Talk",TALK,ico.talk));}
var lan=addImg("range-lanthanides",rangeTile("Lanthanide","57–71","La–Lu")),act=addImg("range-actinides",rangeTile("Actinide","89–103","Ac–Lr"));
var MG=[1,2,13,14,15,16,17,18];
function fLinks(b,r6,r7,col,fb,hide){var l=CAT["Lanthanide"],a=CAT["Actinide"];put(b,r6,col,link("Lanthanides",fb,lan,l.bg,dk(l.bg),hide));put(b,r7,col,link("Actinides",fb,act,a.bg,dk(a.bg),hide));}
var P="periodic-table-",catT={};
CATS.forEach(function(c){var k=c[0];catT[k]=k=="Transition metal"?P+"transition-metals":(k=="Lanthanide"||k=="Actinide")?P+"lanthanides-actinides":P+c[1];});
[false,true].forEach(function(facts){var sfx=facts?"-facts":"",tag=facts?" (facts)":"";
var mode=facts?"Each element says a fact sentence: name, symbol, atomic number, category, group and period.":"Each element says its name.";
function twin(base){return facts?base:base+"-facts";}
var fb=P+"lanthanides-actinides"+sfx,b;
b=board(P+"full"+sfx,"Periodic Table: Full Table"+tag,8,18,"The main body of the periodic table in its true layout. "+mode);
E.forEach(function(e){if(e.group)put(b,e.period-1,e.group-1,elBtn(e,facts,true));});
fLinks(b,5,6,2,fb,true);
CATS.forEach(function(c,i){put(b,1,2+i,link(c[3],catT[c[0]],addImg("legend-"+c[1],famTile(c[0])),c[4],dk(c[4]),true));});
nav(b,twin(P+"full"),!facts);
b=board(P+"first-20"+sfx,"Periodic Table: Elements 1–20"+tag,5,8,"Hydrogen through calcium in their true positions. "+mode);
E.slice(0,20).forEach(function(e){put(b,e.period-1,MG.indexOf(e.group),elBtn(e,facts));});
nav(b,twin(P+"first-20"),!facts);
b=board(P+"main-groups"+sfx,"Periodic Table: Main Groups"+tag,8,8,"Groups 1, 2 and 13 to 18 in their true positions. "+mode);
E.forEach(function(e){if(MG.indexOf(e.group)>=0)put(b,e.period-1,MG.indexOf(e.group),elBtn(e,facts));});
nav(b,twin(P+"main-groups"),!facts);
b=board(P+"transition-metals"+sfx,"Periodic Table: Transition Metals"+tag,5,10,"Groups 3 to 12 in their true positions. "+mode);
E.forEach(function(e){if(e.group&&e.group>=3&&e.group<=12)put(b,e.period-4,e.group-3,elBtn(e,facts));});
fLinks(b,2,3,0,fb,false);nav(b,twin(P+"transition-metals"),!facts);
b=board(fb,"Periodic Table: Lanthanides and Actinides"+tag,3,15,"Elements 57 to 71 and 89 to 103. "+mode);
E.forEach(function(e){if(e.f!==null)put(b,e.period-6,e.f,elBtn(e,facts));});
nav(b,twin(P+"lanthanides-actinides"),!facts);});
CATS.forEach(function(c){var k=c[0];if(catT[k]!=P+c[1])return;var m=E.filter(function(e){return e.category==k;}),rows=Math.ceil(m.length/4);
var b=board(catT[k],"Periodic Table: "+c[2],rows+1,4,c[2]+" in atomic-number order. Each element says its name.");
m.forEach(function(e,i){put(b,Math.floor(i/4),i%4,elBtn(e));});nav(b);});
var RW=[["#DCEBFF","atom|proton|neutron|electron|nucleus|electron shell|valence electrons|energy level"],["#FFF1C9","element|symbol|atomic number|atomic mass|group|period|row|column"],["#DDF3D6","metal|nonmetal|metalloid|solid|liquid|gas|reactive|stable"],["#F6DCF5","charge|positive|negative|neutral|ion|isotope|bond|compound"],["#FFFFFF","0|1|2|3|4|5|6|7"],["#FFFFFF","8|9|plus|minus|equals|more|less|the same"],["#ECECEC","it is|it is a|it has|it is in|and|not|how many|because"]];
var bw=board(WORDS,"Periodic Table: Science Words",8,8,"Atom parts, table words, properties, charge and bonding words, numbers and a few connecting words.",true);
RW.forEach(function(row,r){row[1].split("|").forEach(function(w,c){put(bw,r,c,word(w,null,row[0],dk(row[0])));});});nav(bw);
var RT=[["#DCEBFF","Which element is that?|What is the symbol?|What is the atomic number?|Can you show me on the table?"],["#DDF3D6","What group is it in?|What period is it in?|Is it a metal?|Is it reactive?"],["#DDF3D6","How many valence electrons?|What is it used for?|Is it a solid, liquid, or gas?|What does it bond with?"],["#FFF1C9","Can you repeat that?|Can you repeat the symbol?|Can you go back?|Please slow down."],["#F6DCF5","I have a question.|I know the answer.|I don't understand.|I need more time."],["#F6DCF5","I think it is|I agree.|I disagree.|Let me find it."]];
var bt=board(TALK,"Periodic Table: Class Talk",7,4,"Whole phrases for science class: asking about an element, asking for a repeat, and joining the discussion.",true);
var SH={"Can you show me on the table?":"Show me on the table?","How many valence electrons?":"Valence electrons?"};
RT.forEach(function(row,r){row[1].split("|").forEach(function(w,c){put(bt,r,c,word(SH[w]||w,w,row[0],dk(row[0])));});});nav(bt);
var CP=["Water|water. H 2 O.|H_2_O","Carbon dioxide|carbon dioxide. C O 2.|CO_2","Oxygen gas|oxygen gas. O 2.|O_2","Hydrogen gas|hydrogen gas. H 2.|H_2","Nitrogen gas|nitrogen gas. N 2.|N_2","Table salt|table salt, sodium chloride. N A, C L.|NaCl","Methane|methane. C, H 4.|CH_4","Ammonia|ammonia. N, H 3.|NH_3","Glucose|glucose. C 6, H 12, O 6.|C_6_H_12_O_6","Hydrochloric acid|hydrochloric acid. H, C L.|HCl","Sulfuric acid|sulfuric acid. H 2, S, O 4.|H_2_SO_4","Sodium hydroxide|sodium hydroxide. N A, O, H.|NaOH","Calcium carbonate|calcium carbonate. C A, C, O 3.|CaCO_3","Hydrogen peroxide|hydrogen peroxide. H 2, O 2.|H_2_O_2","Carbon monoxide|carbon monoxide. C O.|CO","Ozone|ozone. O 3.|O_3","Baking soda|baking soda, sodium bicarbonate. N A, H, C, O 3.|NaHCO_3","Rust|rust, iron oxide. F E 2, O 3.|Fe_2_O_3","Sand|sand, silicon dioxide. S I, O 2.|SiO_2","Ethanol|ethanol. C 2, H 5, O H.|C_2_H_5_OH"];
function toks(f){return f.split("_").map(function(t,i){return[t,i%2==1];});}
var bc=board(P+"compounds","Periodic Table: Common Compounds",5,5,"Twenty compounds that come up in middle and high school science. Each says its name, then its formula.");
CP.forEach(function(s,i){var p=s.split("|");put(bc,Math.floor(i/5),i%5,word(p[0],p[1],null,null,addImg("compound-"+p[0].toLowerCase().replace(/ /g,"-"),formulaTile(p[0],toks(p[2])))));});nav(bc);
var hub=board(HUB,"Periodic Table",3,7,"Start here. Top row: the table by layout. Second row: element families. Bottom row: navigation, science words and class talk.");
function setOf(fn){var o={};E.forEach(function(e){if(fn(e))o[e.z]=1;});return o;}
[["Full table",P+"full",function(e){return!!e.group;}],["Elements 1–20",P+"first-20",function(e){return e.z<=20;}],["Main groups",P+"main-groups",function(e){return MG.indexOf(e.group)>=0;}],["Transition metals",P+"transition-metals",function(e){return e.group&&e.group>=3&&e.group<=12;}],["Lanthanides and actinides",P+"lanthanides-actinides",function(e){return e.f!==null;}]].forEach(function(v,c){put(hub,0,c,link(v[0],v[1],addImg("map-"+v[1],mapTile(setOf(v[2]),v[0])),NB,GB));});
put(hub,0,6,link("Compounds",P+"compounds",addImg("compound-water",formulaTile("Water",toks("H_2_O"))),NB,GB));
var col=0;CATS.forEach(function(c){var k=c[0];if(catT[k]!=P+c[1])return;put(hub,1,col++,link(c[2],catT[k],addImg("map-"+catT[k],mapTile(setOf(function(e){return e.category==k;}),c[2])),c[4],dk(c[4])));});
nav(hub);
// derive this theme's ids, names and colors
function rid(i){return ROOT+i.slice(14);}
function rname(n){return n=="Periodic Table"?TITLE:PREFIX+n.slice(15);}
var RB={};Object.keys(B).forEach(function(k){var b=B[k];b.id=rid(b.id);b.name=rname(b.name);RB[b.id]=b;
b.cells.forEach(function(row){row.forEach(function(x){if(!x)return;if(x.link)x.link=rid(x.link);
if(HC){var old=x.bg;x.bg=(b.textOnly&&!x.image)?(TINT[old]||"#000000"):"#000000";x.border=FAM[old]?old:"#FFFFFF";}});});});
function obf(b){var order=[],btns=[],used=[],n=1;
b.cells.forEach(function(row){var o=[];row.forEach(function(x){if(!x){o.push(null);return;}
var t={id:String(n++),label:x.label,background_color:rgb(x.bg),border_color:rgb(x.border)};
if(x.image){t.image_id=b.id+"."+x.image;if(used.indexOf(x.image)<0)used.push(x.image);}
if(x.action)t.actions=[x.action];else if(x.link){t.load_board={id:x.link,name:RB[x.link].name,path:"boards/"+x.link+".obf"};t.ext_lingolinq_home_lock=true;}else t.vocalization=x.say;
if(x.hide)t.ext_lingolinq_hide_label=true;if(x.element)t.ext_lingolinq_external_id="element-"+x.element;
btns.push(t);o.push(t.id);});order.push(o);});
return{format:"open-board-0.1",id:b.id,locale:"en",name:b.name,description_html:b.desc,default_layout:"landscape",license:LIC,buttons:btns,grid:{rows:b.rows,columns:b.cols,order:order},
images:used.map(function(i){return{id:b.id+"."+i,width:512,height:512,content_type:"image/svg+xml",path:"images/"+i+".svg",license:ILIC};}),sounds:[],
ext_lingolinq_settings:{"private":true,key:"lingolinq/"+b.id,word_suggestions:false,"protected":false,home_board:false,categories:[],text_only:b.textOnly,hide_empty:true}};}
var files={},bids=Object.keys(RB).sort(),iids=Object.keys(IMG).sort(),pb={},pi={},O={},pm={};
bids.forEach(function(i){pb[i]="boards/"+i+".obf";O[i]=obf(RB[i]);O[i].images.forEach(function(m){pm[m.id]=m.path;});});
Object.keys(pm).sort().forEach(function(k){pi[k]=pm[k];});
files["manifest.json"]=JSON.stringify({format:"open-board-0.1",paths:{boards:pb,images:pi,sounds:{}},root:"boards/"+ROOT+".obf"});
bids.forEach(function(i){files[pb[i]]=JSON.stringify(O[i]);});iids.forEach(function(i){files["images/"+i+".svg"]=IMG[i];});
return files;}
if(typeof module!=="undefined")module.exports=ptBuild;
